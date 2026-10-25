import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/acctdel.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.33: Delete my account in Settings > Privacy & security. Shown only when signed in, asks for the word DELETE, calls the delete-account function with the person's token and wipes this device only after the server says deleted.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NO_SANDBOX = process.env.CI || process.env.NO_SANDBOX ? ["--no-sandbox"] : [];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".txt": "text/plain" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname), file = join(REPO, path === "/" ? "index.html" : path);
  if (!file.startsWith(REPO) || !existsSync(file) || /(^|[\\/])\./.test(path)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
}).listen(8792, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9355", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-vendor-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9355/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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

const urls = []; const prevOnMsg = ws.onmessage; ws.onmessage = m => { try { const d = JSON.parse(m.data); if (d.method === "Network.requestWillBeSent") urls.push(d.params.request.url); } catch {} prevOnMsg(m); };
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";

await view(1000);
await send("Page.navigate", { url: "http://127.0.0.1:8792/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30, sex: "female", culture: "Ghana" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); return true; })()`);
// 8.3.33: the real sign-in library (nothing faked, nothing blocked) loads from this site, and no outside script host is asked for.
await ev(`location.hash = "#/settings"; true`); await sleep(600); await ev(`render(); true`); await sleep(300);
ok("the sign-in library is loaded", await ev(`typeof window.supabase?.createClient === "function"`));
ok("it came from this site", urls.some(u => u.endsWith("/vendor/supabase-js-2.117.2.umd.js")));
ok("nothing was requested from jsDelivr", !urls.some(u => /jsdelivr/.test(u)), urls.filter(u => /jsdelivr/.test(u)).join(","));
ok("the Account card offers sign-in, not the could-not-load message", await ev(`!!document.getElementById("sb-account") && !/couldn't load/.test(document.getElementById("sb-account").textContent)`));
await ev(`window.supabase = undefined; SB.client = null; render(); true`); await sleep(300);
const card = await ev(`document.getElementById("sb-account")?.textContent`); ok("without the library the card says so and offers Reload", await ev(`/couldn't load/.test(document.getElementById("sb-account").textContent) && !!document.querySelector('#sb-account [data-act="sb-reload"]')`), String(card));
ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
