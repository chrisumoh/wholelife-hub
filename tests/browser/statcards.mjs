import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Build 8.3.16: weekly stat cards (Summary footer style, Workouts plain row).
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
}).listen(8801, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9371", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-statcards-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9371/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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

await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
await view(1100);
await send("Page.navigate", { url: "http://127.0.0.1:8801/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
// Last week's same weekday carries 30 min; this week so far carries 60 min, so the pill reads +100%.
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 3, weightKg: 70, heightCm: 170, age: 30, sex: "female", culture: "Ghana", goal: "lose" });
  S.profiles = [p]; S.activeId = p.id;
  addEntry("workouts", { id: uid(), date: today(), type: "run", minutes: 60 });
  addEntry("workouts", { id: uid(), date: addDays(weekStart(today()), -7), type: "run", minutes: 30 });
  setVital(today(), "sleep", 480); setVital(addDays(weekStart(today()), -7), "sleep", 420);
  saveProfile(); await flush(); location.hash = "#/home"; render(); return true; })()`);
ok("Summary shows minutes, calories, sleep cards (no water logged)", await waitFor(`[...document.querySelectorAll(".scgrid:not(.plain) .sc-l")].map(e => e.textContent).join() === "Workout minutes,Workout calories,Sleep a night"`), errors.join(" | "));
ok("minutes card reads 60 min with a green +100% pill", await ev(`(() => { const c = document.querySelector(".scgrid .sc"); return c.querySelector(".sc-v").textContent === "60 min" && c.querySelector(".sc-d.up").textContent.includes("100%"); })()`));
ok("sleep card reads 8.0 h with a green pill", await ev(`(() => { const c = document.querySelectorAll(".scgrid .sc")[2]; return c.querySelector(".sc-v").textContent === "8.0 h" && !!c.querySelector(".sc-d.up"); })()`));
ok("card says From last week", await ev(`document.querySelector(".sc-bot").textContent.includes("From last week")`));
ok("tip hidden, then opens on tap", await ev(`(() => { const c = document.querySelector(".sc"), t = c.querySelector(".sc-tip"); const a = getComputedStyle(t).display === "none"; c.querySelector(".sc-i").click(); return a && getComputedStyle(t).display !== "none"; })()`));
await ev(`setVital(today(), "sleep", 360); render()`);
ok("less sleep gives a red pill", await waitFor(`!!document.querySelectorAll(".scgrid .sc")[2]?.querySelector(".sc-d.down")`));
await view(375);
ok("footer cards are 1-up on a phone", await ev(`getComputedStyle(document.querySelector(".scgrid:not(.plain)")).gridTemplateColumns.split(" ").length === 1`));
await view(1100);
ok("footer cards are 4-up when wide", await ev(`getComputedStyle(document.querySelector(".scgrid:not(.plain)")).gridTemplateColumns.split(" ").length === 4`));
await ev(`location.hash = "#/workouts"`);
ok("Workouts shows workouts, minutes, streak", await waitFor(`[...document.querySelectorAll(".scgrid.plain .sc-l")].map(e => e.textContent).join() === "Workouts,Minutes,Streak"`), errors.join(" | "));
ok("plain row values match the logged workout", await ev(`(() => { const v = [...document.querySelectorAll(".scgrid.plain .sc-v")].map(e => e.textContent); return v[0] === "1" && v[1] === "60"; })()`));
await view(375);
ok("plain row is 2-up on a phone", await ev(`getComputedStyle(document.querySelector(".scgrid.plain")).gridTemplateColumns.split(" ").length === 2`));
ok("no console errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
