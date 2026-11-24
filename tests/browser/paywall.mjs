import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/paywall.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.6.3, restyled in 8.6.5 from the Premium comparison design: the Free vs Premium dialog (the paywall) as one flat table, a tile and a description on every row, real Premium list, accessible dialog, Spanish, three looks.
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
}).listen(8844, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9404", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-paywall-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9404/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8844/index.html?premium=0" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30, sex: "female", goal: "build", coachPersona: "enforcer", coachName: "Coach Henry",
  widgets: [{ k: "calories", size: "s" }, { k: "steps", size: "m" }, { k: "meals", size: "m" }, { k: "coach", size: "l" }] });
  S.profiles = [p]; S.activeId = p.id; S.logs = {};
  for (let d = 0; d < 6; d++) { const date = addDays(today(), -d); addEntry("meals", { id: uid(), date, slot: "lunch", name: "Jollof rice", cal: 500 + d * 30, dish: "jollof", extras: [], est: false }); setVital(date, "steps", 8000 + d * 100); }
  saveProfile(); await flush(); render(); return true; })()`);
await ev(`P().widgets.find(w => w.k === "coach").size = "l"; render(); true`);
await goto("#/home");

const key = async (k, code, vk, mods = 0) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await sleep(250); };
const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`); await sleep(400); };
const open = () => ev(`!!document.getElementById("pop-paywall")`);
const SPEC = `(() => { const pop = document.getElementById("pop-paywall"); if (!pop) return null; const card = pop.querySelector(".pop-card"); return { role: card.getAttribute("role"), modal: card.getAttribute("aria-modal"), name: card.getAttribute("aria-labelledby").split(" ").map(i => document.getElementById(i)?.textContent).join(" "), inside: card.contains(document.activeElement), active: document.activeElement?.className }; })()`;

// This page was opened with ?premium=0, so the viewer is on Free and the paywall can be reached the way a person reaches it.
await ev(`UI.editPage = null; true`);
await view(1280, 900); await goto("#/home"); await sleep(300);

console.log("--- 1. Opening it: from Go Premium, from a locked page, from Compare plans");
ok("a Free viewer sees Go Premium in the side menu", await ev(`!!document.querySelector('.side [data-act="paywall"]')`));
await ev(`document.querySelector('.side [data-act="paywall"]').focus(); document.querySelector('.side [data-act="paywall"]').click(); true`); await sleep(700);
let d = await ev(SPEC);
ok("Go Premium opens one dialog named WholeLife Hub Premium and Free vs Premium, with focus inside it", d && d.role === "dialog" && d.modal === "true" && d.name === "WholeLife Hub Premium Free vs Premium — everything side by side" && d.inside, JSON.stringify(d));
ok("focus starts on See plans", d && /fvp-cta/.test(d.active), d && d.active);
ok("there is only one paywall open, and the old bottom sheet is gone", await ev(`document.querySelectorAll("#pop-paywall").length === 1 && !document.querySelector(".pw-wrap")`));
await shot("paywall-1280-light");
await key("Escape", "Escape", 27); await sleep(300);
ok("Escape closes it and focus returns to Go Premium", !(await open()) && await ev(`document.activeElement === document.querySelector('.side [data-act="paywall"]')`));
await ev(`location.hash = "#/premium/grocery"; true`); await sleep(900);
ok("opening a locked page shows the paywall and puts the address back", await open() && await ev(`location.hash !== "#/premium/grocery"`), await ev(`location.hash`));
await ev(`closePaywall(); true`); await sleep(300);
await goto("#/premium"); await sleep(400);
ok("Compare plans on the Premium page opens it", await ev(`(() => { const b = document.querySelector('main [data-act="paywall"]'); if (!b) return false; b.click(); return true; })()`) && (await sleep(600), await open()));
await ev(`closePaywall(); true`); await sleep(300);

console.log("--- 2. The table: a real table, one flat list, a tile and a description on every row");
await ev(`openPaywall(); true`); await sleep(600);
const T = await ev(`(() => { const t = document.querySelector("#pop-paywall .fvp-table"); if (!t) return null;
  const cols = [...t.querySelectorAll("thead th")].map(x => ({ scope: x.getAttribute("scope"), txt: x.textContent.replace(/\\s+/g, " ").trim() }));
  const rows = [...t.querySelectorAll("tbody tr")].map(r => ({ name: r.querySelector(".fvp-fn").textContent.trim(), sub: r.querySelector(".fvp-fs")?.textContent.trim() || "", free: r.querySelector("td.fvp-fr").textContent.replace(/\\s+/g, " ").trim(), prem: r.querySelector("td.fvp-pr").textContent.replace(/\\s+/g, " ").trim(), th: r.querySelector("th").getAttribute("scope") }));
  return { tag: t.tagName, cap: t.querySelector("caption")?.textContent, cols, groups: t.querySelectorAll("tbody").length, rows }; })()`);
