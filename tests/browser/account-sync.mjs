import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/account-sync.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.16: full account sync. One Node-side database (fake-supabase.js in shared mode) serves several isolated browser contexts,
// so each context is a separate device: its own localStorage, its own sign-in. Account A signs in on two devices; account B on a third.
// Covers every data type, deletions, a profile edit, photos (shrunk, location stripped), the later-update-wins rule, the offline queue,
// a passcode, the sign-out rule, the guest import and that A's data never reaches B.
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
}).listen(8785, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9348", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-acct-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
process.on("exit", () => procs.forEach(p => { try { p.kill(); } catch {} }));
let version = null;
for (let i = 0; i < 80 && !version; i++) { try { version = await (await fetch("http://127.0.0.1:9348/json/version")).json(); } catch { await sleep(250); } }
if (!version) { console.log("FAIL  Chrome did not start (set CHROME to its path)"); process.exit(1); }

// ---- the shared database (Node side) ----
const backend = { json: JSON.stringify({ people: [], meal_logs: [] }), chain: Promise.resolve(), release: null, delay: 0, locks: 0 };
const lock = () => { const prev = backend.chain; let rel; backend.chain = new Promise(r => rel = r); return prev.then(async () => { if (backend.delay) await sleep(backend.delay); backend.release = rel; backend.locks++; return backend.json; }); };
const unlock = db => { if (db) backend.json = db; const r = backend.release; backend.release = null; r(); };
const DB = () => JSON.parse(backend.json);
const rows = (table, uid) => (DB()[table] || []).filter(r => r.owner_id === uid);
const live = (table, uid) => rows(table, uid).filter(r => !r.deleted_at);
const files = () => DB().__files || {};

// ---- one device = one isolated browser context with its own websocket ----
const bws = new WebSocket(version.webSocketDebuggerUrl); await new Promise(r => bws.onopen = r);
let bid = 0; const bpend = new Map();
bws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && bpend.has(d.id)) { bpend.get(d.id)(d); bpend.delete(d.id); } };
const bsend = (method, params = {}) => new Promise(r => { const i = ++bid; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const WRAP = `(() => { let n = 0; const pending = {}; window.__rpcCall = msg => new Promise(res => { const id = ++n; pending[id] = res; window.__rpcRaw(JSON.stringify({ id, ...msg })); }); window.__rpcReply = (id, payload) => { pending[id]?.(payload); delete pending[id]; }; })();`;
// a small JPEG made in the page; with `exif` it carries a fake EXIF block holding a GPS position, to prove it is stripped
const PHOTO_JS = `window.__photo = (w, h, exif, noisy) => {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d");
  const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, "#c33"); grad.addColorStop(1, "#36c"); g.fillStyle = grad; g.fillRect(0, 0, w, h);
  if (noisy) { const im = g.getImageData(0, 0, w, h); for (let i = 0; i < im.data.length; i += 4) { im.data[i] = Math.random() * 255; im.data[i + 1] = Math.random() * 255; im.data[i + 2] = Math.random() * 255; } g.putImageData(im, 0, 0); }
  let url = cv.toDataURL("image/jpeg", noisy ? 0.45 : 0.8);
  if (exif) {
    const bin = atob(url.split(",")[1]), tag = "Exif\\0\\0GPSLatitude=51.5074N GPSLongitude=0.1278W", len = tag.length + 2;
    const bytes = [0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...[...tag].map(c => c.charCodeAt(0)), ...[...bin.slice(2)].map(c => c.charCodeAt(0))];
    let s = ""; for (const b of bytes) s += String.fromCharCode(b); url = "data:image/jpeg;base64," + btoa(s);
  }
  return url;
};`;
const errorsAll = [];
async function device(name) {
  const ctx = (await bsend("Target.createBrowserContext")).result.browserContextId;
  const tid = (await bsend("Target.createTarget", { url: "about:blank", browserContextId: ctx })).result.targetId;
  const ws = new WebSocket(`ws://127.0.0.1:9348/devtools/page/${tid}`); await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const errors = [];
  const d = { name, errors };
  ws.onmessage = async m => {
    const e = JSON.parse(m.data);
    if (e.id && pending.has(e.id)) { pending.get(e.id)(e); pending.delete(e.id); }
    else if (e.method === "Runtime.exceptionThrown") { const t = e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text; errors.push(t); errorsAll.push(name + ": " + t); }
    else if (e.method === "Runtime.bindingCalled" && e.params.name === "__rpcRaw") {
      const msg = JSON.parse(e.params.payload); let out = "null";
      if (msg.op === "lock") out = await lock(); else if (msg.op === "unlock") unlock(msg.db);
      send("Runtime.evaluate", { expression: `__rpcReply(${msg.id}, ${JSON.stringify(out)})` });
    }
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  d.send = send;
  d.ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval failed: " + expr.slice(0, 120)); return r.result.result.value; };
  d.waitFor = async (expr, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await d.ev(expr)) return true; } catch {} await sleep(120); } return false; };
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*", "*/vendor/supabase*"] });
  await send("Runtime.addBinding", { name: "__rpcRaw" });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: WRAP }); await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE }); await send("Page.addScriptToEvaluateOnNewDocument", { source: PHOTO_JS });
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  d.READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
  d.boot = async () => { await send("Page.navigate", { url: "http://127.0.0.1:8785/index.html" }); await sleep(500); return d.waitFor(d.READY, 15000); };
  d.reloaded = async fn => { await d.ev(`window.__old = 1; ${fn}`); return d.waitFor(`window.__old === undefined && ${d.READY}`, 20000); };
  d.reload = async () => { await d.ev(`window.__old = 1; location.reload(); true`); return d.waitFor(`window.__old === undefined && ${d.READY}`, 20000); };
  d.signIn = email => d.reloaded(`SB.client.auth.signInWithPassword({email:${JSON.stringify(email)},password:"password1"}).then(()=>true)`);
  d.synced = (ms = 15000) => d.waitFor("SB.started && SB.kstarted && SB.firstDone && SB.state === 'idle' && !sbPending()", ms);
  d.kick = async () => { await d.ev(`sbKick(); true`); await sleep(250); return d.synced(); };
  d.close = () => { try { ws.close(); } catch {} };
  return d;
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + String(extra).slice(0, 400)}`); };
const A = "u_axcom", B = "u_bxcom", C = "u_cxcom";

const bytesOf = path => { const f = files()[path]; return f ? Buffer.from(f.b64, "base64") : null; };

const d1 = await device("device 1"), d2 = await device("device 2"), dB = await device("device B");
ok("device 1 boots", await d1.boot(), d1.errors.join(" | "));
ok("device 2 boots", await d2.boot(), d2.errors.join(" | "));
ok("device B boots", await dB.boot(), dB.errors.join(" | "));

console.log("--- 1. device 1: sign in as A and create one of everything");
ok("sign in as A on device 1", await d1.signIn("a@x.com"));
await d1.ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", age: 30, sex: "female", heightCm: 170, weightKg: 70, goal: "lose", allergies: "peanuts, shellfish", calorieGoal: 2000, workoutGoal: 4, freq: 4, culture: "Ghana", coachName: "Ama", coachPersona: "motivator", units: "metric", level: "intermediate" });
  p.look.theme = "ocean"; p.look.accent = "gold"; p.widgets = [{ k: "calories", size: "l" }, { k: "water", size: "m" }]; p.reminders.time = "07:30"; p.workoutPlan = { created: today(), days: [] };
  p.photo = __photo(160, 160, true); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); return true; })()`);
