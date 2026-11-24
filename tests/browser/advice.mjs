import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/advice.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.21: the coach advice card marks a repeat of yesterday's advice and, in the evening, reviews today by name and sets up tomorrow by weekday.
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
}).listen(8797, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9360", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-advice-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9360/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*", "*/vendor/supabase*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
await send("Page.addScriptToEvaluateOnNewDocument", { source: "Date.prototype.getHours = function () { return 19; };" }); // always evening
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
await send("Page.navigate", { url: "http://127.0.0.1:8797/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", coachPersona: "enforcer" });
  S.profiles = [p]; S.activeId = p.id; S.logs = {};
  addEntry("meals", { id: uid(), date: today(), slot: "lunch", name: "Banku with okro stew", cal: 600, dish: null, extras: [], est: false });
  addEntry("workouts", { id: uid(), date: addDays(today(), -2), type: "strength", minutes: 40 });
  addEntry("workouts", { id: uid(), date: today(), type: "run", minutes: 30 });
  saveProfile(); await flush(); render(); return true; })()`);

console.log("--- 1. the evening review and tomorrow's plan");
const tomorrow = await ev(`parseYmd(addDays(today(), 1)).toLocaleDateString("en-US", { weekday: "long" })`);
const lastDow = await ev(`parseYmd(addDays(today(), -2)).toLocaleDateString("en-US", { weekday: "long" })`);
const items = await ev(`coachAdviceItems(P())`);
const ev1 = items.find(i => i.k === "evening");
ok("an evening item is built from today's log", !!ev1, JSON.stringify(items));
ok("it names the lunch dish and its calories", /Banku with okro stew \(600 cal\)/.test(ev1?.text || ""), ev1?.text);
ok("it names today's workout and the last earlier session by weekday", /Running for 30 min/.test(ev1?.text || "") && (ev1?.text || "").includes(lastDow), ev1?.text);
ok("it sets up tomorrow by weekday name", (ev1?.text || "").includes(tomorrow), ev1?.text);
ok("it is first, so it survives the two-item cap", items[0]?.k === "evening");
await ev(`(() => { const p = P(); S.logs = {}; logIdxDrop(); return true; })()`);
ok("with nothing logged today there is no evening item", !(await ev(`coachAdviceItems(P())`)).some(i => i.k === "evening"));

console.log("--- 2. repeats are marked, in the coach's voice");
await ev(`(() => { const p = P(); addEntry("meals", { id: uid(), date: today(), slot: "lunch", name: "Waakye", cal: 580, dish: null, extras: [], est: false }); localStorage.removeItem(ukey("wlh.advice." + p.id)); return true; })()`);
const first = await ev(`adviceRepeats(coachAdviceItems(P()), P()).map(i => i.text)`);
ok("the first showing is plain", first.length > 0 && first.every(t => !/^Second day running/.test(t)), first.join(" | "));
// Pretend today's fingerprints were yesterday's.
await ev(`(() => { const p = P(), k = ukey("wlh.advice." + p.id), h = JSON.parse(localStorage.getItem(k)); h[addDays(today(), -1)] = h[today()]; delete h[today()]; localStorage.setItem(k, JSON.stringify(h)); return true; })()`);
const again = await ev(`adviceRepeats(coachAdviceItems(P()), P()).map(i => i.text)`);
ok("the same advice on the same data is marked as a second day (Enforcer)", again.length > 0 && again.every(t => /Second day running: /.test(t)), again.join(" | "));
await ev(`P().coachPersona = "motivator"; true`);
ok("the Motivator marks it in its own words", (await ev(`adviceRepeats(coachAdviceItems(P()), P()).map(i => i.text)`)).every(t => /Still the one to fix: /.test(t)));
await ev(`(() => { const p = P(), k = ukey("wlh.advice." + p.id), h = JSON.parse(localStorage.getItem(k)); h[addDays(today(), -1)] = ["evening:other", "water:99"]; localStorage.setItem(k, JSON.stringify(h)); return true; })()`);
ok("changed data is not marked", (await ev(`adviceRepeats(coachAdviceItems(P()), P()).map(i => i.text)`)).every(t => !/Still the one to fix|Second day|Unchanged since/.test(t)));
ok("only the last two days are kept", Object.keys(await ev(`JSON.parse(localStorage.getItem(ukey("wlh.advice." + P().id)))`)).length <= 2);
ok("sign-out and delete-everything clear the history", await ev(`LS_USER_BASES.some(b => ukey("wlh.advice." + P().id).startsWith(b))`));
console.log("--- 3. protein from logged dishes, and West African first when no culture is set (8.6.18)");
await ev(`(() => { const p = P(); p.coachPersona = "enforcer"; p.weightKg = 70; p.culture = ""; S.logs = {}; logIdxDrop();
  addEntry("meals", { id: uid(), date: today(), slot: "lunch", name: "Beef suya (1.5\u00d7 portion)", cal: 630, dish: "suya", extras: [], est: false });
  addEntry("meals", { id: uid(), date: today(), slot: "dinner", name: "Typed by hand", cal: 400, dish: null, extras: [], est: false });
  for (let i = 1; i <= 4; i++) addEntry("meals", { id: uid(), date: addDays(today(), -i), slot: "lunch", name: "Fried yam with pepper sauce", cal: 480, dish: "friedyam", extras: [], est: false });
  return true; })()`);
const pt = await ev(`proteinOn(today())`);
ok("protein is the dish's grams times the portion, hand-typed meals left out", pt.g === 60 && pt.counted === 1 && pt.meals === 2, JSON.stringify(pt));
const pItem = (await ev(`coachAdviceItems(P())`)).find(i => i.k === "protein");
ok("four fully logged low-protein days give a protein item naming a West African dish", !!pItem && /about 6 g a day against roughly 112 g/.test(pItem.text), pItem?.text);
const sf = await ev(`(() => { const p = P(); p.culture = ""; const s = shortfallAdvice({ ...p, calorieGoal: 5000 }); return s ? s.dense.map(d => d.r) : null; })()`);
ok("with no culture set the shortfall suggestions are all West African", Array.isArray(sf) && sf.length > 0 && sf.every(r => r === "west"), JSON.stringify(sf));
ok("the day's glance shows the protein line", await ev(`(() => { UI.route; return /Protein: about 60 g from 1 of 2 meals/.test(glanceCardNutrition(P(), today(), onDate("meals", today()), []).replace(/<[^>]+>/g, "")); })()`));
console.log("--- 4. Open Food Facts search: off until turned on, sends only the typed words, logs as an estimate (8.6.19)");
await ev(`(() => { const o = window.fetch; window.__off = []; window.fetch = (u, x) => { if (/openfoodfacts/.test(String(u))) { window.__off.push(String(u)); return Promise.resolve(new Response(JSON.stringify({ products: [{ product_name: "Kenkey <b>x</b>", brands: "Acme, Co", nutriments: { "energy-kcal_100g": 140, proteins_100g: 3.1 }, serving_quantity: 200 }, { product_name: "No calories", nutriments: {} }, { product_name: "Absurd", nutriments: { "energy-kcal_100g": 5000 } }] }), { status: 200 })); } return o(u, x); }; S.logs = {}; logIdxDrop(); delete P().foodSearchOk; location.hash = "#/nutrition"; return true; })()`);
ok("the nutrition page opens with a Search more foods chip", await waitFor(`!!document.querySelector('[data-act="off-open"]')`), errors.join(" | "));
await ev(`document.querySelector('[data-act="off-open"]').click(); true`);
ok("before it is turned on the panel explains what is sent and has no search box", await ev(`!!document.querySelector('#off-panel [data-act="off-on"]') && !document.querySelector('#off-q') && /words you type are sent to world\\.openfoodfacts\\.org/.test(document.querySelector('#off-panel').textContent)`));
ok("nothing has been sent yet", (await ev(`window.__off.length`)) === 0);
await ev(`document.querySelector('[data-act="off-on"]').click(); true`);
await ev(`(() => { document.querySelector('#off-q').value = "kenkey"; document.querySelector('[data-form="off-search"]').requestSubmit(); return true; })()`);
ok("a search shows only matches that have calories, as text", await waitFor(`document.querySelectorAll('[data-act="off-pick"]').length === 1`), await ev(`document.querySelector('#off-panel')?.textContent`));
ok("the request carries only the typed words", await ev(`window.__off.length === 1 && /^https:\\/\\/world\\.openfoodfacts\\.org\\/cgi\\/search\\.pl\\?search_terms=kenkey&/.test(window.__off[0]) && !/Ada/.test(window.__off[0])`), await ev(`window.__off[0]`));
ok("the product name is escaped and shows calories per 100 g and the serving", await ev(`(() => { const b = document.querySelector('[data-act="off-pick"]'); return !b.querySelector("b b") && b.textContent.includes("Kenkey <b>x</b>") && /140 cal per 100 g/.test(b.textContent) && /serving 200 g/.test(b.textContent) && !b.querySelector("img"); })()`));
await ev(`document.querySelector('[data-act="off-pick"]').click(); true`);
ok("picking fills the name and the serving's calories", await ev(`document.getElementById("m-name").value === "Kenkey <b>x</b>" && document.getElementById("m-cal").value === "280"`));
await ev(`document.querySelector('[data-act="log-meal"]').click(); true`);
ok("the meal is logged as an estimate with no dish id", await ev(`(() => { const m = onDate("meals", today()).find(x => /Kenkey/.test(x.name)); return !!m && m.est === true && m.cal === 280 && m.dish === null; })()`), await ev(`JSON.stringify(onDate("meals", today()))`));
await ev(`(() => { P().foodSearchOk = true; location.hash = "#/nutrition"; render(); document.querySelector('[data-act="off-open"]').click(); return true; })()`);
await ev(`document.querySelector('[data-act="off-off"]').click(); true`);
ok("Turn off removes the switch and the search box", await ev(`!P().foodSearchOk && !document.querySelector('#off-q')`));
ok("no page errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
