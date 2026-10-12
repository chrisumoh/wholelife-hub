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
}).listen(8778, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9341", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-cards-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9341/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8778/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
// A profile with data for every widget, every widget pinned (premium on so the premium cards show), and a culture so Meals has picks.
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, weightKg: 70, heightCm: 170, age: 30, sex: "female", culture: "Ghana", goal: "lose" });
  p.premium = { active: true, since: today(), source: "test", expires: null };
  S.profiles = [p]; S.activeId = p.id;
  for (let d = 0; d < 10; d++) { const date = addDays(today(), -d); addEntry("meals", { id: uid(), date, slot: "lunch", name: "Jollof rice", cal: 500 + d * 30, dish: "jollof", extras: [], est: false }); addEntry("workouts", { id: uid(), date, type: "run", minutes: 20 + d * 3, cal: 200 }); addEntry("snacks", { id: uid(), date, name: "Plantain chips", qty: 1, cal: 150 }); addEntry("weights", { id: uid(), date, kg: 70 - d * 0.1 }); }
  setVital(today(), "steps", 8450); setVital(today(), "rhr", 62); setVital(addDays(today(), -1), "steps", 6100);
  p.widgets = [...Object.keys(EXTRA_WIDGETS), ...Object.keys(METRICS)].map(k => ({ k, size: "s" })); p.widgets[0].size = "l"; p.widgets[1].size = "m";
  saveProfile(); await flush(); return true; })()`);

// In-page audit of every dashboard card on the current screen. Returns a list of problems.
const AUDIT = `((want) => { const out = [], lum = c => { const [r, g, b] = c.match(/[\\d.]+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const cards = [...document.querySelectorAll(".app .dcard")];
  if (cards.length < want.min) out.push("only " + cards.length + " dashboard cards");
  const bg = getComputedStyle(document.body).backgroundColor; if (bg !== want.ground) out.push("page background " + bg + " not " + want.ground);
  for (const el of cards) { const sz = el.classList.contains("ws-s") ? "s" : el.classList.contains("ws-l") ? "l" : "m"; const name = (el.querySelector(".mhead b")?.textContent || "?"), tag = "[" + name + "] ", c = getComputedStyle(el), r = el.getBoundingClientRect();
    if (c.backgroundColor !== want.card) out.push(tag + "surface " + c.backgroundColor + " not " + want.card);
    if (c.borderTopWidth !== "0px" || c.borderLeftWidth !== "0px") out.push(tag + "has a border");
    if (c.boxShadow !== "none") out.push(tag + "has a shadow");
    if (c.backdropFilter !== "none") out.push(tag + "is blurred");
    if (c.backgroundImage !== "none") out.push(tag + "has a gradient or image");
    if (c.borderRadius !== "20px") out.push(tag + "radius " + c.borderRadius);
    if (c.paddingTop !== "16px" || c.paddingLeft !== "16px" || c.paddingRight !== "16px" || c.paddingBottom !== "16px") out.push(tag + "padding " + c.padding);
    for (const ps of ["::before", "::after"]) if (getComputedStyle(el, ps).display !== "none") out.push(tag + ps + " layer");
    if (!want.editing && !(el.tagName === "A" && el.getAttribute("href")) && !(el.tagName === "DIV" && sz === "l" && el.querySelector(":scope > a.cover[href]"))) out.push(tag + "is not one link");
    if (el.querySelector("button, input, select, textarea, .btn, .chip, .tag, .mcard, .card, .dcard") && !want.editing) out.push(tag + "has a control or an inner card");
    const head = el.querySelector(":scope > .mhead"), ic = head?.querySelector("svg"), b = head?.querySelector("b"), when = head?.querySelector(".when");
    if (!head || !ic || !b || (sz !== "s" && !when) || (sz === "s" && when)) { out.push(tag + "no header row"); continue; }
    if (Math.round(ic.getBoundingClientRect().width) !== 18) out.push(tag + "icon " + ic.getBoundingClientRect().width + "px");
    const bs = getComputedStyle(b); if (bs.fontSize !== (sz === "s" ? "15px" : "17px") || bs.fontWeight !== "600") out.push(tag + "name " + bs.fontSize + " " + bs.fontWeight);
    if (ratio(bs.color, c.backgroundColor) < 4.5) out.push(tag + "name contrast " + ratio(bs.color, c.backgroundColor).toFixed(2));
    if (when) { const ws_ = getComputedStyle(when); if (ws_.fontSize !== "15px") out.push(tag + "when " + ws_.fontSize);
      if (ratio(ws_.color, c.backgroundColor) < 4.5) out.push(tag + "gray contrast " + ratio(ws_.color, c.backgroundColor).toFixed(2));
      if (!want.editing && !when.querySelector(".chev svg")) out.push(tag + "no chevron"); }
    const val = el.querySelector(".mval"); if (!val) { out.push(tag + "no value"); continue; }
    const vs = getComputedStyle(val), nodata = val.classList.contains("nodata");
    if (nodata) { if (val.textContent.trim() !== "No Data") out.push(tag + "empty state says " + val.textContent); }
    else { if (vs.fontSize !== (sz === "s" ? "28px" : "34px") || vs.fontWeight !== "700") out.push(tag + "value " + vs.fontSize + " " + vs.fontWeight); if (!/tabular-nums/.test(vs.fontVariantNumeric)) out.push(tag + "numerals not tabular"); }
    const sm = val.querySelector("small"); if (sm && getComputedStyle(sm).fontSize !== (sz === "s" ? "14px" : "17px")) out.push(tag + "unit " + getComputedStyle(sm).fontSize);
    const sub = el.querySelector(".msub"); if (sub && getComputedStyle(sub).fontSize !== "15px") out.push(tag + "sub-line " + getComputedStyle(sub).fontSize);
    if (nodata && el.querySelector(".spark")) out.push(tag + "chart on an empty card");
    const gap = val.getBoundingClientRect().top - head.getBoundingClientRect().bottom; if (gap < (sz === "s" ? 11.5 : 47.5)) out.push(tag + "only " + Math.round(gap) + "px under the header");
    const mm = el.querySelector(".mmain").getBoundingClientRect(); if (Math.abs(mm.left - (r.left + 16)) > 1) out.push(tag + "value not at the left");
    if (r.bottom - Math.max(mm.bottom, ...[...el.querySelectorAll(".mbody > *")].map(x => x.getBoundingClientRect().bottom)) > 17 && !want.editing && sz !== "l") out.push(tag + "value not at the bottom");
    const sp = el.querySelector(".spark"); if (sp) { const sr = sp.getBoundingClientRect(); if (sr.width > 120.5 || sr.height > 64.5) out.push(tag + "chart " + Math.round(sr.width) + "x" + Math.round(sr.height)); if (Math.abs(sr.right - (r.right - 16)) > 1) out.push(tag + "chart not bottom right");
      const rects = [...sp.querySelectorAll("rect")], last = rects[rects.length - 1], fill = e => e.getAttribute("fill");
      if (!(fill(last) !== "var(--chart-gray)" && rects.slice(0, -1).every(x => fill(x) === "var(--chart-gray)"))) out.push(tag + "chart bars: gray bars, latest in the category colour"); }
    if (r.width < 100) out.push(tag + "card is only " + Math.round(r.width) + "px wide");
  }
  for (const g of document.querySelectorAll(".app .mgrid")) { const s = getComputedStyle(g); if (s.columnGap !== "12px" || s.rowGap !== "12px") out.push("grid gap " + s.rowGap + " " + s.columnGap); }
  const under = [...document.querySelectorAll(".app a")].filter(a => !a.closest(".legal") && getComputedStyle(a).textDecorationLine !== "none"); if (under.length) out.push(under.length + " underlined links, e.g. " + under[0].textContent.trim().slice(0, 30));
  if (document.documentElement.scrollWidth > innerWidth) out.push("horizontal scroll");
  return out; })`;

const SCHEMES = { light: ["rgb(242, 242, 247)", "rgb(255, 255, 255)"], dark: ["rgb(0, 0, 0)", "rgb(28, 28, 30)"], oled: ["rgb(0, 0, 0)", "rgb(16, 16, 18)"] };
const set = (mode, theme) => ev(`(async () => { const p = P(); p.look = { ...(p.look || {}), mode: ${JSON.stringify(mode)}, theme: ${JSON.stringify(theme)} }; saveProfile(); applyLook(p); render(); return true; })()`);
const markDrawn = () => ev(`document.querySelectorAll(".spark, .chart-svg").forEach(e => e.classList.add("drawn")); true`);
const goto = async h => { await ev(`location.hash = ${JSON.stringify(h)}; true`); await sleep(450); await markDrawn(); };
const expectFor = (mode, theme) => { const eff = theme === "midnight" ? (mode === "oled" ? "oled" : "dark") : mode; return { ground: SCHEMES[eff][0], card: SCHEMES[eff][1] }; };

console.log("--- 1. pattern, every width, scheme and theme");
const PAGES = [["#/home", 12], ["#/nutrition", 2], ["#/health", 10]];
for (const w of [375, 820, 1440]) {
  await view(w);
  for (const mode of ["light", "dark", "oled"]) for (const theme of ["forest", "ocean", "sunset", "midnight"]) {
    await set(mode, theme);
    for (const [h, min] of PAGES) {
      await goto(h);
      const probs = await ev(`${AUDIT}(${JSON.stringify({ ...expectFor(mode, theme), min })})`);
      ok(`${w}px ${mode} ${theme} ${h}`, probs.length === 0, probs.slice(0, 4).join(" | "));
    }
  }
}

console.log("--- 2. content of the cards");
await view(1440); await set("dark", "forest"); await goto("#/home");
const names = await ev(`[...document.querySelectorAll(".app .wgrid .dcard .mhead b, .app .mgrid .dcard .mhead b")].map(b => b.textContent)`);
for (const want of ["Meals", "Calories eaten", "Weight estimate", "Workouts", "Steps", "Sleep", "Resting heart rate", "Coach", "Micronutrients", "Recovery", "Pantry"]) ok(`Summary has the ${want} card`, names.includes(want), names.join(","));
ok("every METRIC is pinned and shows", await ev(`Object.values(METRICS).every(m => [...document.querySelectorAll(".dcard .mhead b")].some(b => b.textContent === m.n))`));
const meals = await ev(`(() => { const c = [...document.querySelectorAll(".dcard")].find(x => x.querySelector(".mhead b").textContent === "Meals"); return { href: c.getAttribute("href"), sub: c.querySelector(".msub")?.textContent, bars: c.querySelectorAll(".spark rect").length, val: c.querySelector(".mval .cnt")?.dataset.count || c.querySelector(".mval").textContent, inner: c.textContent, picks: dailyPicks(today(), P()).length, sum: dailyPicks(today(), P()).reduce((a, d) => a + d.cal, 0) }; })()`);
ok("Meals links to the detail page", meals.href === "#/nutrition", meals.href);
ok("Meals shows the planned calories", meals.val.replace(/[^\d]/g, "") === String(meals.sum), `${meals.val} vs ${meals.sum}`);
ok("Meals sub-line reads 'N planned · N logged'", /^\d+ planned · \d+ logged$/.test(meals.sub || ""), meals.sub);
ok("Meals chart has one bar per meal", meals.bars === meals.picks, `${meals.bars} vs ${meals.picks}`);
ok("no meal list, plan button or culture prompt inside the Meals card", !/Breakfast|Lunch|Dinner|Build a plan|Meal plan|food culture/i.test(meals.inner), meals.inner);
ok("Summary has no dish tiles", await ev(`document.querySelectorAll(".app .dish").length === 0`));
ok("Coach card keeps the coaching line", await ev(`[...document.querySelectorAll(".dcard")].find(x => x.querySelector(".mhead b").textContent === "Coach").querySelector(".msub").textContent === motivation(P())`));
await goto("#/nutrition");
ok("the Meals detail page has the Breakfast, Lunch and Dinner list", await ev(`(() => { const s = document.getElementById("meals-today"); return !!s && ["Breakfast", "Lunch", "Dinner"].every(x => s.textContent.includes(x)) && /Build a plan|See full plan/.test(s.textContent); })()`));
await ev(`(() => { P().culture = ""; saveProfile(); render(); return true; })()`); await sleep(300);
ok("the 'No food culture set' prompt is on the detail page, not in a card", await ev(`document.getElementById("meals-today").textContent.includes("No food culture set") && ![...document.querySelectorAll(".dcard")].some(c => c.textContent.includes("No food culture set"))`));
await goto("#/home");
ok("and not on the Summary cards either", await ev(`![...document.querySelectorAll(".dcard")].some(c => c.textContent.includes("food culture"))`));
await ev(`(() => { P().culture = "Ghana"; saveProfile(); render(); return true; })()`);

console.log("--- 3. empty state");
await ev(`(async () => { const p = S.profiles[0]; S.logs[p.id] = {}; markAll(); render(); return true; })()`); await sleep(400); await markDrawn();
const empty = await ev(`${AUDIT}(${JSON.stringify({ ...expectFor("dark", "forest"), min: 10 })})`);
ok("with no data every card says No Data in the value position and the pattern still holds", empty.length === 0, empty.slice(0, 4).join(" | "));
ok("empty cards have no buttons or chips", await ev(`document.querySelectorAll(".dcard .nodata").length > 5 && [...document.querySelectorAll(".dcard")].every(c => !c.querySelector("button, .chip, .btn"))`));

console.log("--- 4. one tap target, and Edit widgets still works");
await view(390); await set("light", "forest"); await ev(`(async () => { const p = P(); for (let d = 0; d < 3; d++) addEntry("workouts", { id: uid(), date: addDays(today(), -d), type: "run", minutes: 30, cal: 250 }); markAll(); render(); return true; })()`); await goto("#/home");
await ev(`[...document.querySelectorAll(".dcard")].find(c => c.querySelector(".mhead b").textContent === "Workouts").scrollIntoView({ block: "center" }); true`); await sleep(200);
const pt = await ev(`(() => { const c = [...document.querySelectorAll(".dcard")].find(c => c.querySelector(".mhead b").textContent === "Workouts"), r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.8 }; })()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
ok("tapping anywhere on a card opens that metric's page", await waitFor(`location.hash === "#/workouts"`), await ev(`location.hash`));
await goto("#/home");
const edit = await ev(`(() => { const b = document.querySelector('[data-act="wl-edit"]'), c = getComputedStyle(b); return { text: b.textContent, bg: c.backgroundColor, border: c.borderTopWidth, shadow: c.boxShadow, color: c.color, accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), h2: getComputedStyle(document.querySelector(".sec-title")).fontSize + " " + getComputedStyle(document.querySelector(".sec-title")).fontWeight, h: b.getBoundingClientRect().height }; })()`);
ok("'Edit widgets' is plain accent text with no background", edit.text === "Edit widgets" && /rgba\(0, 0, 0, 0\)|transparent/.test(edit.bg) && edit.border === "0px" && edit.shadow === "none" && edit.h >= 43.9, JSON.stringify(edit));
ok("section titles are 22px bold", edit.h2 === "22px 700", edit.h2);
await ev(`document.querySelector('[data-act="wl-edit"]').click(); true`); await sleep(400);
const ed = await ev(`({ done: document.querySelector('[data-act="wl-edit"]').textContent, n: document.querySelectorAll(".dcard.editing").length, minus: document.querySelectorAll(".dcard.editing .mhead .wminus").length, seg: document.querySelectorAll(".dcard.editing .mhead .wseg").length, old: document.querySelectorAll(".wtools, .wx, .addtray, [data-act='w-size'], [data-act='pw-size']").length })`);
ok("Edit mode puts a minus and an S/M/L switch in every card's top row, and no old controls", ed.done === "Done" && ed.n >= 5 && ed.minus === ed.n && ed.seg === ed.n && ed.old === 0, JSON.stringify(ed));
const before = await ev(`P().widgets.length`);
await ev(`document.querySelector('.dcard.editing [data-act="wl-size"][data-v="m"]').click(); true`); await sleep(200);
ok("resizing a card works", await ev(`P().widgets.some(w => w.size === "m") && document.querySelector(".dcard.editing").classList.contains("ws-m")`));
await ev(`document.querySelector('.dcard.editing .wminus').click(); true`); await sleep(300);
ok("hiding a card works", (await ev(`P().widgets.length`)) === before - 1, String(await ev(`P().widgets.length`)));
await ev(`document.querySelector('[data-act="wl-edit"]').click(); true`); await sleep(300);
ok("Done returns to normal cards", await ev(`document.querySelectorAll(".dcard.editing").length === 0 && document.querySelectorAll("a.dcard").length > 3`));

await goto("#/health");
const pgEdit = await ev(`(() => { const b = document.querySelector('[data-act="wl-edit"]'); if (!b) return "none"; const c = getComputedStyle(b); return JSON.stringify({ t: b.textContent, bg: c.backgroundColor, bw: c.borderTopWidth, sh: c.boxShadow }); })()`);
ok("page widgets: 'Edit widgets' is plain accent text too", /"t":"Edit widgets","bg":"rgba\(0, 0, 0, 0\)","bw":"0px","sh":"none"/.test(pgEdit), pgEdit);
console.log("--- 5. legal text keeps its underlines, nothing else does");
await goto("#/privacy-policy");
ok("links in the legal text are still underlined", await ev(`[...document.querySelectorAll(".legal a")].some(a => getComputedStyle(a).textDecorationLine === "underline")`) || await ev(`document.querySelectorAll(".legal a").length === 0`));
ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
