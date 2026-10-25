import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run from the repo root:  node tests/browser/glass.mjs [screenshot-dir]   (needs Node 22+, Python 3 and Chrome)
// Checks the 8.2.6 look: content cards are flat (no glass, caustics, beam or scene behind them) and blur survives only on the
// floating bars and menus; plus the rubber-band Interface opacity slider from 8.1.20.
// With a directory argument it also saves screenshots.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const NO_SANDBOX = process.env.CI || process.env.NO_SANDBOX ? ["--no-sandbox"] : [];   // CI runners run Chrome as root
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const SHOTS = process.argv[2]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
procs.push(spawn(PYTHON, ["-m", "http.server", "8769", "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" }));
procs.push(spawn(CHROME, ["--headless=new", "--remote-debugging-port=9337", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-glass-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }));
// Wait for Chrome's debugging port instead of a fixed sleep: a cold start on a CI runner can take several seconds.
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9337/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
if (!list) { console.log("FAIL  Chrome did not start (set CHROME to its path)"); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(1); }
// Never leave Chrome or the server running if the test throws: a leftover Chrome on the same port would poison the next test.
process.on("exit", () => procs.forEach(p => { try { p.kill(); } catch {} }));
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const waitFor = async (expr, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(120); } return false; };
const VK = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, Enter: 13, Escape: 27, Tab: 9 };
const key = async (k, extra = {}) => { const code = k.length === 1 ? { text: k } : { windowsVirtualKeyCode: VK[k], code: k, ...(k === "Enter" ? { text: "\r" } : {}) }; await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, ...code, ...extra }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, ...(k.length === 1 ? {} : { windowsVirtualKeyCode: VK[k], code: k }) }); await sleep(40); };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };
const view = async (w, h = 900, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
const shot = async name => { if (!SHOTS) return; const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(SHOTS, name + ".png"), Buffer.from(r.result.data, "base64")); };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable"); await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*", "*/vendor/supabase*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const ready = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
const boot = async (hash = "") => { await send("Page.navigate", { url: "http://127.0.0.1:8769/index.html" + hash }); await sleep(500); return waitFor(ready, 15000); };
const go = async hash => { await ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(500); };

await view(1440);
ok("boot", await boot(), JSON.stringify(errors));
await ev(`(async () => { const p = newProfile("Ada"); p.onboarded = true; p.coachPrompted = true; p.tourSeen = "dismissed"; S.profiles.push(p); S.activeId = p.id; markAll(); await flush(); })()`);
await sleep(400);
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });

console.log("--- Summary: flat cards, glass only on the chrome (8.2.6)");
ok("summary", await boot("#/home")); await sleep(800);
await shot("summary-dark");
const flat = await ev(`(() => { const cs = [...document.querySelectorAll(".app .card, .app .mcard")]; const bad = cs.filter(e => { const c = getComputedStyle(e); return c.backdropFilter !== "none" || c.boxShadow !== "none" || c.borderTopWidth !== "0px" || c.backgroundImage !== "none"; });
  const pseudo = [...document.querySelectorAll(".app .mcard")].filter(e => getComputedStyle(e, "::before").display !== "none" || getComputedStyle(e, "::after").display !== "none");
  return { n: cs.length, bad: bad.length, pseudo: pseudo.length }; })()`);
ok("every content card is solid and flat: no blur, shadow, border or gradient", flat.n > 3 && flat.bad === 0, JSON.stringify(flat));
ok("no caustic, sheen or beam layer on any card", flat.pseudo === 0 && await ev(`getComputedStyle(document.getElementById("rings"), "::before").display === "none"`), JSON.stringify(flat));
ok("no aurora, scene or season layer behind the cards", await ev(`[...document.querySelectorAll(".aurora, .scene, .season-layer")].every(e => getComputedStyle(e).display === "none")`));
ok("blur survives only on the floating bars and menus", await ev(`[...document.querySelectorAll("*")].filter(e => getComputedStyle(e).backdropFilter !== "none").every(e => e.closest(".top, .tabs, .side, .compact-head, .page-head, .scrim, [role=dialog], .pop, .popover, .notif-pop, .palette"))`));

