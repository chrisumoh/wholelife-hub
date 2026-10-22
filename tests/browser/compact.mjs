import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/workouts.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.6: compact Workouts and Recipes pages.
// (borrowed boilerplate)  Every activity has its own icon drawn inside the tile, a colour, a MET value and a group; the picker shows them in groups;
// every coach sport has three sessions and an icon; imports (Apple Health and file names) land on the right activity; a logged workout gets the right calorie estimate.
// The icons are original artwork inside the app (ten are Boxicons glyphs since 8.2.17), so this test is the check that none is missing, blank, clipped or a copy of another.
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
}).listen(8786, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9349", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-compact-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9349/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await view(1440);
await send("Page.navigate", { url: "http://127.0.0.1:8786/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", age: 30, sex: "female", heightCm: 170, weightKg: 70, freq: 3, level: "beginner" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); location.hash = "#/workouts"; render(); return true; })()`); await sleep(500);
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);

console.log("--- Workouts");
ok("imports start folded and the file inputs are not in the page", await ev(`!document.getElementById("f-apple") && !!document.querySelector('[data-act="imp-toggle"]')`));
await click('[data-act="imp-toggle"]'); await sleep(200);
ok("opening imports shows both file inputs", await ev(`!!document.getElementById("f-apple") && !!document.getElementById("f-google")`));
ok("the activity picker is folded to the current activity", await ev(`document.querySelectorAll(".actbtn").length === 0 && document.querySelector(".actcur b").textContent === ACT.strength.n`));
await click('[data-act="act-toggle"]'); await sleep(200);
ok("Change opens all activities and Done folds them", await ev(`document.querySelectorAll(".actbtn").length === ACTIVITIES.length`));
await click('[data-act="act-toggle"]'); await sleep(200);
ok("Done folds the picker again", await ev(`document.querySelectorAll(".actbtn").length === 0`));
await ev(`(() => { document.getElementById("w-min").value = "42"; document.getElementById("w-d").value = "2026-10-01"; document.getElementById("w-cal").value = "300"; document.getElementById("w-note").value = "legs"; return true; })()`);
await click('[data-act="act-toggle"]'); await sleep(200); await click('[data-act="pick-act"][data-v="pilates"]'); await sleep(200); await click('[data-act="imp-toggle"]'); await sleep(200);
ok("a filled workout form keeps minutes, date, calories and notes through Change, pick and Import", await ev(`["w-min","w-d","w-cal","w-note"].map(i => document.getElementById(i).value).join("|") === "42|2026-10-01|300|legs"`));
const n = await ev(`(() => { for (let i = 0; i < 14; i++) addEntry("workouts", { id: uid(), date: today(), type: "run", minutes: 20 + i }); render(); return document.querySelectorAll(".wrow").length; })()`);
ok("history shows 10 first, with Show more", n === 10 && await ev(`!!document.querySelector('[data-act="more-w"]')`), String(n));

console.log("--- Recipes");
await ev(`location.hash = "#/recipes"; render(); true`); await sleep(300);
await click('[data-act="build-plan"]'); await sleep(500);
ok("a built 7-day plan shows only the first day until opened", await ev(`document.querySelectorAll(".planday").length === 1`));
await click('[data-act="plan-toggle"]'); await sleep(200);
ok("Show all days lists all seven", await ev(`document.querySelectorAll(".planday").length === 7`));
await ev(`location.hash = "#/recipes"; render(); true`); await sleep(400);
const r = await ev(`({ n: document.querySelectorAll(".dpv").length, total: DISHES.length, days: document.querySelectorAll(".planday").length, h: Math.round(document.querySelector(".dpv").getBoundingClientRect().height) })`);
ok("the library shows 6 dishes, not the whole catalog", r.n === 6 && r.total > 6, JSON.stringify(r));
ok("a dish row is 64px tall when closed", r.h === 64, String(r.h));
ok("Browse all opens every dish", (await click('[data-act="rec-all"]'), await sleep(300), await ev(`document.querySelectorAll(".dpv").length === DISHES.length`)));
await click('[data-act="rec-all"]'); await sleep(300);
await click('[data-act="dpv"]'); await sleep(900);
const o = await ev(`(() => { const c = document.querySelector(".dpv"); return { exp: c.classList.contains("expanded"), h: Math.round(c.getBoundingClientRect().height), ar: document.querySelector('[data-act="dpv"]').getAttribute("aria-expanded") }; })()`);
ok("the preview button opens a dish to 120px (touch and keyboard)", o.exp && o.h === 120 && o.ar === "true", JSON.stringify(o));
ok("a search shows at most 12 matches until Browse all", (await ev(`UI.recFilter.q = "rice"; render(); true`), await ev(`document.querySelectorAll(".dpv").length <= 12`)));

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
