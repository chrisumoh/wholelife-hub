import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run from the repo root:  node tests/browser/security.mjs   (needs Node 22+, Python 3 and Chrome)
// Checks docs/SECURITY.md sections 3 and 4 in a real browser:
//   (a) a profile name that is markup is shown as plain text, and nothing runs;
//   (b) data from one account is never shown to, or copied for, the next account on the same browser.
// The supabase-js CDN script is blocked and replaced with fake-supabase.js, so no real account is touched.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const NO_SANDBOX = process.env.CI || process.env.NO_SANDBOX ? ["--no-sandbox"] : [];   // CI runners run Chrome as root
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
procs.push(spawn(PYTHON, ["-m", "http.server", "8766", "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" }));
procs.push(spawn(CHROME, ["--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-sec-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }));
// Wait for Chrome's debugging port instead of a fixed sleep: a cold start on a CI runner can take several seconds.
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9334/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
if (!list) { console.log("FAIL  Chrome did not start (set CHROME to its path)"); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(1); }
// Never leave Chrome or the server running if the test throws: a leftover Chrome on the same port would poison the next test.
process.on("exit", () => procs.forEach(p => { try { p.kill(); } catch {} }));
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = []; const dialogs = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  else if (d.method === "Page.javascriptDialogOpening") { dialogs.push(d.params.message); send("Page.handleJavaScriptDialog", { accept: true }); } // an alert() means script ran
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval failed: " + expr); return r.result.result.value; };
const waitFor = async (expr, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(150); } return false; };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const ready = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
const boot = async (hash = "") => { await send("Page.navigate", { url: "http://127.0.0.1:8766/index.html" + hash }); await sleep(500); return waitFor(ready, 15000); };
// Sign in through the page; the app reloads itself when the account changes, so wait for the fresh page.
const signIn = async email => {
  await ev(`window.__old = 1; SB.client.auth.signInWithPassword({email:${JSON.stringify(email)},password:"password1"}).then(()=>true)`);
  return waitFor(`window.__old === undefined && ${ready}`, 15000);
};
const signOutViaApp = async () => {
  await ev(`window.__old = 1; sbSignOut(false).then(() => UI.sbConfirmOut ? sbSignOut(true) : 0).then(()=>true)`);
  return waitFor(`window.__old === undefined && ${ready}`, 15000);
};
const mkGuest = (name, extra = "") => ev(`(async () => {
  const p = newProfile(${JSON.stringify(name)}); p.onboarded = true; p.coachPrompted = true; S.profiles.push(p); S.activeId = p.id;
  ${extra}
  markAll(); await flush(); return p.id; })()`);
const lsDump = () => ev(`(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k.startsWith("__fake")) o[k] = localStorage.getItem(k); } return o; })()`);
const lsHas = async needle => { const d = await lsDump(); return Object.entries(d).some(([k, v]) => k.includes(needle) || v.includes(needle)); };
// Keys that hold a person's data. An empty store ({"root":null,"logs":{}}, which every boot writes) holds none.
const userKeys = async () => Object.entries(await lsDump()).filter(([k, v]) => /^wlh\.(v62|v61|notif\.|rem\.)/.test(k) && !(k.startsWith("wlh.v62") && /^\{"root":null,"logs":\{\}\}$/.test(v))).map(([k]) => k);

// ---------------------------------------------------------------- (a)
console.log("--- (a) markup in a profile name is shown as plain text");
const PAYLOAD = "<img src=x onerror=alert(1)>";
ok("boot as guest", await boot(), JSON.stringify(errors));
// Four logged days so the coach advice card has something to say (it addresses the person by name).
await mkGuest(PAYLOAD, `for (let i = 0; i < 4; i++) { const d = addDays(today(), -i); const L = logFor(p.id, monthOf(d)); L.meals.push({ id: "m" + i + "abcd", date: d, at: Date.now() - i * 864e5, slot: "lunch", name: "Jollof rice", cal: 600, dish: null, extras: [], est: false, photo: null }); }`);
ok("boot again (name now comes from storage)", await boot("#/coach"));
await sleep(400);
const page = await ev(`(() => ({
  imgX: !!document.querySelector('img[src="x"]'),
  anyOnerror: !!document.querySelector("[onerror]"),
  text: document.body.textContent.includes(${JSON.stringify(PAYLOAD)}),
  advice: document.getElementById("coach-advice")?.textContent.includes(${JSON.stringify(PAYLOAD)}) ?? null,
  adviceImg: !!document.querySelector("#coach-advice img")
}))()`);
ok("the stored name is the literal text", await ev(`P().name === ${JSON.stringify(PAYLOAD)}`));
ok("coach advice card is on the page", page.advice !== null, JSON.stringify(page));
ok("coach advice shows the name as text", page.advice === true, JSON.stringify(page));
ok("no <img> was created from the name", !page.imgX && !page.adviceImg && !page.anyOnerror, JSON.stringify(page));
ok("the name is visible as text on the page", page.text);
ok("coachAdviceItems keeps raw text; the card escapes it", await ev(`(() => { const t = coachAdviceItems().map(i => i.text).join(" "); const h = coachAdviceCard(); return t.includes("<img") && !h.includes("<img src=x") && h.includes("&lt;img"); })()`));
for (const route of ["#/home", "#/settings", "#/nutrition"]) {
  await ev(`location.hash = ${JSON.stringify(route)}; true`); await sleep(500);
  const bad = await ev(`!!document.querySelector('img[src="x"], [onerror]')`);
  ok(`no injected element on ${route}`, !bad);
}
ok("alert() never fired", dialogs.length === 0, JSON.stringify(dialogs));

// ---------------------------------------------------------------- (b)
console.log("--- (b) account A's data is not shown to account B");
await ev(`localStorage.clear(); true`);
ok("fresh boot as guest", await boot());
await mkGuest("", `p.name = "Alice Secret"; const d = today(); logFor(p.id, monthOf(d)).meals.push({ id: "mA1abcd", date: d, at: Date.now(), slot: "lunch", name: "Alice's egusi", cal: 700, dish: null, extras: [], est: false, photo: null }); logFor(p.id, monthOf(d)).snacks.push({ id: "sA1abcd", date: d, at: Date.now(), name: "Alice's chin chin", qty: 1, cal: 200 });
  localStorage.setItem("wlh.notif." + p.id, JSON.stringify([{ id: "n1", t: "Alice note" }]));`);
const guestId = await ev(`S.activeId`);
ok("guest data is saved under the guest key", (await userKeys()).includes("wlh.v62"));

ok("sign in as A (page reloads)", await signIn("a@x.com"), JSON.stringify(errors));
ok("guest data is NOT attached silently: prompt is shown", await ev(`!!UI.guestPrompt && /Data from before you signed in/.test(document.body.textContent)`));
ok("nothing was uploaded for A before the choice", (await ev(`__fake.DB.people.length + __fake.DB.meal_logs.length`)) === 0);
ok("the guest store is still untouched", (await userKeys()).includes("wlh.v62"));
ok("the app is not showing the guest profile yet", await ev(`S.profiles.length === 0`));

await ev(`document.querySelector('[data-act="sb-guest-import"]').click(); true`);
ok("import: guest profile now belongs to A", await waitFor(`S.profiles.length === 1 && S.profiles[0].name === "Alice Secret"`));
ok("import: guest key removed", !(await userKeys()).includes("wlh.v62"));
ok("import: A's key is user-suffixed", (await userKeys()).includes("wlh.v62@u_axcom"));
await waitFor(`SB.started && !sbPending()`);
ok("A's meal reached the database", (await ev(`__fake.DB.meal_logs.filter(r => r.owner_id === "u_axcom" && !r.deleted_at).length`)) === 1);
ok("A's name reached the database", (await ev(`__fake.DB.people.some(r => r.owner_id === "u_axcom" && r.display_name === "Alice Secret")`)));
await ev(`flush()`);

ok("sign out as A (page reloads)", await signOutViaApp(), JSON.stringify(errors));
ok("signed out", await ev(`!SB.user && STORE_UID === null`));
ok("no profile or entry in memory", await ev(`S.profiles.length === 0 && Object.keys(S.logs).length === 0`));
ok("no user-data keys left in this browser", (await userKeys()).length === 0, JSON.stringify(await userKeys()));
ok("no meal cache left", !(await lsDump())["wlh.meals.v1"]);
ok("nothing of A's in local storage", !(await lsHas("Alice")) && !(await lsHas("u_axcom")));
ok("A's data is still in A's database rows", (await ev(`__fake.DB.meal_logs.filter(r => r.owner_id === "u_axcom").length`)) === 1);

ok("sign in as B (page reloads)", await signIn("b@x.com"), JSON.stringify(errors));
await waitFor(`!SB.busy && SB.state !== "syncing"`); await sleep(800);
ok("no guest prompt for B", await ev(`!UI.guestPrompt`));
ok("B sees no profile", await ev(`S.profiles.length === 0`));
ok("A's name is not on B's screen", await ev(`!document.body.textContent.includes("Alice")`));
ok("B sees no meals or snacks", await ev(`[...sbAllMeals()].length === 0 && Object.values(S.logs).every(m => Object.values(m).every(l => !l.snacks.length))`));
ok("B has no copy in local storage", !(await lsHas("Alice")) && !(await lsHas("u_axcom")));
ok("B has no rows in the database", (await ev(`__fake.DB.meal_logs.filter(r => r.owner_id === "u_bxcom").length + __fake.DB.people.filter(r => r.owner_id === "u_bxcom").length`)) === 0);
ok("B's direct query sees none of A's rows", (await ev(`SB.client.from("meal_logs").select().then(r => r.data.filter(x => x.owner_id !== "u_bxcom").length)`)) === 0);
ok("B's own key is separate from A's", !(await userKeys()).some(k => k.endsWith("@u_axcom")));

console.log("--- (b2) guest data found when B signs in can be discarded");
ok("sign out as B", await signOutViaApp());
await mkGuest("Gary Guest");
ok("sign in as B again", await signIn("b@x.com"));
ok("prompt shown", await ev(`!!UI.guestPrompt`));
await ev(`document.querySelector('[data-act="sb-guest-discard"]').click(); true`);
ok("discard: guest key removed", await waitFor(`!localStorage.getItem("wlh.v62")`));
ok("discard: nothing of Gary's reached B or the database", !(await lsHas("Gary")) && (await ev(`JSON.stringify(__fake.DB).includes("Gary")`)) === false);
await ev(`window.__old = 1; sbSignOut(false).then(() => UI.sbConfirmOut ? sbSignOut(true) : 0).then(()=>true)`); await waitFor(`window.__old === undefined && ${ready}`, 15000);

console.log("--- (b3) A signs back in: name and meals return from the account, local-only data does not");
ok("sign in as A", await signIn("a@x.com"));
await waitFor(`S.profiles.length === 1`, 8000); await waitFor(`[...sbAllMeals()].length === 1`, 8000);
ok("A's name is restored from the account", await ev(`P()?.name === "Alice Secret"`));
ok("A's synced meal is back", await ev(`[...sbAllMeals()].length === 1`));
ok("A's snack comes back too: snacks sync since 8.2.16", await waitFor(`Object.values(S.logs).some(m => Object.values(m).some(l => l.snacks.length))`, 8000));

console.log("--- erase removes notification and reminder keys too");
await ev(`localStorage.setItem(NOTIF_KEY(P()), "[1]"); localStorage.setItem(remKey(P().id, "r1"), "2026-10-06"); true`);
ok("keys exist before erase", (await userKeys()).some(k => k.startsWith("wlh.notif.")) && (await userKeys()).some(k => k.startsWith("wlh.rem.")));
await ev(`window.__old = 1; eraseEverything().then(()=>true)`); await waitFor(`window.__old === undefined && ${ready}`, 15000);
ok("no wlh.v62 / wlh.notif.* / wlh.rem.* keys left", (await userKeys()).length === 0, JSON.stringify(await userKeys()));

console.log("--- (c) an expired session keeps the data and shows the sign-in screen");
ok("sign in as A", await signIn("a@x.com"));
await waitFor(`S.profiles.length === 1 && SB.started`, 10000);
await ev(`addEntry("snacks", { id: uid(), date: today(), name: "Local snack", qty: 1, cal: 100 }); true`); await sleep(1200);
await ev(`window.__old = 1; __fake.expireNow(); true`); await sleep(1500);
ok("the page did not reload", await ev(`window.__old === 1`));
ok("the sign-in screen is shown", await ev(`UI.sessionExpired === true && /Sign in again/.test(document.body.textContent) && !!document.querySelector('[data-act="sb-open"][data-v="in"]')`));
ok("data kept in memory", await ev(`S.profiles.length === 1 && Object.values(S.logs).some(m => Object.values(m).some(l => l.snacks.some(x => x.name === "Local snack")))`));
ok("data kept on disk under A's key", (await userKeys()).includes("wlh.v62@u_axcom") && await lsHas("Local snack"));
await ev(`SB.client.auth.signInWithPassword({email:"a@x.com",password:"password1"}).then(()=>true)`);
ok("same account signs back in: no reload, data still there", await waitFor(`window.__old === 1 && !UI.sessionExpired && SB.started`, 10000) && await ev(`Object.values(S.logs).some(m => Object.values(m).some(l => l.snacks.some(x => x.name === "Local snack")))`));

console.log("--- (c2) sign-out while offline warns first, and Cancel keeps everything");
await ev(`P().coachPrompted = true; P().tourSeen = "dismissed"; location.hash = "#/settings"; __fake.offline = true; addEntry("meals", { id: uid(), date: today(), slot: "dinner", name: "Offline egusi", cal: 500, dish: null, extras: [], est: false, photo: null }); render(); true`); await waitFor(`!!document.querySelector('[data-act="sb-out"]')`);
await ev(`document.querySelector('[data-act="sb-out"]').click(); true`);
ok("warning shown, still signed in", await waitFor(`!!UI.sbConfirmOut && !!SB.user && !!document.querySelector('[data-act="sb-out-force"]')`));
ok("warning says what will be deleted, including the unsent meal", await ev(`/Signing out will delete data from this device/.test(document.getElementById("sb-account").textContent) && /waiting to upload and will be deleted too/.test(document.getElementById("sb-account").textContent)`));
ok("buttons are Cancel and Sign out anyway", await ev(`(() => { const b = [...document.querySelectorAll("#sb-account button")].map(x => x.textContent.trim()); return b.includes("Cancel") && b.includes("Sign out anyway"); })()`));
await ev(`document.querySelector('[data-act="sb-out-no"]').click(); true`);
ok("Cancel: still signed in and the data is kept", await ev(`!UI.sbConfirmOut && !!SB.user && STORE_UID === "u_axcom"`) && (await userKeys()).includes("wlh.v62@u_axcom"));
await ev(`document.querySelector('[data-act="sb-out"]').click(); true`);
await waitFor(`!!document.querySelector('[data-act="sb-out-force"]')`);
await ev(`window.__old = 1; document.querySelector('[data-act="sb-out-force"]').click(); true`);
ok("Sign out anyway: page reloads signed out", await waitFor(`window.__old === undefined && ${ready} && !SB.user`, 15000));
ok("Sign out anyway: device is cleared", (await userKeys()).length === 0 && !(await lsHas("Offline egusi")) && !(await lsHas("Local snack")));
ok("the meal that never uploaded is not in the account", (await ev(`JSON.stringify(__fake.DB).includes("Offline egusi")`)) === false);

console.log("--- (d) sign-out: no warning when everything is saved, a warning for what cannot be");
ok("sign in as A", await signIn("a@x.com"));
await waitFor(`S.profiles.length === 1 && SB.started && !sbPending()`, 10000);
await ev(`(() => { const p = P(); p.coachPrompted = true; p.tourSeen = "dismissed"; p.goal = "lose"; p.age = 30; p.workoutPlan = { created: today(), days: [] };
  addEntry("snacks", { id: uid(), date: today(), name: "Dialog snack", qty: 1, cal: 100 });
  addEntry("drinks", { id: uid(), date: today(), k: "beer", name: "Beer", qty: 1, cal: 150, units: 1 });
  addEntry("workouts", { id: uid(), date: today(), type: "strength", minutes: 30, cal: 100, note: null, src: null, equip: null, photo: null });
  addEntry("weights", { id: uid(), date: today(), kg: 70 });
  const L = logFor(p.id, monthOf(today())); L.vitals[today()] = { steps: 1000 }; markLog(p.id, monthOf(today())); saveProfile();
  location.hash = "#/settings"; render(); return true; })()`);
await sleep(2500); await waitFor(`SB.state === "idle" && !sbPending()`, 10000);
await waitFor(`!!document.querySelector('[data-act="sb-out"]')`);
await ev(`window.__old = 1; document.querySelector('[data-act="sb-out"]').click(); true`);
ok("everything is saved in the account, so it signs out with no warning", await waitFor(`window.__old === undefined && ${ready} && !SB.user`, 15000));
ok("sign in as A again", await signIn("a@x.com"));
ok("snack, drink, workout, weigh-in, vitals and the plan all came back from the account", await waitFor(`S.profiles.length === 1 && [...sbAllOf("snacks")].length >= 1 && [...sbAllOf("drinks")].length === 1 && [...sbAllOf("workouts")].length === 1 && [...sbAllOf("weights")].length === 1 && [...sbAllOf("vitals")].length === 1 && !!P().workoutPlan`, 15000));
await ev(`(() => { P().prem.clips = [{ id: "clip1abcd", at: Date.now(), date: today(), n: "Squat", v: "data:video/webm;base64,AAAA", secs: 3, ex: null }]; location.hash = "#/settings"; render(); return true; })()`);
await waitFor(`!!document.querySelector('[data-act="sb-out"]')`);
await ev(`document.querySelector('[data-act="sb-out"]').click(); true`);
ok("a form-check video can't be saved to the account, so the warning appears", await waitFor(`!!UI.sbConfirmOut && !!document.querySelector('[data-act="sb-out-force"]')`));
const dlg = await ev(`document.getElementById("sb-account").textContent`);
ok(`the warning lists "1 form-check video"`, dlg.includes("1 form-check video"), dlg.slice(0, 300));
const localList = await ev(`UI.sbConfirmOut.local.join(" | ")`);
for (const not of ["snack", "drink", "workout", "weigh-in", "vitals", "plans"]) ok(`it no longer lists "${not}", which are saved`, !localList.includes(not), localList);
ok("dialog has Cancel and Sign out anyway", await ev(`(() => { const b = [...document.querySelectorAll("#sb-account button")].map(x => x.textContent.trim()); return b.includes("Cancel") && b.includes("Sign out anyway"); })()`));
await ev(`document.querySelector('[data-act="sb-out-no"]').click(); true`);
await ev(`flush().then(() => true)`);
ok("Cancel keeps the data and the session", await ev(`!UI.sbConfirmOut && !!SB.user`) && await lsHas("Dialog snack"));

console.log("--- (e) export and calendar downloads work without window.claude");
ok("window.claude is absent", await ev(`typeof window.claude === "undefined"`));
await ev(`window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, text: fetch(this.href).then(r => r.text()) }); }; location.hash = "#/settings/about"; render(); true`);
await waitFor(`!!document.querySelector('[data-act="export"]')`);
ok("Download (JSON) button is enabled", await ev(`!document.querySelector('[data-act="export"]').disabled`));
await ev(`document.querySelector('[data-act="export"]').click(); true`); await sleep(500);
const exp = await ev(`(async () => { const d = window.__dl[0]; return d ? { name: d.name, text: await d.text } : null; })()`);
ok("a .json file was handed to the browser", !!exp && /^wholelife-.*\.json$/.test(exp.name), JSON.stringify(exp)?.slice(0, 120));
const parsed = exp ? JSON.parse(exp.text) : {};
ok("the file holds the profile and the logs", parsed.profile?.name === "Alice Secret" && JSON.stringify(parsed.logs).includes("Dialog snack"));
await ev(`window.__dl.length = 0; const b = document.createElement("button"); b.dataset.act = "rem-ics"; document.body.append(b); b.click(); b.remove(); true`); await sleep(500);
const ics = await ev(`(async () => { const d = window.__dl[0]; return d ? { name: d.name, text: await d.text } : null; })()`);
ok("an .ics file was handed to the browser", !!ics && ics.name === "wholelife-reminders.ics" && /^BEGIN:VCALENDAR/.test(ics.text), JSON.stringify(ics)?.slice(0, 120));

console.log("--- (f) a tab that sees the account signed out elsewhere drops its memory and writes nothing");
const tgt = await (await fetch("http://127.0.0.1:9334/json/new?about:blank", { method: "PUT" })).json();
const ws2 = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws2.onopen = r);
let id2 = 0; const pend2 = new Map();
ws2.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend2.has(d.id)) { pend2.get(d.id)(d); pend2.delete(d.id); } };
const send2 = (method, params = {}) => new Promise(r => { const i = ++id2; pend2.set(i, r); ws2.send(JSON.stringify({ id: i, method, params })); });
const ev2 = async expr => { const r = await send2("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error("tab2: " + (r.result.exceptionDetails.exception?.description || expr)); return r.result.result.value; };
const waitFor2 = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev2(expr)) return true; } catch {} await sleep(150); } return false; };
// Records every localStorage write the page makes (the log lives in window.name so it survives a reload).
const SPY = `(() => { window.__prevWrites = []; try { window.__prevWrites = JSON.parse(window.name || "[]"); } catch {} const log = []; window.__spyReset = () => { log.length = 0; window.name = "[]"; };
  for (const m of ["setItem", "removeItem", "clear"]) { const o = Storage.prototype[m]; Storage.prototype[m] = function (k, ...r) { if (this === localStorage && !String(k).startsWith("__fake")) { log.push(m + ":" + k); window.name = JSON.stringify(log); } return o.call(this, k, ...r); }; } })();`;
