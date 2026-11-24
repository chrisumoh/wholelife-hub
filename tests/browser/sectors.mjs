import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/sectors.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Builds 8.6.8 to 8.6.12: the six-sector revamp (Daily nutrition, Workouts, WL Coach, Profile, Glass & motion, Premium trust and FAQ),
// and 8.6.14 to 8.6.15: the Nutrition and Personal coach layout (Log a meal beside Meals on today, the glance tiles and drinks panel,
// the coach hero, the check-in beside the read-out), in light, dark and OLED, on a desktop and a phone. Real data only: nothing here is sample data.
// SHOTS=<folder> also saves screenshots there, for looking at.
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
}).listen(8846, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9406", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-sectors-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9406/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
await view(1200);
await send("Page.navigate", { url: "http://127.0.0.1:8846/index.html?premium=0" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30, sex: "female", goal: "build", coachPersona: "enforcer", coachName: "Coach Henry",
  widgets: [{ k: "calories", size: "s" }, { k: "steps", size: "m" }, { k: "meals", size: "m" }, { k: "coach", size: "l" }] });
  S.profiles = [p]; S.activeId = p.id; S.logs = {};
  for (let d = 0; d < 6; d++) { const date = addDays(today(), -d); addEntry("meals", { id: uid(), date, slot: "lunch", name: "Jollof rice", cal: 500 + d * 30, dish: "jollof", extras: [], est: false }); setVital(date, "steps", 8000 + d * 100); }
  saveProfile(); await flush(); render(); return true; })()`);
await ev(`P().widgets.find(w => w.k === "coach").size = "l"; render(); true`);
await goto("#/home");

// ---- in-page helpers: colours are read through a canvas so any CSS colour syntax (color-mix included) comes back as sRGB ----
await ev(`window.__t = { px: c => { const x = document.createElement("canvas").getContext("2d"); x.fillStyle = "#000"; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); },
  lum: ([r, g, b]) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); },
  ratio(a, b) { const [x, y] = [this.lum(this.px(a)), this.lum(this.px(b))].sort((p, q) => q - p); return (x + .05) / (y + .05); },
  same(a, b) { return this.px(a).join() === this.px(b).join(); } }; true`);
let curMode = null;
const setMode = async mode => { await ev(`P().look = Object.assign(P().look || {}, { mode: ${JSON.stringify(mode)}, theme: "forest" }); applyLook(P()); render(); true`); await sleep(curMode === mode ? 250 : 1000); curMode = mode; }; // colours ease over about 0.5s, so wait for them to land before measuring
const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await sleep(250); };
const VK = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35 };
const key = async k => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, windowsVirtualKeyCode: VK[k], code: k }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, windowsVirtualKeyCode: VK[k], code: k }); await sleep(60); };


// opacity of any CSS colour (the canvas keeps the alpha), and the colour a translucent surface shows over a backdrop
await ev(`window.__t.alpha = c => { const x = document.createElement("canvas").getContext("2d"); x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return x.getImageData(0, 0, 1, 1).data[3] / 255; }; true`);
const GEOM = `window.__g = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }; true`;
await ev(GEOM);
const g = sel => ev(`window.__g(${JSON.stringify(sel)})`);
const contrast = (sel, bgSel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 0; const b = ${bgSel ? `document.querySelector(${JSON.stringify(bgSel)})` : "e"}; return window.__t.ratio(getComputedStyle(e).color, getComputedStyle(b).backgroundColor); })()`);

// colour of the text against the first ancestor that paints a solid background (a list row has none of its own)
const contrastUp = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 0; let b = e; while (b && window.__t.alpha(getComputedStyle(b).backgroundColor) < .95) b = b.parentElement; return window.__t.ratio(getComputedStyle(e).color, getComputedStyle(b || document.body).backgroundColor); })()`);
// the same, but translucent backgrounds (tinted chips, glass) are laid over whatever is behind them, as the screen does
const contrastStack = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 0; const fg = getComputedStyle(e).color, gi = getComputedStyle(e).backgroundImage; const stops = /gradient/.test(gi) ? gi.match(/rgba?\\([^)]+\\)/g) : null; if (stops) return Math.min(...stops.map(c => window.__t.ratio(fg, c))); const layers = []; let b = e; while (b) { const c = getComputedStyle(b).backgroundColor, a = window.__t.alpha(c); if (a > 0) layers.push([window.__t.px(c), a]); if (a >= .95) break; b = b.parentElement; } if (!b) layers.push([window.__t.px(getComputedStyle(document.body).backgroundColor), 1]); let base = layers.pop()[0]; for (const [rgb, a] of layers.reverse()) base = base.map((v, i) => Math.round(rgb[i] * a + v * (1 - a))); return window.__t.ratio(fg, "rgb(" + base.join(",") + ")"); })()`); // a gradient button is measured against each of its colour stops

