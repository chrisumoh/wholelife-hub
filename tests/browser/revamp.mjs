import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/paywall.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.6.4: the revamp of the menu icons and colours, the Settings rail, Appearance, Coach settings, Profile and Health data (quick log included),
// in light, dark and OLED, on a desktop, a tablet and a phone.
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
}).listen(8845, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9405", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-revamp-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9405/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8845/index.html?premium=0" }); await sleep(500);
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
const setMode = async mode => { await ev(`P().look = Object.assign(P().look || {}, { mode: ${JSON.stringify(mode)}, theme: "forest" }); applyLook(P()); render(); true`); await sleep(250); };
const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await sleep(250); };

console.log("--- 1. Menu: a glyph of its own for every row, a colour only on the page you are in");
await view(1280, 900); await setMode("light"); await goto("#/home");
const glyphs = await ev(`[...document.querySelectorAll(".side .nav a svg.ci, .side .nav button.prem-trigger svg.ci, .side .nav .navdisc svg.ci")].map(s => [...s.classList].find(c => /^ci-/.test(c)))`);
ok("every menu row has its own glyph (no two rows share one)", glyphs.length >= 8 && new Set(glyphs).size === glyphs.length, glyphs.join(","));
ok("Log, Plan, Coach and Progress use the four new glyphs", ["ci-journal", "ci-notepen", "ci-whistle", "ci-trendup"].every(g => glyphs.includes(g)), glyphs.join(","));
await view(390, 800); await sleep(300);
const bar = await ev(`[...document.querySelectorAll(".bottombar .bb-item svg")].map(s => s.dataset.icon)`);
ok("the phone bottom bar shows the same journal, plan and whistle glyphs, all different", bar.length === 5 && new Set(bar).size === 5 && ["journal", "notepen", "whistle"].every(g => bar.includes(g)), bar.join(","));
await view(1280, 900);
const NAV = `(() => { const t = window.__t, out = [], a = document.querySelector('.side .nav a[aria-current="page"], .side .nav button.prem-trigger[aria-current="page"]'); if (!a) return ["no row is marked as the current page"];
  const cs = getComputedStyle(a), ic = getComputedStyle(a.querySelector(".si-tile svg")).color, side = getComputedStyle(document.querySelector(".side")).backgroundColor, lab = getComputedStyle(a.querySelector(":scope > span:not(.si-tile)")).color;
  if (t.same(cs.backgroundColor, side)) out.push("no pill: " + cs.backgroundColor);
  if (t.ratio(ic, cs.backgroundColor) < 3) out.push("icon " + ic + " on " + cs.backgroundColor + " is " + t.ratio(ic, cs.backgroundColor).toFixed(2));
  if (t.ratio(lab, cs.backgroundColor) < 4.5) out.push("label contrast " + t.ratio(lab, cs.backgroundColor).toFixed(2));
  const b = getComputedStyle(a, "::before"); if (b.width !== "3px" || !t.same(b.backgroundColor, ic)) out.push("edge bar " + b.width + " " + b.backgroundColor + " vs icon " + ic);
  const idle = [...document.querySelectorAll(".side .nav a:not([aria-current]) .si-tile svg")].filter(s => s.getClientRects().length).map(s => getComputedStyle(s).color); if (idle.some(c => t.same(c, ic))) out.push("an idle row has the active colour");
  return out; })()`;
for (const mode of ["light", "dark", "oled"]) {
  await setMode(mode);
  const bad = [];
  for (const r of ["home", "nutrition", "workouts", "snacks", "recipes", "culture", "health", "awards", "learn", "coach", "settings"]) { await goto("#/" + r); const o = await ev(NAV); if (o.length) bad.push(r + ": " + o.join("; ")); }
  ok(`${mode}: on all 11 pages the current row has a tinted pill, a 3px edge, an icon of 3:1 and a label of 4.5:1, and idle rows stay grey`, bad.length === 0, bad.slice(0, 3).join(" | "));
}
await setMode("light"); await goto("#/nutrition");
await ev(`(() => { const g = document.querySelector('.navgrp-disc.holds'); const open = g?.classList.contains("open") || g?.querySelector('[aria-expanded="true"]'); if (open) g.querySelector("button")?.click(); return true; })()`); await sleep(300);
ok("a shut group that holds the current page shows a dot in that page's colour", await ev(`(() => { const g = document.querySelector(".navgrp-disc.holds"); if (!g) return false; const shut = g.querySelector('[aria-expanded]')?.getAttribute("aria-expanded") === "false"; return !shut || !!g.querySelector(".navdot"); })()`));

