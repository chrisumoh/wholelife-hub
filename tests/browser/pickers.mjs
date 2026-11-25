import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/motion.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.34: the sliding pill on the Settings tabs and the wheel picker (select[data-wheel]) on Log a meal > Portion.
// SHOTS=<folder> also saves screenshots there, for looking at.
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
}).listen(8802, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9362", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-pickers-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9362/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
const shot = async name => { if (!process.env.SHOTS) return; const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(process.env.SHOTS, name + ".png"), Buffer.from(r.data, "base64")); };
const goto = async h => { await ev(`location.hash = ${JSON.stringify(h)}; true`); await sleep(500); await ev(`document.querySelectorAll(".spark, .chart-svg").forEach(e => e.classList.add("drawn")); true`); };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*", "*/vendor/supabase*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
await view(1200);
await send("Page.navigate", { url: "http://127.0.0.1:8802/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30, sex: "female", goal: "build", coachPersona: "enforcer", coachName: "Coach Henry",
  widgets: [{ k: "calories", size: "s" }, { k: "steps", size: "m" }, { k: "meals", size: "m" }, { k: "coach", size: "l" }] });
  S.profiles = [p]; S.activeId = p.id; S.logs = {};
  for (let d = 0; d < 6; d++) { const date = addDays(today(), -d); addEntry("meals", { id: uid(), date, slot: "lunch", name: "Jollof rice", cal: 500 + d * 30, dish: "jollof", extras: [], est: false }); setVital(date, "steps", 8000 + d * 100); }
  saveProfile(); await flush(); render(); return true; })()`);
await ev(`P().widgets.find(w => w.k === "coach").size = "l"; render(); true`);
await goto("#/home");

console.log("--- 1. Settings rail: the left rail replaced the sliding-pill tab strip (build 8.5.x)");
await goto("#/settings"); await sleep(500);
const rail = () => ev(`(() => { const r = document.querySelector(".setrail"), act = r ? [...r.querySelectorAll('a[aria-current="page"]')] : []; return r ? { n: r.querySelectorAll("a").length, groups: [...r.querySelectorAll(".setrail-lbl")].map(x => x.textContent), active: act.map(a => a.textContent.trim()), minH: Math.min(...[...r.querySelectorAll("a")].map(a => a.getBoundingClientRect().height)), dir: getComputedStyle(r.querySelector("a")).flexDirection, tabsLeft: document.querySelectorAll(".set-layout .tabs").length } : null; })()`);
let rl = await rail();
ok("9 rail rows in the You and App groups, Profile active", rl && rl.n === 9 && rl.groups.join() === "You,App" && rl.active.join() === "Profile", JSON.stringify(rl));
ok("every row is at least 44px tall and icon and label sit side by side", rl && rl.minH >= 44 && rl.dir === "row", JSON.stringify(rl));
ok("the shared .tabs class is not used inside the layout", rl && rl.tabsLeft === 0, JSON.stringify(rl));
await ev(`document.querySelector('.setrail a[href="#/settings/appearance"]').click(); true`); await sleep(500);
rl = await rail();
ok("choosing a row switches the section and moves the active mark", rl && rl.active.join() === "Appearance" && await ev(`!!document.getElementById("appearance")`), JSON.stringify(rl));
ok("the rail stays sticky while the page scrolls", await ev(`getComputedStyle(document.querySelector(".setrail")).position === "sticky"`));
await view(390, 800); await sleep(300);
ok("on a phone the rail is a single pinned row, not a squeezed card", await ev(`(() => { const r = document.querySelector(".setrail"), b = r.getBoundingClientRect(); return b.height < 80 && b.width > 300 && getComputedStyle(r).flexDirection === "row" && r.scrollWidth > r.clientWidth; })()`));
await view(1200);

console.log("--- 2. Log a meal > Portion is a standard dropdown list again (8.6.20)");
await goto("#/nutrition"); await sleep(500);
ok("the Portion select is a normal dropdown with its five options, not a wheel", await ev(`(() => { const s = document.getElementById("m-portion"); return !!s && !s._wheel && !!s._wl && s.options.length === 5 && !document.querySelector(".wl-wheel"); })()`));
ok("it opens as a list you can pick from, like Meal", await ev(`(() => { const s = document.getElementById("m-portion"); s._wl.click?.(); return true; })()`));
ok("the Meal select beside it is a dropdown too", await ev(`(() => { const s = document.getElementById("m-slot"); return !s._wheel && !!s._wl; })()`));
ok("no wheel appears where no select asks for one (Settings)", await ev(`(async () => { location.hash = "#/settings"; await new Promise(r => setTimeout(r, 600)); return document.querySelectorAll(".wl-wheel").length === 0; })()`));
await ev(`document.documentElement.dataset.motion = "reduced"; true`);
const rm = await ev(`(() => ({ m: document.documentElement.dataset.motion, rail: !!document.querySelector(".setrail") && document.querySelectorAll(".setrail a").length === 9 }))()`);
ok("reduced motion keeps the Settings rail intact (the sliding pill went with the tab strip)", rm.m === "reduced" && rm.rail, JSON.stringify(rm));

ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