console.log("--- 1. Daily nutrition (8.6.14): Log a meal beside Meals on today, with today's menu one tap away");
await view(1280, 900); await setMode("light"); await goto("#/nutrition"); await sleep(400);
// does an input's hint fit inside it? A text copy of the field, same size and font, holding the hint, must not scroll
const fits = id => ev(`(() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return false; const cs = getComputedStyle(el), c = el.cloneNode(); c.type = "text"; c.removeAttribute("id"); c.value = el.placeholder; c.style.cssText = "position:fixed;left:0;top:0;width:" + cs.width + ";padding:" + cs.padding + ";font:" + cs.font + ";border:" + cs.border + ";box-sizing:" + cs.boxSizing; document.body.appendChild(c); const r = c.scrollWidth <= c.clientWidth; c.remove(); return r; })()`);
const lm = await g(".nut-top .nut-log"), mo = await g(".nut-top .nut-meals");
ok("Log a meal and Meals on today sit side by side at the top of the page", lm && mo && lm.r <= mo.l + 1 && Math.abs(lm.t - mo.t) < 2, JSON.stringify({ lm, mo }));
const row = await ev(`(() => { const r = document.querySelector(".nut-meals .nm-row"); return r ? { slot: r.querySelector(".nm-slot")?.textContent, ds: r.querySelector(".nm-slot")?.dataset.slot, name: r.querySelector(".nm-line b")?.textContent, total: r.querySelector(".nm-total")?.textContent, extras: !!r.querySelector('[data-act="extras"]'), del: r.querySelector('[data-act="del-meal"]')?.getAttribute("aria-label"), pill: document.querySelector(".nut-meals .pill-goal").textContent } : null; })()`);
ok("a logged meal shows its slot, name and total, with Extras and a named delete, and the pill adds up the day", row && row.slot === "Lunch" && row.ds === "lunch" && row.name === "Jollof rice" && row.total === "500 cal" && row.extras && row.del === "Delete Jollof rice" && row.pill === "500 cal", JSON.stringify(row));
const mb = await ev(`(() => { const b = document.querySelector('.nut-meals [data-act="nm-menu"]'), m = document.getElementById("meals-today"); return { t: b?.textContent, exp: b?.getAttribute("aria-expanded"), ctl: b?.getAttribute("aria-controls"), hidden: !!m?.hidden, vis: m?.checkVisibility(), inCard: !!m?.closest(".nut-meals"), h: b?.getBoundingClientRect().height }; })()`);
ok("today's menu starts folded inside Meals on today, behind a 44px See today's menu button that says it is collapsed", mb.t === "See today's menu" && mb.exp === "false" && mb.ctl === "meals-today" && mb.hidden && !mb.vis && mb.inCard && mb.h >= 43.5, JSON.stringify(mb));
await ev(`document.querySelector('[data-act="nm-menu"]').focus(); true`); await click('[data-act="nm-menu"]');
const mo2 = await ev(`(() => { const b = document.querySelector('[data-act="nm-menu"]'), m = document.getElementById("meals-today"); return { t: b.textContent, exp: b.getAttribute("aria-expanded"), vis: m.checkVisibility(), focus: document.activeElement === b }; })()`);
ok("tapping it opens the menu; the button now says Hide today's menu, is marked expanded, and keeps the focus", mo2.t === "Hide today's menu" && mo2.exp === "true" && mo2.vis && mo2.focus, JSON.stringify(mo2));
const picks = await ev(`[...document.querySelectorAll("#meals-today .mt-row")].map(c => { const l = c.querySelector(".mt-log"); return { slot: c.dataset.slot, link: c.querySelector(".mt-name")?.getAttribute("href"), name: c.querySelector(".mt-name b")?.textContent, info: c.querySelector(".tiny")?.textContent, btn: l?.textContent.trim(), bh: l?.getBoundingClientRect().height, al: l?.getAttribute("aria-label") }; })`);
ok("the menu lists breakfast, lunch and dinner, each linking to its recipe with its calories and a named 44px + Log", picks.length === 3 && picks.map(c => c.slot).join() === "breakfast,lunch,dinner" && picks.every(c => /^#\/recipes\//.test(c.link) && c.name && /≈\d+ cal/.test(c.info) && c.btn === "+ Log" && c.bh >= 43.5 && c.al.startsWith("Log " + c.name)), JSON.stringify(picks));
ok("the dish name and its details still sit on separate lines (the Meals clean-up from 8.x)", await ev(`[...document.querySelectorAll("#meals-today .li .grow")].every(g => { const b = g.querySelector("b"), t = g.querySelector(".tiny"); return getComputedStyle(b).display === "block" && getComputedStyle(t).display === "block" && Math.abs(b.getBoundingClientRect().left - t.getBoundingClientRect().left) < 1 && t.getBoundingClientRect().top >= b.getBoundingClientRect().bottom - 1; })`));
const nMeals = await ev(`onDate("meals", today()).length`);
await click('#meals-today .mt-row[data-slot="dinner"] .mt-log'); await sleep(300);
const lg = await ev(`(() => { const ms = onDate("meals", today()), m = ms.find(x => x.slot === "dinner"), d = dailyPicks(today(), P())[2]; return { n: ms.length, ok: !!m && m.name === d.n && m.cal === Math.round(d.cal) && m.dish === (d.id || null) && m.date === today(), extras: /Anything added\\?/.test(document.querySelector(".nut-top")?.textContent || ""), pend: UI.pendingExtras === m?.id, menu: UI.nmMenu }; })()`);
ok("+ Log on the dinner pick logs that dish for today, one regular portion, asks about extras in its place, and folds the menu", lg.n === nMeals + 1 && lg.ok && lg.extras && lg.pend && lg.menu === false, JSON.stringify(lg));
await ev(`(() => { const m = onDate("meals", today()).find(x => x.slot === "dinner"); removeEntry("meals", m.id); UI.pendingExtras = null; render(); return true; })()`); await sleep(300);
ok("removing it again leaves the meals as they were, with Meals on today back beside the form", await ev(`onDate("meals", today()).length`) === nMeals && await ev(`!!document.querySelector(".nut-top .nut-meals")`));
await ev(`UI.navDate = addDays(today(), -9); render(); true`); await sleep(300);
const em = await ev(`(() => { const c = document.querySelector(".nut-meals"); return { h2: c.querySelector("h2").textContent, txt: c.querySelector(".nm-etext")?.textContent, btn: !!c.querySelector('.nm-empty [data-act="nm-menu"]'), pill: c.querySelector(".pill-goal").textContent, bowl: c.querySelector(".nm-bowl")?.getAttribute("aria-hidden") }; })()`);
ok("a day with nothing logged says so in one line that names the day, and still offers today's menu", /^Meals on /.test(em.h2) && !/today/.test(em.h2) && /^No meals logged on .+\. Log one, or pick from today's menu\.$/.test(em.txt) && em.btn && em.pill === "0 cal" && em.bowl === "true", JSON.stringify(em));
await ev(`UI.navDate = today(); render(); true`); await sleep(250);
const tag0 = await ev(`(() => ({ tag: document.getElementById("m-slot-tag")?.textContent, want: tr(SLOTS.find(s => s[0] === val("m-slot"))?.[1] || "x") }))()`);
ok("the tag beside Log a meal names the meal the form will log", tag0.tag === tag0.want, JSON.stringify(tag0));
await ev(`(() => { const s = document.getElementById("m-slot"); s.value = "breakfast"; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`); await sleep(150);
ok("choosing Breakfast changes the tag at once", await ev(`document.getElementById("m-slot-tag").textContent === "Breakfast" && UI.mSlot === "breakfast"`));
await ev(`render(); true`); await sleep(200);
ok("a redraw keeps Breakfast in both the Meal menu and the tag", await ev(`val("m-slot") === "breakfast" && document.getElementById("m-slot-tag").textContent === "Breakfast"`));
await ev(`(() => { document.getElementById("m-name").value = "Waakye"; document.getElementById("m-cal").value = "600"; return true; })()`); await click('[data-act="log-meal"]'); await sleep(300);
ok("Log meal logs it as breakfast, and the next meal goes back to the time-of-day guess", await ev(`(() => { const m = onDate("meals", today()).find(x => x.name === "Waakye"); const ok = !!m && m.slot === "breakfast" && m.cal === 600 && UI.mSlot == null; if (m) removeEntry("meals", m.id); UI.pendingExtras = null; render(); return ok; })()`));
await sleep(250);
const gs = await ev(`(() => { const b = document.querySelector(".nl-calbox .nl-guess"), i = document.getElementById("m-cal"), br = b.getBoundingClientRect(), ir = i.getBoundingClientRect(); return { beside: Math.abs(br.left - ir.right) < 1.5 && Math.abs(br.top - ir.top) < 1.5 && Math.abs(br.bottom - ir.bottom) < 1.5, h: br.height, label: document.querySelector('label[for="m-cal"]')?.textContent, al: b.getAttribute("aria-label"), t: b.textContent.trim(), type: b.type }; })()`);
ok("Guess is joined to the right end of the Calories box, the same height, 44px, named, and never covers what is typed", gs.beside && gs.h >= 43.5 && gs.label === "Calories" && gs.al === "Guess the calories" && gs.t === "Guess" && gs.type === "button", JSON.stringify(gs));
ok("the Calories hint fits in the box beside Guess", await fits("m-cal"));
await ev(`document.getElementById("m-name").value = "rice and stew with chicken"; true`); await click(".nl-guess"); await sleep(300);
ok("Guess with a meal typed opens the meal builder with what was typed", await ev(`!!UI.mealBuild && UI.mealBuild.text === "rice and stew with chicken" && UI.mealBuild.items.length > 0`), await ev(`JSON.stringify(UI.mealBuild || null).slice(0, 200)`));
await ev(`UI.mealBuild = null; render(); document.getElementById("m-name").value = ""; true`); await sleep(250);

console.log("--- 2. Daily nutrition (8.6.14): Today at a glance in four tiles, and Drinks · Alcohol opening a panel");
const gl = await g(".nut-glance"), top = await g(".nut-top");
ok("the glance card comes after the top row", gl && top && gl.t >= top.b - 1, JSON.stringify({ gl, top }));
const gt = await ev(`[...document.querySelectorAll(".nut-glance .gl-tile")].map(t => t.innerText.replace(/\\s+/g, " ").trim())`);
ok("four tiles: Meals, Snacks, the Total against the target, and Drinks · Alcohol", gt.length === 4 && gt[0] === "Meals 1" && gt[1] === "Snacks 0" && gt[2] === "Total 500 cal 1,500 left of 2,000" && gt[3] === "Drinks · Alcohol Nothing today", gt.join(" | "));
ok("the total's bar shows a quarter of the target and is hidden from screen readers, since the text says it", await ev(`(() => { const b = document.querySelector(".nut-glance .gl-bar"); return !!b && b.getAttribute("aria-hidden") === "true" && b.querySelector("i").style.width === "25%" && !b.classList.contains("over"); })()`));
await ev(`P().calorieGoal = 400; render(); true`); await sleep(250);
ok("over the target the tile says how far over, and the bar turns to its over colour", await ev(`/100 over 400/.test(document.querySelector(".nut-glance .gl-sub").textContent) && document.querySelector(".nut-glance .gl-bar").classList.contains("over")`));
await ev(`P().calorieGoal = null; render(); true`); await sleep(250);
ok("with no calorie target the Total tile shows only the total, with no bar", await ev(`!document.querySelector(".nut-glance .gl-bar") && !document.querySelector(".nut-glance .gl-sub") && /^Total\\s*500 cal$/.test(document.querySelectorAll(".nut-glance .gl-tile")[2].innerText.replace(/\\s+/g, " ").trim())`));
await ev(`P().calorieGoal = 2000; render(); true`); await sleep(250);
const dt0 = await ev(`(() => { const b = document.querySelector(".gl-drinks"); return { tag: b.tagName, exp: b.getAttribute("aria-expanded"), ctl: b.getAttribute("aria-controls"), panel: !!document.getElementById("drinks-panel"), h: b.getBoundingClientRect().height }; })()`);
ok("the drinks tile is a button, marked collapsed, with no panel on the page yet", dt0.tag === "BUTTON" && dt0.exp === "false" && dt0.ctl === null && !dt0.panel && dt0.h >= 43.5, JSON.stringify(dt0));
await ev(`document.querySelector(".gl-drinks").focus(); true`); await click(".gl-drinks");
const dt1 = await ev(`(() => { const b = document.querySelector(".gl-drinks"), p = document.getElementById("drinks-panel"); return { exp: b.getAttribute("aria-expanded"), ctl: b.getAttribute("aria-controls"), panel: !!p, lab: p && document.getElementById(p.getAttribute("aria-labelledby"))?.textContent, form: !!p?.querySelector("#dr-k") && !!p?.querySelector('[data-act="drink-log"]'), below: !!p && p.getBoundingClientRect().top >= document.querySelector(".nut-glance").getBoundingClientRect().bottom - 1, close: p?.querySelector('[data-act="drinks-tile"]')?.textContent }; })()`);
ok("tapping it opens the drinks panel under the glance card, named by its heading, with the whole drink form and a Close button", dt1.exp === "true" && dt1.ctl === "drinks-panel" && dt1.panel && dt1.lab === "Drinks · Alcohol" && dt1.form && dt1.below && dt1.close === "Close", JSON.stringify(dt1));
await ev(`document.getElementById("dr-qty").value = "1"; true`); await click('#drinks-panel [data-act="drink-log"]'); await sleep(300);
const dl = await ev(`(() => { const d = drinksOn(today()); return { n: d.length, tile: document.querySelector(".gl-drinks .gl-dval").textContent.trim(), want: "1 drink · " + drinkKcalOn(today()).toLocaleString() + " cal", total: document.querySelectorAll(".nut-glance .gl-tile .num")[2].textContent, wantT: intakeOn(today()).toLocaleString() + " cal", more: intakeOn(today()) > 500 }; })()`);
ok("a drink logged from the panel shows on the tile, and counts in the day's total", dl.n === 1 && dl.tile === dl.want && dl.total === dl.wantT && dl.more, JSON.stringify(dl));
await click('#drinks-panel [data-act="drink-del"]'); await sleep(300);
ok("deleting it from the panel takes it off the tile again", await ev(`drinksOn(today()).length === 0 && document.querySelector(".gl-drinks .gl-dval").textContent.trim() === "Nothing today"`));
await click('#drinks-panel [data-act="drinks-tile"]');
ok("Close folds the panel away and puts the focus back on the drinks tile", await ev(`!document.getElementById("drinks-panel") && document.activeElement?.classList.contains("gl-drinks") && document.querySelector(".gl-drinks").getAttribute("aria-expanded") === "false"`));
const wr = await ev(`(() => { const r = [...document.querySelectorAll(".nut-weight .nw-row > *")].map(e => e.getBoundingClientRect()); return { n: r.length, oneRow: new Set(r.map(x => Math.round(x.bottom))).size === 1, save: document.querySelector('.nut-weight .nw-row [data-act="log-weight"]')?.textContent }; })()`);
ok("Log your weight puts the weight, the date and Save on one row", wr.n === 3 && wr.oneRow && wr.save === "Save", JSON.stringify(wr));
ok("the weight hint fits in its box", await fits("w-val"));
ok("Log your weight keeps its hint, the units it accepts and the recent weigh-ins", await ev(`(() => { const c = document.querySelector(".nut-weight"); return /however you like/.test(c.textContent) && /Accepts lb, kg or st/.test(c.textContent) && !!c.querySelector('[data-act="del-weight"]') === entries("weights").length > 0; })()`));
ok("the 300-odd dish suggestions are not part of the redrawn page; the meal box still points at them", await ev(`!document.querySelector("#sec-nutrition datalist, #app #dishlist") && document.getElementById("m-name").getAttribute("list") === "dishlist"`));
await send("Emulation.setFocusEmulationEnabled", { enabled: true }); // headless Chrome only sends focus events to a page that has focus
await ev(`document.getElementById("m-name").focus(); true`); await sleep(100);
ok("focusing What did you eat? builds them once, outside the page, with every dish and alternate name", await ev(`(() => { const d = document.getElementById("dishlist"); return !!d && d.parentElement === document.body && d.options.length === DISHES.length + dishAltOptions().length && document.getElementById("m-name").list === d; })()`));
await ev(`document.getElementById("m-name").blur(); render(); document.getElementById("m-name").focus(); document.getElementById("m-name").blur(); true`); await sleep(150);
ok("a redraw and a second focus keep exactly one list, unchanged", await ev(`document.querySelectorAll("#dishlist").length === 1 && document.getElementById("dishlist").options.length === DISHES.length + dishAltOptions().length && document.getElementById("m-name").list?.id === "dishlist"`));
await send("Emulation.setFocusEmulationEnabled", { enabled: false });
await ev(`(() => { const i = document.getElementById("w-val"); i.value = "70"; document.querySelector('[data-act="log-weight"]').click(); return true; })()`); await sleep(400);
ok("saving a weight from the one-row card still records it", await ev(`entries("weights").some(w => Math.round(w.kg) === 70 || Math.abs(w.kg - 31.75) < .5)`));
ok("the day arrows in the glance card still step back a day and forward again", await (async () => { await click('.nut-glance [data-act="day"][data-v="-1"]'); const a = await ev(`UI.navDate === addDays(today(), -1) && /at a glance/.test(document.querySelector(".nut-glance h2").textContent) && !/^Today/.test(document.querySelector(".nut-glance h2").textContent) && document.querySelector(".nut-glance .gl-date").textContent === fmtDay(addDays(today(), -1))`); await click('.nut-glance [data-act="day"][data-v="1"]'); return a && await ev(`UI.navDate === today() && document.querySelector('.nut-glance [data-act="day"][data-v="1"]').disabled`); })());

console.log("--- 3. Daily nutrition (8.6.14): Last 7 days beside Log your weight, a chart you can read");
const l7 = await g(".nut-lower .nut-week"), wt = await g(".nut-lower .nut-weight"), gl2 = await g(".nut-glance");
ok("Last 7 days and Log your weight sit side by side under the glance card", l7 && wt && l7.r <= wt.l + 1 && Math.abs(l7.t - wt.t) < 2 && l7.t >= gl2.b - 1, JSON.stringify({ l7, wt }));
ok("the Last 7 days card names the target and the bars say their day and calories on hover", await ev(`(() => { const c = document.querySelector(".nut-week"); const ts = [...c.querySelectorAll("rect > title")].map(t => t.textContent); return /Target 2,000 cal/.test(c.querySelector(".pill-goal")?.textContent || "") && ts.length === 6 && ts.every(t => /: [\\d,]+ cal/.test(t)); })()`));
const fsz = w => ev(`(() => { const s = document.querySelector(".chart-svg.narrow"), k = s.getBoundingClientRect().width / s.viewBox.baseVal.width; return Math.min(...[...s.querySelectorAll("text")].map(t => parseFloat(t.getAttribute("font-size")) * k)); })()`);
ok("the chart text is 9px or more on a desktop", await fsz() >= 9, await fsz());

console.log("--- 4. Daily nutrition: the Snap your plate opt-in is compact, with the privacy points one tap away");
await ev(`P().photoAiConsent = false; render(); true`); await sleep(300);
const po = await ev(`(() => { const c = document.getElementById("food-photo-optin"); if (!c) return null; const h = c.querySelector(".mhead"), d = c.querySelector("details.po-how"), s = d.querySelector("summary"); return { head: h?.querySelector("b")?.textContent, size: h && getComputedStyle(h.querySelector("b")).fontSize, h2: c.querySelector("h2")?.textContent, open: d.open, sh: s.getBoundingClientRect().height, btn: !!c.querySelector('[data-act="photoai-optin"]'), key: /Nothing is sent unless you use this/.test(c.textContent), hidden: [...d.querySelectorAll("li")].every(l => !l.checkVisibility()), height: c.getBoundingClientRect().height }; })()`);
ok("the card keeps its Photo estimate header, says Nothing is sent unless you use this, and the privacy details start closed", po && po.head === "Photo estimate" && po.size === "17px" && po.h2 === "Snap your plate" && po.key && po.btn && po.open === false && po.hidden, JSON.stringify(po));
ok("the 'How privacy works' summary is 44px tall and the card is shorter than 230px while closed", po.sh >= 43.5 && po.height < 230, JSON.stringify(po));
await click("#food-photo-optin details.po-how summary");
ok("opening it shows all three points: what is sent, that nothing is sent otherwise, and how to turn it off", await ev(`(() => { const d = document.querySelector("#food-photo-optin details.po-how"), li = [...d.querySelectorAll("li")]; return d.open && li.length === 3 && li.every(l => l.checkVisibility()) && /sent to Claude/.test(li[0].textContent) && /Typing the calories in by hand/.test(li[1].textContent) && /Settings > Privacy and security/.test(li[2].textContent); })()`));
await click('#food-photo-optin [data-act="photoai-optin"]'); await sleep(300);
ok("Allow still records the choice and swaps the card for the photo estimate", await ev(`P().photoAiConsent === true && !!document.getElementById("food-photo") && !document.getElementById("food-photo-optin")`));
await ev(`P().photoAiConsent = false; render(); true`); await sleep(200);

console.log("--- 5. Daily nutrition: light, dark, OLED and a phone");
await ev(`UI.nmMenu = true; render(); true`); await sleep(200);
const nutContrast = async () => { const r = { log: await contrast("#meals-today .mt-log"), pill: await contrast(".nut-lower .pill-goal"), num: await contrast(".nut-glance .gl-tile .num", ".nut-glance .gl-tile"), sub: await contrastStack(".nut-glance .gl-sub"), label: await contrastStack(".nut-glance .gl-tile .muted"), slot: await contrast(".nut-meals .nm-slot"), tag: await contrast("#m-slot-tag"), guess: await contrast(".nl-guess"), menu: await contrast(".nm-menu-btn") }; return r; };
for (const mode of ["light", "dark", "oled"]) { await setMode(mode); await sleep(200);
  const c = await nutContrast();
  ok(`${mode}: + Log, the target pill, the glance numbers, the slot chip and tag, Guess and the menu button keep a 4.5:1 contrast`, Object.values(c).every(x => x >= 4.5), JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +v.toFixed(2)]))));
  await shot("nutrition-1280-" + mode); }