console.log("--- 2. Settings rail: an icon well, a colour of its own per section, shown only on the current one");
await view(1280, 900);
const SECTIONS = ["profile", "coach", "goals", "household", "appearance", "premium", "privacy", "about", "bugs"];
await goto("#/settings");
const rail = await ev(`(() => { const items = [...document.querySelectorAll(".setrail a.setrail-item")], r = document.querySelector(".setrail").getBoundingClientRect(); return { n: items.length, icons: items.map(a => a.querySelector("svg").dataset.icon), well: items.map(a => { const w = a.querySelector(".sr-well").getBoundingClientRect(), s = a.querySelector("svg").getBoundingClientRect(); return [Math.round(w.width), Math.round(w.height), Math.round(s.width)].join("x"); }), w: Math.round(r.width), radius: getComputedStyle(document.querySelector(".setrail")).borderRadius, groups: [...document.querySelectorAll(".setrail-lbl")].map(x => x.textContent), tall: Math.min(...items.map(a => a.getBoundingClientRect().height)) }; })()`);
ok("the rail has 9 rows in two groups, each with its own glyph", rail.n === 9 && new Set(rail.icons).size === 9 && rail.icons.every(i => /^set[A-Z]/.test(i)) && rail.groups.join() === "You,App", JSON.stringify(rail));
ok("each icon sits in a 32px well and is 20px, rows are 44px tall, the rail is 272px wide with 20px corners", rail.well.every(w => w === "32x32x20") && rail.tall >= 43.9 && Math.abs(rail.w - 272) <= 1 && rail.radius === "20px", JSON.stringify(rail));
for (const mode of ["light", "dark", "oled"]) {
  await setMode(mode); const bad = [];
  for (const k of SECTIONS) {
    await goto("#/settings" + (k === "profile" ? "" : "/" + k));
    const o = await ev(`(() => { const t = window.__t, a = document.querySelector('.setrail a[aria-current="page"]'), out = []; if (!a) return ["no current row"]; const cs = getComputedStyle(a), well = getComputedStyle(a.querySelector(".sr-well")), ic = getComputedStyle(a.querySelector("svg")).color, surf = getComputedStyle(document.querySelector(".setrail")).backgroundColor, lab = getComputedStyle(a.querySelector(".sr-t")).color;
      if (t.same(cs.backgroundColor, surf)) out.push("no pill"); if (t.same(well.backgroundColor, cs.backgroundColor)) out.push("no well tint");
      if (t.ratio(ic, well.backgroundColor) < 3) out.push("icon on well " + t.ratio(ic, well.backgroundColor).toFixed(2)); if (t.ratio(lab, cs.backgroundColor) < 4.5) out.push("label " + t.ratio(lab, cs.backgroundColor).toFixed(2));
      const b = getComputedStyle(a, "::before"); if (b.width !== "3px" || !t.same(b.backgroundColor, ic)) out.push("edge " + b.width);
      const cols = [...document.querySelectorAll(".setrail a:not([aria-current]) svg")].map(s => getComputedStyle(s).color); if (cols.some(c => t.same(c, ic))) out.push("an idle row has this colour"); return out; })()`);
    if (o.length) bad.push(k + ": " + o.join("; "));
  }
  ok(`${mode}: every section has a pill, a tinted well, an edge, icon 3:1 and label 4.5:1, and idle rows are grey`, bad.length === 0, bad.slice(0, 3).join(" | "));
}
await setMode("light"); await shot("rail-premium-light");
const colours = await ev(`[...document.querySelectorAll(".setrail a")].map(a => a.style.getPropertyValue("--sv"))`);
ok("the nine sections have nine different colours", new Set(colours).size === 9, colours.join(","));
await goto("#/settings/bugs"); await sleep(300);
const fq = () => ev(`(() => ({ n: document.querySelectorAll("#faqs details").length, open: document.querySelectorAll("#faqs details[open]").length, groups: [...document.querySelectorAll("#faqs .faq-grp")].map(h => h.textContent), diag: !!document.querySelector("#diagnostics"), noDiagInAbout: true, med: /not medical advice/.test(document.querySelector("#faqs .advice-banner")?.textContent || "") }))()`);
let fqs = await fq();
ok("Bug reports & FAQs: eight questions start collapsed, in groups, with Diagnostics and the medical note", fqs.n === 8 && fqs.open === 0 && fqs.groups.length === 3 && fqs.diag && fqs.med, JSON.stringify(fqs));
await click('[data-act="faq-all"]'); await sleep(200); fqs = await fq();
ok("Show all reveals every question in four groups, still collapsed", fqs.n === 18 && fqs.open === 0 && fqs.groups.join() === "Account & data,Coach & privacy,Premium & billing,Help", JSON.stringify(fqs));
await view(390, 800); await goto("#/settings/about"); await sleep(300);
const ph = await ev(`(() => { const r = document.querySelector(".setrail"), a = r.querySelector('a[aria-current="page"]'), rr = r.getBoundingClientRect(), ar = a.getBoundingClientRect(); return { dir: getComputedStyle(r).flexDirection, h: Math.round(rr.height), seen: ar.left >= rr.left - 1 && ar.right <= rr.right + 1, scroll: r.scrollLeft, bar: getComputedStyle(a, "::before").display }; })()`);
ok("on a phone the rail is one scrolling row that has scrolled to the section you are in", ph.dir === "row" && ph.h < 80 && ph.seen && ph.scroll > 0 && ph.bar === "none", JSON.stringify(ph));
await shot("rail-phone");
await view(1280, 900);

