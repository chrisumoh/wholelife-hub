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
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
procs.push(spawn("python", ["-m", "http.server", "8766", "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" }));
procs.push(spawn(CHROME, ["--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-sec-"))}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" }));
await sleep(2500);
const list = await (await fetch("http://127.0.0.1:9334/json/list")).json();
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
  await ev(`window.__old = 1; sbSignOut(false).then(()=>true)`);
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
await ev(`window.__old = 1; sbSignOut(false).then(()=>true)`); await waitFor(`window.__old === undefined && ${ready}`, 15000);

console.log("--- (b3) A signs back in: name and meals return from the account, local-only data does not");
ok("sign in as A", await signIn("a@x.com"));
await waitFor(`S.profiles.length === 1`, 8000); await waitFor(`[...sbAllMeals()].length === 1`, 8000);
ok("A's name is restored from the account", await ev(`P()?.name === "Alice Secret"`));
ok("A's synced meal is back", await ev(`[...sbAllMeals()].length === 1`));
ok("A's snack, which was only on the device, is gone", await ev(`Object.values(S.logs).every(m => Object.values(m).every(l => !l.snacks.length))`));

console.log("--- erase removes notification and reminder keys too");
await ev(`localStorage.setItem(NOTIF_KEY(P()), "[1]"); localStorage.setItem(remKey(P().id, "r1"), "2026-10-06"); true`);
ok("keys exist before erase", (await userKeys()).some(k => k.startsWith("wlh.notif.")) && (await userKeys()).some(k => k.startsWith("wlh.rem.")));
await ev(`window.__old = 1; eraseEverything().then(()=>true)`); await waitFor(`window.__old === undefined && ${ready}`, 15000);
ok("no wlh.v62 / wlh.notif.* / wlh.rem.* keys left", (await userKeys()).length === 0, JSON.stringify(await userKeys()));

console.log("--- no uncaught exceptions, no alert()");
ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
ok("alert() never fired", dialogs.length === 0, JSON.stringify(dialogs));

console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