ok("it is a real table with a caption and Feature, Free and Premium column headers", T && T.tag === "TABLE" && T.cap && T.cols.map(c => c.scope).join() === "col,col,col" && /^Feature$/.test(T.cols[0].txt) && /^Free/.test(T.cols[1].txt) && /^Premium/.test(T.cols[2].txt), JSON.stringify(T && T.cols));
ok("the Free column says $0 forever and the Premium column shows both real prices", T && /\$0 forever/.test(T.cols[1].txt) && /\$7\.99\/mo · \$59\.99\/yr/.test(T.cols[2].txt), T && T.cols[2].txt);
ok("the prices come from PREMIUM_PLANS, not from the table", await ev(`(() => { const m = PREMIUM_PLANS.find(p => p.k === "monthly").amount, y = PREMIUM_PLANS.find(p => p.k === "yearly").amount; return document.querySelector("#pop-paywall .fvp-pr .fvp-price").textContent.includes(String(m)) && document.querySelector("#pop-paywall .fvp-pr .fvp-price").textContent.includes(String(y)); })()`));
ok("one flat list with no group headings", T && T.groups === 1 && await ev(`!document.querySelector("#pop-paywall .fvp-sec") && document.querySelectorAll("#pop-paywall tbody tr").length === document.querySelectorAll("#pop-paywall tbody th[scope=row]").length`), JSON.stringify(T && T.groups));
const NF = await ev(`PREMIUM_FEATURES.length`);
ok("one row per Premium feature plus the Core tracker, no duplicates", T && T.rows.length === NF + 1 && new Set(T.rows.map(r => r.name)).size === T.rows.length, T && T.rows.length + " rows for " + NF);
ok("every Premium feature name appears, and each row header is a row-scope th", await ev(`(() => { const names = [...document.querySelectorAll("#pop-paywall .fvp-fn")].map(e => e.textContent.trim()); return PREMIUM_FEATURES.every(f => names.includes(f.name)); })()`) && T.rows.every(r => r.th === "row"));
ok("the order is the Core tracker, then the Premium list in its own order", await ev(`JSON.stringify([...document.querySelectorAll("#pop-paywall .fvp-fn")].map(e => e.textContent.trim())) === JSON.stringify(["Core tracker", ...PREMIUM_FEATURES.map(f => f.name)])`));
ok("each Premium row shows that feature's own one-line description, read from the Premium list", await ev(`(() => { const subs = [...document.querySelectorAll("#pop-paywall tbody tr")].slice(1).map(r => r.querySelector(".fvp-fs")?.textContent.trim()); return PREMIUM_FEATURES.every((f, i) => subs[i] === f.blurb); })()`));
ok("Core tracker is on both plans and says what it covers", T && T.rows[0].name === "Core tracker" && /^Summary and rings, health data, meal, snack, drink and workout logging, full history, recipes and meal plans, achievements — free forever\.$/.test(T.rows[0].sub) && /Included in Free/.test(T.rows[0].free) && /Included in Premium/.test(T.rows[0].prem), JSON.stringify(T && T.rows[0]));
const bad = await ev(`(() => { const rows = {}; document.querySelectorAll("#pop-paywall tbody tr").forEach(r => rows[r.querySelector(".fvp-fn").textContent.trim()] = { free: r.querySelector("td.fvp-fr").textContent.replace(/\\s+/g, " ").trim(), prem: r.querySelector("td.fvp-pr").textContent.replace(/\\s+/g, " ").trim() });
  return PREMIUM_FEATURES.filter(f => { const r = rows[f.name]; return f.basic === "limited" ? !(r.free === "Limited" && r.prem === "Full") : !(/Not included/.test(r.free) && /Included in Premium/.test(r.prem)); }).map(f => f.id); })()`);
