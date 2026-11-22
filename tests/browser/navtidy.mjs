import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/navtidy.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.5.5: the side menu and phone bottom bar, Today, Achievements, Health, Recipes and Coach layout, and even spacing.
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
}).listen(8842, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9402", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-navtidy-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9402/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8842/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30, sex: "female", goal: "build", coachPersona: "enforcer", coachName: "Coach Henry",
  widgets: [{ k: "calories", size: "s" }, { k: "steps", size: "m" }, { k: "meals", size: "m" }, { k: "coach", size: "l" }] });
  S.profiles = [p]; S.activeId = p.id; S.logs = {};
  for (let d = 0; d < 6; d++) { const date = addDays(today(), -d); addEntry("meals", { id: uid(), date, slot: "lunch", name: "Jollof rice", cal: 500 + d * 30, dish: "jollof", extras: [], est: false }); setVital(date, "steps", 8000 + d * 100); }
  saveProfile(); await flush(); render(); return true; })()`);
await ev(`P().widgets.find(w => w.k === "coach").size = "l"; render(); true`);
await goto("#/home");


const key = async (k, code, vk) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, text: k === "Enter" ? "\r" : undefined }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); await sleep(250); };
const nav = () => ev(`(() => { const s = document.querySelector(".side .nav"); if (!s) return null; const cur = [...s.querySelectorAll('[aria-current="page"]')].map(a => a.textContent.trim());
  const top = [...s.querySelectorAll(":scope > a, :scope > .navgrp > button.navdisc, :scope > .navgrp-tail a, :scope > .navgrp-tail button")].map(e => e.textContent.trim());
  const grp = Object.fromEntries([...s.querySelectorAll(".navgrp-disc")].map(g => { const b = g.querySelector("button.navdisc"), items = document.getElementById(b.getAttribute("aria-controls")); return [g.dataset.grp, { exp: b.getAttribute("aria-expanded"), ctl: !!items, hidden: !!items && getComputedStyle(items).display === "none", links: items ? [...items.querySelectorAll("a")].map(a => a.getAttribute("href")) : [] }]; }));
  return { cur, top, grp }; })()`);

console.log("--- 1. Side menu: a short top level with Log, Plan and Progress as disclosures");
await view(1280, 900); await goto("#/home"); await sleep(300);
await ev(`UI.navOpen = {}; try { localStorage.removeItem("wlh.navopen"); } catch {} UI.navKey = null; render(); true`); await sleep(200);
let nv = await nav();
ok("top level is Today, Log, Plan, Coach, Progress, Learn, then Premium and Settings", nv && nv.top.join("|").replace(/\s+/g, " ").startsWith("Today|Log|Plan|Coach|Progress|Learn") && /Premium/.test(nv.top.join()) && nv.top.includes("Settings"), JSON.stringify(nv));
ok("Today, Coach and Learn are links to #/home, #/coach and #/learn", await ev(`["#/home","#/coach","#/learn"].every(h => !!document.querySelector('.side .nav a[href="' + h + '"]'))`));
ok("no invented #/log, #/plan or #/progress routes", await ev(`!document.querySelector('.side .nav a[href="#/log"],.side .nav a[href="#/plan"],.side .nav a[href="#/progress"]')`));
ok("each disclosure has aria-expanded and aria-controls pointing at its list", nv && ["log", "plan", "progress"].every(g => nv.grp[g] && nv.grp[g].ctl && (nv.grp[g].exp === "true" || nv.grp[g].exp === "false")), JSON.stringify(nv && nv.grp));
ok("Log holds Meals, Snacks, Workouts; Plan holds Recipes, Culture; Progress holds Health, Achievements", nv && nv.grp.log.links.join() === "#/nutrition,#/snacks,#/workouts" && nv.grp.plan.links.join() === "#/recipes,#/culture" && nv.grp.progress.links.join() === "#/health,#/awards", JSON.stringify(nv && nv.grp));
ok("only Today is current on the Summary page", nv && nv.cur.length === 1 && /Today/.test(nv.cur[0]), JSON.stringify(nv && nv.cur));
await goto("#/nutrition"); await sleep(300); nv = await nav();
ok("opening Meals reveals Log and marks only Meals as the current page", nv && nv.grp.log.exp === "true" && !nv.grp.log.hidden && nv.cur.length === 1 && /Meals/.test(nv.cur[0]), JSON.stringify(nv));
await goto("#/metric/steps"); await sleep(300); nv = await nav();
ok("a health metric page reveals Progress with Health data current", nv && nv.grp.progress.exp === "true" && nv.cur.length === 1 && /Health data/.test(nv.cur[0]), JSON.stringify(nv));
await goto("#/recipes"); await sleep(300); nv = await nav();
ok("the recipes page reveals Plan, and Log is still as the person left it (open)", nv && nv.grp.plan.exp === "true" && nv.grp.log.exp === "true" && /Recipes/.test(nv.cur[0] || ""), JSON.stringify(nv));
await ev(`document.querySelector('.side .nav button.navdisc[data-v="log"]').click(); true`); await sleep(250); nv = await nav();
ok("clicking a disclosure shuts it, hides the list and keeps the current page", nv && nv.grp.log.exp === "false" && nv.grp.log.hidden && /Recipes/.test(nv.cur[0] || ""), JSON.stringify(nv));
ok("a shut group's links are out of the keyboard order (display none)", await ev(`getComputedStyle(document.getElementById("ngi-log")).display === "none"`));
await ev(`document.querySelector('.side .nav button.navdisc[data-v="log"]').focus(); true`); await key("Enter", "Enter", 13); nv = await nav();
ok("Enter on the focused disclosure opens it again and focus stays on it", nv && nv.grp.log.exp === "true" && await ev(`document.activeElement?.dataset?.v === "log"`), JSON.stringify(nv && nv.grp.log));
ok("the choice is kept on this device only (wlh.navopen)", await ev(`(() => { try { return JSON.parse(localStorage.getItem("wlh.navopen")).log === true; } catch { return false; } })()`));
ok("every menu row is at least 44px tall", await ev(`[...document.querySelectorAll(".side .nav a, .side .nav button")].filter(e => e.offsetParent && e.getBoundingClientRect().height).every(e => e.getBoundingClientRect().height >= 43.5)`), await ev(`[...document.querySelectorAll(".side .nav a, .side .nav button")].filter(e => e.offsetParent && e.getBoundingClientRect().height).map(e => e.textContent.trim() + ":" + e.getBoundingClientRect().height).join(" ")`));
ok("group rows use flat line icons, no gradient tile", await ev(`(() => { const t = document.querySelector(".side .nav button.navdisc .si-tile"); const cs = getComputedStyle(t); return cs.backgroundImage === "none"; })()`));
await shot("nav-desktop");

console.log("--- 2. Phone: bottom bar and the Log, Plan and More sheets");
await view(390, 800); await goto("#/home"); await sleep(400);
const bb = () => ev(`(() => { const b = document.querySelector(".bottombar"); if (!b || getComputedStyle(b).display === "none") return null; const items = [...b.querySelectorAll(".bb-item")]; const r = b.getBoundingClientRect(), m = document.querySelector(".main"); return { n: items.length, labels: items.map(i => i.textContent.trim()), minH: Math.min(...items.map(i => i.getBoundingClientRect().height)), minW: Math.min(...items.map(i => i.getBoundingClientRect().width)), pos: getComputedStyle(b).position, bottom: Math.round(r.bottom) === innerHeight, h: Math.round(r.height), padB: parseFloat(getComputedStyle(m).paddingBottom), side: getComputedStyle(document.querySelector(".side")).display, toggle: getComputedStyle(document.querySelector(".menu-toggle")).display, hscroll: document.documentElement.scrollWidth > innerWidth, aria: b.getAttribute("aria-label") }; })()`);
let b1 = await bb();
ok("five labelled targets: Today, Log, Plan, Coach, More", b1 && b1.n === 5 && b1.labels.join() === "Today,Log,Plan,Coach,More", JSON.stringify(b1));
ok("each target is at least 44px both ways and the bar is fixed to the bottom", b1 && b1.minH >= 44 && b1.minW >= 44 && b1.pos === "fixed" && b1.bottom, JSON.stringify(b1));
ok("page padding clears the bar so nothing sits under it", b1 && b1.padB >= b1.h, JSON.stringify(b1));
ok("the desktop menu and hamburger are not shown beside it, and nothing scrolls sideways", b1 && b1.side === "none" && b1.toggle === "none" && !b1.hscroll, JSON.stringify(b1));
ok("Today is current on the Summary page", await ev(`document.querySelector('.bottombar a[href="#/home"]').getAttribute("aria-current") === "page"`));
await ev(`document.querySelector('.bottombar [data-v="log"]').focus(); document.querySelector('.bottombar [data-v="log"]').click(); true`); await sleep(500);
const sheet = () => ev(`(() => { const c = document.querySelector(".navsheet .pop-card"); if (!c) return null; const h = c.querySelector("h2"); return { role: c.getAttribute("role"), modal: c.getAttribute("aria-modal"), name: document.getElementById(c.getAttribute("aria-labelledby"))?.textContent, links: [...c.querySelectorAll(".sheet-link")].map(a => a.getAttribute("href")), focusIn: c.contains(document.activeElement), close: !!c.querySelector('[data-pop="close"]'), minH: Math.min(...[...c.querySelectorAll(".sheet-link,.sheet-x")].map(a => a.getBoundingClientRect().height)), bg: getComputedStyle(c).backgroundColor, exp: document.querySelector('.bottombar [data-v="log"]').getAttribute("aria-expanded"), bottom: Math.round(c.getBoundingClientRect().bottom) }; })()`);
let sh = await sheet();
ok("Log opens a labelled modal sheet with its three real destinations", sh && sh.role === "dialog" && sh.modal === "true" && sh.name === "Log" && sh.links.join() === "#/nutrition,#/snacks,#/workouts", JSON.stringify(sh));
ok("focus moves into the sheet, its rows are 44px or more, and the trigger shows aria-expanded=true", sh && sh.focusIn && sh.minH >= 44 && sh.exp === "true", JSON.stringify(sh));
ok("the sheet has a visible close control and a solid background", sh && sh.close && !/rgba\(.*,\s*0(\.\d+)?\)$/.test(sh.bg) && sh.bg !== "rgba(0, 0, 0, 0)", JSON.stringify(sh));
await key("Tab", "Tab", 9); await key("Tab", "Tab", 9); await key("Tab", "Tab", 9); await key("Tab", "Tab", 9); await key("Tab", "Tab", 9);
ok("Tab stays inside the sheet", await ev(`!!document.querySelector(".navsheet .pop-card")?.contains(document.activeElement)`));
const hashBefore = await ev(`location.hash`);
await key("Escape", "Escape", 27); await sleep(400);
ok("Escape closes the sheet without navigating and gives focus back to Log", !(await sheet()) && await ev(`location.hash`) === hashBefore && await ev(`document.activeElement?.dataset?.v === "log" && document.activeElement.getAttribute("aria-expanded") === "false"`), await ev(`document.activeElement?.outerHTML?.slice(0, 120)`));
await ev(`document.querySelector('.bottombar [data-v="plan"]').click(); true`); await sleep(400);
sh = await sheet();
ok("Plan lists Recipes and Food culture", sh && sh.name === "Plan" && sh.links.join() === "#/recipes,#/culture", JSON.stringify(sh));
await ev(`document.querySelector('.navsheet .pop-scrim').click(); true`); await sleep(400);
ok("tapping the backdrop closes it", !(await sheet()));
await ev(`document.querySelector('.bottombar [data-v="more"]').click(); true`); await sleep(400);
sh = await sheet();
ok("More lists Health data, Achievements & Goals, Learn, Premium and Settings", sh && sh.name === "More" && sh.links.join() === "#/health,#/awards,#/learn,#/premium,#/settings", JSON.stringify(sh));
await ev(`document.querySelector('.navsheet .sheet-link[href="#/awards"]').click(); true`); await sleep(600);
ok("choosing a row closes the sheet and goes there", !(await sheet()) && await ev(`location.hash`) === "#/awards" && await ev(`document.querySelector('.bottombar [data-v="more"]').classList.contains("on")`));
ok("Achievements keeps the last row clear of the bar (page padding)", await ev(`parseFloat(getComputedStyle(document.querySelector(".main")).paddingBottom) >= document.querySelector(".bottombar").getBoundingClientRect().height`));
await ev(`document.querySelector('.bottombar [data-v="log"]').click(); true`); await sleep(300);
await ev(`location.hash = "#/coach"; true`); await sleep(500);
ok("a hash change closes an open sheet", !(await sheet()));
await ev(`wlaSetLang("es"); true`); await sleep(500);
b1 = await bb();
ok("Spanish: bottom bar labels and name are translated", b1 && b1.labels.join() === "Hoy,Registrar,Planificar,Entrenador,Más" || (b1 && /^Hoy,/.test(b1.labels.join()) && /Más$/.test(b1.labels.join()) && b1.aria === "Navegación móvil"), JSON.stringify(b1));
await ev(`document.querySelector('.bottombar [data-v="more"]').click(); true`); await sleep(400);
sh = await sheet();
ok("Spanish: the More sheet title and Close label are translated", sh && sh.name === "Más" && await ev(`document.querySelector('.navsheet .sheet-x').getAttribute("aria-label") === "Cerrar"`), JSON.stringify(sh));
await key("Escape", "Escape", 27); await sleep(300);
await ev(`wlaSetLang("en"); true`); await sleep(300);
await ev(`document.querySelector('.bottombar [data-v="log"]').click(); true`); await sleep(300);
await view(1280, 900); await sleep(400);
ok("growing past phone width closes an open sheet", !(await sheet()));
await view(390, 800); await sleep(300);
await shot("nav-phone");

console.log("--- 3. Even spacing and one-row header");
await view(1280, 900); await goto("#/home"); await sleep(400);
const sp = await ev(`(() => { const q = s => document.querySelector(s), r = e => e.getBoundingClientRect(); const side = r(q(".side")), wrap = r(q(".wrap")); const cards = [...document.querySelectorAll(".wrap > section > *, .wrap > section > .stack > *")]; const gaps = [], names = []; const kids = [...q(".wrap .section.active").children].filter(e => e.getBoundingClientRect().height > 0); for (let i = 1; i < kids.length; i++) { gaps.push(Math.round(r(kids[i]).top - r(kids[i - 1]).bottom)); names.push((kids[i - 1].className || kids[i - 1].tagName) + " > " + (kids[i].className || kids[i].tagName)); } const head = q(".page-head"), hr = r(head); return { gapToMenu: Math.round(wrap.left - side.right), gaps, names, headH: Math.round(hr.height), actions: !!q(".ph-right .page-head-actions"), wrapR: Math.round(wrap.right), vw: innerWidth }; })()`);
ok("content starts within 24px of the side menu", sp.gapToMenu >= 0 && sp.gapToMenu <= 24, JSON.stringify(sp));
ok("cards on Summary are 12px apart (the app's card gap), none wider than 16px", sp.gaps.length > 3 && sp.gaps.every(g => g >= 0 && g <= 16) && sp.gaps.filter(g => g === 12).length >= sp.gaps.length - 1, JSON.stringify(sp));
ok("the page header (title, Snack, Log a meal, clock, bell) fits in one row at desktop width", sp.actions && sp.headH <= 90, JSON.stringify(sp));
await view(1180, 820); await goto("#/settings"); await sleep(400);
ok("tablet width: content sits beside the menu with no horizontal scroll", await ev(`(() => { const w = document.querySelector(".wrap").getBoundingClientRect(), s = document.querySelector(".side").getBoundingClientRect(); return w.left - s.right <= 24 && !(document.documentElement.scrollWidth > innerWidth); })()`));
ok("the Web app layout is gone: a saved choice is ignored", await ev(`(() => { P().look = { ...(P().look || {}), layout: "webapp" }; saveProfile(); applyLook(); return !document.documentElement.dataset.layout; })()`));
await ev(`P().look = { ...(P().look || {}) }; delete P().look.layout; saveProfile(); applyLook(); true`);

console.log("--- 4. Today: a next step first, rings and coming up aligned");
await view(1440, 900); await goto("#/home"); await sleep(500);
await ev(`P().widgets = [{ k: "calories", size: "s" }]; try { setVital(today(), "water", 0); } catch {} render(); true`); await sleep(300);
const td = await ev(`(() => { const r = e => e && e.getBoundingClientRect(); const ns = document.querySelector(".nextstep"), g = document.querySelector(".today-grid"), rings = g && g.children[0], col = g && g.querySelector(".today-col"), cu = document.getElementById("wlComingUp"); return { ns: !!ns, nsTop: ns && Math.round(r(ns).top), nsText: ns && ns.querySelector(".ns-title").textContent, cta: ns && ns.querySelector("a")?.textContent.trim(), href: ns && ns.querySelector("a")?.getAttribute("href"), ringsTop: rings && Math.round(r(rings).top), colTop: col && Math.round(r(col).top), cols: g && getComputedStyle(g).gridTemplateColumns.split(" ").length, cuIn: !!cu && col.contains(cu), strip: Math.round(r(document.querySelector(".profstrip")).bottom), minBtn: ns && r(ns.querySelector("a")).height }; })()`);
ok("a Next step card comes right after the greeting, before the rings", td.ns && td.nsTop >= td.strip && td.nsTop < td.ringsTop, JSON.stringify(td));
ok("it names a real thing to do with a matching button (water to go, Log water)", /Water/.test(td.nsText || "") && td.cta === "Log water" && td.href === "#/metric/water" && td.minBtn >= 43.5, JSON.stringify(td));
ok("the rings card and the Coming up column share a top edge on a wide screen", td.cols === 2 && td.ringsTop === td.colTop && td.cuIn, JSON.stringify(td));
await ev(`setVital(today(), "water", WATER_GOAL_ML); render(); true`); await sleep(300);
ok("with everything done it says so and offers no made-up task", await ev(`(() => { const ns = document.querySelector(".nextstep"); return /all caught up/i.test(ns.textContent) && !ns.querySelector("a"); })()`));
await ev(`setVital(today(), "water", 0); render(); true`); await sleep(200);
await view(390, 800); await sleep(400);
ok("on a phone it reads in order: next step, rings, coming up, score", await ev(`(() => { const t = s => document.querySelector(s)?.getBoundingClientRect().top; const a = t(".nextstep"), b = t(".today-grid > :first-child"), c = t("#wlComingUp"), d = t("#wlScore"); return a < b && b < c && (d == null || c < d); })()`));
await shot("today-phone");

console.log("--- 5. Achievements: Earned / All / Locked, 24 at a time");
await view(1280, 900);
await ev(`addEntry("workouts", { id: uid(), date: today(), type: "run", minutes: 30, name: "Run" }); refreshAwards(P()); true`); await goto("#/awards"); await sleep(500);
const bg = () => ev(`(() => { const g = document.getElementById("badgeGallery"); const n = [...g.querySelectorAll(".badge")]; const f = [...g.querySelectorAll('[data-act="badge-filter"]')]; return { n: n.length, filters: f.map(b => b.textContent.trim().replace(/\\s+/g, " ")), pressed: f.filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.dataset.v), status: g.querySelector('[role="status"]')?.textContent, more: g.querySelector('[data-act="badge-more"]')?.textContent.trim(), earned: n.filter(b => b.classList.contains("earned")).length, descs: n.every(b => b.querySelector(".tiny.muted")?.textContent.trim().length > 3), titles: n.filter(b => b.hasAttribute("title")).length, total: BADGES.length, earnedAll: BADGES.filter(b => badgeEarned(P(), b.k)).length }; })()`);
let bgs = await bg();
ok("there is at least one earned badge to test with", bgs.earnedAll >= 1, JSON.stringify(bgs));
ok("Earned is the first view when something is earned, and every card shown is earned", bgs.pressed.join() === "earned" && bgs.n === bgs.earnedAll && bgs.earned === bgs.n, JSON.stringify(bgs));
ok("filter buttons carry exact counts", bgs.filters[0] === `Earned (${bgs.earnedAll})` && bgs.filters[1] === `All (${bgs.total})` && bgs.filters[2] === `Locked (${bgs.total - bgs.earnedAll})`, JSON.stringify(bgs.filters));
ok("no badge shows its description only in a title tooltip: each has visible text", bgs.descs && bgs.titles === 0, JSON.stringify(bgs));
await ev(`document.querySelector('#badgeGallery [data-v="all"]').click(); true`); await sleep(300); bgs = await bg();
ok("All shows at most 24 first, says how many of how many, and has Show more", bgs.n === 24 && bgs.status === `Showing 24 of ${bgs.total}` && /Show more \(\d+ left\)/.test(bgs.more || ""), JSON.stringify(bgs));
ok("earned badges come first in All", await ev(`(() => { const n = [...document.querySelectorAll("#badgeGallery .badge")]; const first = n.findIndex(b => !b.classList.contains("earned")); return n.slice(0, first < 0 ? n.length : first).every(b => b.classList.contains("earned")) && n.slice(first).every(b => !b.classList.contains("earned")); })()`));
await ev(`document.querySelector('#badgeGallery [data-act="badge-more"]').focus(); true`); await key("Enter", "Enter", 13); bgs = await bg();
ok("Show more by keyboard adds 24, updates the count and moves focus to the first new badge", bgs.n === 48 && bgs.status === `Showing 48 of ${bgs.total}` && await ev(`document.activeElement?.classList.contains("badge") && document.activeElement.dataset.i === String([...document.querySelectorAll("#badgeGallery .badge")][24].dataset.i)`), JSON.stringify(bgs));
await ev(`document.querySelector('#badgeGallery [data-v="locked"]').click(); true`); await sleep(300); bgs = await bg();
ok("changing the filter resets the batch to 24 and Locked holds no earned badge", bgs.n === 24 && bgs.earned === 0 && bgs.pressed.join() === "locked" && bgs.status === `Showing 24 of ${bgs.total - bgs.earnedAll}`, JSON.stringify(bgs));
ok("the Achievements page has no widget grid or Widgets title", await ev(`!document.querySelector(".wsec, .wgrid, [data-act='wl-edit']")`));

console.log("--- 6. Health: one category at a time, search looks everywhere");
await view(1280, 900); await goto("#/health"); await sleep(500);
const hl = () => ev(`(() => { const secs = [...document.querySelectorAll(".health-sec")]; const chips = [...document.querySelectorAll('[data-act="health-cat"]')]; return { secs: secs.map(s => s.id), pressed: chips.filter(c => c.getAttribute("aria-pressed") === "true").map(c => c.dataset.v), cards: [...document.querySelectorAll(".health-sec .mgrid > *")].length, status: document.querySelector(".hs-status")?.textContent.trim(), q: document.getElementById("browse-q")?.value, minChip: Math.min(...chips.map(c => c.getBoundingClientRect().height)), empty: document.querySelector(".health-sec ~ .empty, .empty")?.textContent }; })()`);
let hh = await hl();
ok("by default one category section shows, and its chip is pressed", hh.secs.length === 1 && hh.pressed.length === 1 && hh.secs[0] === "sec-" + hh.pressed[0], JSON.stringify(hh));
ok("category buttons are 44px tall", hh.minChip >= 44, JSON.stringify(hh));
ok("a metric pinned as a widget is not drawn again in the category below", await ev(`(() => { const pins = wlGet(P(), "health").shown.map(w => w.k); return pins.length > 0 && pins.every(k => !document.querySelector('.health-sec a[href="#/metric/' + k + '"]')); })()`));
await ev(`document.querySelector('[data-act="health-cat"][data-v="sleep"]').click(); true`); await sleep(300); hh = await hl();
ok("choosing Sleep shows only Sleep", hh.secs.join() === "sec-sleep" && hh.pressed.join() === "sleep", JSON.stringify(hh));
await ev(`(() => { const i = document.getElementById("browse-q"); i.value = "oxygen"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`); await sleep(600); hh = await hl();
ok("searching 'oxygen' while Sleep is chosen finds it in another category and counts results", hh.secs.length >= 1 && !hh.secs.includes("sec-sleep") && /^\d+ results? across all categories$/.test(hh.status) && Number(hh.status.match(/^\d+/)[0]) === hh.cards && hh.pressed.length === 0, JSON.stringify(hh));
ok("typing kept focus in the search box", await ev(`document.activeElement?.id === "browse-q"`));
await ev(`(() => { const i = document.getElementById("browse-q"); i.value = "zzzz"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`); await sleep(600); hh = await hl();
ok("a search with no match shows an empty message and zero results", /Nothing matches/.test(hh.empty || "") && /^0 results/.test(hh.status), JSON.stringify(hh));
await ev(`(() => { const i = document.getElementById("browse-q"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`); await sleep(600); hh = await hl();
ok("clearing the search brings back the chosen category (Sleep)", hh.secs.join() === "sec-sleep" && hh.pressed.join() === "sleep" && hh.status === "", JSON.stringify(hh));

console.log("--- 7. Recipes: readable names, 3 / 2 / 1 columns, allergy line whole");
await ev(`P().allergies = "peanuts"; saveProfile(); true`);
const rc = () => ev(`(() => { const cards = [...document.querySelectorAll(".dpv")]; const lefts = [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().left)))]; const h3 = document.querySelector(".dpv-main h3"), cs = getComputedStyle(h3); const small = [...document.querySelectorAll(".dpv-main .small")]; const hit = small.find(s => /Contains/.test(s.textContent)); const btn = document.querySelector(".dpv-btn").getBoundingClientRect(); return { n: cards.length, cols: lefts.length, ws: cs.whiteSpace, clamp: cs.webkitLineClamp, truncated: h3.scrollWidth > h3.clientWidth + 1, titleOk: [...document.querySelectorAll(".dpv-main")].every(a => a.getAttribute("title") === a.querySelector("h3").textContent), smallWrap: small.every(s => getComputedStyle(s).whiteSpace === "normal"), hit: hit ? hit.scrollWidth <= hit.clientWidth + 1 : null, btnW: Math.round(btn.width), btnH: Math.round(btn.height), hscroll: document.documentElement.scrollWidth > innerWidth, rowTops: [...new Set(cards.slice(0, 3).map(c => Math.round(c.getBoundingClientRect().top)))].length }; })()`);
await view(1440, 900); await goto("#/recipes"); await sleep(600);
let rr = await rc();
ok("desktop: three cards across, no more", rr.n === 12 && rr.cols === 3, JSON.stringify(rr));
ok("names wrap to two lines instead of one clipped line, and the full name is on the link", rr.ws === "normal" && rr.clamp === "2" && !rr.truncated && rr.titleOk, JSON.stringify(rr));
ok("the preview button is 44px", rr.btnW >= 44 && rr.btnH >= 44, JSON.stringify(rr));
ok("cards in the first row line up", rr.rowTops === 1, JSON.stringify(rr));
await view(820, 1100); await sleep(500); rr = await rc();
ok("tablet: two cards across", rr.cols === 2 && !rr.hscroll, JSON.stringify(rr));
await view(390, 800); await sleep(500); rr = await rc();
ok("phone: one card across and no sideways scroll", rr.cols === 1 && !rr.hscroll, JSON.stringify(rr));
ok("small text under a name wraps (nothing is cut off with an ellipsis)", rr.smallWrap, JSON.stringify(rr));
await ev(`(() => { const hits = DISHES.filter(d => allergyHits(d, P()).length); UI.recFilter.q = hits[0]?.n || ""; UI.recPg = 1; render(); return !!hits.length; })()`); await sleep(300);
const al = await ev(`(() => { const small = [...document.querySelectorAll(".dpv-main .small")].find(s => /Contains/.test(s.textContent)); return small ? { text: small.textContent, whole: small.scrollWidth <= small.clientWidth + 1, h: small.getBoundingClientRect().height } : null; })()`).catch(() => null);
ok("an allergy line is shown whole (peanut allergy, a dish that has it)", al !== null && al.whole && al.h > 0, JSON.stringify(al));

console.log("--- 8. Coach opens with the conversation, then the questionnaire, then the plan");
await view(1280, 900); await goto("#/coach"); await sleep(600);
ok("order: greeting, chat, ask your coach, then the weekly plan; widgets after the plan", await ev(`(() => { const t = document.querySelector(".wrap").innerText; const i = s => t.indexOf(s); return i("Chat with your coach") >= 0 && i("Chat with your coach") < i("Questions about training or food") && i("Questions about training or food") < i("Your weekly plan") && (i("Edit widgets") < 0 || i("Your weekly plan") < i("Edit widgets")); })()`));
ok("the Coach page does not open with the widgets", await ev(`(() => { const w = document.querySelector(".wsec"), c = document.getElementById("wlc"); return !w || (c && (c.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0); })()`));

console.log("--- 9. Icon-only rail keeps every page reachable");
await view(1280, 900); await ev(`UI.rail = true; saveRail(true); render(); true`); await sleep(500);
const rl = await ev(`(() => { const links = [...document.querySelectorAll(".app.rail .side .nav a, .app.rail .side .nav button.prem-trigger")].filter(a => a.offsetParent); return { n: links.length, hrefs: links.map(a => a.getAttribute("href")).filter(Boolean), names: links.map(a => a.getAttribute("aria-label") || a.getAttribute("data-label") || a.textContent.trim()), shown: !!document.querySelector(".app.rail .navgrp-disc>.navdisc") && getComputedStyle(document.querySelector(".app.rail .navgrp-disc>.navdisc")).display }; })()`);
ok("every destination shows as an icon (12 rows) even when a group was left shut", rl.n >= 11 && ["#/home","#/nutrition","#/snacks","#/workouts","#/recipes","#/culture","#/coach","#/health","#/awards","#/learn","#/settings"].every(h => rl.hrefs.includes(h)), JSON.stringify(rl));
ok("each icon-only link has a name (label or tooltip text)", rl.names.every(n => n && n.length > 1), JSON.stringify(rl.names));
ok("the group header buttons are not drawn in the icon-only rail", rl.shown === "none", JSON.stringify(rl));
await ev(`UI.rail = false; saveRail(false); render(); true`);

ok("no page errors during any of this", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
