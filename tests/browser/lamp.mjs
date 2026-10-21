import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/legal.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.9: the neutral age screen (birth month and year, nothing pre-selected, no age limit named, a 24-hour retry block, only the age kept)
// and the Terms and Privacy Policy agreement at sign-up (unticked box, underlined accent links, the version and time saved with the account and on the device).
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
}).listen(8788, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9351", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-lamp-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
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

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";

await view(1440);
await send("Page.navigate", { url: "http://127.0.0.1:8788/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const pick = (m, y) => ev(`(() => { const a = document.getElementById("ag-m"), b = document.getElementById("ag-y"); a.value = ${JSON.stringify(String(m))}; b.value = ${JSON.stringify(String(y))}; return true; })()`);
const submitGate = async () => { await ev(`document.querySelector('form[data-form="age-gate"]').requestSubmit(); true`); await sleep(350); };
const fresh = async () => { await ev(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`); await send("Page.reload"); await sleep(500); return waitFor(READY, 15000); };
const CY = await ev(`new Date().getFullYear()`);


console.log("--- lamp sign-in popup");
const OPEN = `openAuthPopup("in"); true`;
await ev(`(() => { localStorage.clear(); return true; })()`); await send("Page.reload"); await sleep(500); await waitFor(READY, 15000);
await ev(OPEN); await sleep(400);
ok("the popup shows the lamp, the Google button and the email form", await ev(`!!document.querySelector("#pop-auth .lamp") && !!document.querySelector('#pop-auth [data-act="sb-google"]') && !!document.querySelector('#pop-auth form[data-form="sb-auth"] #sb-email')`));
ok("the lamp starts off, with a real button as its cord (aria-pressed false)", await ev(`(() => { const l = document.querySelector("#pop-auth .lamp"), b = l.querySelector(".lamp-cord"); return l.dataset.on === "0" && b.tagName === "BUTTON" && b.getAttribute("aria-pressed") === "false" && !!b.getAttribute("aria-label"); })()`));
ok("the form is usable while the lamp is off (email field focusable, no inert/hidden parent)", await ev(`(() => { const e = document.getElementById("sb-email"); e.focus(); return document.activeElement === e && !e.closest("[inert],[hidden]"); })()`));
ok("the lamp lights by itself, with 12 fireflies", await waitFor(`document.querySelector("#pop-auth .lamp").dataset.on === "1"`, 3000) && await ev(`document.querySelectorAll("#pop-auth .lamp-flies span").length === 12`));
ok("fireflies animate while the lamp is on", await ev(`getComputedStyle(document.querySelector("#pop-auth .lamp-flies span")).animationPlayState.split(", ").every(x => x === "running")`));
await ev(`document.querySelector("#pop-auth .lamp-cord").click(); true`); await sleep(200);
ok("pulling the cord turns the light off and updates aria-pressed", await ev(`(() => { const l = document.querySelector("#pop-auth .lamp"); return l.dataset.on === "0" && l.querySelector(".lamp-cord").getAttribute("aria-pressed") === "false"; })()`));
ok("fireflies pause while the lamp is off", await ev(`getComputedStyle(document.querySelector("#pop-auth .lamp-flies span")).animationPlayState.split(", ").every(x => x === "paused")`));
await ev(`document.querySelector("#pop-auth .lamp-cord").click(); true`); await sleep(200);
ok("pulling again turns it back on", await ev(`document.querySelector("#pop-auth .lamp").dataset.on === "1"`));
await ev(`Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); true`);
ok("fireflies pause when the tab is hidden", await ev(`getComputedStyle(document.querySelector("#pop-auth .lamp-flies span")).animationPlayState.split(", ").every(x => x === "paused")`));
await ev(`Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); true`);
ok("and run again when it is back", await ev(`getComputedStyle(document.querySelector("#pop-auth .lamp-flies span")).animationPlayState.split(", ").every(x => x === "running")`));
ok("the cord's hit area is at least 44px", await ev(`(() => { const r = document.querySelector("#pop-auth .lamp-cord").getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })()`));
await ev(`document.querySelector('#pop-auth [data-act="sb-mode"][data-v="up"]').click(); true`); await sleep(200);
ok("switching to Create account keeps the lamp (same element) and shows the agree box", await ev(`!!document.querySelector("#pop-auth .lamp") && !!document.getElementById("sb-agree")`));
await ev(`document.querySelector('#pop-auth [data-act="sb-mode"][data-v="in"]').click(); true`); await sleep(200);
await ev(`document.querySelector('#pop-auth [data-act="sb-mode"][data-v="reset"]').click(); true`); await sleep(200);
ok("Reset password has no Google button", await ev(`!document.querySelector('#pop-auth [data-act="sb-google"]')`));
await ev(`document.querySelector('#pop-auth [data-act="sb-mode"][data-v="in"]').click(); true`); await sleep(200);

console.log("--- email sign-in still works");
await ev(`document.getElementById("sb-email").value = "a@b.co"; document.getElementById("sb-pass").value = "password1"; document.querySelector('#pop-auth form[data-form="sb-auth"]').requestSubmit(); true`);
ok("email and password sign in and close the popup", await waitFor(`!!SB.user && !document.querySelector("#pop-auth.on")`, 5000));

console.log("--- Google");
await ev(`(() => { localStorage.clear(); return true; })()`); await send("Page.reload"); await sleep(500); await waitFor(READY, 15000);
const GOOGLE_OFF = `window.fetch = async () => ({ ok: true, json: async () => ({ external: { google: false } }) }); true`;
const GOOGLE_ON = `window.fetch = async () => ({ ok: true, json: async () => ({ external: { google: true } }) }); true`;
await ev(OPEN); await ev(`document.getElementById("sb-email").value = "keep@me.co"; document.getElementById("sb-pass").value = "typed-secret"; true`); await ev(GOOGLE_OFF); await ev(`document.querySelector('#pop-auth [data-act="sb-google"]').click(); true`); await sleep(400);
ok("Google switched off: what was typed in the email and password fields is still there", await ev(`document.getElementById("sb-email").value === "keep@me.co" && document.getElementById("sb-pass").value === "typed-secret"`));
ok("Google switched off: a clear message, no redirect attempted", await ev(`/isn't switched on/.test(document.getElementById("auth-g-msg")?.textContent || "") && !(window.__oauth || []).length`));
await ev(GOOGLE_ON); await ev(`document.querySelector('#pop-auth [data-act="sb-google"]').click(); true`); await sleep(400);
ok("Google switched on: signInWithOAuth is called for google, returning to this app", await ev(`(() => { const o = (window.__oauth || [])[0]; return !!o && o.provider === "google" && o.options.redirectTo === location.origin + location.pathname; })()`));
ok("the button is usable again afterwards", await ev(`!document.querySelector('#pop-auth [data-act="sb-google"]').disabled`));
await ev(`window.fetch = async () => { throw new TypeError("offline"); }; document.querySelector('#pop-auth [data-act="sb-google"]').click(); true`); await sleep(400);
ok("a failed settings request shows a message, not an error", await ev(`/Couldn't reach sign-in|offline/i.test(document.getElementById("auth-g-msg")?.textContent || "")`));

console.log("--- layout");
for (const [w, h] of [[375, 667], [375, 560], [820, 900], [1440, 900]]) {
  await view(w, h); await ev(OPEN); await sleep(500);
  const m = await ev(`(() => { const c = document.querySelector("#pop-auth .pop-card"), r = c.getBoundingClientRect(), l = document.querySelector("#pop-auth .lamp").getBoundingClientRect(); return { fitsX: c.scrollWidth <= c.clientWidth && r.left >= 0 && r.right <= innerWidth, docX: document.documentElement.scrollWidth <= innerWidth, lamp: l.width > 100 && l.height > 80 }; })()`);
  ok(`${w}x${h}: no sideways scroll, popup and lamp fit`, m.fitsX && m.docX && m.lamp, JSON.stringify(m));
  ok(`${w}x${h}: the cord is at least 44px wide and tall`, await ev(`(() => { const r = document.querySelector("#pop-auth .lamp-cord").getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })()`));
}
await view(1440);

console.log("--- reduced motion");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await ev(OPEN); await sleep(500);
ok("reduced motion: lamp is simply lit, no fireflies, no animation", await ev(`(() => { const l = document.querySelector("#pop-auth .lamp"); return l.dataset.on === "1" && l.querySelectorAll(".lamp-flies span").length === 0 && getComputedStyle(l.querySelector(".lamp-flies")).display === "none"; })()`));
ok("reduced motion: the cord still works", await ev(`(() => { document.querySelector("#pop-auth .lamp-cord").click(); return document.querySelector("#pop-auth .lamp").dataset.on === "0"; })()`));
ok("reduced motion: the form is usable", await ev(`!!document.getElementById("sb-email") && !document.querySelector("#pop-auth form").closest("[inert],[hidden]")`));
await send("Emulation.setEmulatedMedia", { features: [] });

console.log("--- themes");
for (const [sch, th] of [["light", "forest"], ["dark", "forest"], ["dark", "ocean"], ["light", "sunset"]]) {
  await ev(`document.documentElement.dataset.scheme = ${JSON.stringify(sch)}; document.documentElement.dataset.theme = ${JSON.stringify(th)}; true`); await ev(OPEN); await sleep(400);
  ok(`${sch}/${th}: lamp scene is drawn (background and cone have colour)`, await ev(`(() => { const l = document.querySelector("#pop-auth .lamp"); return getComputedStyle(l).backgroundColor !== "rgba(0, 0, 0, 0)" && getComputedStyle(l.querySelector(".lamp-cone")).backgroundImage.includes("gradient"); })()`));
}

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