ok("each row matches the feature's own basic setting: Limited on Free and Full on Premium, or not on Free and included on Premium", bad.length === 0, JSON.stringify(bad));
ok("the Limited features are the four the app marks limited", await ev(`document.querySelectorAll("#pop-paywall td.fvp-fr .fvp-q").length === PREMIUM_FEATURES.filter(f => f.basic === "limited").length && document.querySelectorAll("#pop-paywall td.fvp-fr .fvp-q").length === 4`));
const LK = await ev(`(() => { const probe = document.createElement("i"); probe.style.color = "var(--good)"; document.body.append(probe); const good = getComputedStyle(probe).color; probe.remove(); const gold = (() => { const q = document.createElement("i"); q.style.color = "var(--gold)"; document.body.append(q); const c = getComputedStyle(q).color; q.remove(); return c; })();
  const tiles = [...document.querySelectorAll("#pop-paywall .fvp-ic")], r = tiles[0].getBoundingClientRect(), cks = [...document.querySelectorAll("#pop-paywall .fvp-ck")], th = document.querySelector("#pop-paywall .fvp-plan.gold");
  return { n: tiles.length, rows: document.querySelectorAll("#pop-paywall tbody tr").length, w: Math.round(r.width), h: Math.round(r.height), svg: tiles.every(t => !!t.querySelector("svg")), tileGold: tiles.every(t => getComputedStyle(t).color === gold), tileBg: getComputedStyle(tiles[0]).backgroundColor !== "rgba(0, 0, 0, 0)", ckGood: cks.length > 0 && cks.every(c => getComputedStyle(c).color === good), planGold: getComputedStyle(th).color === gold,
    left: [...document.querySelectorAll("#pop-paywall td")].every(c => getComputedStyle(c).textAlign === "left" || getComputedStyle(c).textAlign === "start"), crown: !!document.querySelector("#pop-paywall .fvp-crown svg"), h2: document.getElementById("fvp-title").textContent, sub: document.getElementById("fvp-sub").textContent }; })()`);
ok("every row has a 34px tile with a gold icon, and the plan name Premium is gold", LK.n === LK.rows && LK.w === 34 && LK.h === 34 && LK.svg && LK.tileGold && LK.tileBg && LK.planGold, JSON.stringify(LK));
ok("ticks are green, cells are left-aligned and the header is a crown, WholeLife Hub Premium and its subtitle", LK.ckGood && LK.left && LK.crown && LK.h2 === "WholeLife Hub Premium" && LK.sub === "Free vs Premium — everything side by side", JSON.stringify(LK));
ok("there is no AI Coach row (the coach is the same on both plans today)", !T.rows.some(r => /AI coach/i.test(r.name)));
ok("a feature added to the Premium list shows up by itself, last, with its own description", await ev(`(() => { PREMIUM_FEATURES.push({ id:"zz", icon:"pmCart", name:"Zed feature", phase:5, basic:"none", blurb:"A made-up feature for this check." }); closePaywall(); openPaywall(); const last = [...document.querySelectorAll("#pop-paywall tbody tr")].pop(); const okk = last.querySelector(".fvp-fn").textContent === "Zed feature" && last.querySelector(".fvp-fs").textContent === "A made-up feature for this check."; PREMIUM_FEATURES.pop(); return okk; })()`));
await sleep(500);

console.log("--- 3. Notice, footer and the See plans button");
const nt = await ev(`document.querySelector("#pop-paywall .fvp-notice")?.textContent.trim()`);
ok("while the beta is open the notice says every feature is free and some are still in testing", /^Beta: every feature is open and free while we finish testing\./.test(nt || "") && /Some features are still in testing and switch on as they pass\.$/.test(nt || ""), nt);
ok("the footer line is the designed one, with plus the rest. in gold", await ev(`document.querySelector("#pop-paywall .fvp-foot p").textContent.trim()`) === "Premium is everything in Free, in full, plus the rest." && await ev(`(() => { const q = document.createElement("i"); q.style.color = "var(--gold)"; document.body.append(q); const g = getComputedStyle(q).color; q.remove(); const sp = document.querySelector("#pop-paywall .fvp-foot p span"); return sp.textContent === "plus the rest." && getComputedStyle(sp).color === g; })()`));
await click('#pop-paywall [data-act="fvp-plans"]'); await sleep(400);
ok("See plans closes the dialog and goes to Settings > Premium", !(await open()) && await ev(`location.hash === "#/settings/premium"`), await ev(`location.hash`));
await goto("#/home");

