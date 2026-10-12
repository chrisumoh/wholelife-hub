import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/privacy.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.14: Settings > Privacy and security shows a privacy summary and a short on-device consent and data history (what you turned on or off, exports, deletions, with the date).
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
}).listen(8783, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9346", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-privacy-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9346/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8783/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30, sex: "female", culture: "Ghana" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); return true; })()`);
const goPrivacy = async () => { await ev(`UI.confirmEraseAll = false; location.hash = "#/settings/privacy"; render(); true`); await sleep(350); };
const glance = () => ev(`document.getElementById("privacy-glance")?.innerText || ""`);
const stored = () => ev(`JSON.parse(localStorage.getItem("wlh.history") || "[]")`);

console.log("--- 1. the summary");
await goPrivacy();
let t = await glance();
ok("the Privacy tab opens with a 'Your privacy at a glance' card", /Your privacy at a glance/.test(t), t);
ok("it says data is on this device only and nobody is signed in", /On this device only/.test(t) && /Not signed in/.test(t), t);
ok("it shows passcode off, 0 of 3 permissions, and terms not recorded", /Passcode encryption\s*Off/.test(t) && /0 of 3 on/.test(t) && /Not recorded on this device/.test(t), t);
ok("the history starts empty with a plain message", /Nothing yet/.test(t) && !(await ev(`!!document.querySelector('[data-act="history-clear"]')`)), t);
ok("the summary card comes first in the tab", await ev(`document.getElementById("privacy-glance") === document.querySelector("#app section.card")`));

console.log("--- 2. permissions are logged as they change");
await ev(`document.querySelector('[data-act="consent-photoai-toggle"]').click(); true`); await sleep(250);
await ev(`document.querySelector('[data-act="consent-clips-toggle"]').click(); true`); await sleep(250);
await ev(`document.querySelector('[data-act="consent-photoai-toggle"]').click(); true`); await sleep(250);
let h = await stored();
ok("three toggles wrote three entries, in order", h.map(x => x.k).join() === "photo-on,clips-on,photo-off", JSON.stringify(h));
t = await glance();
ok("the card lists them, newest first, in plain words", t.indexOf("Turned off photo meal logging") > -1 && t.indexOf("Turned off photo meal logging") < t.indexOf("Turned on the form check camera") && t.indexOf("Turned on the form check camera") < t.indexOf("Turned on photo meal logging"), t);
ok("the permission count follows the toggles (1 of 3 on)", /1 of 3 on/.test(t), t);
ok("an entry carries only a kind and an ISO time, no names or health data", h.every(x => Object.keys(x).sort().join() === "at,k" && !isNaN(Date.parse(x.at))), JSON.stringify(h));
await ev(`document.querySelector('[data-act="consent-body-toggle"]').click(); true`); await sleep(300);
ok("the body studio toggle is logged too", (await stored()).at(-1).k === "body-on");

console.log("--- 3. export, profile delete and erase are logged");
await ev(`document.querySelector('[data-act="export"]').click(); true`); await sleep(300);
ok("downloading the data adds an entry", (await stored()).at(-1).k === "export");
await ev(`(() => { const q = newProfile("Kofi"); Object.assign(q, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles.push(q); saveProfile(); UI.confirmDel = q.id; location.hash = "#/settings/household"; render(); return true; })()`); await sleep(350);
await ev(`document.querySelector('[data-act="del-profile-yes"]').click(); true`); await sleep(300);
ok("deleting a profile adds an entry", (await stored()).at(-1).k === "profile-del");
await goPrivacy();
await ev(`document.querySelector('[data-act="erase-all-ask"]').click(); true`); await sleep(250);
await ev(`document.querySelector('[data-act="erase-all-yes"]').click(); true`); await sleep(800);
h = await stored();
ok("deleting everything leaves the history in place and adds a 'Deleted all data' entry", h.length >= 5 && h.at(-1).k === "erase" && h[0].k === "photo-on", JSON.stringify(h));
ok("the profile data itself is gone", await ev(`S.profiles.length === 0 && !Object.keys(localStorage).some(k => k.startsWith("wlh.v62"))`));

console.log("--- 4. the history list and its limits");
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); return true; })()`);
await ev(`(() => { for (let i = 0; i < 60; i++) historyAdd(i % 2 ? "export" : "body-off"); return true; })()`);
ok("the log keeps only the newest 50 entries", (await stored()).length === 50);
await ev(`localStorage.setItem("wlh.history", JSON.stringify([{ k: "<img src=x onerror=alert(1)>", at: new Date().toISOString() }, { k: "export", at: "2026-10-12T09:30:00.000Z" }, "junk", null, { k: "erase" }])); true`);
await goPrivacy();
t = await glance();
ok("entries with an unknown kind, no time, or the wrong shape are ignored", (await ev(`historyGet().length`)) === 1 && !/img/.test(await ev(`document.getElementById("privacy-glance").innerHTML`)), t);
await ev(`localStorage.setItem("wlh.history", "{not json"); true`); await goPrivacy();
ok("a damaged history reads as empty and the page still renders", /Nothing yet/.test(await glance()));
await ev(`historyAdd("export"); historyAdd("terms"); true`); await goPrivacy();
ok("terms entries read 'Accepted the Terms and Privacy Policy at sign-up'", /Accepted the Terms and Privacy Policy at sign-up/.test(await glance()));
await ev(`document.querySelector('[data-act="history-clear"]').click(); true`); await sleep(300);
ok("Clear history removes the key and shows the empty message", (await ev(`localStorage.getItem("wlh.history")`)) === null && /Nothing yet/.test(await glance()));

console.log("--- 5. terms and account lines");
await ev(`localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: TERMS_VERSION, at: new Date().toISOString() })); true`); await goPrivacy();
ok("an accepted terms version is shown", new RegExp("Version " + await ev(`TERMS_VERSION`)).test(await glance()));
await ev(`SB.user = { id: "u1", email: "ada@example.com" }; render(); true`); await sleep(250);
t = await glance();
ok("signed in, it names the account and says meals and names also sync", /ada@example\.com/.test(t) && /Meals and profile names also sync/.test(t), t);
await ev(`SB.user = null; true`);

console.log("--- 6. layout");
for (const w of [390, 768, 1440]) { await view(w); await goPrivacy(); ok(`no sideways scroll at ${w}px`, await ev(`document.documentElement.scrollWidth <= innerWidth + 1`)); }
ok("the app raised no script errors", errors.length === 0, errors.join(" | "));

console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
