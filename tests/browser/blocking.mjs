import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/workouts.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.21: blocking in the Friends card. Block buttons on friends, requests and search results; a Blocked people list with Unblock; names are escaped.
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9348", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-blocking-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9348/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*", "*/vendor/supabase*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";

await view(1000);
await send("Page.navigate", { url: "http://127.0.0.1:8785/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const html = await ev(`(() => {
  SB.user = SB.user || { id: "me" };
  FR.on = true; FR.me = { app_name: "ada" }; FR.blocks = ["b1"];
  FR.rows = [{ friendship_id: "f1", status: "accepted", member_id: "u1", app_name: "kofi" }, { friendship_id: "f2", status: "pending", incoming: true, member_id: "u2", app_name: "ama" }];
  localStorage.setItem(frBlockKey(), JSON.stringify({ b1: "<b>troll</b>" }));
  return friendsCard();
})()`);
ok("a friend has a Block button", html.includes('data-act="fr-block" data-id="u1"'));
ok("an incoming request can be blocked", html.includes('data-act="fr-block" data-id="u2"'));
ok("the Blocked people list has Unblock", html.includes("Blocked people") && html.includes('data-act="fr-unblock" data-id="b1"'));
ok("blocked names are escaped", !html.includes("<b>troll</b>") && html.includes("&lt;b&gt;troll"));
const none = await ev(`(() => { FR.blocks = []; return friendsCard(); })()`);
ok("no list when nobody is blocked", !none.includes("Blocked people"));
const res = await ev(`(() => { FR.res = [{ member_id: "s1", app_name: "yaw" }]; document.body.insertAdjacentHTML("beforeend", '<div id="fr-res"></div>'); frPaint(); return document.getElementById("fr-res").innerHTML; })()`);
ok("search results can be blocked", res.includes('data-act="fr-block" data-id="s1"'));
ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