await setMode("light"); await sleep(200);
await view(390, 844); await sleep(500);
const ph = await ev(`(() => { const lg = document.querySelector(".nut-log").getBoundingClientRect(), ml = document.querySelector(".nut-meals").getBoundingClientRect(), tl = [...document.querySelectorAll(".nut-glance .gl-tile")].map(t => Math.round(t.getBoundingClientRect().top));
  return { hs: document.documentElement.scrollWidth > innerWidth, stacked: ml.top >= lg.bottom - 1 && Math.abs(ml.left - lg.left) < 1, tileRows: new Set(tl).size, rows: [...document.querySelectorAll("#meals-today .mt-row")].map(c => { const r = c.getBoundingClientRect(), b = c.querySelector(".mt-log").getBoundingClientRect(); return { sameRow: Math.abs((b.top + b.height / 2) - (r.top + r.height / 2)) < r.height / 2, inside: b.right <= r.right + 1 }; }) }; })()`);
ok("on a phone the page does not scroll sideways, Meals on today sits under the form, and the glance tiles go two by two", !ph.hs && ph.stacked && ph.tileRows === 2, JSON.stringify(ph));
ok("on a phone each menu row keeps its + Log on the same row as the dish", ph.rows.length === 3 && ph.rows.every(r => r.sameRow && r.inside), JSON.stringify(ph.rows));
ok("on a phone the Calories and weight hints still fit", await fits("m-cal") && await fits("w-val"));
ok("on a phone the chart text is still 9px or more", await fsz() >= 9, await fsz());
await shot("nutrition-390");
await ev(`UI.nmMenu = false; render(); true`);
await view(1280, 900);

