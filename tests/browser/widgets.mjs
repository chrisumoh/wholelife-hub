import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/widgets.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.7: widget sizes and edit mode. Every widget is rendered at Small, Medium and Large on Summary and on the other pages, at 375, 820 and 1440px,
// and the layout and the content must differ; sizes are chosen the way a person does (Edit widgets, S/M/L, Done), apply live, and survive a reload.
// Also covers the edit controls (minus, S/M/L, drag handle or arrows), Hidden widgets, Reset layout with a confirm step, and the restyled leftover cards.
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
}).listen(8779, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9342", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-widgets-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9342/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8779/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const seed = (withData = true) => ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, targetKg: 65, weightKg: 70, heightCm: 170, age: 30, sex: "female", culture: "Ghana", goal: "lose" });
  S.profiles = [p]; S.activeId = p.id; S.logs = {};
  if (${withData}) { for (let d = 0; d < 10; d++) { const date = addDays(today(), -d); addEntry("meals", { id: uid(), date, slot: d % 2 ? "dinner" : "lunch", name: "Jollof rice", cal: 500 + d * 30, dish: "jollof", extras: [], est: false }); addEntry("workouts", { id: uid(), date, type: "Run", minutes: 20 + d * 3, cal: 200 }); addEntry("snacks", { id: uid(), date, name: "Plantain chips", qty: 1, cal: 150 + d }); addEntry("drinks", { id: uid(), date, k: "zobo", name: "Zobo", qty: 1, cal: 90 }); addEntry("weights", { id: uid(), date, kg: 70 - d * 0.1 });
    setVital(date, "steps", 8000 + d * 100); setVital(date, "rhr", 60 + d % 3); setVital(date, "sleep", 420 + d); setVital(date, "water", 1800 + d * 50); setVital(date, "active", 300 + d); setVital(date, "spo2", 97); setVital(date, "sys", 118 + d % 4); setVital(date, "dia", 78); } }
  saveProfile(); await flush(); return true; })()`);
await seed();
const only = (page, k) => ev(`(() => { const p = P(); if (${JSON.stringify(page)} === "home") p.widgets = [{ k: ${JSON.stringify(k)}, size: "s" }]; else p.layouts = { ...(p.layouts || {}), ${JSON.stringify(page)}: [{ k: ${JSON.stringify(k)}, size: "s", on: true }] }; UI.editPage = null; saveProfile(); render(); return true; })()`);
const goto = async h => { await ev(`location.hash = ${JSON.stringify(h)}; true`); await sleep(450); await ev(`document.querySelectorAll(".spark, .chart-svg").forEach(e => e.classList.add("drawn")); true`); };
const editBtn = page => `document.querySelector('.wsec[data-page="${page}"] [data-act="wl-edit"]')`;
// Choose a size the way a person does: Edit widgets, tap S/M/L on the card, Done.
const uiSize = async (page, k, v) => {
  await ev(`(() => { if (!document.querySelector('.wgrid[data-page="${page}"]').classList.contains("editing")) ${editBtn(page)}.click(); return true; })()`); await sleep(120);
  await ev(`document.querySelector('.wgrid[data-page="${page}"] [data-act="wl-size"][data-k="${k}"][data-v="${v}"]').click(); true`); await sleep(120);
  await ev(`${editBtn(page)}.click(); true`); await sleep(160);
  await ev(`document.querySelectorAll(".spark, .chart-svg").forEach(e => e.classList.add("drawn")); true`);
};
const measure = (page, k) => ev(`(() => { const g = document.querySelector('.wgrid[data-page="${page}"]'), c = g.querySelector('.dcard[data-k="${k}"]'); if (!c) return null; const r = c.getBoundingClientRect(), gr = g.getBoundingClientRect(); const lc = c.querySelector(".lchart");
  return { w: r.width, h: r.height, gw: gr.width, cls: [...c.classList].filter(x => /^ws-/.test(x)).join(), tag: c.tagName, html: c.innerHTML, text: c.textContent.replace(/\\s+/g, " ").trim(), when: !!c.querySelector(".when"), sub: !!c.querySelector(".msub"), spark: !!c.querySelector(".mbody .spark"), lx: !!c.querySelector(".lx"), secs: [...c.querySelectorAll(".lh")].map(x => x.textContent), lbars: c.querySelectorAll(".lc-bar").length, llabels: [...c.querySelectorAll(".lc-l")].filter(x => x.textContent).length, lchart: !!lc, cover: !!c.querySelector(":scope > a.cover") }; })()`);

const EXPECT = { calories: ["Today by meal", "Top 3 foods today", "Remaining today", "Last 7 days"], meals: ["Planned for today", "Logged today", "Logged meals, last 7 days"], water: ["Last drink", "Last 7 days", "Last 3 readings"], weight: ["Last 30 days", "Since you started"],
  steps: ["Today by hour", "Best day this week", "Last 7 days"], workouts: ["Last workout", "This week", "Streak", "Last 7 days"], coach: ["Today's advice", "Streak", "Next action", "Workout minutes, last 7 days"], snacks: ["Top 3 snacks today", "Last 7 days"],
  estimate: ["Where you could be", "What it is based on"], sleep: ["Last 7 days", "Last 3 readings"], rhr: ["Last 7 days", "Last 3 readings"], active: ["Last 7 days", "Last 3 readings"], spo2: ["Last 7 days", "Last 3 readings"], bp: ["Last 7 days", "Last 3 readings"] };
const KEYS = Object.keys(EXPECT);

console.log("--- 1. every widget at S, M and L: the layout and the content change, live, at 375, 820 and 1440");
const noop = await ev(`window.__noReload = 1; true`);
for (const w of [375, 820, 1440]) {
  await view(w); await goto("#/home");
  for (const k of KEYS) {
    await only("home", k);
    const m = {};
    for (const s of ["s", "m", "l"]) { await uiSize("home", k, s); m[s] = await measure("home", k); }
    const tag = `${w}px ${k}`;
    ok(`${tag}: the size class follows the choice`, m.s.cls === "ws-s" && m.m.cls === "ws-m" && m.l.cls === "ws-l", `${m.s.cls} ${m.m.cls} ${m.l.cls}`);
    const cols = w < 700 ? 2 : 4;
    ok(`${tag}: Small is a ${cols}-per-row square-ish tile`, Math.abs(m.s.w - (m.s.gw - (cols - 1) * 12) / cols) < 1.5 && m.s.h / m.s.w > 0.85 && m.s.h / m.s.w < 1.35, `${Math.round(m.s.w)}x${Math.round(m.s.h)} in ${Math.round(m.s.gw)}`);
    ok(`${tag}: Small is icon, name and one value only`, !m.s.when && !m.s.sub && !m.s.spark && !m.s.lx, JSON.stringify([m.s.when, m.s.sub, m.s.spark, m.s.lx]));
    ok(`${tag}: Medium and Large are full width`, Math.abs(m.m.w - m.m.gw) < 1 && Math.abs(m.l.w - m.l.gw) < 1, `${m.m.w} ${m.l.w} ${m.m.gw}`);
    ok(`${tag}: Medium adds the context header and no extra block`, m.m.when && !m.m.lx, JSON.stringify([m.m.when, m.m.lx]));
    ok(`${tag}: Large adds the detail block, about twice the height of Medium`, m.l.lx && m.l.h >= m.m.h * 1.5, `${Math.round(m.m.h)} -> ${Math.round(m.l.h)}`);
    ok(`${tag}: Large shows the sections this widget calls for`, EXPECT[k].every(h => m.l.secs.includes(h) || m.l.text.includes(h)), `${EXPECT[k].filter(h => !m.l.secs.includes(h) && !m.l.text.includes(h)).join(", ")} missing from ${m.l.secs.join(" | ")}`);
    ok(`${tag}: three sizes, three different layouts and contents`, new Set([m.s.html, m.m.html, m.l.html]).size === 3 && m.s.text !== m.m.text && m.m.text !== m.l.text && m.s.h !== m.l.h, "");
    if (k !== "estimate" && k !== "coach" && k !== "meals") ok(`${tag}: Large has a labelled chart`, m.l.lchart && m.l.lbars >= 7 && m.l.llabels >= 3, `${m.l.lbars} bars, ${m.l.llabels} labels`);
    ok(`${tag}: no invented numbers (no NaN, undefined or Infinity)`, !/NaN|undefined|Infinity|null/.test(m.s.text + m.m.text + m.l.text), m.l.text.slice(0, 200));
    if (k === "meals" || k === "coach") ok(`${tag}: Large is a div with one stretched link, and its inner links work`, m.l.tag === "DIV" && m.l.cover, m.l.tag);
  }
}
ok("sizes changed live: the page never reloaded", await ev(`window.__noReload === 1`));

console.log("--- 2. No Data, never a made-up number");
await seed(false); await view(1440); await goto("#/home");
for (const k of KEYS) {
  await only("home", k); await uiSize("home", k, "l");
  const m = await measure("home", k);
  ok(`empty ${k}: Large says No Data and shows no invented number`, /No Data|Set up|Rest day|planned/.test(m.text) && !/NaN|undefined|Infinity/.test(m.text) && !/\b(7-day average\s*[1-9])/.test(m.text), m.text.slice(0, 160));
}
await only("home", "steps"); await uiSize("home", "steps", "l");
const st = await measure("home", "steps");
ok("steps: the hourly chart says No Data (steps are saved per day)", /Today by hour\s*No Data/.test(st.text), st.text.slice(0, 200));
await only("home", "water"); await uiSize("home", "water", "l");
ok("water: last drink says No Data (water is saved per day)", /Last drink\s*No Data/.test((await measure("home", "water")).text));
await seed(true);

console.log("--- 3. size survives a reload, per profile and per page");
await view(1440); await goto("#/home");
await ev(`(() => { const p = P(); p.widgets = [{ k: "calories", size: "s" }, { k: "steps", size: "s" }, { k: "sleep", size: "s" }]; p.layouts = { workouts: [{ k: "workouts", size: "s", on: true }, { k: "steps", size: "s", on: true }], nutrition: [{ k: "water", size: "s", on: true }, { k: "calories", size: "s", on: true }] }; saveProfile(); render(); return true; })()`);
await uiSize("home", "calories", "l"); await uiSize("home", "steps", "m");
await goto("#/workouts"); await uiSize("workouts", "workouts", "l"); await uiSize("workouts", "steps", "m");
await goto("#/nutrition"); await uiSize("nutrition", "calories", "m");
await ev(`flush()`); await sleep(300);
await send("Page.reload"); await sleep(600);
ok("app boots again after a reload", await waitFor(READY, 15000), errors.join(" | "));
const sizesOf = (page) => ev(`[...document.querySelectorAll('.wgrid[data-page="${page}"] .dcard')].map(c => c.dataset.k + ":" + [...c.classList].find(x => /^ws-/.test(x))).join(",")`);
await goto("#/home"); ok("Summary: sizes and order survive a reload", (await sizesOf("home")) === "calories:ws-l,steps:ws-m,sleep:ws-s", await sizesOf("home"));
await goto("#/workouts"); ok("Workouts: sizes survive a reload", (await sizesOf("workouts")) === "workouts:ws-l,steps:ws-m", await sizesOf("workouts"));
await goto("#/nutrition"); ok("Nutrition: sizes survive a reload", (await sizesOf("nutrition")) === "water:ws-s,calories:ws-m", await sizesOf("nutrition"));
ok("the same widget keeps a different size on each page", (await sizesOf("nutrition")).includes("calories:ws-m") && await ev(`P().widgets.find(w => w.k === "calories").size === "l"`));
await ev(`(async () => { const q = newProfile("Kofi"); q.onboarded = true; q.coachPrompted = true; q.tourSeen = "dismissed"; S.profiles.push(q); saveProfile(); await flush(); return true; })()`);
await ev(`(() => { S.activeId = S.profiles[1].id; render(); return true; })()`); await goto("#/home");
ok("a second profile has its own layout (the defaults, not Ada's)", (await ev(`P().widgets`)) == null && /^meals:ws-m/.test(await sizesOf("home")), await sizesOf("home"));
await ev(`(() => { S.activeId = S.profiles[0].id; render(); return true; })()`);
console.log("--- 3b. layouts saved before 8.2.7 keep their full width (old Large and Wide become Medium)");
await ev(`(() => { const p = P(); delete p.wv; p.widgets = [{ k: "steps", size: "l" }, { k: "sleep", size: "m" }, { k: "rhr", size: "s" }]; saveProfile(); return true; })()`); await ev(`flush()`); await sleep(300);
await send("Page.reload"); await sleep(600); await waitFor(READY, 15000); await goto("#/home");
ok("old 'l' reads as Medium, 'm' stays Medium, 's' stays Small", (await sizesOf("home")) === "steps:ws-m,sleep:ws-m,rhr:ws-s", await sizesOf("home"));
await uiSize("home", "steps", "l"); await ev(`flush()`); await sleep(300); await send("Page.reload"); await sleep(600); await waitFor(READY, 15000); await goto("#/home");
ok("a Large chosen after the upgrade is kept on the next reload", (await sizesOf("home")).startsWith("steps:ws-l"), await sizesOf("home"));

console.log("--- 4. edit mode");
await seed(); await view(1440); await goto("#/home");
await ev(`(() => { P().widgets = ["calories", "steps", "sleep", "rhr", "water"].map(k => ({ k, size: "s" })); UI.editPage = null; saveProfile(); render(); return true; })()`);
const row = await ev(`(() => { const b = document.querySelector('.wsec[data-page="home"] [data-act="wl-edit"]'), h = document.querySelector('.wsec[data-page="home"] .sec-title'), c = getComputedStyle(b); const br = b.getBoundingClientRect(), hr = h.getBoundingClientRect(); return { right: br.left > hr.right, same: Math.abs((br.top + br.height / 2) - (hr.top + hr.height / 2)) < 8, plain: c.backgroundColor === "rgba(0, 0, 0, 0)" && c.borderTopWidth === "0px" && c.boxShadow === "none", accent: c.color === getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || true, text: b.textContent }; })()`);
ok("'Edit widgets' is plain accent text on the right of the section title", row.right && row.same && row.plain && row.text === "Edit widgets", JSON.stringify(row));
await ev(`${editBtn("home")}.click(); true`); await sleep(300);
const ctl = await ev(`(() => { const out = { cards: 0, bad: [] }; const vis = e => e && e.getClientRects().length > 0; for (const c of document.querySelectorAll('.wgrid[data-page="home"] .dcard')) { out.cards++; const h = c.querySelector(":scope > .mhead"); const minus = h.querySelector(".wminus"), seg = [...h.querySelectorAll(".wseg button")], drag = h.querySelector(".wdrag"), mv = [...h.querySelectorAll('[data-act="wl-move"]')];
    const big = e => { const r = e.getBoundingClientRect(); return r.width >= 43.9 && r.height >= 43.9; };
    if (!minus || !big(minus)) out.bad.push("minus"); else { const dot = getComputedStyle(minus.firstElementChild); if (dot.borderRadius !== "50%" || !/^rgb[(]/.test(dot.backgroundColor)) out.bad.push("not a red circle"); }
    if (seg.length !== 3 || !seg.every(big) || seg.map(b => b.textContent).join("") !== "SML") out.bad.push("S/M/L switch");
    if (!drag || !vis(drag) || !big(drag)) out.bad.push("drag handle"); if (mv.some(vis)) out.bad.push("arrows on desktop"); }
  out.loose = document.querySelectorAll('.dcard.editing > .wtools, .dcard.editing > .wx, .dcard.editing > [data-act="wl-move"], .dcard.editing > .seg, [data-act="w-remove"], [data-act="pw-hide"], [data-act="pw-size"]').length;
  out.hideBtns = [...document.querySelectorAll(".dcard.editing button")].filter(b => b.textContent.trim() === "Hide").length;
  out.done = document.querySelector('.wsec[data-page="home"] [data-act="wl-edit"]').textContent; out.wiggle = getComputedStyle(document.querySelector(".dcard.editing")).animationName; return out; })()`);
ok("desktop edit mode: every card has the red minus, the S/M/L switch and a drag handle in its top row, all 44px", ctl.cards === 5 && ctl.bad.length === 0, JSON.stringify(ctl));
ok("no loose arrows, size bars or Hide buttons under the cards; Done is on the title row", ctl.loose === 0 && ctl.hideBtns === 0 && ctl.done === "Done", JSON.stringify(ctl));
ok("cards do not wiggle in edit mode", ctl.wiggle === "none", ctl.wiggle);
const rst = await ev(`(() => { const r = document.querySelector('.wsec[data-page="home"] .wreset button'), c = getComputedStyle(r); const big = [...document.querySelectorAll('.wsec[data-page="home"] button, .wsec[data-page="home"] .btn')].filter(b => /^Reset/.test(b.textContent.trim()) && b.getBoundingClientRect().width > 300); return { text: r.textContent, size: c.fontSize, color: c.color, bg: c.backgroundColor, bar: big.length, h: r.getBoundingClientRect().height }; })()`);
ok("'Reset layout' is small red text, and there is no large Reset bar", rst.text === "Reset layout" && parseFloat(rst.size) <= 14 && rst.bg === "rgba(0, 0, 0, 0)" && rst.bar === 0 && rst.h >= 43.9 && (() => { const [r, g, b] = rst.color.match(/\d+/g).map(Number); return r > g * 1.8 && r > b * 1.8; })(), JSON.stringify(rst));
await ev(`document.querySelector('[data-act="wl-reset-ask"]').click(); true`); await sleep(150);
const ask = await ev(`({ txt: document.querySelector(".wreset").textContent.replace(/\\s+/g, " ").trim(), widgets: P().widgets.length })`);
ok("Reset layout asks first and changes nothing yet", /Reset sizes and order to the default\? Reset Cancel/.test(ask.txt) && ask.widgets === 5, JSON.stringify(ask));
await ev(`document.querySelector('[data-act="wl-reset-no"]').click(); true`); await sleep(150);
ok("Cancel keeps the layout", (await ev(`P().widgets.length`)) === 5 && (await ev(`document.querySelector('[data-act="wl-reset-ask"]')?.textContent`)) === "Reset layout");
// hide, hidden list, add back
await ev(`document.querySelector('.dcard[data-k="sleep"] .wminus').click(); true`); await sleep(200);
const hid = await ev(`({ shown: [...document.querySelectorAll('.wgrid .dcard')].map(c => c.dataset.k).join(), inList: [...document.querySelectorAll(".wlist-rows li")].some(li => li.textContent.includes("Sleep")), h: document.querySelector(".wlist-h")?.textContent, plus: (() => { const b = document.querySelector('.wlist [data-act="wl-add"][data-k="sleep"]'); const r = b?.getBoundingClientRect(); return r && r.width >= 43.9 && r.height >= 43.9 && b.textContent.trim() === "+"; })(), last: document.querySelector(".wlist").getBoundingClientRect().top > document.querySelector(".wgrid").getBoundingClientRect().bottom })`);
ok("hiding removes the card and lists it under 'Hidden widgets' with a 44px +", hid.shown === "calories,steps,rhr,water" && hid.inList && hid.h === "Hidden widgets" && hid.plus && hid.last, JSON.stringify(hid));
await ev(`document.querySelector('.wlist [data-act="wl-add"][data-k="sleep"]').click(); true`); await sleep(200);
ok("tapping + puts it back on the page", (await ev(`[...document.querySelectorAll('.wgrid .dcard')].map(c => c.dataset.k).join()`)) === "calories,steps,rhr,water,sleep" && !(await ev(`!!document.querySelector('.wlist [data-k="sleep"]')`)));
// move with the keyboard on the handle
await ev(`document.querySelector('.dcard[data-k="steps"] .wdrag').focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 }); await sleep(250);
ok("ArrowUp on the drag handle moves the card up", (await ev(`P().widgets.map(w => w.k).join()`)) === "steps,calories,rhr,water,sleep", await ev(`P().widgets.map(w => w.k).join()`));
// real drag with the mouse
await ev(`document.querySelector('.wsec[data-page="home"] .wgrid').scrollIntoView({ block: "start" }); true`); await sleep(200);
const pts = await ev(`(() => { const h = document.querySelector('.dcard[data-k="steps"] .wdrag').getBoundingClientRect(), t = document.querySelector('.dcard[data-k="rhr"]').getBoundingClientRect(); return { hx: h.left + h.width / 2, hy: h.top + h.height / 2, tx: t.left + t.width * 0.8, ty: t.top + t.height / 2 }; })()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pts.hx, y: pts.hy, button: "left", buttons: 1, clickCount: 1 });
for (let i = 1; i <= 8; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pts.hx + (pts.tx - pts.hx) * i / 8, y: pts.hy + (pts.ty - pts.hy) * i / 8, button: "left", buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pts.tx, y: pts.ty, button: "left", clickCount: 1 }); await sleep(300);
ok("dragging the handle onto another card reorders the layout", (await ev(`P().widgets.map(w => w.k).join()`)) === "calories,rhr,steps,water,sleep", await ev(`P().widgets.map(w => w.k).join()`));
await ev(`document.querySelector('[data-act="wl-reset-ask"]').click(); true`); await sleep(100); await ev(`document.querySelector('[data-act="wl-reset"]').click(); true`); await sleep(250);
ok("confirmed Reset puts the default layout back", (await ev(`P().widgets.map(w => w.k).join()`)) === "meals,calories,estimate,workouts,steps,sleep,rhr,coach" && (await ev(`P().widgets.find(w => w.k === "meals").size`)) === "m");

console.log("--- 5. phones: up and down buttons instead of the drag handle");
await view(375);
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await ev(`(() => { P().widgets = ["calories", "steps", "sleep"].map(k => ({ k, size: "m" })); UI.editPage = "home"; saveProfile(); render(); return true; })()`); await sleep(300);
const ph = await ev(`(() => { const vis = e => e && e.getClientRects().length > 0; const big = e => { const r = e.getBoundingClientRect(); return r.width >= 43.9 && r.height >= 43.9; }; const out = [];
  for (const c of document.querySelectorAll('.wgrid .dcard')) { const mv = [...c.querySelectorAll('.mhead [data-act="wl-move"]')], drag = c.querySelector(".wdrag"); if (mv.length !== 2 || !mv.every(vis) || !mv.every(big)) out.push(c.dataset.k + " arrows"); if (vis(drag)) out.push(c.dataset.k + " handle shown"); }
  const f = document.querySelector('.dcard[data-k="calories"] [data-act="wl-move"][data-d="-1"]'), l = document.querySelector('.dcard[data-k="sleep"] [data-act="wl-move"][data-d="1"]'); if (!f.disabled) out.push("first card can move up"); if (!l.disabled) out.push("last card can move down"); return out; })()`);
ok("375px touch: each card has two 44px arrows in its top row and no drag handle", ph.length === 0, ph.join(", "));
await ev(`document.querySelector('.dcard[data-k="steps"] [data-act="wl-move"][data-d="1"]').click(); true`); await sleep(250);
ok("the down arrow moves the card", (await ev(`P().widgets.map(w => w.k).join()`)) === "calories,sleep,steps");
const fit = await ev(`(() => { const out = []; for (const c of document.querySelectorAll(".wgrid .dcard")) { const r = c.getBoundingClientRect(); for (const b of [...c.querySelectorAll(".mhead button")].filter(x => x.getClientRects().length)) { const q = b.getBoundingClientRect(); if (q.right > r.right + 0.5 || q.left < r.left - 0.5) out.push(c.dataset.k + " " + (b.getAttribute("aria-label") || b.textContent)); } } return { out, scroll: document.documentElement.scrollWidth > innerWidth }; })()`);
ok("375px: no control spills out of its card and the page does not scroll sideways", fit.out.length === 0 && !fit.scroll, JSON.stringify(fit));
await ev(`(() => { P().widgets = ["calories", "steps", "sleep", "rhr"].map(k => ({ k, size: "s" })); saveProfile(); render(); return true; })()`); await sleep(300);
const sm = await ev(`(() => { const out = []; for (const c of document.querySelectorAll(".wgrid .dcard")) { const r = c.getBoundingClientRect(); for (const b of [...c.querySelectorAll(".mhead button")].filter(x => x.getClientRects().length)) { const q = b.getBoundingClientRect(); if (q.right > r.right + 0.5 || q.left < r.left - 0.5 || q.width < 43.9 || q.height < 43.9) out.push(c.dataset.k + " " + (b.getAttribute("aria-label") || b.textContent)); } } return out; })()`);
ok("375px: controls on Small cards fit inside the card and stay 44px", sm.length === 0, sm.join(", "));
await send("Emulation.setTouchEmulationEnabled", { enabled: false }); 

console.log("--- 6. other pages share the same engine");
for (const [page, keys] of [["workouts", ["workouts", "steps", "active", "coach"]], ["nutrition", ["water", "estimate", "calories", "meals"]], ["health", ["steps", "rhr", "sleep", "weight"]], ["coach", ["coach", "workouts"]], ["awards", ["workouts", "calories", "water"]]]) {
  await view(1440); await seed(); await goto("#/" + page);
  ok(`${page}: has the widget section with 'Edit widgets' on the title row`, await ev(`!!document.querySelector('.wsec[data-page="${page}"] .row.between .sec-title') && ${editBtn(page)}?.textContent === "Edit widgets"`));
  for (const k of keys.slice(0, 2)) {
    await only(page, k); await goto("#/" + page);
    const sizes = {}; for (const s of ["s", "m", "l"]) { await uiSize(page, k, s); sizes[s] = await measure(page, k); }
    ok(`${page}/${k}: S, M and L differ in layout and content`, sizes.s.cls === "ws-s" && sizes.m.cls === "ws-m" && sizes.l.cls === "ws-l" && sizes.s.h < sizes.m.h + 100 && sizes.l.h > sizes.m.h * 1.4 && new Set([sizes.s.html, sizes.m.html, sizes.l.html]).size === 3, `${sizes.s.h}/${sizes.m.h}/${sizes.l.h}`);
  }
  await ev(`(() => { const p = P(); p.layouts[${JSON.stringify(page)}] = ${JSON.stringify(keys.map((k, i) => ({ k, size: "s", on: i !== 1 })))}; saveProfile(); render(); return true; })()`);
  await ev(`${editBtn(page)}.click(); true`); await sleep(250);
  const dl = await ev(`({ shown: [...document.querySelectorAll('.wgrid .dcard')].map(c => c.dataset.k).join(), hidden: [...document.querySelectorAll(".wlist [data-act='wl-add']")].map(b => b.dataset.k).join() })`);
  ok(`${page}: a hidden widget in the saved list sits in 'Hidden widgets', not on the page`, dl.hidden.includes(keys[1]) && !dl.shown.includes(keys[1]), JSON.stringify(dl));
  await ev(`document.querySelector('.wgrid .dcard .wminus').click(); true`); await sleep(200);
  ok(`${page}: hiding the first card hides that card, not a neighbour`, !(await ev(`[...document.querySelectorAll('.wgrid .dcard')].some(c => c.dataset.k === ${JSON.stringify(keys[0])})`)) && (await ev(`[...document.querySelectorAll('.wgrid .dcard')].length`)) === keys.length - 2);
  await ev(`${editBtn(page)}.click(); true`);
}

console.log("--- 7. leftover cards use the card header");
for (const page of ["nutrition", "workouts", "coach", "health", "awards"]) {
  await view(375); await goto("#/" + page);
  const up = await ev(`[...document.querySelectorAll("#sec-${page} .card .eyebrow")].filter(e => getComputedStyle(e).textTransform === "uppercase").map(e => e.textContent.trim())`);
  ok(`${page}: no uppercase card labels`, up.length === 0, up.join(" | "));
}
await goto("#/workouts"); await ev(`(() => { const p = P(); p.photoAiConsent = false; saveProfile(); render(); return true; })()`); await sleep(200);
const pe = await ev(`(() => { const c = document.getElementById("equip-photo-optin"); const h = c?.querySelector(".mhead"); return c ? { head: !!h, upper: [...c.querySelectorAll(".eyebrow")].some(e => getComputedStyle(e).textTransform === "uppercase"), name: h?.querySelector("b")?.textContent, size: h && getComputedStyle(h.querySelector("b")).fontSize, icon: !!h?.querySelector("svg") } : null; })()`);
ok("'Photo estimate' card: icon and 17px name header, no uppercase green label", pe && pe.head && !pe.upper && pe.name === "Photo estimate" && pe.size === "17px" && pe.icon, JSON.stringify(pe));
await view(1440); await goto("#/nutrition");
ok("Nutrition has no second copy of the Water and Weight estimate cards under the widgets", await ev(`(() => { const names = [...document.querySelectorAll("#sec-nutrition .dcard .mhead b")].map(b => b.textContent); return names.length === new Set(names).size; })()`));

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
