import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/motion.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.22: the collapsed sidebar rail -- one centre line, one row height, one gap. SHOTS=<folder> saves a screenshot.
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9360", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-rail-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
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
const shot = async name => { if (!process.env.SHOTS) return; const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(process.env.SHOTS, name + ".png"), Buffer.from(r.data, "base64")); };
const goto = async h => { await ev(`location.hash = ${JSON.stringify(h)}; true`); await sleep(500); await ev(`document.querySelectorAll(".spark, .chart-svg").forEach(e => e.classList.add("drawn")); true`); };
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*", "*/vendor/supabase*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("wlh.rail", "1"); } catch {}` });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
await view(1280, 1000);
await send("Page.navigate", { url: "http://127.0.0.1:8797/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
// Free profile (Go Premium link) and subscriber (Premium button) are both checked, forced with ?premium=0/1.
for (const premium of [false, true]) {
  await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", }); history.replaceState(null, "", "?premium=${premium ? 1 : 0}"); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); render(); return true; })()`);
  await sleep(1200);
  const m = await ev(`(() => { const c = e => { const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, top: r.top, h: r.height }; };
    const rows = [...document.querySelectorAll(".app.rail .side .nav > a, .app.rail .side .nav .navgrp-items > *")].filter(e => e.offsetParent), tiles = rows.map(r => c(r.querySelector(".si-tile")));
    const rail = document.querySelector(".side").getBoundingClientRect(), pitch = tiles.slice(1).map((t, i) => Math.round(t.top - tiles[i].top));
    return { n: rows.length, axis: Math.round(rail.left + rail.width / 2), cx: tiles.map(t => Math.round(t.cx)), logo: Math.round(c(document.querySelector(".side .brand svg, .side .brand .logo-svg")).cx), avatar: Math.round(c(document.querySelector(".side .who .avatar")).cx), upsell: !!document.querySelector(".side .nav a.upsell"), btn: !!document.querySelector(".side .nav button.prem-trigger"), heights: [...new Set(rows.map(r => Math.round(r.getBoundingClientRect().height)))], pitch }; })()`);
  const tag = premium ? "subscriber" : "free profile";
  ok(`${tag}: the expected Premium row is showing`, premium ? m.btn && !m.upsell : m.upsell && !m.btn, JSON.stringify(m));
  ok(`${tag}: every icon, the logo and the avatar share one centre line`, m.n >= 10 && m.cx.every(x => x === m.axis) && m.logo === m.axis && m.avatar === m.axis, JSON.stringify(m));
  ok(`${tag}: every row is the same height`, m.heights.length === 1, JSON.stringify(m.heights));
  // The one larger step is the hairline that sets Premium and Settings apart from the daily rows.
  const steps = [...new Set(m.pitch)].sort((a, b) => a - b);
  ok(`${tag}: rows are evenly spaced, with one wider step for the divider only`, steps[0] === m.heights[0] + 6 && m.pitch.filter(p => p !== steps[0]).length === 1, JSON.stringify(m.pitch));
  ok(`${tag}: the logo is a link to Summary`, await ev(`(() => { const a = document.querySelector(".side a.brand-home"); return !!a && a.getAttribute("href") === "#/home" && !!a.getAttribute("aria-label"); })()`));
  await ev(`location.hash = "#/settings"; true`); await sleep(500);
  await ev(`document.querySelector(".side a.brand-home").click(); true`); await sleep(500);
  ok(`${tag}: clicking the logo opens Summary`, await ev(`location.hash === "#/home"`));
  await shot("rail-" + (premium ? "subscriber" : "free"));
}
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
