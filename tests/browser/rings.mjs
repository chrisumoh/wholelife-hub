import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/cards.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// The 8.2.6 dashboard card: every Summary pin, the cards on Nutrition and Health data, and the Trends cards must follow one flat pattern
// (solid surface, 20px radius, 16px padding, no border, shadow, blur or gradient; header, 48px of space, value bottom left, optional
// chart bottom right; "No Data" when empty; one link to the detail page). Checked at 375, 820 and 1440px in light, dark and OLED, in every theme.
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
}).listen(8788, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9351", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-rings-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9351/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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

// The 8.3.8 rings card: a seven-day picker, per-day rings, staggered draw-in.
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
await view(1100);
await send("Page.navigate", { url: "http://127.0.0.1:8788/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 3, weightKg: 70, heightCm: 170, age: 30, sex: "female", culture: "Ghana", goal: "lose" });
  S.profiles = [p]; S.activeId = p.id;
  addEntry("meals", { id: uid(), date: today(), slot: "lunch", name: "Jollof rice", cal: 600, dish: "jollof", extras: [], est: false });
  addEntry("meals", { id: uid(), date: addDays(today(), -2), slot: "lunch", name: "Waakye", cal: 900, dish: "waakye", extras: [], est: false });
  saveProfile(); await flush(); render(); return true; })()`);
ok("rings card shows seven day buttons", await waitFor(`document.querySelectorAll("#rings .rday").length === 7`), errors.join(" | "));
ok("today is pressed by default", await ev(`document.querySelector("#rings .rday[aria-pressed=true]").dataset.v === today()`));
ok("move legend shows today's 600 cal", await ev(`document.querySelector("#rings .rleg-num b").textContent.replace(/\\D/g, "") === "600"`));
await ev(`document.querySelector('#rings .rday[data-v="' + addDays(today(), -2) + '"]').click()`);
ok("tapping a day shows that day's calories", await waitFor(`document.querySelector("#rings .rleg-num b").textContent.replace(/\\D/g, "") === "900"`));
ok("the tapped day is pressed and keeps focus", await ev(`document.activeElement.dataset.v === addDays(today(), -2) && document.activeElement.getAttribute("aria-pressed") === "true"`));
ok("eyebrow names the chosen day", await ev(`!/Today/.test(document.querySelector("#rings .eyebrow").textContent)`));
ok("arcs have staggered delays", await ev(`[...document.querySelectorAll("#rings .rg-arc")].map(a => parseInt(a.style.transitionDelay)).join() === "0,140,280"`));
ok("ring centre shows closed count", await ev(`/^\\d\\/3/.test(document.querySelector("#rings .rings-mid").textContent)`));
ok("no console errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
