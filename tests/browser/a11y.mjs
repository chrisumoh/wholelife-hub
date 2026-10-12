import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/a11y.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root; AXE_JS=path to axe.min.js to work offline)
// Build 8.2.10: accessibility. axe-core (WCAG 2.0, 2.1 and 2.2 level A and AA, plus its best-practice rules) must find nothing on every screen and popup, at 375 and 1440px,
// in light and dark. Then the things axe cannot see: the skip link, a visible focus ring on every tab stop, no click-only controls, one h1 and one main per page,
// and no sideways scrolling at 320px (reflow). axe-core is not bundled: it is read from AXE_JS, or fetched from jsDelivr (version pinned).
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
}).listen(8781, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9344", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-a11y-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9344/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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

const AXE_VERSION = "4.10.2";
let AXE = ""; try { AXE = process.env.AXE_JS ? readFileSync(process.env.AXE_JS, "utf8") : await (await fetch(`https://cdn.jsdelivr.net/npm/axe-core@${AXE_VERSION}/axe.min.js`)).text(); } catch {}
await view(1440);
await send("Page.navigate", { url: "http://127.0.0.1:8781/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
ok("axe-core is available (set AXE_JS if the network is blocked)", AXE.length > 100000, "length " + AXE.length);
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const setMode = async mode => { await ev(`(() => { const p = P(); p.look = { ...(p.look || {}), mode: ${JSON.stringify(mode)} }; saveProfile(); applyLook(p); render(); return true; })()`); await sleep(1200); }; // colours fade between schemes, so wait for them to settle before measuring contrast
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, targetKg: 65, weightKg: 70, heightCm: 170, age: 30, sex: "female", culture: "Ghana" }); p.premium = { active: true, since: today(), source: "test", expires: null };
  S.profiles = [p]; S.activeId = p.id; for (let d = 0; d < 8; d++) { const date = addDays(today(), -d); addEntry("meals", { id: uid(), date, slot: "lunch", name: "Jollof", cal: 500, dish: "jollof", extras: [], est: false }); addEntry("workouts", { id: uid(), date, type: "Run", minutes: 30, cal: 200 }); addEntry("snacks", { id: uid(), date, name: "Chips", qty: 1, cal: 150 }); setVital(date, "steps", 8000); setVital(date, "rhr", 62); setVital(date, "sleep", 420); }
  saveProfile(); await flush(); return true; })()`);
await ev(AXE + "\n;true");
const RUN = `(async () => { const x = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }); return x.violations.map(v => v.id + " (" + v.impact + "): " + v.nodes.length + " e.g. " + v.nodes[0].target.join(" ") + " " + (v.nodes[0].any[0] || v.nodes[0].all[0] || v.nodes[0].none[0] || {}).message); })()`;
const ROUTES = ["home", "health", "nutrition", "workouts", "snacks", "alcohol", "awards", "recipes", "recipes/jollof", "culture", "coach", "metric/steps", "metric/weight", "metric/bp", "cat/activity", "settings/profile", "settings/coach", "settings/goals", "settings/household", "settings/appearance", "settings/premium", "settings/privacy", "settings/about", "premium", "premium/pantry", "premium/micros", "privacy-policy", "terms", "refunds", "contact", "credits"];
const STATES = {
  "Summary in edit mode with Large cards": `(() => { const p = P(); p.wv = 2; p.widgets = [{ k: "calories", size: "l" }, { k: "meals", size: "l" }, { k: "coach", size: "l" }, { k: "weight", size: "l" }, { k: "water", size: "l" }]; UI.editPage = "home"; location.hash = "#/home"; render(); return true; })()`,
  "Create account popup": `(() => { UI.editPage = null; location.hash = "#/settings/profile"; render(); setTimeout(() => document.querySelector('[data-act="sb-open"][data-v="up"]')?.click(), 150); return true; })()`,
  "quick jump palette": `(() => { location.hash = "#/home"; render(); openPalette(); return true; })()`,
  "welcome screen": `(() => { UI.obDraft = newProfile(""); UI.obStep = 0; UI.obGate = null; UI.obGateOk = false; S.activeId = null; render(); return true; })()`,
  "age screen": `(() => { UI.obGate = "next"; render(); return true; })()`,
  "setup step 1 (coach)": `(() => { UI.obGate = null; UI.obStep = 1; render(); return true; })()`,
  "setup step 3": `(() => { UI.obStep = 3; render(); return true; })()`,
  "setup step 4": `(() => { UI.obStep = 4; render(); return true; })()`
};
console.log("--- 1. axe on every screen, 375 and 1440px, light and dark");
for (const w of [375, 1440]) for (const mode of ["light", "dark"]) {
  await view(w); await setMode(mode);
  const bad = [];
  for (const r of ROUTES) { await ev(`location.hash = "#/${r}"; true`); await sleep(350); bad.push(...(await ev(RUN)).map(x => r + ": " + x)); }
  ok(`${w}px ${mode}: ${ROUTES.length} screens, no axe violations`, bad.length === 0, bad.slice(0, 3).join(" || "));
}
console.log("--- 2. axe on popups, edit mode and the setup screens");
const keep = await ev(`JSON.stringify(S.profiles[0])`);
for (const w of [375, 1440]) for (const mode of ["light", "dark"]) {
  await view(w); await setMode(mode);
  const bad = [];
  for (const [name, js] of Object.entries(STATES)) { await ev(`S.profiles = [${keep}]; S.activeId = S.profiles[0].id; true`); await ev(js); await sleep(600); bad.push(...(await ev(RUN)).map(x => name + ": " + x)); }
  await ev(`S.profiles = [${keep}]; S.activeId = S.profiles[0].id; UI.obStep = 0; UI.obDraft = null; UI.obGate = null; UI.editPage = null; location.hash = "#/home"; render(); true`);
  ok(`${w}px ${mode}: ${Object.keys(STATES).length} popups, edit mode and setup screens, no axe violations`, bad.length === 0, bad.slice(0, 3).join(" || "));
}

console.log("--- 3. keyboard and structure (what axe cannot see)");
await view(1440); await setMode("light"); await ev(`document.querySelectorAll('[data-pop="close"]').forEach(b => b.click()); closePalette(); document.activeElement?.blur?.(); location.hash = "#/home"; true`); await sleep(700);
const key = async (k, code, vk) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, ...(k === "Enter" ? { text: "\r" } : {}) }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); await sleep(60); };
await ev(`document.body.focus(); true`);
await key("Tab", "Tab", 9);
const first = await ev(`({ cls: document.activeElement.className, text: document.activeElement.textContent.trim(), top: document.activeElement.getBoundingClientRect().top, vis: getComputedStyle(document.activeElement).display })`);
ok("the first Tab stop is 'Skip to page content', and it is on screen when focused", first.cls === "skip-link" && first.text === "Skip to page content" && first.top >= 0, JSON.stringify(first));
await key("Enter", "Enter", 13);
ok("pressing it moves focus into the page content", await ev(`document.activeElement?.classList.contains("section") && document.activeElement.id === "sec-home"`), await ev(`document.activeElement?.tagName + "." + document.activeElement?.className`));
const rings = [];
await ev(`document.activeElement.blur(); document.body.focus(); true`);
for (let i = 0; i < 24; i++) { await key("Tab", "Tab", 9); rings.push(await ev(`(() => { const e = document.activeElement, c = getComputedStyle(e); const r = e.getBoundingClientRect(); return { n: e.tagName + "." + String(e.className).slice(0, 24) + (e.dataset?.act ? "[" + e.dataset.act + "]" : ""), ring: c.outlineStyle !== "none" && parseFloat(c.outlineWidth) >= 2 || c.boxShadow !== "none", onscreen: r.width > 0 && r.bottom > 0 && r.top < innerHeight }; })()`)); }
const noRing = rings.filter(r => !r.ring).map(r => r.n);
ok("24 Tab stops in a row on Summary: every one shows a focus ring", noRing.length === 0 && rings.every(r => r.n !== "BODY."), noRing.join(", "));
const clickOnly = [];
for (const r of ["home", "nutrition", "workouts", "settings/profile", "settings/privacy", "recipes", "premium"]) { await ev(`location.hash = "#/${r}"; true`); await sleep(350);
  clickOnly.push(...(await ev(`[...document.querySelectorAll("[data-act]")].filter(e => !/^(BUTTON|A|INPUT|SELECT|SUMMARY|TEXTAREA|LABEL)$/.test(e.tagName) && !e.hasAttribute("tabindex") && !e.closest("button, a") && !e.classList.contains("scrim") && !e.classList.contains("brandline")).map(e => "${r}: " + e.tagName + "." + e.className + "[" + e.dataset.act + "]")`))); }
ok("no control that only works with a mouse (every data-act is a button, link or field)", clickOnly.length === 0, clickOnly.slice(0, 4).join(", "));
const struct = [];
for (const r of ROUTES) { await ev(`location.hash = "#/${r}"; true`); await sleep(300); const o = await ev(`({ h1: document.querySelectorAll("h1").length, main: document.querySelectorAll("main").length, title: document.title, lang: document.documentElement.lang })`);
  if (o.h1 !== 1) struct.push(r + ": " + o.h1 + " h1"); if (o.main !== 1) struct.push(r + ": " + o.main + " main"); if (!o.title || o.title === "Whole Life Hub") struct.push(r + ": title"); if (o.lang !== "en") struct.push(r + ": lang"); }
ok("every screen has one h1, one main landmark, its own title and a language", struct.length === 0, struct.slice(0, 4).join(", "));
await view(320, 800);
const wide = [];
for (const r of ROUTES) { await ev(`location.hash = "#/${r}"; true`); await sleep(300); const sw = await ev(`document.documentElement.scrollWidth > innerWidth ? document.documentElement.scrollWidth : 0`); if (sw) wide.push(r + " " + sw); }
ok("at 320px wide nothing scrolls sideways (reflow)", wide.length === 0, wide.slice(0, 4).join(", "));
await view(1440);
await ev(`location.hash = "#/home"; true`); await sleep(300); await ev(`openPalette(); true`); await sleep(300);
const pal = await ev(`(() => { const i = document.getElementById("palette-input"); return { role: i.getAttribute("role"), exp: i.getAttribute("aria-expanded"), ctl: i.getAttribute("aria-controls"), ad: i.getAttribute("aria-activedescendant"), opt: !!document.getElementById(i.getAttribute("aria-activedescendant")) }; })()`);
ok("the quick-jump box is a labelled combobox that names the highlighted option", pal.role === "combobox" && pal.exp === "true" && pal.ctl === "palette-list" && pal.opt, JSON.stringify(pal));
await key("ArrowDown", "ArrowDown", 40);
ok("ArrowDown moves the named option along", await ev(`document.getElementById("palette-input").getAttribute("aria-activedescendant") === "pal-opt-1" && document.getElementById("pal-opt-1").getAttribute("aria-selected") === "true"`));
await key("Escape", "Escape", 27); await sleep(300);

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
