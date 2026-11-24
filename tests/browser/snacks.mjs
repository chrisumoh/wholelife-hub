import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/snacks.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.6.2: the Snacks page: serving multiplier, No allergens, sort, results line, logged pill and the recipe drawer.
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
}).listen(8843, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9403", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-snacks-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9403/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8843/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30, sex: "female", goal: "build", coachPersona: "enforcer", coachName: "Coach Henry",
  widgets: [{ k: "calories", size: "s" }, { k: "steps", size: "m" }, { k: "meals", size: "m" }, { k: "coach", size: "l" }] });
  S.profiles = [p]; S.activeId = p.id; S.logs = {};
  for (let d = 0; d < 6; d++) { const date = addDays(today(), -d); addEntry("meals", { id: uid(), date, slot: "lunch", name: "Jollof rice", cal: 500 + d * 30, dish: "jollof", extras: [], est: false }); setVital(date, "steps", 8000 + d * 100); }
  saveProfile(); await flush(); render(); return true; })()`);
await ev(`P().widgets.find(w => w.k === "coach").size = "l"; render(); true`);
await goto("#/home");

const key = async (k, code, vk) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); await sleep(250); };
const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`); await sleep(260); };
const setSel = async (id, v) => { await ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`); await sleep(260); };
const cards = () => ev(`[...document.querySelectorAll("#snack-ideas .dish")].map(d => ({ id: d.dataset.snack, name: d.querySelector("h3").textContent, cal: parseInt(d.querySelector("[data-snack-cal]").textContent, 10), txt: d.textContent }))`);
const status = () => ev(`document.querySelector('#snack-ideas [role="status"]')?.textContent.trim()`);
const todayList = () => ev(`onDate("snacks", today()).map(s => ({ name: s.name, qty: s.qty, cal: s.cal }))`);

await ev(`UI.snackRegion = "all"; UI.snackQ = ""; UI.snackNoAl = false; UI.snackSort = "default"; UI.snackMult = {}; render(); true`);
await view(1280, 900); await goto("#/snacks"); await sleep(300);

console.log("--- 1. The page: one card per snack with Recipe, servings and Add to today; text only");
let cs = await cards();
const TOTAL = await ev(`SNACKS.length`);
ok("every snack in All regions has a card", cs.length === TOTAL && TOTAL > 20, cs.length + " of " + TOTAL);
ok("each card has a Recipe button, a servings select and Add to today", await ev(`[...document.querySelectorAll("#snack-ideas .dish")].every(d => d.querySelector('[data-act="snack-recipe"]') && d.querySelector('select[id^="sq-"]') && d.querySelector('[data-act="add-snack"]'))`));
ok("the servings select offers 0.5, 1, 1.5, 2 and 3 servings, set to 1", await ev(`(() => { const s = document.querySelector('select[id^="sq-"]'); return [...s.options].map(o => o.value).join() === "0.5,1,1.5,2,3" && s.value === "1"; })()`));
const media = await ev(`(() => { const bad = d => [...d.querySelectorAll("img,svg,i,picture,canvas")].find(e => !e.closest(".wl-sel")); return [...document.querySelectorAll("#snack-ideas .dish")].filter(d => bad(d) || /\\p{Extended_Pictographic}/u.test(d.textContent)).map(d => d.dataset.snack + ":" + (bad(d)?.outerHTML.slice(0, 50) || [...d.textContent.matchAll(/\\p{Extended_Pictographic}/gu)].join())).slice(0, 4).join(" | ") })()`);
ok("food cards stay text only: no image, icon, svg or emoji on a card (the select's own chevron aside)", media === "", media);
ok("the how-to text is no longer printed inside every card", await ev(`!document.querySelector("#snack-ideas .dish details") && ![...document.querySelectorAll("#snack-ideas .dish")].some(d => d.textContent.includes(SNACKS[0].how.slice(0, 30)))`));
ok("the Recipe button names its snack for screen readers and announces a dialog", await ev(`(() => { const b = document.querySelector('[data-act="snack-recipe"]'); return b.getAttribute("aria-haspopup") === "dialog" && /How to make it: /.test(b.getAttribute("aria-label")) && b.getAttribute("aria-label").includes(b.closest(".dish").querySelector("h3").textContent); })()`));
ok("the results line says how many snacks and where", /^Showing \d+ snacks in all regions$/.test(await status()), await status());
await shot("snacks-1280");

console.log("--- 2. Region, search, No allergens and sort");
await click('[data-act="snack-region"][data-v="west"]');
const westN = await ev(`SNACKS.filter(s => s.r === "west").length`); cs = await cards();
ok("a region narrows the list and the results line follows", cs.length === westN && (await status()) === `Showing ${westN} snacks in West Africa`, await status());
await click('[data-act="snack-region"][data-v="all"]');
const noAlN = await ev(`SNACKS.filter(s => !s.al.length).length`);
await click('[data-act="snack-noal"]'); cs = await cards();
ok("No allergens shows only snacks with no allergens listed", cs.length === noAlN && noAlN > 0 && noAlN < TOTAL && cs.every(c => /No common allergens/.test(c.txt)), cs.length + " vs " + noAlN);
ok("the chip is pressed and the results line says so", await ev(`document.querySelector('[data-act="snack-noal"]').getAttribute("aria-pressed")`) === "true" && /no allergens listed$/.test(await status()), await status());
ok("Clear filters appears once a filter is on", await ev(`!!document.querySelector('[data-act="snack-reset"]')`));
await setSel("s-sort", "low"); cs = await cards();
ok("Lowest calories sorts ascending (and keeps the No allergens filter)", cs.length === noAlN && cs.every((c, i) => !i || cs[i - 1].cal <= c.cal) && await ev(`document.getElementById("s-sort").value`) === "low", cs.map(c => c.cal).join());
await setSel("s-sort", "high"); cs = await cards();
ok("Highest calories sorts descending", cs.every((c, i) => !i || cs[i - 1].cal >= c.cal) && cs[0].cal > cs[cs.length - 1].cal, cs.map(c => c.cal).join());
await click('[data-act="snack-reset"]'); cs = await cards();
ok("Clear filters restores every snack, default order, chip off, nothing left in the box", cs.length === TOTAL && await ev(`document.querySelector('[data-act="snack-noal"]').getAttribute("aria-pressed") === "false" && document.getElementById("s-sort").value === "default" && !document.querySelector('[data-act="snack-reset"]')`) && cs[0].id === await ev(`SNACKS[0].id`));
await ev(`(() => { const e = document.getElementById("s-q"); e.value = "puff"; e.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`); await sleep(500);
cs = await cards();
ok("search narrows the list by name or country", cs.length >= 1 && cs.every(c => /puff/i.test(c.name)) && cs.length < TOTAL, JSON.stringify(cs.map(c => c.name)));
await ev(`(() => { const e = document.getElementById("s-q"); e.value = "zzzz"; e.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`); await sleep(500);
ok("no match shows a message and a Clear filters button", await ev(`/No snacks match/.test(document.querySelector("#snack-ideas .empty")?.textContent || "") && !!document.querySelector('#snack-ideas .empty [data-act="snack-reset"]')`));
await click('#snack-ideas .empty [data-act="snack-reset"]');
ok("Clear filters empties the search box and restores the list", await ev(`document.getElementById("s-q").value === ""`) && (await cards()).length === TOTAL);

console.log("--- 3. Servings: 0.5x to 3x on each card, kept per snack, logged once");
await ev(`UI.snackRegion = "west"; render(); true`); await sleep(200);
const chin = await ev(`SNACKS.find(s => s.id === "chinchin").cal`);
await setSel("sq-chinchin", "2");
ok("choosing 2 servings doubles the calories shown on that card only", await ev(`document.querySelector('[data-snack-cal="chinchin"]').textContent`) === `${chin * 2} cal` && await ev(`document.querySelector('[data-snack-cal="puffpuff"]').textContent`) === `${await ev(`SNACKS.find(s => s.id === "puffpuff").cal`)} cal`);
await setSel("sq-chinchin", "0.5");
ok("0.5 serving halves it (rounded)", await ev(`document.querySelector('[data-snack-cal="chinchin"]').textContent`) === `${Math.round(chin * 0.5)} cal`);
await ev(`render(); true`); await sleep(200);
ok("the choice survives a re-render", await ev(`document.getElementById("sq-chinchin").value`) === "0.5" && await ev(`document.querySelector('[data-snack-cal="chinchin"]').textContent`) === `${Math.round(chin * 0.5)} cal`);
await setSel("sq-chinchin", "3");
await click('[data-act="add-snack"][data-id="chinchin"]');
let tl = await todayList();
ok("Add to today logs the snack once, with the quantity and scaled calories", tl.length === 1 && tl[0].name === "Chin chin" && tl[0].qty === 3 && tl[0].cal === Math.round(chin * 3), JSON.stringify(tl));
ok("Today's snacks lists it and the logged pill counts it", await ev(`/Chin chin\\s*× 3/.test(document.getElementById("snack-today").textContent)`) && (await ev(`document.querySelector(".snack-pill").textContent.trim()`)) === `1 logged · ${Math.round(chin * 3).toLocaleString()} cal`, await ev(`document.querySelector(".snack-pill").textContent`));
await setSel("sq-puffpuff", "1");
await click('[data-act="add-snack"][data-id="puffpuff"]');
tl = await todayList();
ok("a second snack at 1 serving adds a second entry; the pill sums them", tl.length === 2 && tl[1].qty === 1 && (await ev(`document.querySelector(".snack-pill").textContent.trim()`)).startsWith("2 logged · "));
ok("the header line under Snacks agrees with the pill", await ev(`new RegExp(onDate("snacks", today()).reduce((a, s) => a + s.cal, 0).toLocaleString() + " cal from 2 snacks today").test(document.querySelector(".cathead").textContent)`));
await ev(`document.querySelector("#snack-today").scrollIntoView(); window.scrollTo(0, document.body.scrollHeight); true`); await sleep(200);
await click(".snack-pill");
ok("tapping the pill takes you to Today's snacks and moves focus there", await ev(`document.activeElement?.id === "snack-today"`));

console.log("--- 4. The recipe drawer");
await ev(`UI.snackMult = {}; render(); true`); await sleep(200);
const aka = await ev(`(({ n, how, cal }) => ({ n, how, cal }))(SNACKS.find(s => s.id === "akarasnack"))`);
await ev(`document.querySelector('[data-act="snack-recipe"][data-id="akarasnack"]').focus(); true`);
await click('[data-act="snack-recipe"][data-id="akarasnack"]'); await sleep(350);
const dlg = await ev(`(() => { const c = document.querySelector("#pop-snackrecipe .pop-card"); if (!c) return null; const h = document.getElementById(c.getAttribute("aria-labelledby")); return { role: c.getAttribute("role"), modal: c.getAttribute("aria-modal"), name: h?.textContent, inside: c.contains(document.activeElement), active: document.activeElement?.className, txt: c.textContent, media: !!c.querySelector("img,svg:not(.icon),picture,canvas,i"), cls: document.getElementById("pop-snackrecipe").className }; })()`);
ok("opens a dialog named after the snack, with focus moved inside", dlg && dlg.role === "dialog" && dlg.modal === "true" && dlg.name === aka.n && dlg.inside, JSON.stringify(dlg));
ok("shows the app's own how-to text, the serving and the calories", dlg && dlg.txt.includes(aka.how.slice(0, 40)) && dlg.txt.includes("How to make it") && dlg.txt.includes(`${aka.cal} cal`), dlg && dlg.txt.slice(0, 200));
ok("the opener reports expanded while the drawer is open", await ev(`document.querySelector('[data-act="snack-recipe"][data-id="akarasnack"]').getAttribute("aria-expanded")`) === "true");
ok("the drawer is text only apart from the close icon", dlg && !(await ev(`!!document.querySelector("#pop-snackrecipe img, #pop-snackrecipe picture, #pop-snackrecipe canvas")`)) && !/\p{Extended_Pictographic}/u.test(dlg.txt));
await setSel("sr-mult", "2");
ok("changing servings in the drawer updates its calories and the card behind it", await ev(`document.getElementById("sr-cal").textContent`) === `${aka.cal * 2} cal` && await ev(`document.getElementById("sq-akarasnack").value`) === "2" && await ev(`document.querySelector('[data-snack-cal="akarasnack"]').textContent`) === `${aka.cal * 2} cal`);
await ev(`document.querySelector("#pop-snackrecipe [data-act='snack-recipe-add']").focus(); true`);
await key("Tab", "Tab", 9);
ok("Tab from the last control wraps to the first, so focus stays in the drawer", await ev(`document.activeElement?.classList.contains("sheet-x")`));
await sleep(200);
ok("the card's own servings control shows the new choice too", await ev(`document.querySelector('[data-snack="akarasnack"] .wl-v')?.textContent`) === "2 servings", await ev(`document.querySelector('[data-snack="akarasnack"] .wl-v')?.textContent`));
await key("Escape", "Escape", 27); await sleep(300);
ok("Escape closes it and focus goes back to the Recipe button", await ev(`!document.getElementById("pop-snackrecipe") && document.activeElement === document.querySelector('[data-act="snack-recipe"][data-id="akarasnack"]')`));
await click('[data-act="snack-recipe"][data-id="akarasnack"]'); await sleep(300);
await ev(`document.querySelector("#pop-snackrecipe .pop-scrim").click(); true`); await sleep(300);
ok("clicking outside closes it", await ev(`!document.getElementById("pop-snackrecipe")`));
await click('[data-act="snack-recipe"][data-id="akarasnack"]'); await sleep(300);
await ev(`location.hash = "#/nutrition"; true`); await sleep(500);
ok("changing page closes it", await ev(`!document.getElementById("pop-snackrecipe")`));
await goto("#/snacks"); await sleep(300);
const before = (await todayList()).length;
await click('[data-act="snack-recipe"][data-id="akarasnack"]'); await sleep(300);
await setSel("sr-mult", "1.5");
await click('[data-act="snack-recipe-add"]'); await sleep(300);
tl = await todayList();
ok("Add to today in the drawer logs at that serving once and closes the drawer", tl.length === before + 1 && tl[tl.length - 1].name === aka.n && tl[tl.length - 1].qty === 1.5 && tl[tl.length - 1].cal === Math.round(aka.cal * 1.5) && await ev(`!document.getElementById("pop-snackrecipe")`), JSON.stringify(tl));

console.log("--- 5. Spanish");
await ev(`wlaSetLang("es"); true`); await sleep(400); await goto("#/snacks"); await sleep(300);
ok("labels, results line and pill are Spanish", await ev(`(() => { const t = document.querySelector("#snack-ideas").textContent; return /Sin alérgenos|Sin alergenos/i.test(t) && /Mostrando \\d+ bocadillos/.test(document.querySelector('#snack-ideas [role="status"]').textContent) && /registrados? · /.test(document.querySelector(".snack-pill").textContent); })()`), await ev(`document.querySelector("#snack-ideas").textContent.slice(0, 400)`));
ok("the Recipe button, servings and sort options are Spanish", await ev(`(() => { const d = document.querySelector("#snack-ideas .dish"); return /Receta/.test(d.querySelector('[data-act="snack-recipe"]').textContent) && /porci/i.test(d.querySelector("select").selectedOptions[0].textContent) && /Menos calor|Calor/i.test(document.getElementById("s-sort").textContent); })()`), await ev(`document.querySelector("#snack-ideas .dish").textContent`));
await click('[data-act="snack-recipe"][data-id="chinchin"]'); await sleep(350);
ok("the drawer shows the Spanish how-to text", await ev(`/Mezcla 2 tazas de harina/.test(document.querySelector("#pop-snackrecipe")?.textContent || "") && !/Mix 2 cups flour/.test(document.querySelector("#pop-snackrecipe").textContent)`));
await key("Escape", "Escape", 27); await sleep(300);
await ev(`wlaSetLang("en"); true`); await sleep(400);

console.log("--- 6. Touch targets and layout at phone, tablet and desktop widths");
for (const [w, h] of [[375, 800], [820, 1100], [1440, 900]]) {
  await view(w, h); await goto("#/snacks"); await sleep(400);
  const m = await ev(`(() => { const small = [...document.querySelectorAll('#snack-ideas button, #snack-ideas select, #snack-ideas input, #snack-ideas .chip')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => (e.dataset.act || e.id || e.className) + ":" + Math.round(e.getBoundingClientRect().height)); const over = document.documentElement.scrollWidth - innerWidth; const clip = [...document.querySelectorAll("#snack-ideas .dish")].filter(d => d.scrollWidth > d.clientWidth + 1).length; return { small: small.slice(0, 6), over, clip }; })()`);
  ok(`${w}px: every control on the page is at least 44px tall`, m.small.length === 0, JSON.stringify(m.small));
  ok(`${w}px: no sideways scroll and nothing clipped inside a card`, m.over <= 0 && m.clip === 0, JSON.stringify(m));
  await shot(`snacks-${w}`);
}
await view(390, 800); await goto("#/snacks"); await sleep(300);
await ev(`document.querySelector('[data-act="snack-recipe"][data-id="chinchin"]').click(); true`); await sleep(500);
let r = await ev(`(() => { const c = document.querySelector("#pop-snackrecipe .pop-card").getBoundingClientRect(); return { l: Math.round(c.left), r: Math.round(c.right), t: Math.round(c.top), b: Math.round(c.bottom), w: innerWidth, h: innerHeight }; })()`);
ok("on a phone the drawer is a bottom sheet inside the screen", r.l >= 0 && r.r <= r.w + 1 && Math.abs(r.b - r.h) <= 2 && r.t > 0 && r.t < r.h * 0.8, JSON.stringify(r));
await shot("snacks-drawer-390");
await key("Escape", "Escape", 27); await sleep(300);
await view(1280, 900); await goto("#/snacks"); await sleep(300);
await ev(`document.querySelector('[data-act="snack-recipe"][data-id="chinchin"]').click(); true`); await sleep(500);
r = await ev(`(() => { const c = document.querySelector("#pop-snackrecipe .pop-card").getBoundingClientRect(); return { l: Math.round(c.left), r: Math.round(c.right), t: Math.round(c.top), b: Math.round(c.bottom), w: innerWidth, cw: document.documentElement.clientWidth, h: innerHeight }; })()`);
ok("on a tablet or desktop it docks to the right edge at full height", Math.abs(r.r - r.cw) <= 2 && r.t <= 1 && Math.abs(r.b - r.h) <= 2 && r.cw - r.l <= 450, JSON.stringify(r));
await shot("snacks-drawer-1280");
await key("Escape", "Escape", 27); await sleep(300);

console.log("--- 7. Light, dark and OLED");
for (const mode of ["dark", "oled", "light"]) {
  await ev(`P().look = Object.assign(P().look || {}, { mode: ${JSON.stringify(mode)} }); applyLook(P()); render(); true`); await sleep(300);
  await ev(`document.querySelector('[data-act="snack-recipe"][data-id="chinchin"]').click(); true`); await sleep(500);
  const c = await ev(`(() => { const card = document.querySelector("#pop-snackrecipe .pop-card"), bg = getComputedStyle(card).backgroundColor, a = bg.match(/[\\d.]+/g).map(Number); return { bg, opaque: a.length < 4 || a[3] === 1, text: getComputedStyle(card.querySelector("h2")).color }; })()`);
  ok(`${mode}: the drawer has a solid background and its heading is readable`, c.opaque && c.bg !== c.text, JSON.stringify(c));
  await shot(`snacks-drawer-${mode}`);
  await key("Escape", "Escape", 27); await sleep(300);
}

ok("no script errors on the page", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