console.log("--- 4. Keyboard, focus and closing");
await ev(`document.querySelector('.side [data-act="paywall"]').focus(); openPaywall(document.querySelector('.side [data-act="paywall"]')); true`); await sleep(700);
const foc = await ev(`[...document.querySelectorAll("#pop-paywall button, #pop-paywall [tabindex]:not([tabindex='-1'])")].map(e => e.className.split(" ")[0])`);
ok("the tab stops are the close button, the scrolling table, then See plans", foc.join() === "fvp-x,fvp-scroll,fvp-cta", foc.join());
ok("the table region is a labelled, keyboard-focusable region", await ev(`(() => { const r = document.querySelector("#pop-paywall .fvp-scroll"); return r.getAttribute("role") === "region" && r.getAttribute("tabindex") === "0" && !!document.getElementById(r.getAttribute("aria-labelledby")); })()`));
await key("Tab", "Tab", 9);
ok("Tab from See plans wraps to the close button", await ev(`document.activeElement?.classList.contains("fvp-x")`));
await key("Tab", "Tab", 9, 8);
ok("Shift+Tab from the close button wraps back to See plans", await ev(`document.activeElement?.classList.contains("fvp-cta")`));
await ev(`document.querySelector("#pop-paywall .fvp-scroll").focus(); true`);
const st0 = await ev(`document.querySelector("#pop-paywall .fvp-scroll").scrollTop`);
await key("PageDown", "PageDown", 34); await sleep(300);
ok("with the table focused, Page Down scrolls it", await ev(`document.querySelector("#pop-paywall .fvp-scroll").scrollTop`) > st0);
const stick = await ev(`(() => { const r = document.querySelector("#pop-paywall .fvp-scroll"), h = r.querySelector("thead th.fvp-fr"); r.scrollTop = 400; return new Promise(res => setTimeout(() => res({ d: Math.abs(h.getBoundingClientRect().top - r.getBoundingClientRect().top), st: r.scrollTop }), 150)); })()`);
ok("the Feature, Free and Premium headings stay pinned at the top while the rows scroll", stick.st >= 300 && stick.d <= 1.5, JSON.stringify(stick));
await ev(`document.querySelector("#pop-paywall .fvp-x").click(); true`); await sleep(400);
ok("the close button closes it and focus returns to Go Premium", !(await open()) && await ev(`document.activeElement === document.querySelector('.side [data-act="paywall"]')`));
await ev(`openPaywall(); true`); await sleep(500);
await ev(`document.querySelector("#pop-paywall .pop-scrim").click(); true`); await sleep(400);
ok("clicking outside closes it", !(await open()));

console.log("--- 5. Size and layout at phone, tablet and desktop widths");
for (const [w, h] of [[375, 800], [820, 1100], [1440, 900]]) {
  await view(w, h); await goto("#/home"); await sleep(300);
  await ev(`openPaywall(); true`); await sleep(600);
  const m = await ev(`(() => { const c = document.querySelector("#pop-paywall .pop-card").getBoundingClientRect(), r = document.querySelector("#pop-paywall .fvp-scroll"), x = document.querySelector("#pop-paywall .fvp-x").getBoundingClientRect(), b = document.querySelector("#pop-paywall .fvp-cta").getBoundingClientRect(), cw = document.documentElement.clientWidth;
    const clip = [...document.querySelectorAll("#pop-paywall td, #pop-paywall th")].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim().slice(0, 20));
    return { l: Math.round(c.left), r: Math.round(c.right), t: Math.round(c.top), b: Math.round(c.bottom), cw, ch: innerHeight, hs: r.scrollWidth - r.clientWidth, xw: Math.round(x.width), xh: Math.round(x.height), bh: Math.round(b.height), clip: clip.slice(0, 4), over: document.documentElement.scrollWidth - innerWidth }; })()`);
  ok(`${w}px: the dialog sits inside the screen and nothing scrolls sideways`, m.l >= 0 && m.r <= m.cw + 1 && m.t >= 0 && m.b <= m.ch + 1 && m.hs <= 0 && m.over <= 0, JSON.stringify(m));
  ok(`${w}px: the close button and See plans are at least 44px tall`, m.xw >= 44 && m.xh >= 44 && m.bh >= 44, JSON.stringify(m));
  ok(`${w}px: no cell clips its words`, m.clip.length === 0, JSON.stringify(m.clip));
  await shot(`paywall-${w}`);
  await key("Escape", "Escape", 27); await sleep(300);
}

