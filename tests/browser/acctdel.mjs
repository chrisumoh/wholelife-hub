import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/acctdel.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.32: Delete my account in Settings > Privacy & security. Shown only when signed in, asks for the word DELETE, calls the delete-account function with the person's token and wipes this device only after the server says deleted.
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
}).listen(8791, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9354", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-acctdel-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9354/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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

await view(1000);
await send("Page.navigate", { url: "http://127.0.0.1:8791/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30, sex: "female", culture: "Ghana" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); return true; })()`);
const goPrivacy = async () => { await ev(`location.hash = "#/settings/privacy"; true`); await sleep(500); await ev(`render(); true`); await sleep(200); };
const card = () => ev(`document.getElementById("data-rights")?.innerText || ""`);

await ev(`SB.user = null; true`); await goPrivacy();
ok("signed out: no Delete my account row", !(await ev(`!!document.querySelector('[data-act="acct-del-ask"]')`)));
ok("signed out: the device erase text points to signing in first", (await card()).includes("sign in and use Delete my account"));

await ev(`SB.user = { id: "u_me", email: "me@example.com" }; window.__calls = []; window.__erased = 0;
  window.eraseEverything = async () => { window.__erased++; };
  const realFetch = window.fetch;
  window.fetch = async (u, o) => { if (String(u).includes("/functions/v1/delete-account")) { window.__calls.push({ u: String(u), o }); return new Response(JSON.stringify({ state: window.__reply || "deleted" }), { status: 200 }); } return realFetch(u, o); };
  sbClient().auth.getSession = async () => ({ data: { session: { access_token: "tok-123" } } }); true`);
await goPrivacy();
ok("signed in: Delete my account button is shown", await ev(`!!document.querySelector('[data-act="acct-del-ask"]')`));
await ev(`document.querySelector('[data-act="acct-del-ask"]').click(); true`); await sleep(250);
ok("asking opens a field and a confirm button, nothing is sent yet", await ev(`!!document.getElementById("acct-del-text") && !!document.querySelector('[data-act="acct-del-yes"]') && window.__calls.length === 0`));
await ev(`document.getElementById("acct-del-text").value = "delete"; document.querySelector('[data-act="acct-del-yes"]').click(); true`); await sleep(300);
ok("the wrong word is refused with a message and nothing is sent", await ev(`window.__calls.length === 0 && window.__erased === 0`) && (await card()).includes("Type DELETE"));
ok("the field's error is announced", await ev(`!!document.querySelector('#data-rights [role="alert"]')`));

await ev(`document.getElementById("acct-del-text").value = "DELETE"; window.__reply = "error"; document.querySelector('[data-act="acct-del-yes"]').click(); true`); await sleep(500);
ok("a server error keeps everything and says nothing was deleted", await ev(`window.__calls.length === 1 && window.__erased === 0`) && (await card()).includes("Nothing was deleted"));

await ev(`document.querySelector('[data-act="acct-del-ask"]') || (UI.delAcct = {}, render()); document.getElementById("acct-del-text").value = "DELETE"; window.__reply = "deleted"; document.querySelector('[data-act="acct-del-yes"]').click(); true`); await sleep(600);
const c = await ev(`window.__calls[window.__calls.length - 1]`);
ok("it calls the delete-account function with the person's token", !!c && c.u.endsWith("/functions/v1/delete-account") && c.o.headers.authorization === "Bearer tok-123" && c.o.method === "POST");
ok("it sends the confirmation word and no account id", !!c && c.o.body === JSON.stringify({ confirm: "DELETE" }));
ok("after 'deleted' this device is wiped", await ev(`window.__erased === 1`));

await ev(`SB.user = { id: "u_me" }; UI.delAcct = null; window.__reply = "unauthorized"; render(); true`); await goPrivacy();
await ev(`document.querySelector('[data-act="acct-del-ask"]').click(); true`); await sleep(200);
await ev(`document.getElementById("acct-del-text").value = "DELETE"; document.querySelector('[data-act="acct-del-yes"]').click(); true`); await sleep(500);
ok("an expired sign-in says to sign in again and wipes nothing", (await card()).includes("sign-in has expired") && await ev(`window.__erased === 1`));
ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
