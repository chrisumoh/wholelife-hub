import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/welcomebg.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.37: the welcome backdrop (cycling photos and light rays). Faked Supabase.
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
}).listen(8799, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9372", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-welcomebg-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9372/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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

await view(1440);
await send("Page.navigate", { url: "http://127.0.0.1:8799/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const reload = async () => { await send("Page.reload"); await sleep(500); return waitFor(READY, 15000); };
const emulate = v => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: v }] });
const photo = `(document.querySelector(".wl-bgi.on") || {}).src || ""`;

await ev(`localStorage.clear(); true`); await reload();
ok("the welcome screen has a backdrop behind the text", await ev(`!!document.querySelector(".wl > .wl-bg .wl-bgi") && !!document.querySelector(".wl-bg .wl-rays") && document.querySelector(".wl-bg").getAttribute("aria-hidden") === "true"`));
ok("the headline, text and rings are unchanged", await ev(`/Meals from your culture/.test(document.querySelector("h1").textContent) && !!document.querySelector('[data-act="ob-next"]') && document.querySelectorAll(".wl-ring .arc").length === 3`));
ok("the first photo fades in", await waitFor(`/img\\/welcome\\/w\\d+\\.webp/.test(${photo})`, 6000));
const first = await ev(photo);
ok("a different photo shows within about 4 seconds", await waitFor(`${photo} !== ${JSON.stringify(first)} && ${photo} !== ""`, 5000));
ok("only one photo is showing at a time", await ev(`document.querySelectorAll(".wl-bgi.on").length === 1`));
ok("the photos are files, not inlined in the page", await ev(`!/data:image/.test(document.querySelector(".wl-bg").outerHTML)`));
ok("the buttons still work over the backdrop", await ev(`(() => { const b = document.querySelector('[data-act="ob-next"]').getBoundingClientRect(); return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2).closest('[data-act="ob-next"]') !== null; })()`));
ok("a re-render keeps the running backdrop (no restart)", await ev(`(() => { const el = document.querySelector(".wl-bg"); el._mark = 1; render(); return document.querySelector(".wl-bg")._mark === 1; })()`));

await emulate("reduce"); await reload();
await waitFor(`/img\\/welcome\\/w01\\.webp/.test(${photo})`, 6000);
await sleep(4000);
ok("reduced motion: the first photo stays still", await ev(`/w01\\.webp/.test(${photo})`));
await emulate("no-preference");

ok("no page errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} });
process.exit(fail ? 1 : 0);