console.log("--- 6. Spanish");
await view(1280, 900); await ev(`wlaSetLang("es"); true`); await sleep(500); await goto("#/home"); await sleep(300);
await ev(`openPaywall(); true`); await sleep(600);
const es = await ev(`(() => { const t = document.getElementById("pop-paywall").textContent.replace(/\\s+/g, " "); return { t, names: PREMIUM_FEATURES.filter(f => !WL_ES[f.name]).map(f => f.id) }; })()`);
ok("the title, headings, statuses, notice, footer and button are Spanish", /Gratis vs Premium/.test(es.t) && /Función/.test(es.t) && /\$0 para siempre/.test(es.t) && /\/mes/.test(es.t) && /Limitado/.test(es.t) && /Completo/.test(es.t) && /Beta: todas las funciones/.test(es.t) && /Premium es todo lo de Gratis/.test(es.t) && /Ver planes/.test(es.t) && /Registro básico/.test(es.t), es.t.slice(0, 500));
ok("every feature name has a Spanish name", es.names.length === 0 && !/Grocery list builder|Voice coach|Weekly review PDF/.test(es.t), JSON.stringify(es.names));
const esd = await ev(`(() => { const t = document.getElementById("pop-paywall").textContent.replace(/\\s+/g, " "); return { missing: PREMIUM_FEATURES.filter(f => !FVP_BLURB_ES[f.id]).map(f => f.id), english: PREMIUM_FEATURES.filter(f => t.includes(f.blurb)).map(f => f.id), core: /Resumen y anillos, datos de salud/.test(t) && /gratis para siempre\\./.test(t), sub: document.getElementById("fvp-sub").textContent, note: document.querySelector("#pop-paywall .fvp-notice")?.textContent }; })()`);
ok("all 19 descriptions and the Core tracker one are in Spanish, and so are the subtitle and the testing note", esd.missing.length === 0 && esd.english.length === 0 && esd.core && esd.sub === "Gratis vs Premium: todo lado a lado" && /Algunas funciones siguen en pruebas y se activan al superarlas\./.test(esd.note || ""), JSON.stringify(esd));
ok("no English table words are left behind", !/\b(Feature|Limited|Full|Free vs|See plans|Not included|Included in)\b/.test(es.t), es.t.slice(0, 300));
await shot("paywall-es");
await key("Escape", "Escape", 27); await sleep(300);
await ev(`wlaSetLang("en"); true`); await sleep(400);
await ev(`openPaywall(); true`); await sleep(500);
ok("switching back gives the English table again", await ev(`document.querySelector("#fvp-title").textContent === "WholeLife Hub Premium" && document.querySelector("#fvp-sub").textContent === "Free vs Premium — everything side by side" && PREMIUM_FEATURES.every((f, i) => document.querySelectorAll("#pop-paywall .fvp-fs")[i + 1]?.textContent === f.blurb)`));
await key("Escape", "Escape", 27); await sleep(300);

console.log("--- 7. Light, dark and OLED");
for (const mode of ["dark", "oled", "light"]) {
  await ev(`P().look = Object.assign(P().look || {}, { mode: ${JSON.stringify(mode)} }); applyLook(P()); render(); true`); await sleep(300);
  await ev(`openPaywall(); true`); await sleep(600);
  const c = await ev(`(() => { const pc = (s) => { const m = s.match(/[\\d.]+/g).map(Number); return m; }; const card = document.querySelector("#pop-paywall .pop-card"), cta = document.querySelector("#pop-paywall .fvp-cta");
    const bg = getComputedStyle(card).backgroundColor, cb = getComputedStyle(cta).backgroundColor, ct = getComputedStyle(cta).color;
    const lum = rgb => { const [r, g, b] = rgb.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
    const ratio = (a, b2) => { const x = lum(pc(a)), y = lum(pc(b2)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    return { solid: pc(bg).length < 4 || pc(bg)[3] === 1, cta: Math.round(ratio(cb, ct) * 10) / 10, sticky: getComputedStyle(document.querySelector("#pop-paywall thead th")).backgroundColor !== "rgba(0, 0, 0, 0)" }; })()`);
  ok(`${mode}: a solid dialog, a sticky heading with its own background, and a readable See plans button (contrast ${c.cta}:1)`, c.solid && c.sticky && c.cta >= 4.5, JSON.stringify(c));
  await shot(`paywall-${mode}`);
  await key("Escape", "Escape", 27); await sleep(300);
}

ok("no script errors on the page", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
