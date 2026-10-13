import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/advice.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.21: the coach advice card marks a repeat of yesterday's advice and, in the evening, reviews today by name and sets up tomorrow by weekday.
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
}).listen(8797, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9360", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-advice-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9360/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
if (!list) { console.log("FAIL  Chrome did not start (set CHROME to its path)"); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(1); }
process.on("exit", () => procs.forEach(p => { try { p.kill(); } catch {} }));
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(120); } return false; };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + String(extra).slice(0, 300)}`); };
const view = (w, h = 900) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
await send("Page.addScriptToEvaluateOnNewDocument", { source: "Date.prototype.getHours = function () { return 19; };" }); // always evening
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
await send("Page.navigate", { url: "http://127.0.0.1:8797/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", coachPersona: "enforcer" });
  S.profiles = [p]; S.activeId = p.id; S.logs = {};
  addEntry("meals", { id: uid(), date: today(), slot: "lunch", name: "Banku with okro stew", cal: 600, dish: null, extras: [], est: false });
  addEntry("workouts", { id: uid(), date: addDays(today(), -2), type: "strength", minutes: 40 });
  addEntry("workouts", { id: uid(), date: today(), type: "run", minutes: 30 });
  saveProfile(); await flush(); render(); return true; })()`);

console.log("--- 1. the evening review and tomorrow's plan");
const tomorrow = await ev(`parseYmd(addDays(today(), 1)).toLocaleDateString("en-US", { weekday: "long" })`);
const lastDow = await ev(`parseYmd(addDays(today(), -2)).toLocaleDateString("en-US", { weekday: "long" })`);
const items = await ev(`coachAdviceItems(P())`);
const ev1 = items.find(i => i.k === "evening");
ok("an evening item is built from today's log", !!ev1, JSON.stringify(items));
ok("it names the lunch dish and its calories", /Banku with okro stew \(600 cal\)/.test(ev1?.text || ""), ev1?.text);
ok("it names today's workout and the last earlier session by weekday", /Running for 30 min/.test(ev1?.text || "") && (ev1?.text || "").includes(lastDow), ev1?.text);
ok("it sets up tomorrow by weekday name", (ev1?.text || "").includes(tomorrow), ev1?.text);
ok("it is first, so it survives the two-item cap", items[0]?.k === "evening");
await ev(`(() => { const p = P(); S.logs = {}; logIdxDrop(); return true; })()`);
ok("with nothing logged today there is no evening item", !(await ev(`coachAdviceItems(P())`)).some(i => i.k === "evening"));

console.log("--- 2. repeats are marked, in the coach's voice");
await ev(`(() => { const p = P(); addEntry("meals", { id: uid(), date: today(), slot: "lunch", name: "Waakye", cal: 580, dish: null, extras: [], est: false }); localStorage.removeItem(ukey("wlh.advice." + p.id)); return true; })()`);
const first = await ev(`adviceRepeats(coachAdviceItems(P()), P()).map(i => i.text)`);
ok("the first showing is plain", first.length > 0 && first.every(t => !/^Second day running/.test(t)), first.join(" | "));
// Pretend today's fingerprints were yesterday's.
await ev(`(() => { const p = P(), k = ukey("wlh.advice." + p.id), h = JSON.parse(localStorage.getItem(k)); h[addDays(today(), -1)] = h[today()]; delete h[today()]; localStorage.setItem(k, JSON.stringify(h)); return true; })()`);
const again = await ev(`adviceRepeats(coachAdviceItems(P()), P()).map(i => i.text)`);
ok("the same advice on the same data is marked as a second day (Enforcer)", again.length > 0 && again.every(t => /Second day running: /.test(t)), again.join(" | "));
await ev(`P().coachPersona = "motivator"; true`);
ok("the Motivator marks it in its own words", (await ev(`adviceRepeats(coachAdviceItems(P()), P()).map(i => i.text)`)).every(t => /Still the one to fix: /.test(t)));
await ev(`(() => { const p = P(), k = ukey("wlh.advice." + p.id), h = JSON.parse(localStorage.getItem(k)); h[addDays(today(), -1)] = ["evening:other", "water:99"]; localStorage.setItem(k, JSON.stringify(h)); return true; })()`);
ok("changed data is not marked", (await ev(`adviceRepeats(coachAdviceItems(P()), P()).map(i => i.text)`)).every(t => !/Still the one to fix|Second day|Unchanged since/.test(t)));
ok("only the last two days are kept", Object.keys(await ev(`JSON.parse(localStorage.getItem(ukey("wlh.advice." + P().id)))`)).length <= 2);
ok("sign-out and delete-everything clear the history", await ev(`LS_USER_BASES.some(b => ukey("wlh.advice." + P().id).startsWith(b))`));
ok("no page errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