console.log("--- 3. Appearance: three cards, swatches and typefaces in the page, no popups");
await goto("#/settings/appearance");
const ap = await ev(`(() => { const cards = [...document.querySelectorAll("#appearance .apr-card")], sw = [...document.querySelectorAll(".apr-swatches .swatch-lg")], fonts = [...document.querySelectorAll(".fopt")], two = document.querySelector(".apr-two"); const r = [...two.children].map(c => c.getBoundingClientRect());
  return { heads: cards.map(c => c.querySelector(".apr-h").textContent), swatches: sw.length, minSw: Math.min(...sw.map(s => s.getBoundingClientRect().height)), pressed: sw.filter(s => s.getAttribute("aria-pressed") === "true").length, fonts: fonts.length, want: FONTS.length, checked: fonts.filter(f => f.getAttribute("aria-selected") === "true").length, cut: fonts.filter(f => [...f.querySelectorAll("span")].some(e => e.scrollWidth > e.clientWidth + 1)).length, side: r.length === 2 && Math.abs(r[0].top - r[1].top) < 2 && r[0].right <= r[1].left, popups: document.querySelectorAll('[data-act="accent-pop"],[data-act="font-pop"]').length, chip: document.getElementById("ui-ts-label")?.textContent, review: !!document.querySelector("#wl-review") }; })()`);
ok("three cards: Display & theme, Typography & layout, Glass & motion", ap.heads.join("|") === "Display & theme|Typography & layout|Glass & motion", ap.heads.join("|"));
ok("accent swatches are in the page, 44px tall, one pressed; the accent popup is gone", ap.swatches === await ev(`ACCENTS.length`) && ap.minSw >= 43.9 && ap.pressed === 1 && ap.popups === 0, JSON.stringify(ap));
ok("typefaces are one compact picker: one option per font, one selected, no name cut off", ap.fonts === ap.want && ap.checked === 1 && ap.cut === 0, JSON.stringify(ap));
ok("UI style and Language sit side by side", ap.side, JSON.stringify(ap));
const pick = await ev(`(() => { const s = [...document.querySelectorAll(".apr-swatches .swatch-lg")].find(x => x.getAttribute("aria-pressed") !== "true" && !x.classList.contains("dyn")); return s ? s.dataset.v : null; })()`);
await click(`.apr-swatches .swatch-lg[data-v="${pick}"]`);
ok("choosing an accent presses that swatch and lists the change for Save or Discard", await ev(`document.querySelector('.apr-swatches .swatch-lg[data-v="${pick}"]').getAttribute("aria-pressed") === "true" && document.querySelectorAll(".apr-swatches [aria-pressed='true']").length === 1 && !!document.querySelector("#wl-review.show")`));
await click('#wl-review [data-act="look-discard"]'); await sleep(200);
const fontPick = await ev(`(() => { const f = [...document.querySelectorAll(".fopt")].find(x => x.getAttribute("aria-selected") !== "true"); return f ? f.dataset.v : null; })()`);
await click('.fpick-btn');
ok("the typeface button opens the list", await ev(`document.querySelector(".fpick").classList.contains("open") && document.querySelector(".fpick-btn").getAttribute("aria-expanded") === "true"`));
await click(`.fopt[data-v="${fontPick}"]`);
ok("choosing a typeface selects it at once (typefaces save immediately)", await ev(`document.querySelector('.fopt[data-v="${fontPick}"]').getAttribute("aria-selected") === "true" && document.querySelectorAll('.fopt[aria-selected="true"]').length === 1 && P().look.font === ${JSON.stringify(fontPick)}`));
await click('.fpick-btn'); await click('.fopt[data-v="system"]');
await ev(`(() => { const r = document.getElementById("ui-ts"); r.value = "5"; r.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`); await sleep(250);
ok("the text-size chip follows the slider", await ev(`document.getElementById("ui-ts-label").textContent === document.getElementById("ui-ts").getAttribute("aria-valuetext")`), await ev(`document.getElementById("ui-ts-label")?.textContent`));
await click('[data-act="ts-reset"]');
await shot("appearance-1280");
await click('[data-act="ui-lang"][data-v="es"]'); await sleep(300);
ok("Spanish: the three card headings and the typeface heading are translated", await ev(`[...document.querySelectorAll("#appearance .apr-h")].map(h => h.textContent).join("|") === "Pantalla y tema|Tipografía y diseño|Cristal y movimiento" && /Tipo de letra/.test(document.querySelector("#appearance").textContent)`), await ev(`[...document.querySelectorAll("#appearance .apr-h")].map(h => h.textContent).join("|")`));
await click('[data-act="ui-lang"][data-v="en"]'); await click('#wl-review [data-act="look-discard"]'); await sleep(200);

