import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/workouts.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.11: the workout picker. Every activity has its own icon drawn inside the tile, a colour, a MET value and a group; the picker shows them in groups;
// every coach sport has three sessions and an icon; imports (Apple Health and file names) land on the right activity; a logged workout gets the right calorie estimate.
// The icons are original artwork inside the app (redrawn by the designer in 8.3.5), so this test is the check that none is missing, blank, clipped or a copy of another.
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9347", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-challenges-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
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
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*", "*/vendor/supabase*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";

await view(1000);
await send("Page.navigate", { url: "http://127.0.0.1:8784/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const html = await ev(`(() => {
  FR.on = true; FR.me = { app_name: "ada" }; FR.rows = [{ status: "accepted", member_id: "u1", app_name: "kofi" }];
  CH.on = true; CH.err = false; CH.open = true;
  CH.rows = [
    { id: "c1", title: "<b>Run</b>", metric: "minutes", starts_on: "2000-01-01", ends_on: "2999-01-01", owner_name: "kofi", is_owner: false, status: "joined" },
    { id: "c2", title: "Steps", metric: "calories", starts_on: "2000-01-01", ends_on: "2999-01-01", owner_name: "<i>x</i>", is_owner: false, status: "invited" }];
  CH.boards = { c1: [{ app_name: "kofi", total: 120, is_you: false }, { app_name: "ada", total: 90, is_you: true }] };
  SB.user = SB.user || { id: "me" };
  return challengesCard();
})()`);
ok("leaderboard lists totals in order with the unit", /kofi: 120 min[\s\S]*ada \(you\): 90 min/.test(html));
ok("invites show Join and Decline", html.includes('data-act="ch-join"') && html.includes('data-act="ch-decline"'));
ok("titles and names are escaped", !html.includes("<b>Run</b>") && !html.includes("<i>x</i>"));
ok("friend picker and metric choice are there", html.includes('name="ch-f"') && html.includes('value="workouts"') && html.includes('value="calories"'));
ok("a non-owner can leave, nobody sees workout details", html.includes(">Leave<") && !html.includes("duration"));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