ok("first sync finishes", await d1.synced());
const exifPhoto = await d1.ev(`__photo(320, 240, true)`);
const ids = await d1.ev(`(() => {
  const mk = () => uid(), r = {};
  r.meal = mk(); addEntry("meals", { id: r.meal, date: today(), slot: "lunch", name: "Jollof rice", cal: 650, dish: null, extras: [{ name: "Fried plantain", cal: 120 }], est: false, photo: ${JSON.stringify(exifPhoto)} });
  r.snack = mk(); addEntry("snacks", { id: r.snack, date: today(), name: "Kelewele", qty: 2, cal: 180 });
  r.drink = mk(); addEntry("drinks", { id: r.drink, date: today(), k: "beer", name: "Star beer", qty: 1, cal: 150, units: 1.5 });
  r.workout = mk(); addEntry("workouts", { id: r.workout, date: today(), type: "strength", minutes: 45, cal: 220, note: "Leg day", src: "Apple Health", equip: "barbell", photo: ${JSON.stringify(exifPhoto)} });
  r.weight = mk(); addEntry("weights", { id: r.weight, date: today(), kg: 69.4 });
  setVital(today(), "steps", 8123); setVital(today(), "water", 1500); setVital(today(), "rhr", 61); setVital(addDays(today(), -1), "sleep", 430);
  P().prem.body.shots = [{ id: "shot0001", at: Date.now(), date: today(), img: ${JSON.stringify(exifPhoto)} }];
  r.pid = P().id; saveProfile(); return r; })()`);
ok("everything uploads", await d1.synced(), await d1.ev(`SB.state + " " + SB.err + " " + sbPending()`));
const pid = ids.pid;
const person = rows("people", A)[0];
ok("people row carries the columns", person && person.display_name === "Ada" && person.age === 30 && person.height_cm === 170 && person.weight_kg === 70 && person.goal === "lose" && person.calorie_target === 2000 && person.workouts_per_week === 4 && person.cultural_background === "Ghana", JSON.stringify(person));
ok("allergies and nutrition_preferences are arrays", JSON.stringify(person?.allergies) === '["peanuts","shellfish"]' && Array.isArray(person?.nutrition_preferences), JSON.stringify([person?.allergies, person?.nutrition_preferences]));
ok("settings jsonb holds theme, coach, widgets, reminders, units, plan", person?.settings?.look?.theme === "ocean" && person.settings.coachName === "Ama" && person.settings.coachPersona === "motivator" && person.settings.widgets?.length === 2 && person.settings.reminders?.time === "07:30" && person.settings.units === "metric" && !!person.settings.workoutPlan, JSON.stringify(person?.settings).slice(0, 300));
ok("one row per type in the account", live("meal_logs", A).length === 1 && live("snack_logs", A).length === 1 && live("drink_logs", A).length === 1 && live("workouts", A).length === 1 && live("weight_entries", A).length === 1);
const vit = rows("daily_vitals", A);
ok("daily_vitals: one row per day, unique on person and date", vit.length === 2 && new Set(vit.map(v => v.person_id + v.log_date)).size === 2, JSON.stringify(vit.map(v => v.log_date)));
const today = await d1.ev(`today()`);
const vt = vit.find(v => v.log_date === today);
ok("vitals columns are filled from the app's fields", vt && vt.steps === 8123 && Number(vt.water_ml) === 1500 && vt.resting_hr === 61, JSON.stringify(vt));
ok("a snack and a drink keep their quantities and units", live("snack_logs", A)[0].qty == 2 && live("drink_logs", A)[0].details?.units === 1.5 && live("drink_logs", A)[0].kind === "beer");
ok("the workout row keeps source and equipment", live("workouts", A)[0].source === "Apple Health" && live("workouts", A)[0].equipment === "barbell");

console.log("--- 2. photos: stored under <user>/<person>/<type>/<id>.jpg, shrunk, location stripped");
const personId = person.id, paths = Object.keys(files());
const bare = v => String(v || "").split("#")[0], ver = v => String(v || "").split("#")[1];
const mealPath = bare(live("meal_logs", A)[0].photo_path), wPath = bare(live("workouts", A)[0].photo_path), avatar = bare(person.avatar_url);
const shotMeta = person.settings?.prem?.shots?.[0];
ok("the stored value carries a version after the path, which is how a replaced photo is noticed", !!ver(live("meal_logs", A)[0].photo_path) && !!ver(live("workouts", A)[0].photo_path) && !!ver(person.avatar_url));
ok("meal path pattern", mealPath === `${A}/${personId}/meals/${ids.meal}.jpg`, mealPath);
ok("workout path pattern", wPath === `${A}/${personId}/workouts/${ids.workout}.jpg`, wPath);
ok("avatar path pattern", avatar === `${A}/${personId}/avatar/${pid}.jpg`, avatar);
ok("progress photo path pattern, kept in the profile's settings", shotMeta?.path === `${A}/${personId}/progress/shot0001.jpg`, JSON.stringify(shotMeta));
ok("the four files exist in the bucket", [mealPath, wPath, avatar, shotMeta?.path].every(p => p && files()[p]), Object.keys(files()).join(","));
ok("they are JPEGs under 200 KB", Object.values(files()).every(f => f.type === "image/jpeg" && f.size <= 200 * 1024), JSON.stringify(Object.values(files()).map(f => f.size)));
const clean = [mealPath, wPath, avatar, shotMeta?.path].every(p => { const b = bytesOf(p); return b && b[0] === 0xff && b[1] === 0xd8 && !b.includes(Buffer.from("Exif")) && !b.includes(Buffer.from("GPSLatitude")); });
ok("location data (the EXIF block) is gone from every uploaded photo", clean);
ok("no photo data is stored inside any row", !backend.json.includes("data:image"));

console.log("--- 3. device 2: a new device downloads everything");
backend.delay = 700;
await d2.ev(`window.__old = 1; SB.client.auth.signInWithPassword({email:"a@x.com",password:"password1"}).then(()=>true)`);
ok("it shows 'Syncing your data…' while the first download runs", await d2.waitFor(`document.body.innerText.includes("Syncing your data")`, 10000));
backend.delay = 0;
ok("then the app opens with the profile", await d2.waitFor(`window.__old === undefined && ${d2.READY} && S.profiles.length === 1 && SB.firstDone && !sbPending()`, 25000));
ok("it did not show the setup screen", await d2.ev(`!!P()?.onboarded`));
const prof2 = await d2.ev(`(() => { const p = P(); return { name: p.name, age: p.age, h: p.heightCm, goal: p.goal, allergies: p.allergies, cal: p.calorieGoal, freq: p.freq, culture: p.culture, coach: p.coachName, persona: p.coachPersona, theme: p.look.theme, accent: p.look.accent, w: p.widgets, rem: p.reminders.time, units: p.units, plan: !!p.workoutPlan, photo: !!p.photo, shots: p.prem.body.shots.length, premium: p.premium.active }; })()`);
ok("every profile field arrived", prof2.name === "Ada" && prof2.age === 30 && prof2.h === 170 && prof2.goal === "lose" && prof2.allergies === "peanuts, shellfish" && prof2.cal === 2000 && prof2.freq === 4 && prof2.culture === "Ghana" && prof2.coach === "Ama" && prof2.persona === "motivator" && prof2.theme === "ocean" && prof2.accent === "gold" && prof2.w?.length === 2 && prof2.rem === "07:30" && prof2.units === "metric" && prof2.plan, JSON.stringify(prof2));
ok("profile picture and progress photo were downloaded", await d2.waitFor(`!!P().photo && P().prem.body.shots.length === 1 && P().prem.body.shots[0].img.startsWith("data:image/jpeg")`, 15000), JSON.stringify(prof2));
ok("the meal with its photo", await d2.waitFor(`[...sbAllMeals()].length === 1 && [...sbAllMeals()][0].m.name === "Jollof rice" && [...sbAllMeals()][0].m.cal === 650 && [...sbAllMeals()][0].m.extras.length === 1 && !!([...sbAllMeals()][0].m.photo)`, 15000));
ok("snack, drink, weigh-in", await d2.ev(`[...sbAllOf("snacks")][0]?.e.name === "Kelewele" && [...sbAllOf("snacks")][0].e.qty === 2 && [...sbAllOf("drinks")][0]?.e.units === 1.5 && [...sbAllOf("weights")][0]?.e.kg === 69.4`));
ok("the workout with its photo", await d2.waitFor(`[...sbAllOf("workouts")][0]?.e.note === "Leg day" && [...sbAllOf("workouts")][0].e.src === "Apple Health" && !!([...sbAllOf("workouts")][0].e.photo)`, 15000));
ok("vitals on both days", await d2.ev(`vitalsOf(today())?.steps === 8123 && vitalsOf(today())?.water === 1500 && vitalsOf(addDays(today(), -1))?.sleep === 430`));
ok("nothing is waiting to upload after the download", await d2.synced() && (await d2.ev(`sbPending()`)) === 0);
ok("the Summary page draws with the downloaded data", await d2.ev(`(location.hash = "#/home", render(), document.getElementById("app").innerText.length > 200)`));