console.log("--- glass slider");
ok("appearance", await boot("#/settings/appearance")); await sleep(500);
await ev(`document.getElementById("ui-op-ws").scrollIntoView({ block: "center" }); true`); await sleep(300);
const s0 = await ev(`(() => { const t = document.querySelector("#ui-op-ws .gslider__thumb"), r = t.getBoundingClientRect(); return { role: t.getAttribute("role"), now: t.getAttribute("aria-valuenow"), min: t.getAttribute("aria-valuemin"), max: t.getAttribute("aria-valuemax"), w: Math.round(r.width), wake: !!document.querySelector(".wake-slider") }; })()`);
ok("thumb is a 28px slider with its values", s0.role === "slider" && s0.now === "100" && s0.min === "35" && s0.max === "100" && s0.w === 28 && !s0.wake, JSON.stringify(s0));
await ev(`document.querySelector("#ui-op-ws .gslider__thumb").focus(); true`);
await key("ArrowLeft"); await sleep(100);
ok("ArrowLeft: 95%, glass follows", await ev(`document.querySelector("#ui-op-ws .gslider__thumb").getAttribute("aria-valuenow") === "95" && getComputedStyle(document.documentElement).getPropertyValue("--ui-op").trim() === "0.95" && document.getElementById("ui-op-val").textContent === "95%"`));
ok("key moves spring (.snap)", await ev(`document.getElementById("ui-op-ws").classList.contains("snap")`));
await key("Home"); await sleep(100);
ok("Home: 35%", await ev(`document.querySelector("#ui-op-ws .gslider__thumb").getAttribute("aria-valuenow") === "35"`));
await key("End"); await sleep(600);
const tr = await ev(`(() => { const r = document.querySelector("#ui-op-ws .gslider__track").getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; })()`);
await mouse("mousePressed", tr.x + tr.w * 0.5, tr.y); await sleep(50);
ok("press jumps to the pointer, no transition while dragging", await ev(`(() => { const s = document.getElementById("ui-op-ws"); return s.classList.contains("drag") && !s.classList.contains("snap") && getComputedStyle(s.querySelector(".gslider__thumb")).transitionDuration === "0s"; })()`));
await mouse("mouseMoved", tr.x + tr.w * 0.25, tr.y); await sleep(50);
const mid = await ev(`parseFloat(getComputedStyle(document.getElementById("ui-op-ws")).getPropertyValue("--pct"))`);
ok("thumb follows the pointer 1:1 inside the track", Math.abs(mid - 25) < 0.5, String(mid));
await mouse("mouseMoved", tr.x - 300, tr.y); await sleep(50);
const ov = await ev(`(() => { const s = document.getElementById("ui-op-ws"); return { pct: parseFloat(getComputedStyle(s).getPropertyValue("--pct")), v: s.querySelector(".gslider__thumb").getAttribute("aria-valuenow"), over: s.classList.contains("over") }; })()`);
const capPct = 12 / tr.w * 100;
ok("past the end: value stops at 35, thumb rubber-bands a little past it", ov.v === "35" && ov.over && ov.pct < 0 && ov.pct > -capPct - 0.01, JSON.stringify(ov) + " cap " + capPct);
ok("only 32% of the overshoot (eased), never more", Math.abs(ov.pct) < (300 / tr.w * 100) * 0.32, JSON.stringify(ov));
await shot("slider-overshoot");
await mouse("mouseReleased", tr.x - 300, tr.y); await sleep(60);
ok("release: overshoot dropped and .snap springs home", await ev(`(() => { const s = document.getElementById("ui-op-ws"); return s.classList.contains("snap") && parseFloat(getComputedStyle(s).getPropertyValue("--pct")) === 0 && !s.classList.contains("drag"); })()`));
ok("spring curve overshoots (0.34, 1.56, 0.64, 1)", await ev(`getComputedStyle(document.querySelector("#ui-op-ws .gslider__thumb")).transitionTimingFunction.includes("cubic-bezier(0.34, 1.56, 0.64, 1)")`));
await sleep(700);
ok(".snap removed after the spring", await ev(`!document.getElementById("ui-op-ws").classList.contains("snap")`));
await ev(`document.querySelector('[data-act="op-reset"]').click(); true`); await sleep(700);
ok("Reset returns the thumb to 100%", await ev(`document.querySelector("#ui-op-ws .gslider__thumb").getAttribute("aria-valuenow") === "100" && parseFloat(getComputedStyle(document.getElementById("ui-op-ws")).getPropertyValue("--pct")) === 100`));

console.log("--- light mode and phone");
await ev(`(() => { const p = P(); p.look = { ...(p.look || {}), mode: "light", theme: "forest" }; saveProfile(); applyLook(p); render(); })()`);
ok("summary light", await boot("#/home")); await sleep(600);
ok("light: cards are white on a #F2F2F7 page", await ev(`getComputedStyle(document.querySelector(".app .mcard")).backgroundColor === "rgb(255, 255, 255)" && getComputedStyle(document.body).backgroundColor === "rgb(242, 242, 247)"`));
await shot("summary-light");
await view(375, 812, true); await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); await boot("#/home"); await sleep(600);
ok("375px: no horizontal scroll", await ev(`document.documentElement.scrollWidth <= innerWidth`));
ok("375px: cards are still flat on touch screens", await ev(`getComputedStyle(document.querySelector(".app .mcard")).boxShadow === "none"`));
await shot("summary-375");

ok("no uncaught page errors", errors.length === 0, JSON.stringify(errors));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => p.kill());
process.exit(fail ? 1 : 0);