console.log("--- 6. Workouts: KPI row first, photo card beside Import, quick picks, minute chips and a live estimate");
await setMode("light"); await goto("#/workouts"); await sleep(400);
const kp = await g("#sec-workouts > .scgrid.plain"), wsec = await g("#sec-workouts > .wsec");
ok("the Workouts / Minutes / Streak strip now comes before the widgets", kp && wsec && kp.t < wsec.t, JSON.stringify({ kp, wsec }));
ok("it still reads Workouts, Minutes and Streak with this week's numbers", await ev(`[...document.querySelectorAll("#sec-workouts > .scgrid.plain .sc-l")].map(e => e.textContent).join() === "Workouts,Minutes,Streak"`));
const eq = await g("#sec-workouts .wk-tools > section:first-child"), im = await g(".wk-import");
ok("Snap gym equipment and Import workouts sit side by side", eq && im && eq.r <= im.l + 1 && Math.abs(eq.t - im.t) < 2, JSON.stringify({ eq, im }));
ok("Import workouts keeps its toggle, and says there is no automatic sync", await ev(`(() => { const c = document.querySelector(".wk-import"); return /Import workouts/.test(c.querySelector("h2").textContent) && /no automatic sync/.test(c.textContent) && c.querySelector('[data-act="imp-toggle"]').textContent.trim() === "Import from Apple Health or another app"; })()`));
const qp = await ev(`[...document.querySelectorAll(".actquick .actq")].map(b => ({ v: b.dataset.v, h: b.getBoundingClientRect().height, ic: !!b.querySelector(".wi") }))`);
ok("five quick activity picks, the current one (Strength training) not among them, each 44px with its icon", qp.length === 5 && qp.map(b => b.v).join() === "run,walk,cycle,hiit,soccer" && qp.every(b => b.h >= 43.5 && b.ic), JSON.stringify(qp));
await ev(`document.getElementById("w-min").value = "33"; document.getElementById("w-note").value = "tempo"; true`);
await click('.actquick [data-v="walk"]'); await sleep(250);
ok("tapping Walking selects it, and the minutes and notes already typed are kept", await ev(`val("w-type") === "walk" && document.getElementById("w-min").value === "33" && document.getElementById("w-note").value === "tempo" && document.querySelector(".actcur b").textContent === ACT.walk.n`));
ok("the picks follow the choice: Strength training is offered again and Walking is not", await ev(`(() => { const v = [...document.querySelectorAll(".actquick .actq")].map(b => b.dataset.v); return v.includes("strength") && !v.includes("walk") && v.length === 5; })()`));
ok("the folded Change picker and its Done button still work", await (async () => { await click('[data-act="act-toggle"]'); const open = await ev(`document.querySelectorAll(".actbtn").length === ACTIVITIES.length && !document.querySelector(".actquick")`); await click('[data-act="act-toggle"]'); return open && await ev(`document.querySelectorAll(".actbtn").length === 0 && !!document.querySelector(".actquick")`); })());
const chips = await ev(`[...document.querySelectorAll(".wk-presets .chip")].map(c => ({ t: c.textContent, v: c.dataset.v, h: c.getBoundingClientRect().height, p: c.getAttribute("aria-pressed") }))`);
ok("four minute chips, 20m 30m 45m 60m, each 44px", chips.map(c => c.t).join() === "20m,30m,45m,60m" && chips.every(c => c.h >= 43.5), JSON.stringify(chips));
await ev(`document.getElementById("w-min").value = ""; wEstimate(); true`);
ok("with no minutes the estimate pill asks for them", await ev(`document.getElementById("w-est").textContent === "Add minutes for an estimate"`));
await click('.wk-presets [data-v="45"]');
const est = await ev(`(() => ({ min: document.getElementById("w-min").value, txt: document.getElementById("w-est").textContent, want: "≈ " + workoutKcal({ type: val("w-type"), minutes: 45 }, latestWeightKg(P())).toLocaleString() + " cal est.", pressed: [...document.querySelectorAll(".wk-presets .chip")].map(c => c.getAttribute("aria-pressed")).join() }))()`);
ok("tapping 45m fills Minutes, marks that chip pressed, and shows the same calories the history would (MET x weight x hours)", est.min === "45" && est.txt === est.want && est.pressed === "false,false,true,false", JSON.stringify(est));
await ev(`(() => { const i = document.getElementById("w-min"); i.value = "60"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
ok("typing 60 by hand moves the pressed chip to 60m and updates the estimate without a re-render", await ev(`document.querySelector('.wk-presets [data-v="60"]').getAttribute("aria-pressed") === "true" && document.getElementById("w-est").textContent === "≈ " + workoutKcal({ type: val("w-type"), minutes: 60 }, latestWeightKg(P())).toLocaleString() + " cal est."`));
await ev(`(() => { const i = document.getElementById("w-cal"); i.value = "300"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
ok("typing your own calories shows them as yours instead of an estimate", await ev(`document.getElementById("w-est").textContent === "300 cal (yours)"`));
ok("the pill is a status region and has a readable contrast", await ev(`document.getElementById("w-est").getAttribute("role") === "status"`) && await contrast("#w-est") >= 4.5);
await ev(`document.getElementById("w-cal").value = ""; document.getElementById("w-min").value = "40"; true`);
await click('[data-act="log-workout"]'); await sleep(400);
ok("Save workout still saves it, and clears the form", await ev(`entries("workouts").some(w => w.type === "walk" && w.minutes === 40 && w.note === "tempo") && document.getElementById("w-min").value === ""`));

console.log("--- 7. Workouts: weekly goal with a stepper and the days you trained, and the history rows");
const dots = await ev(`[...document.querySelectorAll(".wk-goal .day-dot")].map(d => ({ t: d.textContent, done: d.classList.contains("is-done"), today: d.classList.contains("is-today"), a: d.getAttribute("aria-label") }))`);
const wkStart = await ev(`weekStart(today())`), tIdx = await ev(`(parseYmd(today()).getDay() + 6) % 7`);
ok("seven day dots, Monday first, today ringed, and each dot says its day and whether you trained", dots.length === 7 && dots.map(d => d.t).join("") === "MTWTFSS" && dots.filter(d => d.today).length === 1 && dots[tIdx].today && dots.every(d => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)( \(today\))?: (\d workouts?|no workout)$/.test(d.a)), JSON.stringify(dots));
const trained = await ev(`new Set(weekWorkouts(P()).map(w => w.date)).size`);
ok("the dots that are filled match the days with a logged workout this week", dots.filter(d => d.done).length === trained && trained >= 1 && dots[tIdx].done, JSON.stringify({ trained, dots }));
ok("the ring says what share of the goal is done and the heading says how many of how many", await ev(`(() => { const r = document.querySelector(".wk-goal .ring-wrap"), n = weekWorkouts(P()).length; return /\\d+%/.test(r.textContent) && r.getAttribute("aria-label") === n + " of 4 workouts this week" && new RegExp("^" + n + " of 4 workouts this week").test(document.querySelector(".wk-goal h2").textContent); })()`));
await click('.wk-goal [data-act="wgoal"][data-d="1"]');
ok("+ raises the weekly goal to 5 and saves it on the profile", await ev(`P().workoutGoal === 5 && document.querySelector(".wg-step span.tab").textContent === "5 / wk" && /of 5 workouts this week/.test(document.querySelector(".wk-goal h2").textContent)`));
await click('.wk-goal [data-act="wgoal"][data-d="-1"]'); await click('.wk-goal [data-act="wgoal"][data-d="-1"]');
ok("- lowers it, and the new value is the one Settings shows", await ev(`P().workoutGoal === 3 && document.querySelector(".wg-step span.tab").textContent === "3 / wk"`));
await ev(`P().workoutGoal = 1; render(); true`); await sleep(200);
ok("at 1 the minus button is disabled, at 14 the plus button is", await ev(`document.querySelector('[data-act="wgoal"][data-d="-1"]').disabled === true`) && await (async () => { await ev(`P().workoutGoal = 14; render(); true`); await sleep(200); return ev(`document.querySelector('[data-act="wgoal"][data-d="1"]').disabled === true && document.querySelector('[data-act="wgoal"][data-d="-1"]').disabled === false`); })());
ok("the stepper buttons are 36px or more and labelled", await ev(`[...document.querySelectorAll(".wg-step .btn")].every(b => b.getBoundingClientRect().height >= 35.5 && /per week/.test(b.getAttribute("aria-label")))`));
await ev(`P().workoutGoal = 4; render(); true`); await sleep(200);
ok("with no weekly goal the card offers to set one instead of a stepper", await (async () => { await ev(`P().workoutGoal = null; render(); true`); await sleep(200); const r = await ev(`!document.querySelector(".wg-step") && /Set a weekly goal/.test(document.querySelector(".wk-goal").textContent) && !document.querySelector(".wk-goal .ring-wrap") && document.querySelectorAll(".wk-goal .day-dot").length === 7`); await ev(`P().workoutGoal = 4; render(); true`); await sleep(200); return r; })());
const hist = await ev(`(() => { const r = document.querySelector(".wrow"); return r ? { name: r.querySelector(".grow b")?.textContent, meta: r.querySelector(".wr-meta")?.textContent, mins: r.querySelector(".wr-nums b")?.textContent, kcal: r.querySelector(".wr-kcal")?.textContent, icon: !!r.querySelector(".wi"), del: !!r.querySelector('[data-act="del-workout"]') } : null; })()`);
ok("a history row shows the name, then the date and note, with minutes and calories on the right", hist && hist.name && /tempo/.test(hist.meta) && /^\d+ min$/.test(hist.mins) && /^≈\d+ cal$/.test(hist.kcal) && hist.icon && hist.del, JSON.stringify(hist));
ok("the calories on the right are green and meet 4.5:1", await contrastUp(".wr-kcal") >= 4.5, await contrastUp(".wr-kcal"));
for (const mode of ["dark", "oled"]) { await setMode(mode); await goto("#/workouts"); await sleep(250);
  ok(`${mode}: a filled day dot, the estimate pill and the kcal text meet 4.5:1`, await contrast(".wk-goal .day-dot.is-done") >= 4.5 && await contrast("#w-est") >= 4.5 && await contrastUp(".wr-kcal") >= 4.5, [await contrast(".wk-goal .day-dot.is-done"), await contrast("#w-est"), await contrastUp(".wr-kcal")].join(","));
  await shot("workouts-1280-" + mode); }
await setMode("light"); await goto("#/workouts"); await shot("workouts-1280-light");
await ev(`(() => { const w = entries("workouts").find(x => x.note === "tempo"); removeEntry("workouts", w.id); render(); return true; })()`);
await view(390, 844); await sleep(500);
ok("on a phone the Workouts page does not scroll sideways", await ev(`document.documentElement.scrollWidth <= innerWidth`));
await shot("workouts-390"); await view(1280, 900);

// The worst contrast between a text colour and the real pixels behind it. The elements in hideSel are hidden for one screenshot,
// so what is sampled is the glass, the gradient and the watermark, never the text itself.
const worstContrast = async (hideSel, textSel) => {
  const col = await ev(`getComputedStyle(document.querySelector(${JSON.stringify(textSel)})).color`);
  const r = await g(textSel); if (!r) return 0;
  await ev(`(() => { const s = document.createElement("style"); s.id = "__hide"; s.textContent = ${JSON.stringify(hideSel + "{visibility:hidden!important}")}; document.head.append(s); return true; })()`); await sleep(150);
  const sh = await send("Page.captureScreenshot", { format: "png", clip: { x: r.l, y: r.t, width: Math.max(2, r.w), height: Math.max(2, r.h), scale: 1 } });
  await ev(`document.getElementById("__hide")?.remove(); true`);
  return ev(`new Promise(res => { const im = new Image(); im.onerror = () => res(0); im.onload = () => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.drawImage(im, 0, 0); let worst = 99;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) { const d = x.getImageData(Math.min(im.width - 1, Math.floor((i + .5) * im.width / 8)), Math.min(im.height - 1, Math.floor((j + .5) * im.height / 3)), 1, 1).data; worst = Math.min(worst, window.__t.ratio(${JSON.stringify(col)}, "rgb(" + d[0] + "," + d[1] + "," + d[2] + ")")); }
    res(worst); }; im.src = "data:image/png;base64,${sh.data}"; })`);
};

console.log("--- 8. WL Coach (8.6.10, 8.6.15): one chat card (signed in, with consent)");
await ev(`SB.user = { id: "u_me", email: "me@example.com" }; window.__calls = []; window.__delay = 0;
  window.fetch = async (u, o) => { if (String(u).includes("/functions/v1/wl-coach")) { window.__calls.push({ u: String(u), o }); if (window.__delay) await new Promise(r => setTimeout(r, window.__delay)); return new Response(JSON.stringify({ state: "ok", reply: "Eggs <b>and</b> plantain, then water." }), { status: 200 }); } return new Response("{}", { status: 404 }); };
  sbClient().auth.getSession = async () => ({ data: { session: { access_token: "tok-123" } } });
  P().coachChatConsent = true; UI.wlc = {}; true`);
await view(1280, 900); await setMode("light"); await goto("#/coach"); await sleep(500);
const head = await ev(`(() => { const c = document.querySelector("#wlc.wlc-card"); if (!c) return null; const r = s => c.querySelector(s)?.getBoundingClientRect(); const hd = r(".wlc-head"), ch = r(".wlc-chips"), lg = r("#wlc-log"), cp = r(".wlc-composer"); return { h2: c.querySelector(".wlc-head h2")?.textContent, note: c.querySelector(".wlc-head .wlc-note")?.textContent, msgs: c.querySelectorAll(".wlc-msg").length, order: hd.bottom <= ch.top + 1 && ch.bottom <= cp.top + 1, logH: lg.height, logEmpty: c.querySelector("#wlc-log").children.length === 0, live: c.querySelector("#wlc-log").getAttribute("aria-live") }; })()`);
ok("the chat card has its heading with the honest note beside it: it can't see your logs, not medical advice", head && head.h2 === "Ask WL Coach" && /Can't see your logs yet/.test(head.note) && /Not medical advice/.test(head.note), JSON.stringify(head));
ok("the suggestions come first, then the box; before the first question there is no made-up conversation and the empty thread takes no room", head.order && head.msgs === 0 && head.logEmpty && head.logH <= 1 && head.live === "polite", JSON.stringify(head));
const asks = await ev(`[...document.querySelectorAll(".wlc-chips .chip")].map(c => ({ t: c.textContent.trim(), act: c.dataset.act, h: c.getBoundingClientRect().height }))`);
ok("four suggested questions, each 44px", asks.length === 4 && asks.every(c => c.act === "wlc-ask" && c.h >= 43.5 && c.t.endsWith("?")), JSON.stringify(asks));
await click('.wlc-chips .chip');
ok("tapping a suggestion fills the box and focuses it", await ev(`document.getElementById("wlc-q").value === "What should I eat after a workout?" && document.activeElement.id === "wlc-q"`));
ok("tapping a suggestion sends nothing (a send goes to a server, so only the person's own Ask does it)", (await ev(`window.__calls.length`)) === 0);
ok("there is exactly one counter and it shows the length", await ev(`document.querySelectorAll("#wlc .wl-count").length === 1 && document.querySelector("#wlc .wl-count").textContent === "34 / 1000"`), await ev(`document.querySelector("#wlc .wl-count")?.textContent`));
const sendBtn = await ev(`(() => { const b = document.querySelector('[data-act="wlc-send"]'), r = b.getBoundingClientRect(); return { h: r.height, t: b.textContent.trim(), type: b.type, dis: b.disabled, inBox: !!b.closest(".wlc-composer") }; })()`);
ok("the Ask button sits in the box, 44px tall", sendBtn.h >= 43.5 && sendBtn.t === "Ask" && sendBtn.type === "button" && !sendBtn.dis && sendBtn.inBox, JSON.stringify(sendBtn));
await ev(`window.__delay = 900; true`);
await click('[data-act="wlc-send"]'); await sleep(250);
const busy = await ev(`(() => { const t = document.querySelector(".wlc-typing"), b = document.querySelector('[data-act="wlc-send"]'); return { typing: !!t, role: t?.getAttribute("role"), label: t?.getAttribute("aria-label"), dots: t?.querySelectorAll("span").length, dis: b.disabled, bt: b.textContent.trim(), mine: document.querySelector(".wlc-msg.me") ? 1 : 0 }; })()`);
ok("while it thinks: three dots (named for screen readers) and the button is off and says Thinking…", busy.typing && busy.role === "status" && /thinking/i.test(busy.label) && busy.dots === 3 && busy.dis && busy.bt === "Thinking…", JSON.stringify(busy));
ok("the question went out once, with the person's token", await waitFor(`window.__calls.length === 1`) && (await ev(`window.__calls[0].o.headers.authorization`)) === "Bearer tok-123" && JSON.parse(await ev(`window.__calls[0].o.body`)).message === "What should I eat after a workout?");
ok("the answer arrives and the dots go", await waitFor(`!document.querySelector(".wlc-typing") && document.querySelectorAll(".wlc-msg").length === 2`, 5000));
const conv = await ev(`(() => { const ms = [...document.querySelectorAll("#wlc-log .wlc-msg")], log = document.getElementById("wlc-log").getBoundingClientRect(); return { me: ms.map(m => m.classList.contains("me")), who: ms.map(m => m.querySelector(".sr-only")?.textContent), t: ms.map(m => m.querySelector(".wlc-bubble").textContent), right: ms.map(m => Math.round(m.querySelector(".wlc-bubble").getBoundingClientRect().right)), left: ms.map(m => Math.round(m.querySelector(".wlc-bubble").getBoundingClientRect().left)), logRight: Math.round(log.right), logLeft: Math.round(log.left), bold: !!document.querySelector("#wlc-log b"), q: document.getElementById("wlc-q").value, cnt: document.querySelector("#wlc .wl-count").textContent, bt: document.querySelector('[data-act="wlc-send"]').textContent.trim() }; })()`);
ok("your question sits on the right and the coach's answer on the left, each labelled for screen readers", conv.me.join() === "true,false" && conv.who.join("|") === "You: |WL Coach: " && conv.right[0] > conv.logRight - 40 && conv.left[1] < conv.logLeft + 40, JSON.stringify(conv));
ok("the answer is plain text: the <b> the server sent is shown as text, not as bold", conv.t[1] === "Eggs <b>and</b> plantain, then water." && !conv.bold, JSON.stringify(conv));
ok("the box is empty again, the counter says 0 / 1000 and the button says Ask", conv.q === "" && conv.cnt === "0 / 1000" && conv.bt === "Ask", JSON.stringify(conv));
await ev(`window.__delay = 0; UI.wlc.msgs = Array.from({ length: 10 }, (_, i) => ({ me: i % 2 === 0, t: "Message number " + i + " in a long chat about training, food and rest. ".repeat(3) })); render(); true`); await sleep(200);
await ev(`document.getElementById("wlc-q").value = "One more?"; true`); await click('[data-act="wlc-send"]'); await sleep(500);
ok("a long chat scrolls inside the thread and stays at the newest message", await ev(`(() => { const l = document.getElementById("wlc-log"); return l.scrollHeight > l.clientHeight + 40 && l.scrollTop + l.clientHeight >= l.scrollHeight - 3; })()`), await ev(`(() => { const l = document.getElementById("wlc-log"); return [l.scrollTop, l.clientHeight, l.scrollHeight].join("/"); })()`));
ok("the page itself is not pushed past the viewport by a long chat", await ev(`document.documentElement.scrollWidth <= innerWidth && document.getElementById("wlc").getBoundingClientRect().height < 900`));
for (const mode of ["light", "dark", "oled"]) { await setMode(mode); await goto("#/coach"); await sleep(250);
  const a = await contrast(".wlc-msg.me .wlc-bubble"), b = await contrast(".wlc-msg:not(.me) .wlc-bubble"), c = await contrastStack(".wlc-note"), d = await contrastStack('[data-act="wlc-send"]');
  ok(`${mode}: your bubble, the coach's bubble, the note and the Ask button meet 4.5:1`, a >= 4.5 && b >= 4.5 && c >= 4.5 && d >= 4.5, [a, b, c, d].map(x => x.toFixed(2)).join(","));
  await shot("coach-1280-" + mode); }
await setMode("light");
await ev(`UI.wlc = {}; render(); true`); await view(390, 844); await goto("#/coach"); await sleep(500);
const phn = await ev(`(() => { const s = document.querySelector('[data-act="wlc-send"]').getBoundingClientRect(), c = document.querySelector(".wlc-composer").getBoundingClientRect(); return { sendR: Math.round(s.right), compR: Math.round(c.right), sw: document.documentElement.scrollWidth, iw: innerWidth, chips: [...document.querySelectorAll(".wlc-chips .chip")].every(x => x.getBoundingClientRect().right <= innerWidth) }; })()`);
ok("on a phone the box and the suggestions stay inside the screen", phn.sw <= phn.iw && phn.sendR <= phn.compR && phn.compR <= phn.iw && phn.chips, JSON.stringify(phn));
await shot("coach-390"); await view(1280, 900);
await ev(`SB.user = null; render(); true`); await goto("#/coach"); await sleep(300);
const out = await ev(`(() => { const c = document.getElementById("wlc"); const b = c.querySelector('[data-act="sb-open"]'); return { h2: c.querySelector("h2")?.textContent, txt: /Sign in to chat with WL Coach/.test(c.textContent), btn: b?.textContent.trim(), v: b?.dataset.v, h: b?.getBoundingClientRect().height, box: !!c.querySelector("#wlc-q, [data-act=\\"wlc-send\\"]") }; })()`);
ok("signed out, the card says why chat needs an account and offers a Sign in button, with no box to type in", out.h2 === "Ask WL Coach" && out.txt && out.btn === "Sign in" && out.v === "in" && out.h >= 43.5 && !out.box, JSON.stringify(out));
await ev(`SB.user = { id: "u_me", email: "me@example.com" }; render(); true`);

console.log("--- 8b. Personal coach page (8.6.15): the hero, the tabs, the check-in beside the read-out, and the five questions");
await goto("#/coach"); await ev(`document.querySelector('[data-act="coach-tab"][data-v="ask"]')?.click(); true`); await sleep(400);
const hero = await ev(`(() => { const h = document.querySelector("#sec-coach .cp-hero"), cd = coachDef(P()); return h ? { name: h.querySelector(".ch-name h2")?.textContent, want: coachName(P()), pill: h.querySelector(".ch-pill")?.textContent, sub: cd.sub, say: h.querySelector(".coach-say")?.textContent.trim().length, av: h.querySelector(".cp-av")?.getAttribute("aria-hidden"), avIcon: !!h.querySelector(".cp-av svg, .cp-av .ico"), meta: h.querySelector(".cp-meta")?.innerText.replace(/\\s+/g, " ").trim(), one: (h.innerText.match(new RegExp(coachName(P()), "g")) || []).length } : null; })()`);
ok("the hero names your coach once, with its style pill, its line for today and a decorative avatar", hero && hero.name === hero.want && hero.one === 1 && hero.pill === hero.sub && hero.say > 10 && hero.av === "true" && hero.avIcon, JSON.stringify(hero));
ok("under it one line reads Goal, Style, Level and Frequency from the profile", /^Goal: .+ · Style: .+ · Level: .+ · Frequency: Not set$/.test(hero.meta), hero.meta);
await ev(`P().freq = 4; render(); true`); await sleep(200);
ok("with a frequency set it says how many days a week", await ev(`/Frequency: 4 days a week$/.test(document.querySelector(".cp-meta").innerText.replace(/\\s+/g, " ").trim())`));
await ev(`delete P().freq; render(); true`); await sleep(200);
const en = await ev(`(() => { const det = adherence(P()), a = adherenceDelta(P()), r = document.querySelector(".cp-hero .en-ring"), go = { Calories: "#/nutrition", Log: "#/nutrition", Session: "#/workouts" };
  const els = [...document.querySelectorAll(".cp-hero .mech-checks .mck")];
  return { aria: r?.getAttribute("aria-label"), want: a.today + "% of today's checks done", role: r?.getAttribute("role"), num: r?.querySelector(".mech-num")?.textContent, pct: a.today + "%", numHidden: r?.querySelector(".mech-num")?.getAttribute("aria-hidden"), side: !!document.querySelector(".cp-hero .mech-side"),
    checks: els.map((e, i) => { const c = det.checks[i] || {}; return { k: c.k, ok: c.ok, good: c.ok ? e.tagName === "SPAN" && e.classList.contains("ok") && e.querySelector(".sr-only")?.textContent === " done" : e.tagName === "A" && e.getAttribute("href") === go[c.k] && e.querySelector(".sr-only")?.textContent === " not done yet", h: e.getBoundingClientRect().height }; }) }; })()`);
ok("The Enforcer shows today's score as a ring a screen reader can read, with the change since yesterday beside it", en.role === "img" && en.aria === en.want && en.num === en.pct && en.numHidden === "true" && en.side, JSON.stringify(en));
ok("each of today's checks is a pill: a done one says done, one still to do is a link to where it gets logged", en.checks.length === 3 && en.checks.map(c => c.k).join() === "Calories,Session,Log" && en.checks.every(c => c.good && c.h >= 35.5) && en.checks.some(c => !c.ok), JSON.stringify(en.checks));
await click('.cp-hero a.mck[href="#/workouts"]'); await sleep(400);
ok("the Session pill takes you to Workouts", await ev(`location.hash === "#/workouts"`));
await goto("#/coach"); await sleep(300);
for (const persona of ["motivator", "strategist"]) { await ev(`P().coachPersona = ${JSON.stringify(persona)}; render(); true`); await sleep(250);
  ok(`${persona}: the hero swaps to that coach's name, pill and own mechanic`, await ev(`(() => { const h = document.querySelector(".cp-hero"); return h.querySelector(".ch-pill").textContent === coachDef(P()).sub && h.querySelector(".ch-name h2").textContent === coachName(P()) && !!h.querySelector(".cp-mech .mech") && !h.querySelector(".en-ring"); })()`)); }
await ev(`P().coachPersona = "enforcer"; render(); true`); await sleep(250);
const tb = await ev(`(() => { const t = document.querySelector("#sec-coach .ctabs"), r = t.getBoundingClientRect(), hero = document.querySelector(".cp-hero").getBoundingClientRect(), tabs = [...t.querySelectorAll('[role="tab"]')].map(x => x.getBoundingClientRect()); return { w: Math.round(r.width), hw: Math.round(hero.width), left: Math.abs(r.left - hero.left) < 2, oneRow: new Set(tabs.map(x => Math.round(x.top))).size === 1, n: tabs.length, h: Math.min(...tabs.map(x => x.height)) }; })()`);
ok("the Ask / Today / Plan / Settings tabs are a compact bar on the left, not the full width", tb.n === 4 && tb.oneRow && tb.left && tb.w < tb.hw * 0.75 && tb.h >= 43.5, JSON.stringify(tb));
const cpair = await ev(`(() => { const q = s => document.querySelector("#coach-context " + s)?.getBoundingClientRect(); const a = q(".cc-check"), b = q(".cc-ready"), s = q(".cc-short"), p = document.getElementById("coach-context").getBoundingClientRect(); const t = trainingAdvice(P()), c = intakeContext(P());
  return { side: !!a && !!b && a.right <= b.left + 1 && Math.abs(a.top - b.top) < 2, short: !!s, wantShort: !!shortfallAdvice(P()), full: s ? Math.abs(s.width - p.width) < 2 && s.top >= Math.max(a.bottom, b.bottom) - 1 : null, level: document.querySelector(".cc-verdict").dataset.l, lv: t.level, h3: document.querySelector(".cc-verdict h3").textContent, why: document.querySelector(".cc-ready p.small").textContent === t.why, strip: document.querySelector(".cc-strip").innerText.replace(/\\s+/g, " ").trim(), days: c.days, dot: document.querySelector(".cc-dot").getAttribute("aria-hidden"), ans: document.querySelector('[data-act="coach-answer"]').getBoundingClientRect().height }; })()`);
ok("the check-in question and the training read-out sit side by side", cpair.side, JSON.stringify(cpair));
ok("the read-out's headline follows the real training advice, and the advice is shown word for word", cpair.level === cpair.lv && cpair.h3 === { easy: "Keep it moderate", push: "Good week to push", moderate: "Hold the volume", normal: "Train as planned" }[cpair.lv] && cpair.why && cpair.dot === "true", JSON.stringify(cpair));
ok("its strip counts the days with food logged in the last 7, from the logs", cpair.strip === `Days with food logged ${cpair.days} of the last 7` && cpair.days === 5, cpair.strip);
ok("You're eating short gets its own full-width card under the pair when intake really falls short", cpair.short && cpair.wantShort && cpair.full, JSON.stringify(cpair));
ok("the Answer button is 44px", cpair.ans >= 43.5, cpair.ans);
await ev(`P().calorieGoal = 600; render(); true`); await sleep(250);
ok("with intake close to the target there is no eating-short card", await ev(`!shortfallAdvice(P()) && !document.querySelector("#coach-context .cc-short")`));
await ev(`P().calorieGoal = 2000; window.__coachKeep = JSON.stringify(P().coach || null); P().coach = Object.assign(P().coach || {}, { baseline: null, skipped: false }); render(); true`); await sleep(250);
const nd = await ev(`(() => { const n = document.getElementById("coach-nudge"); return n ? { h2: n.querySelector(".cn-head h2")?.textContent, pill: n.querySelector(".cn-head .pill-goal")?.textContent, btn: n.querySelector('[data-act="coach-tab"][data-v="settings"]')?.textContent, h: n.getBoundingClientRect().height } : null; })()`);
ok("before any of the five questions is answered, a slim strip says 0 of 5 answered and offers Answer them", nd && nd.h2 === "Five quick questions" && nd.pill === "0 of 5 answered" && nd.btn === "Answer them" && nd.h < 160, JSON.stringify(nd));
await ev(`P().coach.baseline = { pushups: 10 }; render(); true`); await sleep(250);
ok("once one is answered the strip goes, so the count is never wrong", await ev(`!document.getElementById("coach-nudge")`));
await ev(`P().coach = JSON.parse(window.__coachKeep); render(); true`); await sleep(200);
await ev(`P().coach = Object.assign(P().coach || {}, { baseline: null, skipped: false }); render(); true`); await sleep(200);
for (const mode of ["light", "dark", "oled"]) { await setMode(mode); await goto("#/coach"); await sleep(250);
  const c = { pill: await contrastStack(".cp-hero .ch-pill"), meta: await contrastStack(".cp-meta b"), check: await contrastStack(".cp-hero .mck.no"), strip: await contrastStack(".cc-strip b"), verdict: await contrastStack(".cc-verdict h3"), nudge: await contrastStack("#coach-nudge .pill-goal") };
  ok(`${mode}: the style pill, the profile line, a to-do pill, the days strip, the headline and the 0 of 5 pill meet 4.5:1`, Object.values(c).every(x => x >= 4.5), JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +v.toFixed(2)]))));
  await shot("coach-page-1280-" + mode); }