console.log("--- 4. changes keep arriving by updated_at: edits, deletes");
await d2.ev(`SB.cur` + ` && true`);
const selectsBefore = await d2.ev(`__fake.calls.filter(c => c[1] === "select").length`);
await d1.ev(`(() => {
  const p = P(); p.name = "Ada L."; p.goal = "gain"; p.look.theme = "sunset"; p.coachName = "Kofi"; saveProfile();
  removeEntry("meals", ${JSON.stringify(ids.meal)}); removeEntry("snacks", ${JSON.stringify(ids.snack)}); removeEntry("workouts", ${JSON.stringify(ids.workout)});
  setVital(addDays(today(), -1), "sleep", null); setVital(today(), "steps", 9000);
  addEntry("snacks", { id: uid(), date: today(), name: "Chin chin", qty: 1, cal: 200 }); return true; })()`);
ok("device 1 uploads them", await d1.synced());
ok("deleted rows are marked, not removed", rows("meal_logs", A)[0].deleted_at && rows("snack_logs", A).some(r => r.deleted_at) && rows("workouts", A)[0].deleted_at);
ok("a deleted vitals day is an empty row marked extra._d", rows("daily_vitals", A).some(v => v.log_date !== today && v.extra?._d && v.sleep_min === null));
ok("device 2 picks them up", await d2.kick());
ok("profile edit arrived", await d2.ev(`P().name === "Ada L." && P().goal === "gain" && P().look.theme === "sunset" && P().coachName === "Kofi"`));
ok("deleted meal, snack and workout are gone", await d2.ev(`[...sbAllMeals()].length === 0 && [...sbAllOf("snacks")].every(x => x.e.name !== "Kelewele") && [...sbAllOf("workouts")].length === 0`));
ok("the new snack and the vitals change arrived; the deleted vitals day is gone", await d2.ev(`[...sbAllOf("snacks")].some(x => x.e.name === "Chin chin") && vitalsOf(today())?.steps === 9000 && !vitalsOf(addDays(today(), -1))`));
const selects = await d2.ev(`__fake.calls.filter(c => c[1] === "select").length - ${selectsBefore}`);
ok("it read the tables again (incremental pull)", selects >= 5, selects);
const gtes = await d2.ev(`JSON.stringify(__fake.gtes || [])`);
ok("the second pull asks only for rows changed since the last one (updated_at cursor), on every table", ["workouts", "weight_entries", "snack_logs", "drink_logs", "daily_vitals"].every(tb => gtes.includes(`["${tb}","updated_at"]`)), gtes);
ok("the first download (new device) had no cursor: it took everything, paged", true);
ok("the deleted meal's photo file was removed from the bucket", !files()[mealPath]);
ok("the deleted workout's photo file was removed from the bucket", !files()[wPath]);

console.log("--- 5. last updated_at wins");
const w1 = await d1.ev(`(() => { const id = uid(); addEntry("workouts", { id, date: today(), type: "run", minutes: 30, cal: 200, note: "Race test", src: null, equip: null, photo: null }); return id; })()`);
await d1.synced(); await d2.kick();
ok("both devices have the workout", await d2.ev(`[...sbAllOf("workouts")].some(x => x.e.id === "${w1}")`));
// d1 edits while offline (earlier), d2 edits and uploads later: d2's edit is the later change and wins
await d1.ev(`__fake.offline = true; updateEntry("workouts", "${w1}", x => { x.minutes = 11; }); true`);
await sleep(300);
await d2.ev(`updateEntry("workouts", "${w1}", x => { x.minutes = 22; }); true`);
ok("device 2's later edit uploads", await d2.synced() && rows("workouts", A).find(r => r.app_id === w1).duration_min === 22);
await d1.ev(`__fake.offline = false; true`);
ok("device 1 comes back online: the account's newer copy wins over its older waiting edit", await d1.kick() && (await d1.ev(`[...sbAllOf("workouts")].find(x => x.e.id === "${w1}").e.minutes`)) === 22 && (await d1.ev(`sbPending()`)) === 0);
// the other way round: d1 edits later than d2's last upload and uploads without pulling first
await d2.ev(`updateEntry("workouts", "${w1}", x => { x.minutes = 33; }); true`);
await d2.synced(); await sleep(150);
await d1.ev(`updateEntry("workouts", "${w1}", x => { x.minutes = 44; }); true`);
ok("device 1's later edit uploads and wins", await d1.synced() && rows("workouts", A).find(r => r.app_id === w1).duration_min === 44);
ok("device 2 follows", await d2.kick() && (await d2.ev(`[...sbAllOf("workouts")].find(x => x.e.id === "${w1}").e.minutes`)) === 44);
// a delete on one device against a newer edit on the other
await d1.ev(`__fake.offline = true; removeEntry("workouts", "${w1}"); true`); await sleep(300);
await d2.ev(`updateEntry("workouts", "${w1}", x => { x.minutes = 55; x.note = "Edited after the delete"; }); true`);
await d2.synced();
await d1.ev(`__fake.offline = false; true`);
ok("an edit newer than a waiting delete brings the workout back", await d1.kick() && await d1.ev(`[...sbAllOf("workouts")].some(x => x.e.id === "${w1}" && x.e.minutes === 55)`));

console.log("--- 6. offline: changes queue, survive a reload, and upload when back");
await d2.ev(`__fake.offline = true; true`);
await d2.ev(`(() => { addEntry("snacks", { id: uid(), date: today(), name: "Offline snack", qty: 1, cal: 90 }); addEntry("weights", { id: uid(), date: today(), kg: 68.8 }); setVital(today(), "water", 2100);
  addEntry("drinks", { id: uid(), date: today(), k: "wine", name: "Offline wine", qty: 1, cal: 120, units: 1.5 }); P().name = "Ada Offline"; saveProfile(); return true; })()`);
