import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Build 8.2.15: workouts and weigh-ins are copied to the account (tables workouts and weight_entries) and back: first upload, edits, soft deletes, another device's changes, offline changes surviving a reload.
// Run from the repo root:  node tests/browser/workout-sync.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// The app is served with a faked Supabase, so no real account is touched.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NO_SANDBOX = process.env.CI || process.env.NO_SANDBOX ? ["--no-sandbox"] : [];
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".txt": "text/plain" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname), file = join(REPO, path === "/" ? "index.html" : path);
  if (!file.startsWith(REPO) || !existsSync(file) || /(^|[\\/])\./.test(path)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
}).listen(8784, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9347", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-wsync-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9347/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
if (!list) { console.log("FAIL  Chrome did not start (set CHROME to its path)"); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(1); }
process.on("exit", () => procs.forEach(p => { try { p.kill(); } catch {} }));
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(120); } return false; };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };
const view = (w, h = 900) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";

await view(1440);
await send("Page.navigate", { url: "http://127.0.0.1:8784/index.html" }); await sleep(500);
const signIn = email => reloaded(`SB.client.auth.signInWithPassword({email:${JSON.stringify(email)},password:"password1"}).then(()=>true)`);
const reloaded = async fn => { await ev(`window.__old = 1; ${fn}`); return waitFor(`window.__old === undefined && ${READY}`, 15000); };
const synced = () => waitFor("SB.started && SB.kstarted && SB.state==='idle' && !sbPending()", 12000);
const DBQ = (tbl, live = true) => ev(`__fake.DB[${JSON.stringify(tbl)}] ? __fake.DB[${JSON.stringify(tbl)}].filter(r => r.owner_id === "u_axcom"${live ? " && !r.deleted_at" : ""}).map(r => ({ ...r })) : []`);
const persistFake = () => ev(`(localStorage.setItem("__fakedb", JSON.stringify(__fake.DB)), true)`);
const local = kind => ev(`[...sbAllOf(${JSON.stringify(kind)})].map(x => x.e)`);
const addW = (note, minutes = 30) => ev(`(addEntry("workouts", { id: uid(), date: today(), type: "strength", minutes: ${minutes}, cal: 120, note: ${JSON.stringify(note)}, src: null, equip: null, photo: null }), render(), true)`);
const addKg = kg => ev(`(addEntry("weights", { id: uid(), date: today(), kg: ${kg} }), render(), true)`);

ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
console.log("--- 1. first upload");
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); return true; })()`);
await addW("Leg day", 45); await addW("Walk", 20); await addKg(71.5); await ev(`flush()`);
ok("sign in as A (page reloads)", await signIn("a@x.com"));
await ev(`document.querySelector('[data-act="sb-guest-import"]')?.click(); true`);
ok("sync finishes", await synced());
let w = await DBQ("workouts"), k = await DBQ("weight_entries");
ok("2 workouts and 1 weigh-in reached the account", w.length === 2 && k.length === 1, `${w.length}/${k.length}`);
const leg = w.find(r => r.notes === "Leg day");
ok("a workout row carries the right columns", leg && leg.type === "strength" && leg.duration_min === 45 && leg.calories_burned === 120 && leg.source === "manual" && /^\d{4}-\d\d-\d\d$/.test(leg.log_date) && leg.person_id === (await ev(`__fake.DB.people[0].id`)), JSON.stringify(leg));
ok("the weigh-in row carries the weight", k[0].weight_kg === 71.5, JSON.stringify(k[0]));
await ev(`flush()`); await sleep(300);
ok("they also stay in the saved months on this device", (await local("workouts")).length === 2 && (await local("weights")).length === 1);

console.log("--- 2. edits and deletes while signed in");
await addW("Evening run", 25); ok("a new workout uploads", await waitFor(`__fake.DB.workouts.filter(r => r.notes === "Evening run").length === 1`, 8000));
await ev(`(() => { const e = [...sbAllOf("workouts")].find(x => x.e.note === "Evening run"); updateEntry("workouts", e.e.id, x => { x.minutes = 35; }); return true; })()`);
ok("an edit updates the same row, not a second one", await waitFor(`__fake.DB.workouts.filter(r => r.notes === "Evening run").length === 1 && __fake.DB.workouts.find(r => r.notes === "Evening run").duration_min === 35`, 8000));
await ev(`(() => { const e = [...sbAllOf("workouts")].find(x => x.e.note === "Evening run"); removeEntry("workouts", e.e.id); return true; })()`);
ok("a delete marks the row deleted instead of removing it", await waitFor(`__fake.DB.workouts.find(r => r.notes === "Evening run")?.deleted_at`, 8000) && (await DBQ("workouts", false)).length === 3);
ok("nothing is left waiting", await synced());
await addKg(70.9); ok("a second weigh-in uploads", await waitFor(`__fake.DB.weight_entries.filter(r => !r.deleted_at).length === 2`, 8000));

console.log("--- 3. another device's changes arrive");
const pid = await ev(`__fake.DB.people[0].id`);
await ev(`(() => {
  const D = __fake.DB, walk = D.workouts.find(r => r.notes === "Walk"), leg = D.workouts.find(r => r.notes === "Leg day");
  leg.duration_min = 99; leg.notes = "Leg day (phone)";
  walk.deleted_at = new Date().toISOString();
  D.workouts.push({ id: "x1", owner_id: "u_axcom", person_id: ${JSON.stringify(pid)}, app_id: "wkfromphone1", log_date: today(), performed_at: new Date().toISOString(), type: "yoga", duration_min: 40, calories_burned: 90, source: "manual", notes: "Morning yoga", equipment: null, deleted_at: null });
  D.workouts.push({ id: "x2", owner_id: "u_axcom", person_id: ${JSON.stringify(pid)}, app_id: "wkbadtype1", log_date: today(), performed_at: new Date().toISOString(), type: "not-a-real-activity", duration_min: 5000, calories_burned: 1, source: "manual", notes: "<b>x</b>", equipment: null, deleted_at: null });
  D.weight_entries.push({ id: "x3", owner_id: "u_axcom", person_id: ${JSON.stringify(pid)}, app_id: "kgfromphone1", log_date: today(), measured_at: new Date().toISOString(), weight_kg: 70.2, deleted_at: null });
  localStorage.setItem("__fakedb", JSON.stringify(D)); return true; })()`);
await ev(`sbKick(); true`);
ok("the new workout appears here", await waitFor(`[...sbAllOf("workouts")].some(x => x.e.note === "Morning yoga" && x.e.type === "yoga")`, 10000));
const wl = await local("workouts");
ok("an edit made elsewhere replaces the entry here", wl.some(e => e.note === "Leg day (phone)" && e.minutes === 99) && !wl.some(e => e.note === "Leg day"));
ok("a workout deleted elsewhere is removed here", !wl.some(e => e.note === "Walk"));
const bad = wl.find(e => e.note === "<b>x</b>");
ok("a row with an unknown activity and absurd minutes is cleaned like any stored data", bad && bad.type === "other" && bad.minutes <= 1440, JSON.stringify(bad));
ok("the weigh-in made elsewhere appears here", (await local("weights")).some(e => e.kg === 70.2));
ok("applying them queued nothing to send back", await synced() && Object.keys(await ev(`SB.kp.workouts.pend`)).length === 0);
await ev(`location.hash = "#/workouts"; true`); await sleep(500);
ok("the Workouts screen shows the workout from the other device", await waitFor(`/yoga/i.test(document.getElementById("app").innerText)`, 4000), await ev(`document.getElementById("app").innerText.slice(0, 200)`));

console.log("--- 4. changes made offline survive a reload");
await ev(`__fake.offline = true; true`);
await addW("Offline swim", 50);
await ev(`(() => { const e = [...sbAllOf("workouts")].find(x => x.e.note === "Morning yoga"); removeEntry("workouts", e.e.id); return true; })()`);
await sleep(1800);
ok("both changes are waiting", (await ev(`Object.keys(SB.kp.workouts.pend).length`)) === 2);
await ev(`flush()`); await sleep(400);
ok("the waiting list is saved in the local cache", (await ev(`Object.keys(JSON.parse(localStorage.getItem(SB_CACHE)).kp.workouts).length`)) === 2);
await ev(`window.__old = 1; location.reload(); true`);
ok("reload (online again)", await waitFor(`window.__old === undefined && ${READY}`, 15000));
ok("the waiting changes come back from the cache", (await ev(`Object.keys(SB.kp.workouts.pend).length`)) === 2 || (await synced()));
ok("they are delivered", await waitFor(`__fake.DB.workouts.some(r => r.notes === "Offline swim" && !r.deleted_at) && __fake.DB.workouts.find(r => r.notes === "Morning yoga")?.deleted_at`, 12000));
ok("and the deleted workout stayed deleted after the pull", !(await local("workouts")).some(e => e.note === "Morning yoga"));

console.log("--- 5. a fresh device gets everything");
const before = (await DBQ("workouts")).length;
await ev(`window.__old = 1; sbSignOut(true).then(() => true)`);
ok("sign out (force) clears this device", await waitFor(`window.__old === undefined && ${READY}`, 15000) && (await ev(`S.profiles.length`)) === 0);
ok("sign back in (page reloads)", await signIn("a@x.com"));
ok("the profile, workouts and weigh-ins return", await waitFor(`S.profiles.length === 1 && [...sbAllOf("workouts")].length === ${before} && [...sbAllOf("weights")].length === 3`, 15000), `${await ev(`[...sbAllOf("workouts")].length`)} vs ${before}`);
ok("nothing is queued to upload after that", await synced() && (await ev(`sbPending()`)) === 0);

console.log("--- 6. a different account never sees them");
await ev(`window.__old = 1; sbSignOut(true).then(() => true)`);
await waitFor(`window.__old === undefined && ${READY}`, 15000);
ok("sign in as B", await signIn("b@x.com"));
await ev(`(async () => { if (!S.profiles.length) { const p = newProfile("Bo"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); } return true; })()`);
await sleep(1500);
ok("B has no workouts or weigh-ins", (await ev(`[...sbAllOf("workouts")].length`)) === 0 && (await ev(`[...sbAllOf("weights")].length`)) === 0);

ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