console.log("--- 4. Coach settings: a hero for the current coach, a colour, a pill and a real sample line on each choice");
await goto("#/settings/coach");
const co = await ev(`(() => { const t = window.__t, h = document.querySelector(".coach-hero"), cards = [...document.querySelectorAll(".coachcard")], pill = h?.querySelector(".ch-pill"); return { hero: !!h, edge: h ? getComputedStyle(h, "::before").width : null, edgeBg: h ? getComputedStyle(h, "::before").backgroundColor : null, pillRatio: pill ? t.ratio(getComputedStyle(pill).color, getComputedStyle(pill).backgroundColor) : 0, n: cards.length, want: COACHES.length, quotes: cards.map(c => c.querySelector(".cc-quote")?.textContent), voice: COACHES.map(c => "\\u201c" + COACH_VOICE[c.id].ask + "\\u201d"), colours: new Set(cards.map(c => c.style.cssText)).size, on: cards.filter(c => c.classList.contains("on")).length, subs: cards.map(c => { const s = c.querySelector(".cc-sub"); return t.ratio(getComputedStyle(s).color, getComputedStyle(s).backgroundColor); }) }; })()`);
ok("the hero shows the current coach with a 4px edge in their colour", co.hero && co.edge === "4px" && co.edgeBg !== "rgba(0, 0, 0, 0)", JSON.stringify(co));
ok("the hero pill and every card pill read at 4.5:1", co.pillRatio >= 4.5 && co.subs.every(r => r >= 4.5), JSON.stringify([co.pillRatio, co.subs]));
ok("one card per coach, each in its own colour, one current", co.n === co.want && co.colours === co.want && co.on === 1, JSON.stringify(co));
ok("each card's sample line is the coach's real voice (COACH_VOICE), not made-up copy", JSON.stringify(co.quotes) === JSON.stringify(co.voice), JSON.stringify(co.quotes));
const other = await ev(`COACHES.find(c => c.id !== coachId(P())).id`);
await click(`.coachcard[data-v="${other}"]`);
ok("choosing another coach makes that card current and updates the hero", await ev(`coachId(P()) === ${JSON.stringify(other)} && document.querySelector(".coachcard.on").dataset.v === ${JSON.stringify(other)} && document.querySelector(".ch-name h2").textContent === coachName(P())`));
await click('[data-act="coach-rename"]');
ok("Rename opens the name form inside the hero", await ev(`!!document.querySelector(".coach-hero form[data-form='coach-name'] #coach-name")`));
await click('[data-act="coach-rename-cancel"]');
await shot("coach-settings-1280");

console.log("--- 5. Profile: photo badge, percent chip, equal cards, profile cards, version line");
await ev(`(() => { const k = newProfile("Kofi"); S.profiles.push(k); saveProfile(); render(); return true; })()`);
await goto("#/settings");
const pr = await ev(`(() => { const hero = document.querySelector(".card.hero"), wrap = hero.querySelector(".photo-wrap"), badge = wrap?.querySelector("button.photo-badge"), br = badge?.getBoundingClientRect(), chip = document.querySelector(".pf-prog .apr-chip"), line = document.querySelector(".pf-prog")?.textContent || "", cards = [...document.querySelectorAll(".pf-people .pf-person")], groups = [...document.querySelectorAll(".pgroup")].map(g => Math.round(g.getBoundingClientRect().height)), tops = [...document.querySelectorAll(".pgroup")].map(g => Math.round(g.getBoundingClientRect().top)), dd = [...document.querySelectorAll(".pgroup .kv dd")].map(d => getComputedStyle(d).textAlign);
  const m = line.match(/(\\d+) of 10/); return { badge: !!badge, size: br && [Math.round(br.width), Math.round(br.height)].join("x"), file: !!wrap?.querySelector('input#photo-in[type=file]'), kbd: String(badge?.tabIndex), label: badge?.getAttribute("aria-label"), chip: chip?.textContent, done: m && +m[1], people: cards.length, add: cards.filter(c => c.classList.contains("add")).length, on: cards.filter(c => c.classList.contains("on")).length, profiles: S.profiles.length, foot: document.querySelector(".pf-foot")?.textContent.replace(/\\s+/g, " ").trim(), groups, tops, dd: [...new Set(dd)] }; })()`);