await send2("Runtime.enable"); await send2("Page.enable"); await send2("Network.enable");
await send2("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send2("Page.addScriptToEvaluateOnNewDocument", { source: FAKE + SPY });
await send2("Page.navigate", { url: "http://127.0.0.1:8766/index.html" });
ok("second tab boots signed in as A with A's data", await waitFor2(`${ready} && STORE_UID === "u_axcom" && Object.values(S.logs).some(m => Object.values(m).some(l => l.snacks.some(x => x.name === "Dialog snack")))`));
await ev2(`window.__old = 1; dirty.add("root"); window.__spyReset(); true`); // unsaved work: a pagehide flush would write it
await ev(`window.__old = 1; sbSignOut(true).then(()=>true)`);
ok("tab 1 signs out and reloads", await waitFor(`window.__old === undefined && ${ready} && !SB.user`, 15000));
ok("tab 2 reloads on its own", await waitFor2(`window.__old === undefined && ${ready}`));
ok("tab 2 wrote nothing to local storage while discarding", JSON.stringify(await ev2(`window.__prevWrites`)) === "[]", JSON.stringify(await ev2(`window.__prevWrites`)));
ok("tab 2 holds no profile and no account", await ev2(`S.profiles.length === 0 && STORE_UID === null && !SB.user`));
ok("A's data did not come back to this browser", (await userKeys()).length === 0 && !(await lsHas("Dialog snack")) && !(await lsHas("Alice")), JSON.stringify(await userKeys()));
await fetch(`http://127.0.0.1:9334/json/close/${tgt.id}`); ws2.close();

console.log("--- no uncaught exceptions, no alert()");
ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
ok("alert() never fired", dialogs.length === 0, JSON.stringify(dialogs));

console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
