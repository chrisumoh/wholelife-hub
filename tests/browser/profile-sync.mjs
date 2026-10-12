import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/profile-sync.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Profiles in the account (8.2.4), against the fake Supabase. A "device" is the browser's storage: the test saves one device's
// storage, wipes it, and loads another, while the fake database (the account) stays shared. Checks that a new device gets the
// profile and its meals, edits and deletes travel between devices, an offline edit survives a reload and wins over the account,
// and that nothing outside the whitelist (plans, coach history, progress photos) is uploaded.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NO_SANDBOX = process.env.CI || process.env.NO_SANDBOX ? ["--no-sandbox"] : [];
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2", ".txt": "text/plain" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname), file = join(REPO, path === "/" ? "index.html" : path);
  if (!file.startsWith(REPO) || !existsSync(file) || /(^|[\\/])\./.test(path)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
}).listen(8775, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9340", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-prof-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9340/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
if (!list) { console.log("FAIL  Chrome did not start (set CHROME to its path)"); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(1); }
process.on("exit", () => procs.forEach(p => { try { p.kill(); } catch {} }));
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(150); } return false; };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
const boot = async () => { await send("Page.navigate", { url: "http://127.0.0.1:8775/index.html" }); await sleep(500); return waitFor(READY, 15000); };
const reload = async () => { await ev(`window.__old = 1; location.reload(); true`); await sleep(500); return waitFor(`window.__old === undefined && ${READY}`, 15000); };
const synced = () => waitFor("SB.started && SB.state==='idle' && !sbPending()", 12000);
const DB = () => ev(`JSON.parse(localStorage.getItem("__fakedb"))`);
const rows = async () => (await DB()).people;
// A device is the browser's storage. Save it, wipe it, and put the account (the fake database) back so the next device shares it.
const saveDevice = () => ev(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))`);
const loadDevice = async (snapshot, db) => {
  await ev(`(() => { const snap = ${JSON.stringify(snapshot || "{}")}, db = ${JSON.stringify(db)}; const o = JSON.parse(snap); localStorage.clear(); sessionStorage.clear();
    for (const k in o) localStorage.setItem(k, o[k]); localStorage.setItem("__fakedb", db); return true; })()`);
  return reload();
};
const signIn = async email => { await ev(`window.__old = 1; SB.client.auth.signInWithPassword({email:${JSON.stringify(email)},password:"password1"}).then(()=>true)`); return waitFor(`window.__old === undefined && ${READY}`, 15000); };
const mkProfile = (name, extra = {}) => ev(`(async () => { const p = newProfile(${JSON.stringify(name)}); Object.assign(p, ${JSON.stringify(extra)}, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles.push(p); if (!P()) S.activeId = p.id; saveProfile(); return p.id; })()`);
const rowOf = async appId => (await rows()).find(r => r.app_id === appId);
const ADA = { goal: "lose", age: 30, heightCm: 170, weightKg: 65, targetKg: 60, calorieGoal: 1800, freq: 4, culture: "Ghana", diet: "", allergies: "peanuts", sex: "female", units: "metric", focus: "africa", coachName: "Ama", level: "intermediate" };

console.log("--- 1. device A: sign in, create a profile");
ok("app boots", await boot(), errors.join(" | "));
ok("sign in as A", await signIn("a@x.com"));
await synced();
const adaId = await mkProfile("Ada", ADA);
await ev(`(() => { const p = S.profiles.find(x => x.id === ${JSON.stringify(adaId)}); p.workoutPlan = { weeks: 4, secret: "plan" }; p.coach.answers = ["private answer"]; p.prem.body.shots = [{ id: "x", data: "data:image/png;base64,AAAA" }]; saveProfile(); return true; })()`);
ok("the profile is sent", await synced());
let row = await rowOf(adaId);
ok("one row in the account", (await rows()).length === 1 && !!row);
ok("columns hold the basics", row && row.display_name === "Ada" && row.age === 30 && row.height_cm === 170 && row.weight_kg === 65 && row.calorie_target === 1800 && row.workouts_per_week === 4 && row.cultural_background === "Ghana" && row.goal === "lose" && row.onboarding_done === true && row.is_primary === true, JSON.stringify(row));
ok("settings hold the choices and a version", row?.settings?.v === 2 && row.settings.sex === "female" && row.settings.units === "metric" && row.settings.focus === "africa" && row.settings.allergies === "peanuts" && row.settings.coachName === "Ama" && row.settings.level === "intermediate" && row.settings.targetKg === 60, JSON.stringify(row?.settings));
const allowed = new Set(["v", "style", "diet", "allergies", "sex", "units", "level", "sport", "targetKg", "workoutGoal", "cultureMode", "focus", "coachPersona", "coachName", "rotation", "menuSkip", "limits", "gear", "coachPrompted", "tourSeen", "created", "look", "widgets", "layouts", "wv", "reminders", "plan", "workoutPlan", "coach", "awards", "celebr", "menuPick", "menuSeed", "prem"]);
ok("nothing outside the list is uploaded", Object.keys(row?.settings || {}).every(k => allowed.has(k)), Object.keys(row?.settings || {}).join(","));
const raw = JSON.stringify(await DB());
ok("plans and coach answers now travel with the profile (8.2.16), but no photo data is ever stored in a row", raw.includes("secret") && raw.includes("private answer") && !raw.includes("data:image"));
ok("the allergy text is also written to the allergies column and the choices to nutrition_preferences", JSON.stringify(row?.allergies) === '["peanuts"]' && (row?.nutrition_preferences || []).includes("africa"), JSON.stringify([row?.allergies, row?.nutrition_preferences]));
await ev(`(() => { addEntry("meals", { id: uid(), date: today(), slot: "lunch", name: "Jollof rice", cal: 500, dish: null, extras: [], est: false }); markLog(P().id, monthOf(today())); return true; })()`);
ok("a meal follows", await synced() && (await DB()).meal_logs.length === 1);
const deviceA = await saveDevice();

console.log("--- 2. device B: a new device gets the profile and its meals");
let db = JSON.stringify(await DB());
await loadDevice("{}", db);   // empty storage; the fake session is gone too
ok("sign in as A on the new device", await signIn("a@x.com"));
ok("first sync finishes", await synced());
ok("the profile is there", await ev(`S.profiles.length === 1 && S.profiles[0].id === ${JSON.stringify(adaId)} && S.profiles[0].name === "Ada" && S.activeId === ${JSON.stringify(adaId)}`));
ok("its basics came back", await ev(`(() => { const p = P(); return p.age === 30 && p.heightCm === 170 && p.weightKg === 65 && p.goal === "lose" && p.culture === "Ghana" && p.calorieGoal === 1800 && p.freq === 4 && p.sex === "female" && p.units === "metric" && p.focus === "africa" && p.allergies === "peanuts" && p.coachName === "Ama" && p.targetKg === 60 && p.onboarded === true && p.coachPrompted === true && p.tourSeen === "dismissed"; })()`));
ok("its meal came back and is attached to it", await ev(`[...sbAllMeals()].length === 1 && [...sbAllMeals()][0].pid === ${JSON.stringify(adaId)}`));
ok("the app shows it, not the setup screen", await ev(`UI.route === "home" && !document.querySelector(".ob")`), await ev(`UI.route + " | " + (document.querySelector(".ob")?.innerText || "").slice(0, 160)`));
ok("nothing waits to upload after the first sync", await ev(`sbPending() === 0`));

console.log("--- 3. an edit on B reaches A");
await ev(`(() => { P().weightKg = 63.5; P().diet = "veg"; saveProfile(); return true; })()`);
ok("B sends it", await synced());
row = await rowOf(adaId);
ok("the account has the new weight and diet", row?.weight_kg === 63.5 && row.settings.diet === "veg", JSON.stringify(row));
const deviceB = await saveDevice(); db = JSON.stringify(await DB());
await loadDevice(deviceA, db);   // A comes back with its older copy (weight 65)
ok("A reloads signed in", await waitFor(`!!SB.user`, 8000));
ok("A's sync finishes", await synced());
ok("A shows B's edit", await ev(`P().weightKg === 63.5 && P().diet === "veg"`), await ev(`P().weightKg + " " + P().diet`));
ok("A has nothing to send", await ev(`sbPending() === 0`));
ok("the account still has one row and one meal", (await rows()).length === 1 && (await DB()).meal_logs.length === 1);

console.log("--- 4. an edit made offline survives a reload and wins");
await ev(`__fake.offline = true; P().age = 31; saveProfile(); true`);
await sleep(1600);
ok("the edit waits (offline)", await ev(`sbPending() >= 1`));
await ev(`flush()`);
ok("the account does not have it yet", (await rowOf(adaId)).age === 30);
ok("reloaded", await reload());
ok("A syncs after the reload", await synced());
ok("the account got the offline edit", (await rowOf(adaId)).age === 31, JSON.stringify((await rowOf(adaId))?.age));
ok("the device kept it (the account's older copy did not win)", await ev(`P().age === 31`));

console.log("--- 5. a second profile, then a delete from another device");
const kofiId = await mkProfile("Kofi", { age: 8 + 20, sex: "male" });
await ev(`(() => { addEntry("meals", { id: uid(), date: today(), slot: "dinner", name: "Banku", cal: 600, dish: null, extras: [], est: false }, ); return true; })()`);
await ev(`(() => { const k = S.profiles.find(p => p.name === "Kofi"); const m = [...sbAllMeals()].pop().m; return true; })()`);
ok("both profiles are in the account", await synced() && (await rows()).filter(r => !r.deleted_at).length === 2);
const deviceA2 = await saveDevice(); db = JSON.stringify(await DB());
await loadDevice(deviceB, db);   // B (older: only Ada) comes back and learns about Kofi
ok("B's sync finishes", await synced());
ok("B now has Kofi too", await ev(`S.profiles.length === 2 && S.profiles.some(p => p.name === "Kofi" && p.age === 28 && p.sex === "male")`), await ev(`S.profiles.map(p => p.name).join(",")`));
await ev(`dropProfile(S.profiles.find(p => p.name === "Kofi").id); saveProfile(); true`);
ok("B sends the delete", await synced());
ok("the account marks Kofi deleted", (await rows()).filter(r => r.deleted_at).length === 1 && (await rows()).filter(r => !r.deleted_at).length === 1);
db = JSON.stringify(await DB());
await loadDevice(deviceA2, db);   // A still has Kofi
ok("A's sync finishes", await synced());
ok("Kofi is gone from A", await ev(`S.profiles.length === 1 && S.profiles[0].name === "Ada"`), await ev(`S.profiles.map(p => p.name).join(",")`));
ok("A did not bring Kofi back", (await rows()).filter(r => !r.deleted_at).length === 1);

console.log("--- 6. a profile from before 8.2.4 (basics only) never overwrites this device's fuller copy");
await ev(`(() => { const db = JSON.parse(localStorage.getItem("__fakedb")); const r = db.people.find(x => x.app_id === ${JSON.stringify(adaId)}); r.settings = {}; r.age = null; r.height_cm = null; r.weight_kg = null; r.goal = null; localStorage.setItem("__fakedb", JSON.stringify(db));
  const c = JSON.parse(localStorage.getItem("wlh.meals.v1")); delete c.ps; delete c.pp; localStorage.setItem("wlh.meals.v1", JSON.stringify(c)); return true; })()`);
ok("reloaded", await reload() && await synced());
ok("this device kept its profile", await ev(`P().age === 31 && P().heightCm === 170 && P().weightKg === 63.5`), await ev(`P().age + " " + P().heightCm + " " + P().weightKg`));
ok("and sent it up", await waitFor(`true`) && (await rowOf(adaId)).settings?.v === 2 && (await rowOf(adaId)).height_cm === 170, JSON.stringify(await rowOf(adaId)));

console.log("--- 7. no console errors");
ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 500));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