ok("the photo has a camera badge (28px, keyboard reachable) that opens the file picker", pr.badge && pr.size === "28x28" && pr.file && pr.kbd === "0" && /profile photo/.test(pr.label || ""), JSON.stringify(pr));
ok("pressing the camera badge hands the photo input to the camera/file chooser, as the old Change button did", await ev(`(() => { const real = window.shotOpen; let got = null; window.shotOpen = inp => { got = inp.id; }; document.querySelector("button.photo-badge").click(); window.shotOpen = real; return got === "photo-in"; })()`));
ok("the percent chip matches the 'N of 10 filled in' line", pr.chip === pr.done * 10 + "%", JSON.stringify(pr));
ok("one card per profile plus an Add card, the current profile is marked", pr.people === pr.profiles + 1 && pr.add === 1 && pr.on === 1, JSON.stringify(pr));
ok("fact rows keep their values on the right", pr.dd.length === 1 && pr.dd[0] === "right", JSON.stringify(pr.dd));
ok("cards that share a row have the same height", await ev(`(() => { const g = [...document.querySelectorAll(".pgroup")].map(x => x.getBoundingClientRect()); const rows = {}; g.forEach(r => (rows[Math.round(r.top)] ||= []).push(Math.round(r.height))); return Object.values(rows).every(h => h.every(x => Math.abs(x - h[0]) <= 1)); })()`), JSON.stringify(pr.groups));
ok("the footer names the update and channel", /Update 8\.\d/.test(pr.foot || "") && /Dev Testing|Beta|Release/.test(pr.foot || ""), pr.foot);
const me = await ev(`S.activeId`);
await click(".pf-person.on");
ok("tapping the current profile's card changes nothing", await ev(`S.activeId === ${JSON.stringify(me)}`));
await click(".pf-person:not(.on):not(.add)");
ok("tapping another profile's card switches to it", await ev(`S.activeId !== ${JSON.stringify(me)} && P().name === "Kofi"`));
await ev(`S.activeId = ${JSON.stringify(me)}; saveProfile(); render(); true`); await sleep(200);
await shot("profile-1280");

