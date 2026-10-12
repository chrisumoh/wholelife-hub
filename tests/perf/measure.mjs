import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/perf/measure.mjs [runs] [--gate]   (Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// --gate is the release gate: it measures only the mid-range phone (3 cold loads) and the screen-open times with a year of logs, compares them with
// tests/perf/budget.json and exits 1 when anything is over. Budgets are raised on purpose, in a pull request that says why (see docs/PERFORMANCE.md).
// Loads the app the way a phone would: 390x844 at 3x, touch, throttled CPU and network, brotli like Vercel. Prints the
// median of each metric over [runs] cold loads (default 5), then how long screens take to open once the app holds a year of logs.
// What it can't see: real GPU cost (backdrop blur, animation), Safari, and a real phone's thermal limits. Check those by hand.
// The supabase-js CDN script is blocked and replaced with fake-supabase.js, so this excludes that CDN download (about 130 KB).
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NO_SANDBOX = process.env.CI || process.env.NO_SANDBOX ? ["--no-sandbox"] : [];
const GATE = process.argv.includes("--gate");
const RUNS = Math.max(1, Number(process.argv.slice(2).find(a => /^\d+$/.test(a))) || (GATE ? 3 : 5));
const BUDGET = GATE ? JSON.parse(readFileSync(process.env.PERF_BUDGET || new URL("./budget.json", import.meta.url), "utf8")) : null;
const fails = [], passes = [];
const check = (what, value, limit, unit = "") => { (value <= limit ? passes : fails).push(`${what}: ${Math.round(value * 1000) / 1000}${unit} (limit ${limit}${unit})`); };
const FAKE = readFileSync(new URL("../browser/fake-supabase.js", import.meta.url), "utf8");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".txt": "text/plain" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const html = readFileSync(join(REPO, "index.html"));
const BR = brotliCompressSync(html, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }), GZ = gzipSync(html, { level: 9 });
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname), file = join(REPO, path === "/" ? "index.html" : path);
  if (!file.startsWith(REPO) || !existsSync(file) || /(^|[\\/])\./.test(path)) { res.writeHead(404); res.end("not found"); return; }
  const type = TYPES[extname(file)] || "application/octet-stream";
  if (file.endsWith("index.html")) { const br = /\bbr\b/.test(req.headers["accept-encoding"] || ""); res.writeHead(200, { "content-type": type, "content-encoding": br ? "br" : "gzip" }); res.end(br ? BR : GZ); return; }
  res.writeHead(200, { "content-type": type }); res.end(readFileSync(file));
}).listen(8773, "127.0.0.1");
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9339", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-perf-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" });
const stop = () => { try { chrome.kill(); } catch {} try { server.close(); } catch {} };
process.on("exit", stop);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9339/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
if (!list) { console.log("Chrome did not start (set CHROME to its path)"); process.exit(1); }
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(), listeners = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else listeners.forEach(f => f(d)); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const waitFor = async (expr, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(100); } return false; };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable"); await send("Performance.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
// Page-side observers, installed before any page script runs.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__perf = { lcp: 0, cls: 0, longs: [], fcp: 0 };
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.longs.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__perf.fcp = e.startTime; }).observe({ type: "paint", buffered: true });` });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";

let bytes = { html: 0, fonts: 0, other: 0, requests: 0 };
listeners.push(d => {
  if (d.method === "Network.responseReceived") { const u = d.params.response.url, t = d.params.type; pending.set("t" + d.params.requestId, { u, t }); }
  if (d.method === "Network.loadingFinished") { const m = pending.get("t" + d.params.requestId); if (!m) return; bytes.requests++; const n = d.params.encodedDataLength; if (m.t === "Font") bytes.fonts += n; else if (m.t === "Document") bytes.html += n; else bytes.other += n; }
});
const PROFILES = [
  { name: "Desktop, no throttle", cpu: 1, net: null },
  { name: "Mid-range phone: 4x CPU, Fast 4G (1.6 Mbps, 150 ms)", cpu: 4, net: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 } },
  { name: "Low-end phone: 6x CPU, Slow 4G (400 Kbps, 400 ms)", cpu: 6, net: { latency: 400, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 } }
];
const seed = `(async () => { const p = newProfile("Ada"); p.onboarded = true; p.coachPrompted = true; p.tourSeen = "dismissed"; S.profiles = [p]; S.activeId = p.id; saveProfile();
  const sl = ["breakfast", "lunch", "dinner"]; for (let d = 0; d < 365; d++) { const date = addDays(today(), -d); for (let k = 0; k < 3; k++) addEntry("meals", { id: uid(), date, slot: sl[k], name: "Jollof rice with chicken", cal: 560, dish: "jollof", extras: [], est: false });
    addEntry("snacks", { id: uid(), date, name: "Plantain chips", qty: 1, cal: 150 }); if (d % 2 === 0) addEntry("workouts", { id: uid(), date, type: "Run", mins: 30, cal: 300 }); }
  await flush(); return true; })()`;

console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB raw, ${(BR.length / 1024).toFixed(0)} KB brotli, ${(GZ.length / 1024).toFixed(0)} KB gzip (${RUNS} cold loads per profile, medians)\n`);
if (GATE) { check("index.html raw", html.length / 1024, BUDGET.sizeKB.raw, " KB"); check("index.html brotli", BR.length / 1024, BUDGET.sizeKB.brotli, " KB"); check("index.html gzip", GZ.length / 1024, BUDGET.sizeKB.gzip, " KB"); }
const rows = [];
for (const pr of GATE ? PROFILES.slice(1, 2) : PROFILES) {
  await send("Emulation.setCPUThrottlingRate", { rate: pr.cpu });
  await send("Network.emulateNetworkConditions", pr.net ? { offline: false, ...pr.net } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    await send("Page.navigate", { url: "about:blank" }); await sleep(300);
    bytes = { html: 0, fonts: 0, other: 0, requests: 0 };
    const t0 = Date.now(); await send("Page.navigate", { url: "http://127.0.0.1:8773/index.html" });
    const ok = await waitFor(READY); const ready = Date.now() - t0; if (!ok) { console.log("app did not become ready"); stop(); process.exit(1); }
    await sleep(1500);   // let late paints and shifts land
    const m = Object.fromEntries((await send("Performance.getMetrics")).result.metrics.map(x => [x.name, x.value]));
    const p = await ev("window.__perf"), nav = await ev("(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; })()");
    const tbt = p.longs.reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    runs.push({ fcp: p.fcp, lcp: p.lcp, cls: p.cls, dcl: nav.dcl, load: nav.load, ready, tbt, longTasks: p.longs.length, script: m.ScriptDuration * 1000, heap: m.JSHeapUsedSize / 1048576, ...bytes });
  }
  rows.push({ pr, r: Object.fromEntries(Object.keys(runs[0]).map(k => [k, median(runs.map(x => x[k]))])) });
}
const f0 = (n, u = "") => Math.round(n) + u;
console.log("| Metric | " + rows.map(x => x.pr.name).join(" | ") + " |\n|---|" + rows.map(() => "---|").join(""));
const line = (label, key, fmt) => console.log(`| ${label} | ${rows.map(x => fmt(x.r[key])).join(" | ")} |`);
line("First contentful paint", "fcp", n => f0(n, " ms")); line("Largest contentful paint", "lcp", n => f0(n, " ms")); line("Layout shift (CLS)", "cls", n => n.toFixed(3));
line("DOMContentLoaded", "dcl", n => f0(n, " ms")); line("Page load event", "load", n => f0(n, " ms")); line("App ready (signed out, empty)", "ready", n => f0(n, " ms"));
line("Total blocking time", "tbt", n => f0(n, " ms")); line("Long tasks (over 50 ms)", "longTasks", n => f0(n)); line("Script time", "script", n => f0(n, " ms")); line("JS heap at ready", "heap", n => n.toFixed(0) + " MB");
line("Document transfer", "html", n => f0(n / 1024, " KB")); line("Fonts transferred", "fonts", n => f0(n / 1024, " KB")); line("Requests", "requests", n => f0(n));