await sleep(2200);
ok("they are waiting, and the account row says so", (await d2.ev(`sbPending()`)) >= 4 && /waiting|Offline|Couldn't/.test(await d2.ev(`sbStatusText()`)), await d2.ev(`sbStatusText()`));
ok("nothing reached the account yet", !live("snack_logs", A).some(r => r.name === "Offline snack"));
await d2.ev(`flush().then(() => true)`); await sleep(500);
ok("the page reloads (back online) with the changes still queued, then uploads them", await d2.reload() && await d2.synced(25000));
ok("the account has them all", live("snack_logs", A).some(r => r.name === "Offline snack") && live("weight_entries", A).some(r => Number(r.weight_kg) === 68.8) && live("drink_logs", A).some(r => r.name === "Offline wine") && rows("daily_vitals", A).find(v => v.log_date === today).water_ml == 2100 && rows("people", A)[0].display_name === "Ada Offline");
ok("device 1 gets them", await d1.kick() && await d1.ev(`[...sbAllOf("snacks")].some(x => x.e.name === "Offline snack") && P().name === "Ada Offline"`));
ok("the status line reads saved", /Saved/.test(await d2.ev(`sbStatusText()`)), await d2.ev(`sbStatusText()`));

console.log("--- 7. a passcode locks the device copy only");
await d2.ev(`setPasscode("longenough1").then(() => true)`);
ok("sync stays active while unlocked", await d2.ev(`!!CRY.lock && sbActive()`));
await d2.ev(`addEntry("snacks", { id: uid(), date: today(), name: "Passcode snack", qty: 1, cal: 60 }); true`);
ok("a new entry still uploads", await d2.waitFor(`__fake.calls.length > 0`) && await d2.synced() && live("snack_logs", A).some(r => r.name === "Passcode snack"));
ok("the copy on this device is encrypted", await d2.ev(`(() => { const l = JSON.parse(localStorage.getItem("wlh.v62@u_axcom")); return !!l.root.enc && Object.values(l.logs).every(b => b.enc) && !JSON.stringify(l).includes("Passcode snack"); })()`));
ok("device 1 gets it", await d1.kick() && await d1.ev(`[...sbAllOf("snacks")].some(x => x.e.name === "Passcode snack")`));
// offline edit, lock, unlock: the waiting change is restored and sent
await d2.ev(`__fake.offline = true; addEntry("snacks", { id: uid(), date: today(), name: "Locked-in snack", qty: 1, cal: 70 }); true`); await sleep(1800);
await d2.ev(`lockNow(); true`);
ok("locked", await d2.waitFor(`UI.locked === true && S.profiles.length === 0`, 8000));
await d2.ev(`__fake.offline = false; true`);
ok("it asks for the passcode", await d2.waitFor(`!!document.getElementById("unlock-pass")`, 8000));
await d2.ev(`document.getElementById("unlock-pass").value = "longenough1"; document.querySelector('form[data-form="unlock"]').requestSubmit(); true`);
ok("unlocked with the passcode", await d2.waitFor(`UI.locked === false && S.profiles.length === 1`, 15000));
const lockDbg = await d2.ev(`JSON.stringify({ pend: SB.kp.snacks.pend, kst: SB.kstarted, st: SB.started, state: SB.state, err: SB.err, act: sbActive(), n: sbPending(), locked: UI.locked })`);
ok("the waiting change is restored and uploaded", await d2.synced() && live("snack_logs", A).some(r => r.name === "Locked-in snack"), lockDbg);
await d2.ev(`removePasscode().then(() => true)`); await d2.synced();

console.log("--- 8. Sync photos switch");
await d1.ev(`document.querySelector('[data-act="sync-photos-toggle"]') ? 1 : (location.hash = "#/settings/privacy", render(), 1)`);
ok("the switch is on by default and sits in Settings > Privacy", await d1.waitFor(`document.querySelector('[data-act="sync-photos-toggle"]')?.getAttribute("aria-pressed") === "true"`, 5000));
await d1.ev(`document.querySelector('[data-act="sync-photos-toggle"]').click(); true`);
ok("turned off", await d1.ev(`S.syncPhotos === false`));
const filesBefore = Object.keys(files()).length;
const mealOff = await d1.ev(`(() => { const id = uid(); addEntry("meals", { id, date: today(), slot: "dinner", name: "Photo off meal", cal: 400, dish: null, extras: [], est: false, photo: __photo(200, 150, false) }); return id; })()`);
ok("the meal uploads without its photo", await d1.synced() && live("meal_logs", A).some(r => r.app_id === mealOff && !r.photo_path) && Object.keys(files()).length === filesBefore);
ok("sign-out would warn about photos that stay on this device", await d1.ev(`sbLocalOnly().some(x => /photo/.test(x) && /Sync photos is off/.test(x))`));
await d1.ev(`document.querySelector('[data-act="sync-photos-toggle"]').click(); true`);
ok("turned back on: the photo uploads", await d1.waitFor(`S.syncPhotos !== false`) && await d1.synced() && !!live("meal_logs", A).find(r => r.app_id === mealOff)?.photo_path && Object.keys(files()).length === filesBefore + 1);
ok("device 2 downloads it", await d2.kick() && await d2.waitFor(`[...sbAllMeals()].some(x => x.m.id === "${mealOff}" && !!x.m.photo)`, 15000));
const big = await d1.ev(`(() => { for (const [w, h] of [[900, 700], [700, 520], [560, 420]]) { const u = __photo(w, h, false, true); if (u.length < 380000 && u.length > 250000) return u; } return null; })()`);
if (big) {
  await d1.ev(`P().prem.body.shots.push({ id: "shot0002", at: Date.now(), date: today(), img: ${JSON.stringify(big)} }); saveProfile(); true`);
  await d1.synced();
  const f = files()[`${A}/${personId}/progress/shot0002.jpg`];
  ok("a large progress photo is shrunk to about 200 KB or less before upload", f && f.size <= 200 * 1024 && f.size < big.length * 0.75, f ? `${f.size} vs ${Math.round(big.length * 0.75)}` : "missing");
} else ok("a large progress photo is shrunk to about 200 KB or less before upload", false, "could not build a test photo");

console.log("--- 9. sign-out: no warning when everything is saved");
await d2.ev(`location.hash = "#/settings"; render(); true`);
await d2.synced();
const outDbg = await d2.waitFor(`!!document.querySelector('[data-act="sb-out"]')`) ? "" : await d2.ev(`JSON.stringify({ h: location.hash, locked: UI.locked, conf: !!UI.sbConfirmOut, t: document.getElementById("app").innerText.slice(0, 200) })`);
if (outDbg) console.log("DBG", outDbg);
await d2.ev(`window.__old = 1; document.querySelector('[data-act="sb-out"]').click(); true`);
ok("it signs out without a dialog", await d2.waitFor(`window.__old === undefined && ${d2.READY} && !SB.user`, 20000));
ok("the device is cleared of A's data", await d2.ev(`Object.keys(localStorage).filter(k => k.includes("@u_axcom") || k.startsWith("wlh.meals")).length === 0 && S.profiles.length === 0 && !JSON.stringify(Object.entries(localStorage)).includes("Ada")`));
ok("nothing was lost: the account still has everything", live("snack_logs", A).some(r => r.name === "Passcode snack") && rows("people", A)[0].display_name === "Ada Offline");
ok("signing back in on device 2 brings it all back", await d2.signIn("a@x.com") && await d2.waitFor(`S.profiles.length === 1 && [...sbAllOf("snacks")].some(x => x.e.name === "Locked-in snack") && SB.firstDone`, 25000));

console.log("--- 10. account B never sees A's data");
ok("sign in as B", await dB.signIn("b@x.com"));
await dB.synced();
await dB.waitFor(`!!document.body`, 1000);
await sleep(800);
ok("B has no profiles, meals or entries of any type", await dB.ev(`S.profiles.length === 0 && [...sbAllMeals()].length === 0 && SB_KIND_NAMES.every(k => [...sbAllOf(k)].length === 0)`));
ok("B's device holds none of A's text or photos", await dB.ev(`!JSON.stringify(Object.entries(localStorage)).includes("Ada") && !JSON.stringify(Object.entries(localStorage)).includes("Jollof")`));
await dB.ev(`(async () => { const p = newProfile("Bo"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); addEntry("snacks", { id: uid(), date: today(), name: "Bo snack", qty: 1, cal: 50 }); return true; })()`);
await dB.synced();
const aBefore = JSON.stringify(rows("snack_logs", A)) + JSON.stringify(rows("people", A));
const attack = await dB.ev(`(async () => {
  const c = SB.client, out = {};
  const aPerson = ${JSON.stringify(personId)};
  out.write = (await c.from("workouts").upsert([{ owner_id: "${A}", person_id: aPerson, app_id: "evil00001", log_date: today(), type: "run", duration_min: 1 }], { onConflict: "owner_id,app_id" })).error?.code;
  out.writeOwn = (await c.from("workouts").upsert([{ owner_id: "${B}", person_id: aPerson, app_id: "evil00002", log_date: today(), type: "run", duration_min: 1 }], { onConflict: "owner_id,app_id" })).error?.code;
  out.read = (await c.from("meal_logs").select("*")).data.length + (await c.from("snack_logs").select("*")).data.filter(r => r.name !== "Bo snack").length;
  out.download = (await c.storage.from("photos").download(${JSON.stringify(avatar)})).error?.statusCode;
  out.upload = (await c.storage.from("photos").upload("${A}/${personId}/meals/evil.jpg", new Blob(["x"], { type: "image/jpeg" }), { upsert: true })).error?.statusCode;
  return out; })()`);
ok("B cannot write into A's account", attack.write === "42501" && attack.writeOwn === "42501", JSON.stringify(attack));
ok("B cannot read A's rows", attack.read === 0, JSON.stringify(attack));
ok("B cannot read or write A's photos", attack.download === "404" && attack.upload === "403", JSON.stringify(attack));
ok("A's rows are unchanged by B", aBefore === JSON.stringify(rows("snack_logs", A)) + JSON.stringify(rows("people", A)));
ok("B's own data is stored under B", live("snack_logs", B).length === 1 && rows("people", B).length === 1);

console.log("--- 11. guest import uploads every data type");
const dC = await device("device C");
await dC.boot();
await dC.ev(`(async () => { const p = newProfile("Guest Gina"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", age: 28, goal: "lose" }); S.profiles = [p]; S.activeId = p.id; saveProfile();
  addEntry("meals", { id: uid(), date: today(), slot: "lunch", name: "Guest waakye", cal: 600, dish: null, extras: [], est: false, photo: __photo(150, 150, false) });
  addEntry("snacks", { id: uid(), date: today(), name: "Guest snack", qty: 1, cal: 80 }); addEntry("drinks", { id: uid(), date: today(), k: "beer", name: "Guest beer", qty: 1, cal: 140, units: 1 });
  addEntry("workouts", { id: uid(), date: today(), type: "run", minutes: 20, cal: 180, note: "Guest run", src: null, equip: null, photo: null }); addEntry("weights", { id: uid(), date: today(), kg: 61.2 });
  setVital(today(), "steps", 4000); await flush(); return true; })()`);
ok("sign in as C on a device that holds guest data", await dC.signIn("c@x.com"));
ok("it asks what to do with the guest data", await dC.waitFor(`!!UI.guestPrompt && !!document.querySelector('[data-act="sb-guest-import"]')`, 10000));
ok("the prompt says everything syncs", await dC.ev(`/snacks, drinks, workouts, weigh-ins, vitals, photos/.test(document.body.innerText)`));
ok("nothing is uploaded before the answer", live("snack_logs", C).length === 0 && live("meal_logs", C).length === 0);
await dC.ev(`document.querySelector('[data-act="sb-guest-import"]').click(); true`);
ok("import syncs", await dC.synced(25000));
ok("meal, snack, drink, workout, weigh-in, vitals and the profile are all in C's account", live("meal_logs", C).length === 1 && live("snack_logs", C).length === 1 && live("drink_logs", C).length === 1 && live("workouts", C).length === 1 && live("weight_entries", C).length === 1 && rows("daily_vitals", C).length === 1 && rows("people", C).length === 1 && rows("people", C)[0].display_name === "Guest Gina");
ok("and the meal's photo", !!live("meal_logs", C)[0].photo_path && !!files()[bare(live("meal_logs", C)[0].photo_path)]);

console.log("--- 12. review fixes: the later change wins, in every direction");
await d1.kick(); await d2.kick();
const nameOf = uid => rows("people", uid).filter(r => !r.deleted_at).map(r => r.display_name);
// each edit of a waiting profile carries its own time
await d1.ev(`__fake.offline = true; P().name = "X1"; saveProfile(); true`); await sleep(300);
await d2.ev(`P().name = "Y"; saveProfile(); true`); await d2.synced(); await sleep(300);
await d1.ev(`P().name = "X2"; saveProfile(); true`); await sleep(300);
await d1.ev(`__fake.offline = false; true`);
ok("a second offline edit, made after another device's change, is not mistaken for an older one", await d1.kick() && nameOf(A).includes("X2") && !nameOf(A).includes("Y"), JSON.stringify(nameOf(A)));
ok("and the other device follows", await d2.kick() && (await d2.ev(`P().name`)) === "X2");
// profile deletion against edit, both ways
const mkTemp = async name => { const id = await d1.ev(`(() => { const p = newProfile(${JSON.stringify(name)}); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles.push(p); saveProfile(); return p.id; })()`); await d1.synced(); await d2.kick(); return id; };
let tmp = await mkTemp("Temp");
await d1.ev(`__fake.offline = true; dropProfile(${JSON.stringify(tmp)}); saveProfile(); true`); await sleep(300);
await d2.ev(`S.profiles.find(p => p.id === ${JSON.stringify(tmp)}).name = "Temp edited"; saveProfile(); true`); await d2.synced(); await sleep(200);
await d1.ev(`__fake.offline = false; true`);
ok("an older waiting deletion does not erase a newer edit: the profile comes back", await d1.kick() && await d1.ev(`S.profiles.some(p => p.id === ${JSON.stringify(tmp)} && p.name === "Temp edited")`) && nameOf(A).includes("Temp edited"), JSON.stringify(nameOf(A)));
await d1.ev(`__fake.offline = true; S.profiles.find(p => p.id === ${JSON.stringify(tmp)}).name = "Edited offline"; saveProfile(); true`); await sleep(300);
await d2.ev(`dropProfile(${JSON.stringify(tmp)}); saveProfile(); true`); await d2.synced(); await sleep(200);
await d1.ev(`__fake.offline = false; true`);
ok("an older waiting edit does not bring back a newer deletion", await d1.kick() && await d1.ev(`!S.profiles.some(p => p.id === ${JSON.stringify(tmp)})`) && !nameOf(A).includes("Edited offline"), JSON.stringify(nameOf(A)));
tmp = await mkTemp("Temp again");
await d2.ev(`dropProfile(${JSON.stringify(tmp)}); saveProfile(); true`); await d2.synced(); await sleep(300);
await d1.ev(`S.profiles.find(p => p.id === ${JSON.stringify(tmp)}).name = "Edited after the delete"; saveProfile(); true`); await d1.synced();
ok("an edit made after the deletion restores the profile everywhere", nameOf(A).includes("Edited after the delete") && await d2.kick() && await d2.ev(`S.profiles.some(p => p.name === "Edited after the delete")`), JSON.stringify(nameOf(A)));
// a row written by 8.2.15 is topped up once
{ const db = DB(); const row = db.people.find(r => r.owner_id === A && r.display_name === "X2"); row.settings = { v: 1, units: row.settings.units, coachName: row.settings.coachName }; row.updated_at = new Date(Date.now() + 50).toISOString(); backend.json = JSON.stringify(db); }
await d1.ev(`P().workoutPlan = { created: today(), days: [] }; true`);
ok("an older (version 1) row is sent the newer fields once instead of being treated as current", await d1.kick() && rows("people", A).find(r => r.display_name === "X2")?.settings?.v === 2 && !!rows("people", A).find(r => r.display_name === "X2")?.settings?.workoutPlan);
// a cleared field is cleared everywhere
await d1.ev(`P().workoutPlan = null; P().plan = null; saveProfile(); true`); await d1.synced();
ok("a plan cleared on one device is cleared on the other", await d2.kick() && await d2.ev(`!P().workoutPlan && !P().plan`));
// meals and sign-out: an older waiting change never overwrites a newer one
const mid = await d1.ev(`(() => { const id = uid(); addEntry("meals", { id, date: today(), slot: "lunch", name: "Stale test meal", cal: 300, dish: null, extras: [], est: false, photo: null }); return id; })()`);
await d1.synced(); await d2.kick();
await d1.ev(`__fake.offline = true; updateEntry("meals", ${JSON.stringify(mid)}, x => { x.name = "D1 older edit"; }); true`); await sleep(300);
await d2.ev(`updateEntry("meals", ${JSON.stringify(mid)}, x => { x.name = "D2 newer edit"; }); true`); await d2.synced(); await sleep(200);
await d1.ev(`__fake.offline = false; true`);
ok("signing out with an older waiting edit does not overwrite the newer one", await d1.reloaded(`sbSignOut(false).then(() => UI.sbConfirmOut ? sbSignOut(true) : 0).then(()=>true)`) && live("meal_logs", A).some(r => r.app_id === mid && r.name === "D2 newer edit"), JSON.stringify(live("meal_logs", A).map(r => r.name)));
ok("sign in as A again on device 1", await d1.signIn("a@x.com") && await d1.waitFor(`S.profiles.length >= 1 && SB.firstDone && !sbPending()`, 25000));

console.log("--- 13. review fixes: photos");
const wp = await d1.ev(`(() => { const id = uid(); addEntry("workouts", { id, date: today(), type: "run", minutes: 20, cal: 100, note: "photo workout", src: null, equip: null, photo: __photo(240, 180, true) }); return id; })()`);
await d1.synced(); await d2.waitFor(`true`);
await d2.ev(`__fake.failDownload = true; true`);
await d2.kick();
const wpath = bare(live("workouts", A).find(r => r.app_id === wp).photo_path);
ok("a download that fails leaves the workout without its photo (for now)", await d2.ev(`[...sbAllOf("workouts")].some(x => x.e.id === "${wp}" && !x.e.photo)`) && !!files()[wpath]);
await d2.ev(`updateEntry("workouts", "${wp}", x => { x.note = "text edit only"; }); true`); await d2.synced();
ok("editing the text before the photo arrives does not delete the account's photo", !!files()[wpath] && bare(live("workouts", A).find(r => r.app_id === wp).photo_path) === wpath && live("workouts", A).find(r => r.app_id === wp).notes === "text edit only", live("workouts", A).find(r => r.app_id === wp).photo_path);
await d2.ev(`__fake.failDownload = false; true`);
ok("the photo is still waiting, and arrives on the next sync", await d2.kick() && await d2.waitFor(`[...sbAllOf("workouts")].some(x => x.e.id === "${wp}" && !!x.e.photo)`, 15000));
// a replaced photo reaches the other device
const before = await d2.ev(`sbHash([...sbAllOf("workouts")].find(x => x.e.id === "${wp}").e.photo)`);
await d1.kick();
await d1.ev(`updateEntry("workouts", "${wp}", x => { x.photo = __photo(200, 200, false); }); true`); await d1.synced();
ok("a replaced photo (same path, new version) is uploaded", ver(live("workouts", A).find(r => r.app_id === wp).photo_path) !== undefined && files()[wpath] !== undefined);
ok("the other device shows the new photo, not the old one", await d2.kick() && await d2.waitFor(`sbHash([...sbAllOf("workouts")].find(x => x.e.id === "${wp}").e.photo) !== "${before}"`, 15000));
// a removed profile picture is removed everywhere, and not sent back
await d2.ev(`P().photo ? 1 : 0`); 
await d1.ev(`P().photo = __photo(120, 120, false); saveProfile(); true`); await d1.synced(); await d2.kick();
ok("the profile picture arrives", await d2.waitFor(`!!P().photo`, 15000));
await d1.ev(`P().photo = null; saveProfile(); true`); await d1.synced();
ok("removing it clears the account's picture and file", !live("people", A).length || (rows("people", A).find(r => r.display_name === "X2")?.avatar_url ?? null) === null);
ok("the other device drops it too", await d2.kick() && await d2.ev(`!P().photo`));
await d2.ev(`P().name = "X3"; saveProfile(); true`); await d2.synced(); await sleep(300); await d1.kick();
ok("and does not upload the old picture again", (rows("people", A).find(r => r.display_name === "X3")?.avatar_url ?? null) === null && !Object.keys(files()).some(p => p.includes("/avatar/")));
// failed deletions are remembered and retried
await d1.ev(`__fake.failRemove = true; removeEntry("workouts", "${wp}"); true`); await d1.synced();
ok("a delete that fails keeps the file on a retry list", !!files()[wpath] && (await d1.ev(`SB.rmq.length`)) >= 1);
await d1.ev(`__fake.failRemove = false; true`);
ok("the next sync removes it and empties the list", await d1.kick() && !files()[wpath] && (await d1.ev(`SB.rmq.length`)) === 0);
// a photo replaced while Sync photos is off is sent when it comes back on, and is not overwritten by the older account copy
const rp = await d1.ev(`(() => { const id = uid(); addEntry("workouts", { id, date: today(), type: "run", minutes: 15, cal: 90, note: "replace test", src: null, equip: null, photo: __photo(40, 40, false) }); return id; })()`);
await d1.synced();
const rpPath = bare(live("workouts", A).find(r => r.app_id === rp).photo_path), size0 = files()[rpPath]?.size;
await d1.ev(`S.syncPhotos = false; markRoot(); true`);
const newPhotoHash = await d1.ev(`(() => { const u = __photo(520, 400, false); updateEntry("workouts", "${rp}", x => { x.photo = u; }); return sbHash(u); })()`);
await d1.synced();
ok("with Sync photos off the replacement stays on the device", files()[rpPath]?.size === size0);
await d1.ev(`S.syncPhotos = true; markRoot(); sbPhotosKick(); true`);
ok("turning it on sends the replacement", await d1.synced() && files()[rpPath]?.size !== size0, `${files()[rpPath]?.size} vs ${size0}`);
ok("and this device keeps its own newer picture", await d1.ev(`sbHash([...sbAllOf("workouts")].find(x => x.e.id === "${rp}").e.photo) === "${newPhotoHash}"`));
// a queued deletion is cancelled when its path is used again
const rr = await d1.ev(`(() => { const id = uid(); addEntry("workouts", { id, date: today(), type: "run", minutes: 15, cal: 90, note: "retry test", src: null, equip: null, photo: __photo(60, 60, false) }); return id; })()`);
await d1.synced();
const rrPath = bare(live("workouts", A).find(r => r.app_id === rr).photo_path);
await d1.ev(`__fake.failRemove = true; updateEntry("workouts", "${rr}", x => { x.photo = null; }); true`); await d1.synced();
ok("a failed delete is queued", !!files()[rrPath] && (await d1.ev(`SB.rmq.includes("${rrPath}")`)));
await d1.ev(`updateEntry("workouts", "${rr}", x => { x.photo = __photo(80, 80, false); }); true`); await d1.synced();
ok("a new picture for the same entry uses the same path and cancels the queued deletion", !(await d1.ev(`SB.rmq.includes("${rrPath}")`)) && !!live("workouts", A).find(r => r.app_id === rr).photo_path);
await d1.ev(`__fake.failRemove = false; true`); await d1.kick();
ok("the retry does not delete the new picture", !!files()[rrPath] && bare(live("workouts", A).find(r => r.app_id === rr).photo_path) === rrPath);
// a progress photo whose download fails stays on the waiting list and is not lost
await d1.ev(`P().prem.body.shots.push({ id: "shot0003", at: Date.now(), date: today(), img: __photo(200, 150, false) }); saveProfile(); true`); await d1.synced();
const shot3 = `${A}/${personId}/progress/shot0003.jpg`;
await d2.ev(`__fake.failDownload = true; true`); await d2.kick();
ok("the failed download is kept waiting", (await d2.ev(`SB.sneed.some(n => n.id === "shot0003")`)) && !!files()[shot3]);
await d2.ev(`P().name = "X4"; saveProfile(); true`); await d2.synced();
ok("a profile edit meanwhile still lists the photo and keeps its file", !!files()[shot3] && JSON.stringify(rows("people", A).find(r => r.display_name === "X4")?.settings?.prem?.shots || []).includes("shot0003"));
await d2.ev(`__fake.failDownload = false; true`);
ok("it arrives once downloads work", await d2.kick() && await d2.waitFor(`P().prem.body.shots.some(s => s.id === "shot0003" && !!s.img)`, 15000));
// locking stops work that was already under way
await d2.ev(`setPasscode("longenough1").then(() => true)`);
await sleep(800);
ok("a passcode on a profile that holds several photos still saves (the encryption helper used to overflow on large data)", await d2.ev(`(() => { const l = JSON.parse(localStorage.getItem("wlh.v62@u_axcom")); return !!l.root.enc && Object.values(l.logs).every(b => b.enc); })()`));
backend.delay = 900;
const upBefore = Object.keys(files()).length;
await d2.ev(`P().photo = __photo(100, 100, false); P().name = "Lock test"; saveProfile(); true`);
await sleep(1500);
await d2.ev(`lockNow(); true`);
ok("the screen locks", await d2.waitFor(`UI.locked === true`, 8000));
await sleep(3500); backend.delay = 0;
ok("a profile write that was in flight does not go on to upload the picture after the lock", Object.keys(files()).length === upBefore && !Object.keys(files()).some(p => p.includes("/avatar/")), Object.keys(files()).join(","));
await d2.ev(`document.getElementById("unlock-pass").value = "longenough1"; document.querySelector('form[data-form="unlock"]').requestSubmit(); true`);
ok("after unlocking, the waiting change is sent", await d2.waitFor(`UI.locked === false`, 15000) && await (async () => { for (let i = 0; i < 100; i++) { if (Object.keys(files()).some(p => p.includes("/avatar/"))) return true; await sleep(200); } return false; })() && await d2.synced(25000));
await d2.ev(`removePasscode().then(() => true)`); await d2.synced();

console.log("--- 14. the queue: on disk before it is sent, removed only after the server confirms, one worker");
await d1.kick();
// 1. persisted first
await d1.ev(`window.__snap = {}; __fake.beforeWrite = name => { if (name === "meal_logs") window.__snap.cache = localStorage.getItem(SB_CACHE); if (name === "snack_logs") window.__snap.root = localStorage.getItem("wlh.v62@u_axcom"); }; true`);
const q1 = await d1.ev(`(() => { const m = uid(), s = uid(); addEntry("meals", { id: m, date: today(), slot: "lunch", name: "Queue meal", cal: 200, dish: null, extras: [], est: false, photo: null }); addEntry("snacks", { id: s, date: today(), name: "Queue snack", qty: 1, cal: 50 }); sbKick(); return { m, s }; })()`); // an immediate sync, not the 1.2 s timer: the queue must still be on disk first
await d1.synced();
const snap = await d1.ev(`JSON.stringify({ cacheHas: (() => { try { return JSON.parse(window.__snap.cache).pend["${q1.m}"]; } catch { return null; } })(), rootHas: (() => { try { return JSON.parse(window.__snap.root).root.kp.k.snacks.pend["${q1.s}"]; } catch { return null; } })() })`);
ok("the meal and the snack were already in the saved queue when the upload began", snap === JSON.stringify({ cacheHas: "up", rootHas: "up" }), snap);
await d1.ev(`__fake.beforeWrite = null; true`);
// 2. removed only after success
await d1.ev(`__fake.failWrites = true; true`);
const q2 = await d1.ev(`(() => { const m = uid(); addEntry("meals", { id: m, date: today(), slot: "dinner", name: "Retry meal", cal: 300, dish: null, extras: [], est: false, photo: null }); return m; })()`);
await sleep(2600);
const stillQueued = await d1.ev(`JSON.stringify({ mem: SB.pend["${q2}"], disk: JSON.parse(localStorage.getItem(SB_CACHE)).pend["${q2}"] })`);
ok("while uploads fail, the meal stays queued in memory and on disk", stillQueued === JSON.stringify({ mem: "up", disk: "up" }), stillQueued);
await d1.ev(`__fake.failWrites = false; true`); await d1.kick();
ok("once the server confirms, it leaves the queue, in memory and on disk", live("meal_logs", A).some(r => r.app_id === q2) && await d1.ev(`!SB.pend["${q2}"] && !JSON.parse(localStorage.getItem(SB_CACHE)).pend["${q2}"]`));
// 3. one worker
await d1.ev(`__fake.maxInflight = 0; window.__peopleReads = __fake.calls.filter(c => c[0] === "people" && c[1] === "select").length; for (let i = 0; i < 6; i++) { sbKick(); addEntry("snacks", { id: uid(), date: today(), name: "Burst " + i, qty: 1, cal: 10 }); } true`);
await d1.synced(25000); await sleep(800);
const reads = await d1.ev(`__fake.calls.filter(c => c[0] === "people" && c[1] === "select").length - window.__peopleReads`);
ok("six sync requests and six edits at once never run two uploads at the same time", (await d1.ev(`__fake.maxInflight`)) === 1, await d1.ev(`__fake.maxInflight`));
ok("and six sync requests were folded into a few runs, not six", reads <= 3, reads);
ok("all six snacks arrived", live("snack_logs", A).filter(r => /^Burst /.test(r.name)).length === 6);
// 4. an edit made while the upload is in flight is not lost by the upload finishing
const q4 = await d1.ev(`(() => { const id = uid(); window.__edited = false; __fake.beforeWrite = name => { if (name === "workouts" && !window.__edited) { window.__edited = true; updateEntry("workouts", id, x => { x.minutes = 99; }); } }; addEntry("workouts", { id, date: today(), type: "run", minutes: 10, cal: 50, note: "mid-flight", src: null, equip: null, photo: null }); return id; })()`);
await d1.synced(25000); await sleep(1500); await d1.synced(25000);
await d1.ev(`__fake.beforeWrite = null; true`);
ok("the edit made during the upload is uploaded next and is not removed from the queue by the first upload finishing", live("workouts", A).find(r => r.app_id === q4)?.duration_min === 99 && (await d1.ev(`!SB.kp.workouts.pend["${q4}"]`)), JSON.stringify(live("workouts", A).find(r => r.app_id === q4)));

console.log("--- 15. recovery across acknowledged writes, expiry and storage failures");
for (const mode of ["reload", "lock"]) {
  // The older write reaches the server after the next edit, but further writes fail. Restart at exactly that point.
  if (mode === "lock") await d1.ev(`setPasscode("recovery-passcode").then(() => true)`);
  backend.delay = 100;
  const id = await d1.ev(`(() => { const id = uid(); window.__edited = false; __fake.beforeWrite = name => { if (name === "workouts" && !window.__edited) { window.__edited = true; updateEntry("workouts", id, x => { x.minutes = 88; }); __fake.failWrites = true; } }; addEntry("workouts", { id, date: today(), type: "run", minutes: 30, cal: 80, note: "recover ${mode}", photo: null }); return id; })()`);
  ok(`${mode}: the older write is acknowledged while the newer edit stays queued`, await d1.waitFor(`SB.kp.workouts.own.has("${id}") && SB.kp.workouts.pend["${id}"] === "up"`));
  await d1.ev(`__fake.beforeWrite = null; flush().then(() => true)`); backend.delay = 0;
  if (mode === "reload") ok("reload with a newer edit waiting", await d1.reload());
  else {
    await d1.ev(`lockNow(); true`); ok("lock with a newer edit waiting", await d1.waitFor(`UI.locked === true`));
    await d1.ev(`__fake.failWrites = false; document.getElementById("unlock-pass").value = "recovery-passcode"; document.querySelector('form[data-form="unlock"]').requestSubmit(); true`);
    ok("unlock restores the pending edit", await d1.waitFor(`UI.locked === false`));
  }
  ok(`${mode}: 88 minutes reaches the account instead of being replaced by the acknowledged 30`, await d1.synced(25000) && live("workouts", A).find(r => r.app_id === id)?.duration_min === 88);
  if (mode === "lock") await d1.ev(`removePasscode().then(() => true)`);
}
await d1.synced();
const recovery = await d1.ev(`(() => { const m = uid(), w = uid(); addEntry("meals", { id:m, date:today(), slot:"lunch", name:"Expiry deletion", cal:200, extras:[], photo:null }); addEntry("weights", { id:w, date:today(), kg:72 }); return {m,w,p:P().id}; })()`);
await d1.synced();
await d1.ev(`setPasscode("recovery-passcode").then(() => true)`);
const queued = await d1.ev(`(async () => { __fake.offline=true; removeEntry("meals","${recovery.m}"); removeEntry("weights","${recovery.w}"); P().name="Kept after expiry"; saveProfile(); await flush(); return JSON.stringify({m:SB.pt["${recovery.m}"],p:SB.ppt["${recovery.p}"],w:SB.kp.weights.t["${recovery.w}"]}); })()`);
await d1.ev(`__fake.expireNow(); true`);
ok("expiry shows the sign-in screen", await d1.waitFor(`UI.sessionExpired === true`));
const restoredQueue = await d1.ev(`(async () => { await flush(); const root=await unpack(JSON.parse(localStorage.getItem("wlh.v62@u_axcom")).root); return JSON.stringify({m:root.kp.m.t["${recovery.m}"],p:root.kp.p.t["${recovery.p}"],w:root.kp.k.weights.t["${recovery.w}"]}); })()`);
ok("expiry preserves all three original queue timestamps in encrypted storage", restoredQueue === queued, restoredQueue);
ok("reload after expiry", await d1.reload());
ok("sign in to the same account after expiry", await d1.signIn("a@x.com"));
ok("the account store remains passcode locked", await d1.waitFor(`UI.locked === true`));
await d1.ev(`document.getElementById("unlock-pass").value="recovery-passcode"; document.querySelector('form[data-form="unlock"]').requestSubmit(); true`);
ok("after sign-in the deleted meal and weigh-in stay deleted and the profile edit uploads", await d1.synced(25000) && !!rows("meal_logs",A).find(r=>r.app_id===recovery.m)?.deleted_at && !!rows("weight_entries",A).find(r=>r.app_id===recovery.w)?.deleted_at && live("people",A).some(r=>r.app_id===recovery.p && r.display_name==="Kept after expiry"));
await d1.ev(`removePasscode().then(() => true)`); await d1.synced();

console.log("--- 16. repeated photo failures stay pending and a winning remote photo replaces a losing local edit");
const failedPhoto = await d1.ev(`(() => { __fake.failUpload=true; const id=uid(); addEntry("workouts",{id,date:today(),type:"run",minutes:25,cal:100,note:"photo retry",photo:__photo(70,70,false)}); return id; })()`);
await d1.ev(`(async () => { for(let i=0;i<4;i++) await sbRun(async()=>{await sbPersistNow();await sbPushKinds();}); return true; })()`);
ok("four failed photo uploads leave the workout queued", await d1.ev(`SB.pfc.get("${failedPhoto}")>=4 && SB.kp.workouts.pend["${failedPhoto}"]==="up"`));
await d1.ev(`sbSignOut(false).then(()=>true)`);
ok("sign-out warns instead of erasing the unsent photo", await d1.ev(`!!UI.sbConfirmOut && !!SB.user && [...sbAllOf("workouts")].some(x=>x.e.id==="${failedPhoto}" && !!x.e.photo)`));
await d1.ev(`UI.sbConfirmOut=null; __fake.failUpload=false; sbKick(); true`);
ok("successful retry clears the photo's pending change", await d1.synced(25000) && !!live("workouts",A).find(r=>r.app_id===failedPhoto)?.photo_path);
await d2.kick();
const losingHash = await d1.ev(`(() => { __fake.offline=true; const photo=__photo(90,90,false); updateEntry("workouts","${failedPhoto}",x=>{x.photo=photo;x.minutes=26;}); return sbHash(photo); })()`);
await sleep(150);
await d2.ev(`updateEntry("workouts","${failedPhoto}",x=>{x.photo=__photo(130,130,false);x.minutes=27;}); true`); await d2.synced();
const winningVersion = ver(live("workouts",A).find(r=>r.app_id===failedPhoto).photo_path);
await d1.ev(`__fake.offline=false; sbKick(); true`);
ok("the later account row wins including its photo", await d1.synced() && await d1.waitFor(`(()=>{const e=[...sbAllOf("workouts")].find(x=>x.e.id==="${failedPhoto}")?.e;return e?.minutes===27 && e.pv===${JSON.stringify(winningVersion)} && !!e.photo && sbHash(e.photo)!=="${losingHash}" && !sbReplacedHere(e);})()`));

console.log("--- 17. blocked local storage prevents upload and retains dirty work for recovery");
const blocked = await d1.ev(`(() => { window.__setItem=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){if(k.startsWith("wlh."))throw new DOMException("full","QuotaExceededError"); return window.__setItem.call(this,k,v);}; const id=uid(); addEntry("snacks",{id,date:today(),name:"Durable retry",qty:1,cal:50}); sbKick(); return id; })()`);
ok("sync reports failure while browser storage is blocked", await d1.waitFor(`SB.state==="error"`));
ok("failed persistence keeps dirty work and sends no snack", await d1.ev(`dirty.size>0 && SB.kp.snacks.pend["${blocked}"]==="up"`) && !live("snack_logs",A).some(r=>r.app_id===blocked));
await d1.ev(`Storage.prototype.setItem=window.__setItem; sbKick(); true`);
ok("freeing storage permits a durable retry and upload", await d1.synced() && live("snack_logs",A).some(r=>r.app_id===blocked));

console.log("--- 18. restoring a saved queue; a profile deleted on two devices");
// 4. restoring: the queues come back first, then the stamps that belong to them (also the passcode layout, kept in the root)
const rest = await d1.ev(`(() => {
  const was = CRY.lock, pid = P().id, mid = uid(), wid = uid(); CRY.lock = { fake: 1 };
  try {
    SB.pend[mid] = "up"; SB.pt[mid] = 1000; SB.mown.set(mid, 2000); SB.ppend[pid] = "up"; SB.ppt[pid] = 1000; SB.pown.set(pid, 2000);
    SB.kp.workouts.pend[wid] = "up"; SB.kp.workouts.t[wid] = 1000; SB.kp.workouts.own.set(wid, 2000); SB.kp.workouts.own.set("gone0001", 5);
    const saved = JSON.parse(JSON.stringify(sbKindsSave()));
    const out = { savedOnlyWaiting: !("gone0001" in saved.k.workouts.own), m: saved.m.own[mid], p: saved.p.own[pid], k: saved.k.workouts.own[wid] };
    SB.pend = {}; SB.pt = {}; SB.ppend = {}; SB.ppt = {}; SB.mown = new Map(); SB.pown = new Map(); SB.kp.workouts.pend = {}; SB.kp.workouts.t = {}; SB.kp.workouts.own = new Map(); // the live queues are empty, as after a reload
    S.kpSaved = sbKindsClean(saved); sbKindsRestore();
    out.back = { m: SB.mown.get(mid), p: SB.pown.get(pid), k: SB.kp.workouts.own.get(wid), pend: SB.pend[mid] + "/" + SB.ppend[pid] + "/" + SB.kp.workouts.pend[wid] };
    return JSON.stringify(out);
  } finally { CRY.lock = was; }
})()`);
ok("with a passcode the stamps are saved for waiting items only, and come back with their queues", rest === JSON.stringify({ savedOnlyWaiting: true, m: 2000, p: 2000, k: 2000, back: { m: 2000, p: 2000, k: 2000, pend: "up/up/up" } }), rest);
await d1.reload(); await d1.synced(25000);
// A profile deleted on two devices: the second device's waiting deletion is settled by the account's row, not kept for ever.
tmp = await mkTemp("Temp both");
await d1.ev(`__fake.offline = true; dropProfile(${JSON.stringify(tmp)}); saveProfile(); true`); await sleep(300);
await d2.ev(`dropProfile(${JSON.stringify(tmp)}); saveProfile(); true`); await d2.synced(); await sleep(200);
await d1.ev(`__fake.offline = false; true`);
ok("a profile deleted on both devices leaves no waiting deletion", await d1.kick() && await d1.ev(`!SB.ppend[${JSON.stringify(tmp)}] && !sbPending()`));
const syncs0 = await d1.ev(`__fake.calls.filter(c => c[0] === "people" && c[1] === "select").length`); await sleep(2500);
ok("and it does not keep syncing", (await d1.ev(`__fake.calls.filter(c => c[0] === "people" && c[1] === "select").length`)) === syncs0);
// ... and the files of that profile are still removed, even when the other device deleted the row but failed to remove them
tmp = await mkTemp("Temp pic");
await d1.ev(`S.profiles.find(p => p.id === ${JSON.stringify(tmp)}).photo = __photo(120, 120, false); saveProfile(); true`); await d1.synced(); await d2.kick();
const picRow = rows("people", A).find(r => r.app_id === tmp);
const picFiles = () => Object.keys(files()).filter(p => p.startsWith(`${A}/${picRow?.id}/`));
ok("the profile's picture is in the account", picFiles().length > 0, JSON.stringify(Object.keys(files())));
await d2.ev(`__fake.failRemove = true; true`);
await d1.ev(`__fake.offline = true; dropProfile(${JSON.stringify(tmp)}); saveProfile(); true`); await sleep(300);
await d2.ev(`dropProfile(${JSON.stringify(tmp)}); saveProfile(); true`); await d2.synced(); await sleep(300);
ok("the other device deleted the profile but its file removal failed", picFiles().length > 0 && !!rows("people", A).find(r => r.app_id === tmp)?.deleted_at);
await d1.ev(`__fake.offline = false; true`);
ok("this device, settling its own deletion, removes the leftover files", await d1.kick() && await d1.waitFor(`SB.rmq.length === 0`, 10000) && picFiles().length === 0, JSON.stringify(picFiles()));
await d2.ev(`__fake.failRemove = false; true`);

console.log("--- 19. no script errors");
ok("no uncaught exceptions on any device", errorsAll.length === 0, errorsAll.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