console.log("--- 6. Health data: pinned vitals, a balanced grid, quick log, search, categories, import banner");
await ev(`(() => { S.profiles = S.profiles.filter(p => p.id === ${JSON.stringify(me)}); S.activeId = ${JSON.stringify(me)}; const p = P(); p.layouts = {}; S.logs = {}; saveProfile(); render(); return true; })()`);
await view(1280, 900); await goto("#/health");
const hv = () => ev(`(() => { const g = document.querySelector('.wgrid[data-page="health"]'), gr = g.getBoundingClientRect(), cards = [...g.children].map(c => { const r = c.getBoundingClientRect(); return { k: c.dataset.key || c.dataset.k, w: Math.round(r.width), l: Math.round(r.left), r: Math.round(r.right), top: Math.round(r.top) }; }); return { grid: [Math.round(gr.left), Math.round(gr.right)], cards, eyebrow: document.querySelector(".wsec-bar .hs-eyebrow")?.textContent }; })()`);
let h = await hv();
ok("the pinned section is headed 'Pinned vitals'", h.eyebrow === "Pinned vitals", JSON.stringify(h));
ok("the default pinned set is Steps over Active energy, Resting heart rate and Blood oxygen, three equal cards filling the row", h.cards.length === 4 && h.cards.slice(1).every(c => Math.abs(c.w - h.cards[1].w) <= 2) && h.cards[3].r >= h.grid[1] - 1 && h.cards[1].l <= h.grid[0] + 1 && h.cards[0].w >= h.grid[1] - h.grid[0] - 1, JSON.stringify(h));
ok("every pinned card has a tinted icon well", await ev(`[...document.querySelectorAll('.wgrid[data-page="health"] .dcard')].every(c => c.querySelector(".mhead .ic-well svg.ci"))`));
for (const [sizes, want] of [[["m", "s", "s", "s", "s"], "last card takes the whole row"], [["m", "s", "s", "s", "s", "s"], "five small cards: three, then two halves"], [["s", "s", "s", "s", "s"], "five small cards in a run"]]) {
  await ev(`(() => { const ks = ["steps", "active", "rhr", "spo2", "sleep", "weight"]; wlSet(P(), "health", ${JSON.stringify(sizes)}.map((s, i) => ({ k: ks[i], size: s }))); render(); return true; })()`); await sleep(300);
  h = await hv(); const rows = {}; h.cards.forEach(c => (rows[c.top] ||= []).push(c)); const filled = Object.values(rows).every(r => Math.max(...r.map(c => c.r)) >= h.grid[1] - 1 && Math.min(...r.map(c => c.l)) <= h.grid[0] + 1);
  ok(`${sizes.join("")}: no row is left with an empty slot (${want})`, filled, JSON.stringify(h.cards));
}
await ev(`P().layouts = {}; saveProfile(); render(); true`); await sleep(300);
console.log("   empty state");
h = await hv();
const em = await ev(`(() => { const cards = [...document.querySelectorAll('.wgrid[data-page="health"] .flipwrap')]; return { n: cards.length, text: cards.map(c => c.querySelector(".mval")?.textContent.trim()), logs: cards.map(c => !!c.querySelector(":scope > .qlog")), inside: !!document.querySelector(".dcard .qlog, .dcard button"), bare: !!document.querySelector(".dcard .spark"), sub: [...document.querySelectorAll(".dcard .msub")].length }; })()`);
ok("with nothing logged every pinned card says No Data, shows no chart and no made-up line", em.n === 4 && em.text.every(t => t === "No Data") && !em.bare && em.sub === 0, JSON.stringify(em));
ok("each empty metric you can type in has a visible '+ Log' beside the card, never inside it", em.logs.every(Boolean) && !em.inside, JSON.stringify(em));
const nl = await ev(`[...document.querySelectorAll(".qlog")].map(b => { const r = b.getBoundingClientRect(); return [b.getAttribute("aria-label"), Math.round(r.height)]; })`);
ok("the + Log buttons are named for their metric and at least 36px tall", nl.length >= 4 && nl.every(([n, hh]) => /^Log /.test(n) && hh >= 35.9), JSON.stringify(nl));
await ev(`document.querySelector('.qlog[data-k="steps"]').focus(); document.querySelector('.qlog[data-k="steps"]').click(); true`); await sleep(700);
const qd = await ev(`(() => { const d = document.querySelector("#pop-qlog .pop-card"); return d ? { role: d.getAttribute("role"), modal: d.getAttribute("aria-modal"), name: document.getElementById(d.getAttribute("aria-labelledby"))?.textContent, fields: [...d.querySelectorAll("input")].map(i => i.id), focus: document.activeElement?.id, w: Math.round(d.getBoundingClientRect().width) } : null; })()`);
ok("+ Log opens a dialog named for the metric with a date and the metric's own field, focus on the field", qd && qd.role === "dialog" && qd.modal === "true" && qd.name === "Log Steps" && qd.fields.join() === "md-date,md-steps" && qd.focus === "md-steps", JSON.stringify(qd));
await shot("quicklog-1280");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(400);
ok("Escape closes it and focus returns to the + Log button", await ev(`!document.querySelector("#pop-qlog") && document.activeElement === document.querySelector('.qlog[data-k="steps"]')`));
await ev(`document.querySelector('.qlog[data-k="steps"]').click(); true`); await sleep(600);
await ev(`(() => { document.getElementById("md-steps").value = "99999999"; document.querySelector("#pop-qlog form").requestSubmit?.(); return true; })()`); await sleep(300);
ok("a value out of range is refused and the dialog stays open", await ev(`!!document.querySelector("#pop-qlog") && vitalsOf(today())?.steps == null`));
await ev(`(() => { document.getElementById("md-steps").value = "5400"; document.querySelector("#pop-qlog form").requestSubmit(); return true; })()`); await sleep(1800);
ok("a good value is saved for today, the dialog closes and the card shows it", await ev(`vitalsOf(today())?.steps === 5400 && !document.querySelector("#pop-qlog") && /5,400/.test(document.querySelector('.wgrid[data-page="health"] .dcard[data-k="steps"]').textContent) && !document.querySelector('.qlog[data-k="steps"]')`));
await ev(`document.querySelector('.qlog[data-k="rhr"]').click(); true`); await sleep(500);
ok("the dialog for a metric with two fields (blood pressure) shows both", await (async () => { await ev(`document.querySelector("#pop-qlog [data-pop='close']").click(); true`); await sleep(300); await goto("#/health"); await ev(`document.querySelector('[data-act="health-cat"][data-v="heart"]').click(); true`); await sleep(300); await ev(`document.querySelector('.qlog[data-k="bp"]').click(); true`); await sleep(500); const f = await ev(`[...document.querySelectorAll("#pop-qlog input")].map(i => i.id).join()`); await ev(`document.querySelector("#pop-qlog [data-pop='close']")?.click(); true`); await sleep(300); return f === "md-date,md-sys,md-dia"; })());
console.log("   with data");
await ev(`(() => { for (let d = 0; d < 7; d++) { const date = addDays(today(), -d); setVital(date, "steps", 6000 + d * 700); setVital(date, "active", 400 + d * 20); setVital(date, "rhr", 58 + (d % 3)); setVital(date, "spo2", 96 + (d % 3)); } saveProfile(); render(); return true; })()`);
await goto("#/health"); await sleep(300);
const sub = await ev(`Object.fromEntries([...document.querySelectorAll('.wgrid[data-page="health"] .dcard')].map(c => [c.dataset.k, c.querySelector(".msub")?.textContent]))`);
ok("steps: the sub-line is the real 7-day average (8,100)", sub.steps === "7-day average 8,100 steps", JSON.stringify(sub));
ok("active energy and resting heart rate show their real averages", sub.active === "7-day average 460 cal" && sub.rhr === "7-day average 59 BPM", JSON.stringify(sub));
ok("blood oxygen shows the real range (96-98)", /^Range 96.98% over 7 days$/.test(sub.spo2 || ""), JSON.stringify(sub));
ok("Small cards keep a chart too, with no empty chart anywhere", await ev(`[...document.querySelectorAll('.wgrid[data-page="health"] .dcard')].every(c => c.querySelector(".spark")) && !document.querySelector(".qlog[data-k='steps'], .qlog[data-k='active'], .qlog[data-k='rhr'], .qlog[data-k='spo2']")`));
await ev(`(() => { S.logs = {}; setVital(today(), "steps", 7000); saveProfile(); render(); return true; })()`); await sleep(300);
ok("with only one logged day there is nothing to average, so there is no sub-line", await ev(`!document.querySelector('.wgrid[data-page="health"] .dcard[data-k="steps"] .msub')`));
await ev(`(() => { for (let d = 0; d < 7; d++) { const date = addDays(today(), -d); setVital(date, "steps", 6000 + d * 700); setVital(date, "active", 400 + d * 20); setVital(date, "rhr", 58 + (d % 3)); setVital(date, "spo2", 96 + (d % 3)); } saveProfile(); render(); return true; })()`); await sleep(300);
await shot("health-1280-light");