if (GATE) { const m = rows[0].r, b = BUDGET.midRange; check("mid-range first contentful paint", m.fcp, b.fcpMs, " ms"); check("mid-range app ready", m.ready, b.readyMs, " ms"); check("mid-range largest contentful paint", m.lcp, b.lcpMs, " ms"); check("mid-range total blocking time", m.tbt, b.tbtMs, " ms"); check("layout shift", m.cls, b.cls); check("document transfer", m.html / 1024, b.transferKB, " KB"); }
// A year of logs, then how long each screen takes to open (mid-range phone profile).
await send("Emulation.setCPUThrottlingRate", { rate: 1 }); await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await send("Page.navigate", { url: "http://127.0.0.1:8773/index.html" }); await waitFor(READY); await ev(seed);
const mid = PROFILES[1]; await send("Emulation.setCPUThrottlingRate", { rate: mid.cpu }); await send("Network.emulateNetworkConditions", { offline: false, ...mid.net });
const t0 = Date.now(); await send("Page.navigate", { url: "http://127.0.0.1:8773/index.html" }); await waitFor(READY); const readyFull = Date.now() - t0; await sleep(800);
console.log(`\nWith a year of logs (1,095 meals, 365 snacks, 183 workouts), mid-range phone: app ready in ${readyFull} ms. Time to open each screen (median of 3, from the hash change to the next two frames):\n\n| Screen | ms |\n|---|---|`);
for (const r of ["nutrition", "workouts", "snacks", "recipes", "culture", "coach", "premium", "settings", "home"]) {
  const t = [];
  for (let i = 0; i < 3; i++) { await ev(`location.hash = "#/health"; true`); await sleep(500); t.push(await ev(`new Promise(res => { const a = performance.now(); location.hash = "#/${r}"; requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - a))); })`)); }
  const nodes = await ev("document.querySelectorAll('*').length");
  console.log(`| ${r} | ${f0(median(t))} |`);
  if (GATE) { const lim = BUDGET.screens[r] || BUDGET.screens.default; check(`${r} opens in`, median(t), lim.ms, " ms"); check(`${r} has DOM nodes`, nodes, lim.nodes); }
}
if (GATE) { console.log("\n--- release gate ---"); for (const x of passes) console.log("PASS  " + x); for (const x of fails) console.log("FAIL  " + x); console.log(`\n${passes.length} within budget, ${fails.length} over`); stop(); process.exit(fails.length ? 1 : 0); }
stop(); process.exit(0);
