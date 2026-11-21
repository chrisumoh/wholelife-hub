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
ok("8 rail rows in the You and App groups, Profile active", rl && rl.n === 8 && rl.groups.join() === "You,App" && rl.active.join() === "Profile", JSON.stringify(rl));
ok("every row is at least 44px tall and icon and label sit side by side", rl && rl.minH >= 44 && rl.dir === "row", JSON.stringify(rl));
ok("the shared .tabs class is not used inside the layout", rl && rl.tabsLeft === 0, JSON.stringify(rl));
await ev(`document.querySelector('.setrail a[href="#/settings/appearance"]').click(); true`); await sleep(500);
rl = await rail();
ok("choosing a row switches the section and moves the active mark", rl && rl.active.join() === "Appearance" && await ev(`!!document.getElementById("appearance")`), JSON.stringify(rl));
ok("the rail stays sticky while the page scrolls", await ev(`getComputedStyle(document.querySelector(".setrail")).position === "sticky"`));
await view(390, 800); await sleep(300);
ok("on a phone the rail is a single pinned row, not a squeezed card", await ev(`(() => { const r = document.querySelector(".setrail"), b = r.getBoundingClientRect(); return b.height < 80 && b.width > 300 && getComputedStyle(r).flexDirection === "row" && r.scrollWidth > r.clientWidth; })()`));
await view(1200);

console.log("--- 2. wheel picker on Log a meal");
await goto("#/nutrition"); await sleep(500);
const wh = () => ev(`(() => { const s = document.getElementById("m-portion"), w = s._wheel; return w ? { n: w.querySelectorAll("[role=option]").length, opts: s.options.length, active: w.querySelector(".active")?.textContent, val: s.options[s.selectedIndex].text, i: w.firstElementChild.style.getPropertyValue("--i"), hidden: getComputedStyle(s).display, op: [...w.querySelectorAll("[role=option]:not(.active)")].map(r => +getComputedStyle(r).opacity.slice(0, 4)) } : null; })()`);
let w1 = await wh();
ok("the Portion select shows as a wheel with one row per option", w1 && w1.n === w1.opts && w1.n >= 3 && w1.hidden === "none", JSON.stringify(w1));
ok("the chosen row is full weight and the rest are faded", w1 && w1.active === w1.val && w1.op.every(o => o < 0.5), JSON.stringify(w1));
await ev(`window.__ch = 0; document.getElementById("m-portion").addEventListener("change", () => window.__ch++); document.getElementById("m-portion")._wheel.focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 }); await sleep(700);
let w2 = await wh();
ok("Arrow Down picks the next row, moves the track and fires one change", w2 && w2.i === String(+w1.i + 1) && w2.active === w2.val && w2.active !== w1.active && await ev(`window.__ch`) === 1, JSON.stringify(w2));
await ev(`document.getElementById("m-portion")._wheel.querySelectorAll("[role=option]")[0].click(); true`); await sleep(300);
let w3 = await wh();
ok("clicking a row picks it", w3 && w3.i === "0" && w3.val === w3.active && await ev(`window.__ch`) === 2, JSON.stringify(w3));
ok("the wheel is a listbox with a name and the active row announced", await ev(`(() => { const w = document.getElementById("m-portion")._wheel; return w.getAttribute("role") === "listbox" && !!w.getAttribute("aria-label") && !!document.getElementById(w.getAttribute("aria-activedescendant")) && w.querySelector('[aria-selected="true"]') !== null; })()`));
ok("the Meal select beside it stays a dropdown", await ev(`(() => { const s = document.getElementById("m-slot"); return !s._wheel && !!s._wl; })()`));
ok("no wheel appears where no select asks for one (Settings)", await ev(`(async () => { location.hash = "#/settings"; await new Promise(r => setTimeout(r, 600)); return document.querySelectorAll(".wl-wheel").length === 0; })()`));
await ev(`document.documentElement.dataset.motion = "reduced"; true`);
const rm = await ev(`(() => ({ m: document.documentElement.dataset.motion, rail: !!document.querySelector(".setrail") && document.querySelectorAll(".setrail a").length === 8 }))()`);
ok("reduced motion keeps the Settings rail intact (the sliding pill went with the tab strip)", rm.m === "reduced" && rm.rail, JSON.stringify(rm));

ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