console.log("   search, categories, import banner");
const sr = () => ev(`(() => { const clear = document.querySelector(".hs-clear"), i = document.getElementById("browse-q"); return { clearHidden: clear?.hidden, clearH: clear ? Math.round(clear.getBoundingClientRect().height) : 0, value: i?.value, status: document.querySelector(".hs-status")?.textContent.trim(), secs: [...document.querySelectorAll(".health-sec")].map(s => s.id), empty: document.querySelector(".hs-empty")?.textContent || "", mag: !!document.querySelector(".hs-search .hs-mag"), inH: Math.round(i.getBoundingClientRect().height), radius: getComputedStyle(i).borderRadius }; })()`);
let s1 = await sr();
ok("the search box has an icon, is 48px tall with 16px corners and shows no clear button while empty", s1.mag && s1.inH >= 48 && s1.radius === "16px" && s1.clearHidden === true, JSON.stringify(s1));
await ev(`(() => { const i = document.getElementById("browse-q"); i.value = "oxygen"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`); await sleep(600); s1 = await sr();
ok("typing shows a 44px clear button and counts results across categories", s1.clearHidden === false && s1.clearH >= 43.9 && /^1 result across all categories$/.test(s1.status), JSON.stringify(s1));
await ev(`document.querySelector(".hs-clear").click(); true`); await sleep(500); s1 = await sr();
ok("Clear empties the box, brings back the chosen category and keeps focus in the search box", s1.value === "" && s1.secs.length === 1 && s1.clearHidden === true && await ev(`document.activeElement?.id === "browse-q"`), JSON.stringify(s1));
await ev(`(() => { const i = document.getElementById("browse-q"); i.value = "zzzz"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`); await sleep(600); s1 = await sr();
ok("a search with no match says 'No matching health metrics', names the search and offers Clear search", /No matching health metrics/.test(s1.empty) && /Nothing matches "zzzz"/.test(s1.empty) && /Clear search/.test(s1.empty), JSON.stringify(s1));
await ev(`document.querySelector(".hs-empty [data-act='health-clear']").click(); true`); await sleep(500); s1 = await sr();
ok("Clear search in the empty state resets the box", s1.value === "" && s1.secs.length === 1 && !s1.empty, JSON.stringify(s1));
const chips = await ev(`(() => { const t = window.__t, cs = [...document.querySelectorAll(".hs-chips .chip")], on = cs.find(c => c.getAttribute("aria-pressed") === "true"), off = cs.find(c => c !== on), sc = getComputedStyle(document.querySelector(".health-sec .shead .ic-well")); return { n: cs.length, want: Object.keys(CATS).length, min: Math.min(...cs.map(c => Math.round(c.getBoundingClientRect().height))), pressed: cs.filter(c => c.getAttribute("aria-pressed") === "true").length, ring: getComputedStyle(on).boxShadow !== "none", bg: !t.same(getComputedStyle(on).backgroundColor, getComputedStyle(off).backgroundColor), label: t.ratio(getComputedStyle(on).color, getComputedStyle(on).backgroundColor), well: !!document.querySelector(".health-sec .shead .ic-well.lg") }; })()`);
ok("seven category pills, 44px tall, the chosen one ringed and tinted in its own colour with a readable label, and a coloured well by the category title", chips.n === chips.want && chips.min >= 44 && chips.pressed === 1 && chips.ring && chips.bg && chips.label >= 4.5 && chips.well, JSON.stringify(chips));
const imp = await ev(`(() => { const b = document.querySelector(".hs-import"), go = b?.querySelector(".hs-go"), a = b?.querySelector("p a"); return { text: b?.querySelector("p")?.textContent.replace(/\\s+/g, " ").trim(), go: go?.getAttribute("href"), goH: go ? Math.round(go.getBoundingClientRect().height) : 0, link: a?.getAttribute("href"), heart: !!b?.querySelector(".hs-heart svg") }; })()`);
ok("the Apple Health import is a banner with a heart badge, the same words, and an 'Import now' link to Workouts & imports", /^Import Apple Health on Workouts & imports to fill these in automatically, or open any card to add data by hand\.$/.test(imp.text || "") && imp.go === "#/workouts" && imp.link === "#/workouts" && imp.goH >= 43.9 && imp.heart, JSON.stringify(imp));
await view(390, 844); await sleep(400);
const phone = await ev(`(() => { const cs = [...document.querySelectorAll(".hs-chips .chip")], tops = new Set(cs.map(c => Math.round(c.getBoundingClientRect().top))), g = document.querySelector('.wgrid[data-page="health"]'), cards = [...g.children].map(c => c.getBoundingClientRect()), box = document.querySelector(".hs-chips"); return { oneRow: tops.size === 1, scrolls: box.scrollWidth > box.clientWidth && getComputedStyle(box).overflowX === "auto", oneCol: new Set(cards.map(r => Math.round(r.left))).size === 1, hscroll: document.documentElement.scrollWidth > innerWidth }; })()`);
ok("on a phone the category pills are one scrolling row, the pinned cards stack in one column, and the page does not scroll sideways", phone.oneRow && phone.scrolls && phone.oneCol && !phone.hscroll, JSON.stringify(phone));
await shot("health-390");
await view(1280, 900);
for (const mode of ["dark", "oled"]) { await setMode(mode); await goto("#/health"); await sleep(200); await shot("health-1280-" + mode);
  ok(`${mode}: the icon wells, pills and banner draw in the dark schemes (well tint differs from the card)`, await ev(`(() => { const t = window.__t, w = document.querySelector(".dcard .ic-well"), c = document.querySelector(".dcard"); return !t.same(getComputedStyle(w).backgroundColor, getComputedStyle(c).backgroundColor); })()`)); }
await setMode("light");
await ev(`(() => { P().look = Object.assign(P().look || {}, { lang: "es" }); WLA.lang = "es"; render(); return true; })()`); await sleep(500);
ok("Spanish: the pinned heading, the banner and the quick log are translated", await ev(`document.querySelector(".hs-eyebrow")?.textContent === "Signos fijados" && /Importa Apple Health en/.test(document.querySelector(".hs-import p")?.textContent || "") && /Importar ahora/.test(document.querySelector(".hs-go")?.textContent || "")`), await ev(`document.querySelector(".hs-eyebrow")?.textContent`));
await ev(`WLA.lang = "en"; render(); true`); await sleep(300);

ok("no script errors during the run", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