await setMode("light"); await view(390, 844); await goto("#/coach"); await sleep(500);
const cph = await ev(`(() => { const id = document.querySelector(".cp-id").getBoundingClientRect(), m = document.querySelector(".cp-mech").getBoundingClientRect(), a = document.querySelector(".cc-check").getBoundingClientRect(), b = document.querySelector(".cc-ready").getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, iw: innerWidth, heroStack: m.top >= id.bottom - 1, pairStack: b.top >= a.bottom - 1 }; })()`);
ok("on a phone the coach page does not scroll sideways, the mechanic goes under the name, and the check-in goes above the read-out", cph.sw <= cph.iw && cph.heroStack && cph.pairStack, JSON.stringify(cph));
await shot("coach-page-390"); await view(1280, 900);
await ev(`P().coach = JSON.parse(window.__coachKeep); render(); true`);

console.log("--- 9. Profile: quick setup chips for the basics that are still empty");
await ev(`window.__keep = { name: P().name, age: P().age, sex: P().sex, heightCm: P().heightCm, weightKg: P().weightKg, units: P().units }; Object.assign(P(), { name: "", age: null, sex: "", heightCm: null, weightKg: null, units: "metric" }); S.logs = {}; saveProfile(); true`);
await goto("#/settings/profile"); await sleep(400);
const qs = await ev(`[...document.querySelectorAll(".pf-quick .pf-q")].map(b => ({ t: b.textContent.trim(), g: b.dataset.g, f: b.dataset.f, h: b.getBoundingClientRect().height }))`);
ok("an empty profile offers five chips: name, age, sex, height, weight, each 44px", qs.map(q => q.t).join("|") === "+ Add name|+ Add age|+ Add sex|+ Add height|+ Add weight" && qs.every(q => q.h >= 43.5), JSON.stringify(qs));
ok("the chips are a named group with a plain-words label", await ev(`document.querySelector(".pf-quick .chips").getAttribute("aria-label") === "Quick setup" && /Quick setup: tap to fill in/.test(document.querySelector(".pf-quick").textContent)`));
await click('.pf-q[data-f="pe-cm"]');
ok("+ Add height opens the Body card on the height field and puts the cursor there", await ev(`document.getElementById("pg-body").classList.contains("editing") && document.activeElement.id === "pe-cm"`), await ev(`document.activeElement.id || document.activeElement.tagName`));
await click('[data-act="cancel-group"]');
await click('.pf-q[data-f="pe-name"]');
ok("+ Add name opens the About card on the name field", await ev(`document.getElementById("pg-about").classList.contains("editing") && document.activeElement.id === "pe-name"`), await ev(`document.activeElement.id || document.activeElement.tagName`));
await ev(`const n = document.getElementById("pe-name"); n.value = "Ada"; n.dispatchEvent(new Event("input", { bubbles: true })); n.closest("form").requestSubmit(); true`); await sleep(400);
ok("saving the name takes its chip away and keeps the other four", await ev(`P().name === "Ada" && !document.querySelector('.pf-q[data-f="pe-name"]') && document.querySelectorAll(".pf-quick .pf-q").length === 4`), await ev(`[...document.querySelectorAll(".pf-q")].map(b => b.textContent).join("|")`));
await click('.pf-q[data-f="pe-sex"]');
ok("+ Add sex lands inside the About card's editor (the select is swapped for a styled one, so the cursor goes to what is shown)", await ev(`document.getElementById("pg-about").classList.contains("editing") && !!document.activeElement.closest("#pg-about")`), await ev(`document.activeElement.id || document.activeElement.className || document.activeElement.tagName`));
await click('[data-act="cancel-group"]');
await ev(`Object.assign(P(), { age: 30, sex: "female", heightCm: 170, weightKg: 70 }); saveProfile(); render(); true`); await sleep(300);
ok("with everything filled in the quick-setup row is gone", await ev(`!document.querySelector(".pf-quick")`));
await ev(`Object.assign(P(), window.__keep); saveProfile(); render(); true`);
await view(390, 844); await ev(`Object.assign(P(), { name: "", age: null, heightCm: null }); render(); true`); await sleep(300);
ok("on a phone the chips wrap inside the card and the page does not scroll sideways", await ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll(".pf-q")].every(b => b.getBoundingClientRect().right <= innerWidth - 8)`));
await shot("profile-quick-390"); await view(1280, 900); await ev(`Object.assign(P(), window.__keep); saveProfile(); render(); true`);

console.log("--- 10. Glass & motion: a live preview, presets, and a third motion style");
await setMode("light"); await goto("#/settings/appearance"); await sleep(500);
const eaten = await ev(`intakeOn(today())`);
const gp = await ev(`(() => { const c = document.querySelector(".gp-card"); return c ? { ring: !!c.querySelector(".ring-wrap"), aria: c.querySelector(".ring-wrap")?.getAttribute("aria-label"), title: c.querySelector(".gp-txt b")?.textContent, line: c.querySelector(".gp-txt .small")?.textContent, badge: document.getElementById("gp-badge")?.textContent } : null; })()`);
ok("the preview card shows today's real calories and a ring that says what share of the target is eaten", gp && gp.ring && gp.title === "Today's calories" && gp.line === eaten.toLocaleString() + " of 2,000 cal" && gp.aria === Math.round(eaten / 2000 * 100) + "% of your calorie target eaten today", JSON.stringify({ gp, eaten }));
ok("the badge starts at 100% glass, the Solid preset is the one pressed", gp.badge === "100% glass" && await ev(`[...document.querySelectorAll(".op-presets .chip")].map(c => c.getAttribute("aria-pressed")).join() === "false,false,true"`));
const presets = await ev(`[...document.querySelectorAll(".op-presets .chip")].map(c => ({ t: c.textContent.trim(), h: c.getBoundingClientRect().height }))`);
ok("three presets, each 44px: Frosted 35%, Balanced 70%, Solid 100%", presets.map(x => x.t).join("|") === "Frosted 35%|Balanced 70%|Solid 100%" && presets.every(x => x.h >= 43.5), JSON.stringify(presets));
const a100 = await ev(`window.__t.alpha(getComputedStyle(document.querySelector(".gp-card")).backgroundColor)`);
await click('[data-act="op-set"][data-v="35"]'); await sleep(300);
const fr = await ev(`({ op: P().look.opacity, css: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-op")), badge: document.getElementById("gp-badge").textContent, val: document.getElementById("ui-op-val")?.textContent, pressed: [...document.querySelectorAll(".op-presets .chip")].map(c => c.getAttribute("aria-pressed")).join(), a: window.__t.alpha(getComputedStyle(document.querySelector(".gp-card")).backgroundColor) })`);
ok("Frosted sets the profile's opacity to 0.35, the live --ui-op, the badge and the slider's number", fr.op === .35 && fr.css === .35 && fr.badge === "35% glass" && fr.val === "35%" && fr.pressed === "true,false,false", JSON.stringify(fr));
ok("the preview card really is more see-through at 35% than at 100%", fr.a < a100 - .2, JSON.stringify({ a100, a35: fr.a }));
await click('[data-act="op-set"][data-v="70"]');
ok("Balanced follows, and the choice survives a render", await ev(`P().look.opacity === .7 && document.getElementById("gp-badge").textContent === "70% glass" && document.querySelector('.op-presets [data-v="70"]').getAttribute("aria-pressed") === "true"`));
await ev(`document.querySelector("#ui-op-ws .gslider__thumb").focus(); true`); await key("ArrowRight"); await sleep(150);
ok("moving the slider updates the badge and clears the preset highlight once it is on none of them", await ev(`document.getElementById("gp-badge").textContent === "75% glass" && document.getElementById("ui-op-val").textContent === "75%"`) && await ev(`[...document.querySelectorAll(".op-presets .chip")].every(c => c.getAttribute("aria-pressed") === "false")`), await ev(`document.getElementById("gp-badge")?.textContent + " " + [...document.querySelectorAll(".op-presets .chip")].map(c => c.getAttribute("aria-pressed")).join()`));
await click('[data-act="op-set"][data-v="35"]');
for (const mode of ["light", "dark", "oled"]) { await setMode(mode); await goto("#/settings/appearance"); await sleep(300);
  const t1 = await worstContrast(".gp-card > *", ".gp-txt b"), t2 = await worstContrast(".gp-card > *", ".gp-txt .small");
  ok(`${mode}: at 35% glass the preview's text still meets 4.5:1 over the real backdrop (worst pixel)`, t1 >= 4.5 && t2 >= 4.5, [t1, t2].map(x => x.toFixed(2)).join(","));
  if (mode !== "oled") await shot("glass-1280-" + mode + "-35"); }
await setMode("light"); await goto("#/settings/appearance"); await sleep(300);
await click('[data-act="op-set"][data-v="100"]');
const mseg = await ev(`[...document.querySelectorAll('[data-act="look-motion"]')].map(b => b.textContent.trim() + ":" + b.getAttribute("aria-pressed")).join()`);
ok("Motion has three choices, Bouncy, Smooth and Reduced, with Bouncy pressed to start", mseg === "Bouncy:true,Smooth:false,Reduced:false", mseg);
await click('[data-act="look-motion"][data-v="smooth"]'); await sleep(300);
const sm = await ev(`(() => { const cs = getComputedStyle(document.documentElement); return { look: P().look.motion, ds: document.documentElement.dataset.motion, page: cs.getPropertyValue("--dur-page").trim(), tap: cs.getPropertyValue("--dur-tap").trim(), spring: cs.getPropertyValue("--ease-spring").trim(), name: document.getElementById("mo-puck").textContent.trim(), pressed: [...document.querySelectorAll('[data-act="look-motion"]')].map(b => b.getAttribute("aria-pressed")).join() }; })()`);
ok("Smooth is saved on the profile and applied: no spring curve, longer and calmer durations", sm.look === "smooth" && sm.ds === "smooth" && sm.page === "540ms" && sm.tap === "220ms" && /cubic-bezier\(\s*\.?0?\.4,\s*0,\s*\.?0?\.2,\s*1\)/.test(sm.spring) && sm.pressed === "false,true,false" && sm.name === "Smooth glide", JSON.stringify(sm));
ok("the profile survives the sanitiser that every sync and import goes through", await ev(`cleanProfile(JSON.parse(JSON.stringify(P()))).look.motion === "smooth"`));
ok("an unknown motion value from an old backup falls back to Bouncy, not to nothing", await ev(`cleanProfile({ ...JSON.parse(JSON.stringify(P())), look: { motion: "wobbly" } }).look.motion === "full"`));
const x0 = await ev(`document.getElementById("mo-puck").getBoundingClientRect().left`);
await click('[data-act="mo-test"]'); await sleep(900);
const x1 = await ev(`document.getElementById("mo-puck").getBoundingClientRect().left`);
ok("Try this motion slides the puck along its track, and sliding again brings it back", x1 > x0 + 40 && await (async () => { await click('[data-act="mo-test"]'); await sleep(900); return Math.abs(await ev(`document.getElementById("mo-puck").getBoundingClientRect().left`) - x0) < 2; })(), JSON.stringify({ x0, x1 }));
ok("the Try button is 44px", (await g('[data-act="mo-test"]')).h >= 43.5);
await click('[data-act="look-motion"][data-v="reduced"]'); await sleep(300);
ok("Reduced still turns the motion off", await ev(`document.documentElement.dataset.motion === "reduced" && document.getElementById("mo-puck").textContent.trim() === "Reduced (instant)"`));
await click('[data-act="look-motion"][data-v="full"]'); await sleep(200);
ok("Bouncy brings the spring back: the Smooth durations are gone", await ev(`document.documentElement.dataset.motion === "full" && getComputedStyle(document.documentElement).getPropertyValue("--dur-page").trim() !== "540ms" && P().look.motion === "full"`));
await shot("appearance-1280-light");
await view(390, 844); await sleep(500);
ok("on a phone the preview, the presets and the motion demo fit and do not scroll sideways", await ev(`document.documentElement.scrollWidth <= innerWidth && [".gp-card", ".op-presets", ".mo-demo"].every(s => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })`));
await shot("appearance-390"); await view(1280, 900);

console.log("--- 11. Premium: what stays open, the questions, and what Premium is");
await goto("#/premium"); await sleep(600);
const pills = await ev(`[...document.querySelectorAll(".prem-stays .wl-pill")].map(p => { const r = p.getBoundingClientRect(); return { t: p.textContent.trim(), ico: !!p.querySelector(".ico, svg"), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; })`);
ok("the six things that stay open are still the same six, each now with an icon", pills.map(p => p.t).join("|") === "Works offline|Dark mode|English & Spanish|Passcode lock|Multiple profiles|Export your data anytime" && pills.every(p => p.ico && p.h >= 43.5), JSON.stringify(pills));
ok("on a desktop they sit in three columns and two rows", new Set(pills.map(p => p.x)).size === 3 && new Set(pills.map(p => p.y)).size === 2, JSON.stringify(pills.map(p => [p.x, p.y])));
ok("the section is a card with a plain-words heading under its eyebrow", await ev(`(() => { const s = document.querySelector(".prem-stays"), cs = getComputedStyle(s); return parseFloat(cs.borderTopWidth) >= 1 && parseFloat(cs.borderRadius) >= 8 && s.querySelector(".ps-title")?.textContent === "Your core tracker and data always stay yours." && /What stays open on Free/.test(s.querySelector(".eyebrow").textContent); })()`));
ok("the not-medical-advice note is still there", await ev(`/not medical advice/.test(document.querySelector(".prem-stays .advice-banner")?.textContent || "")`));
const faqs = await ev(`[...document.querySelectorAll(".prem-faqs details.wl-faq")].map(d => ({ q: d.querySelector("summary").textContent, h: d.querySelector("summary").getBoundingClientRect().height, chev: getComputedStyle(d.querySelector("summary"), "::after").content, open: d.open }))`);
ok("three questions in one bordered card, every one 44px with a chevron drawn after it, all closed to start", faqs.length === 3 && faqs.every(f => f.h >= 43.5 && f.chev !== "none" && f.chev !== "normal" && !f.open) && await ev(`getComputedStyle(document.querySelector(".prem-faqs")).borderTopWidth !== "0px"`), JSON.stringify(faqs));
const hClosed = (await g(".prem-faqs")).h;
await click(".prem-faqs details.wl-faq summary");
const fo = await ev(`(() => { const d = document.querySelector(".prem-faqs details.wl-faq"); return { open: d.open, anim: getComputedStyle(d.querySelector("p")).animationName, rot: getComputedStyle(d.querySelector("summary"), "::after").transform }; })()`);
ok("opening a question shows the answer with a short fade-in, grows the card, and turns the chevron", fo.open && /faqin/.test(fo.anim) && (await g(".prem-faqs")).h > hClosed + 20 && fo.rot !== "none", JSON.stringify(fo));
await ev(`document.querySelector(".prem-faqs details.wl-faq summary").focus(); true`);
await click(".prem-faqs details.wl-faq summary");
ok("it closes again, and the questions are still keyboard operable <details> elements", await ev(`!document.querySelector(".prem-faqs details.wl-faq").open && document.querySelectorAll(".prem-faqs details.wl-faq > summary").length === 3`));
ok("About Premium keeps its text and has a crown watermark that is hidden from screen readers", await ev(`(() => { const a = document.querySelector(".prem-about"), c = a.querySelector(".pa-crown"); return /About Premium/.test(a.textContent) && c.getAttribute("aria-hidden") === "true" && !!c.querySelector(".ico, svg") && getComputedStyle(c).pointerEvents === "none"; })()`));
for (const mode of ["light", "dark", "oled"]) { await setMode(mode); await goto("#/premium"); await sleep(300);
  const e1 = await worstContrast(".prem-about > :not(.pa-crown)", ".prem-about .eyebrow"), e2 = await worstContrast(".prem-about > :not(.pa-crown)", ".prem-about p");
  const e3 = await contrast(".prem-stays .ps-title", ".prem-stays"), e4 = await contrast(".prem-stays .eyebrow", ".prem-stays"), e5 = await contrast(".prem-stays .wl-pill", ".prem-stays .wl-pill");
  ok(`${mode}: the About eyebrow and text (over the real gold gradient and crown), the heading, the eyebrow and the tiles meet 4.5:1`, e1 >= 4.5 && e2 >= 4.5 && e3 >= 4.5 && e4 >= 4.5 && e5 >= 4.5, [e1, e2, e3, e4, e5].map(x => x.toFixed(2)).join(","));
  await shot("premium-1280-" + mode); }
await setMode("light"); await view(390, 844); await goto("#/premium"); await sleep(500);
const pp = await ev(`(() => { const ps = [...document.querySelectorAll(".prem-stays .wl-pill")].map(p => p.getBoundingClientRect()); return { sw: document.documentElement.scrollWidth, iw: innerWidth, cols: new Set(ps.map(r => Math.round(r.left))).size, fit: ps.every(r => r.left >= 0 && r.right <= innerWidth), h: ps.every(r => r.height >= 43.5) }; })()`);
ok("on a phone the tiles stack in one column, fit, and the page does not scroll sideways", pp.sw <= pp.iw && pp.cols === 1 && pp.fit && pp.h, JSON.stringify(pp));
await shot("premium-390"); await view(1280, 900);

console.log("--- 12. Spanish: the new words are translated");
await ev(`wlaSetLang("es"); true`); await sleep(500);
await goto("#/nutrition"); await sleep(500);
ok("Spanish: + Log reads + Registrar, with a Spanish name for the meal slot", await ev(`(() => { const b = document.querySelector(".mt-log"); return b.textContent.trim() === "+ Registrar" && /^Registrar /.test(b.getAttribute("aria-label")) && !/Breakfast|Lunch|Dinner/.test(b.getAttribute("aria-label")); })()`), await ev(`document.querySelector(".mt-log")?.getAttribute("aria-label")`));
ok("Spanish: the privacy accordion and the hover hint are translated", await ev(`(() => { const t = document.querySelector("#sec-nutrition")?.innerText || document.body.innerText; return /Cómo funciona la privacidad|Pasa el cursor sobre una barra/.test(t); })()`));
ok("Spanish: Guess, the menu button, the drinks tile and the weight units are translated, and Estimar sits beside the calories box", await ev(`(() => { const t = document.querySelector("#sec-nutrition").innerText, b = document.querySelector(".nl-guess"), i = document.getElementById("m-cal"); return b.textContent.trim() === "Estimar" && b.getBoundingClientRect().left >= i.getBoundingClientRect().right - 1 && /Ver el menú de hoy/.test(t) && /Bebidas · Alcohol/.test(t) && /Acepta lb, kg o st/.test(t) && i.placeholder === "Del catálogo"; })()`), await ev(`[document.querySelector(".nl-guess")?.textContent, document.querySelector(".nl-guess")?.getBoundingClientRect().width, document.getElementById("m-cal")?.placeholder].join(" | ")`));
ok("Spanish: the Calories hint fits beside Estimar", await fits("m-cal"));
await goto("#/workouts"); await sleep(500);
ok("Spanish: the new Workouts rows are translated (the import card, the estimate pill, the minute chips and the stepper names)", await ev(`(() => { const t = document.getElementById("app").innerText, lab = s => document.querySelector(s)?.getAttribute("aria-label"); return /Importar entrenamientos/.test(t) && /Añade los minutos para una estimación/.test(t) && lab(".wk-presets") === "Minutos rápidos" && lab('[data-act="wgoal"][data-d="1"]') === "Más entrenamientos por semana" && !/Import workouts|Add minutes for an estimate/.test(t); })()`), await ev(`[document.querySelector(".wk-presets")?.getAttribute("aria-label"), document.querySelector('[data-act="wgoal"][data-d="1"]')?.getAttribute("aria-label")].join("|")`));
await goto("#/coach"); await ev(`SB.user = { id: "u_me" }; P().coachChatConsent = true; UI.wlc = {}; render(); true`); await sleep(500);
ok("Spanish: the coach note, the suggested questions and the Ask button are translated", await ev(`(() => { const t = document.getElementById("wlc").innerText; return /Aún no ve tus registros/.test(t) && /¿Qué debo comer después de entrenar\\?/.test(t) && document.querySelector('[data-act="wlc-send"]').textContent.trim() === "Preguntar" && !/Suggested questions/.test(t); })()`), await ev(`document.getElementById("wlc")?.innerText.slice(0, 300)`));
ok("Spanish: the coach page's headline, days strip and five-questions pill are translated", await (async () => { await ev(`P().coach = Object.assign(P().coach || {}, { baseline: null, skipped: false }); render(); true`); await sleep(400); return ev(`(() => { const v = document.querySelector(".cc-verdict h3").textContent, s = document.querySelector(".cc-strip").innerText, n = document.querySelector("#coach-nudge .pill-goal")?.textContent; return !/^(Keep it moderate|Good week to push|Hold the volume|Train as planned)$/.test(v) && /Días con comida registrada/.test(s) && /de los últimos 7/.test(s) && n === "0 de 5 respondidas"; })()`); })(), await ev(`[document.querySelector(".cc-verdict h3")?.textContent, document.querySelector(".cc-strip")?.innerText, document.querySelector("#coach-nudge .pill-goal")?.textContent].join(" | ")`));
await click('.wlc-chips .chip');
ok("Spanish: a suggested question fills the box in Spanish", await ev(`document.getElementById("wlc-q").value === "¿Qué debo comer después de entrenar?"`), await ev(`document.getElementById("wlc-q")?.value`));
await goto("#/settings/appearance"); await sleep(500);
ok("Spanish: Smooth, the presets and the demo are translated", await ev(`(() => { const t = document.body.innerText; return /Suave/.test(t) && /Esmerilado 35%/.test(t) && /Equilibrado 70%/.test(t) && /Sólido 100%/.test(t) && /Probar este movimiento/.test(t) && /Calorías de hoy/.test(t); })()`), await ev(`[...document.querySelectorAll(".op-presets .chip, .mo-demo *")].map(x => x.textContent.trim()).filter(Boolean).join("|")`));
await goto("#/settings/profile"); await ev(`Object.assign(P(), { name: "", age: null }); render(); true`); await sleep(400);
ok("Spanish: the quick setup row is translated", await ev(`/Configuración rápida: toca para completar/.test(document.querySelector(".pf-quick")?.textContent || "") && /\\+ Añadir nombre/.test(document.querySelector(".pf-quick").textContent)`), await ev(`document.querySelector(".pf-quick")?.textContent`));
await ev(`wlaSetLang("en"); true`); await sleep(300);

await ev(`Object.assign(P(), window.__keep); saveProfile(); render(); true`);

console.log("--- 13. axe on the new states: WCAG 2.2 AA and best practice, 1280 and 390px, light and dark");
const AXE_VERSION = "4.10.2";
let AXE = ""; try { AXE = process.env.AXE_JS ? readFileSync(process.env.AXE_JS, "utf8") : await (await fetch(`https://cdn.jsdelivr.net/npm/axe-core@${AXE_VERSION}/axe.min.js`)).text(); } catch {}
if (AXE.length < 100000) console.log("SKIP  axe-core is not available here (set AXE_JS to a copy of axe.min.js); a11y.mjs fails when it is missing, so this is not hidden");
else {
  await ev(AXE + "\n;true");
  const AXE_RUN = `(async () => { const x = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }); return x.violations.map(v => v.id + " (" + v.impact + "): " + v.nodes.length + " e.g. " + v.nodes[0].target.join(" ") + " " + (v.nodes[0].any[0] || v.nodes[0].all[0] || v.nodes[0].none[0] || {}).message); })()`;
  const AX = {
    "Nutrition, photo opt-in with the privacy details closed": { js: `P().photoAiConsent = false; location.hash = "#/nutrition"; render(); true`, see: "#food-photo-optin details.po-how:not([open])" },
    "Nutrition, privacy details open": { js: `P().photoAiConsent = false; location.hash = "#/nutrition"; render(); setTimeout(() => document.querySelector("#food-photo-optin details.po-how summary")?.click(), 100); true`, see: "#food-photo-optin details.po-how[open]" },
    "Workouts": { js: `location.hash = "#/workouts"; render(); true`, see: ".wk-goal .day-dot" },
    "Nutrition with today's menu and the drinks panel open": { js: `UI.nmMenu = true; UI.drinkOpen = true; location.hash = "#/nutrition"; render(); true`, see: "#drinks-panel" },
    "Coach page with the five questions strip": { js: `UI.nmMenu = false; UI.drinkOpen = false; P().coach = Object.assign(P().coach || {}, { baseline: null, skipped: false }); location.hash = "#/coach"; render(); true`, see: "#coach-nudge .pill-goal" },
    "Coach chat signed out": { js: `SB.user = null; UI.wlc = {}; location.hash = "#/coach"; render(); true`, see: '#wlc [data-act="sb-open"]' },
    "Coach chat with a conversation": { js: `SB.user = { id: "u_me", email: "me@example.com" }; UI.wlc = { msgs: [{ me: true, t: "What should I eat?" }, { me: false, t: "Eggs and plantain." }] }; location.hash = "#/coach"; render(); true`, see: ".wlc-msg.me" },
    "Coach chat while it thinks": { js: `UI.wlc = { msgs: [{ me: true, t: "Hello" }], busy: true }; location.hash = "#/coach"; render(); true`, see: ".wlc-typing" },
    "Profile with quick setup chips": { js: `Object.assign(P(), { name: "", age: null, heightCm: null }); location.hash = "#/settings/profile"; render(); true`, see: ".pf-quick .pf-q" },
    "Appearance with the glass at 35%": { js: `P().look = Object.assign(P().look || {}, { opacity: .35 }); applyOpacity(P()); location.hash = "#/settings/appearance"; render(); true`, see: ".gp-card" },
    "Premium with a question open": { js: `location.hash = "#/premium"; render(); setTimeout(() => document.querySelector(".prem-faqs details.wl-faq summary")?.click(), 100); true`, see: ".prem-faqs details.wl-faq[open]" }
  };
  for (const mode of ["light", "dark"]) { await setMode(mode);
    for (const w of [1280, 390]) { await view(w, 900); const bad = [];
      for (const [name, st] of Object.entries(AX)) {
        await ev(st.js); const seen = await waitFor(`!!document.querySelector(${JSON.stringify(st.see)})`, 4000); await sleep(300);
        if (!seen) { bad.push(name + ": expected state did not appear"); continue; }
        bad.push(...(await ev(AXE_RUN)).map(x => name + ": " + x));
        await ev(`Object.assign(P(), window.__keep); P().look.opacity = 1; applyOpacity(P()); UI.wlc = {}; P().photoAiConsent = false; true`); }
      ok(`${w}px ${mode}: ${Object.keys(AX).length} new states, no axe violations`, bad.length === 0, bad.slice(0, 3).join(" || ")); } }
  await view(1280, 900); await setMode("light");
}

ok("no script errors during the run", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
