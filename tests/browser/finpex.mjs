import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/finpex.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.5.2: Finpex adaptations: Premium page extras, Web app layout, offline note, Coming up and the score card.
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
}).listen(8811, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9371", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-finpex-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9371/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8811/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30 });
  S.profiles = [p]; S.activeId = p.id; S.logs = {}; saveProfile(); await flush(); render(); return true; })()`);
await goto("#/premium");
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const store = () => ev(`JSON.parse(localStorage.getItem("wl-appearance") || "null")`);
const rows = () => ev(`[...document.querySelectorAll("#wl-review .small")].map(e => e.textContent)`);

console.log("--- 1. Premium page: what stays open, pills, FAQ, advice note");
await sleep(400);
ok("What stays open on Free is shown", await ev(`/What stays open on Free/.test(document.querySelector(".stays-open")?.textContent || "")`));
ok("the pill strip mixes free pills and PREMIUM badges", await ev(`document.querySelectorAll(".pill-strip .pill").length >= 6 && document.querySelectorAll(".pill-strip .tier-badge.premium").length === 3`));
ok("the FAQ uses native details and every summary is 44px", await ev(`(() => { const s = [...document.querySelectorAll(".prem-faq details.faq > summary")]; return s.length === 3 && s.every(x => x.getBoundingClientRect().height >= 43.5); })()`));
ok("the not-medical-advice note is there", await ev(`/not medical advice/.test(document.querySelector(".advice-banner")?.textContent || "")`));
ok("pills are 44px tall", await ev(`[...document.querySelectorAll(".pill-strip .pill")].every(x => x.getBoundingClientRect().height >= 43.5)`));
ok("no free trial is promised on the page", await ev(`!/free trial/i.test(document.querySelector(".prem-store-page")?.textContent || "")`));
ok("tier badge text sits on a solid colour, not a gradient", await ev(`getComputedStyle(document.querySelector(".tier-badge.premium")).backgroundImage === "none"`));

console.log("--- 2. Layout setting");
await goto("#/settings/appearance");
ok("Layout row with App and Web app", await ev(`[...document.querySelectorAll('[data-act="ui-layout"]')].map(b => b.textContent).join() === "App,Web app" && document.querySelector('[data-act="ui-layout"][data-v="app"]').getAttribute("aria-pressed") === "true"`));
const wrapW = () => ev(`document.querySelector(".app .wrap").getBoundingClientRect().width`);
await view(1900);
const before = await wrapW();
await click('[data-act="ui-layout"][data-v="webapp"]'); await sleep(300);
ok("Web app applies at once and is listed for review", await ev(`document.documentElement.dataset.layout === "webapp"`) && (await rows()).some(t => t.includes("Layout")));
ok("the page is wider at 1900px", (await wrapW()) > before + 100, `${before} -> ${await wrapW()}`);
await view(800);
ok("at 800px Web app looks like App", await ev(`getComputedStyle(document.querySelector(".app .wrap")).maxWidth === "960px"`));
await view(375, 812);
ok("at 375px nothing overflows", await ev(`document.documentElement.scrollWidth <= innerWidth + 2`));
await view(1900);
await click("#wl-review .btn.primary"); await sleep(300);
ok("Save keeps Web app and writes it to wl-appearance", (await store())?.layout === "webapp");
await send("Page.reload"); await sleep(500);
ok("it survives a reload and is applied before the app boots", await waitFor(`${READY} && document.documentElement.dataset.layout === "webapp"`, 15000));
await goto("#/settings/appearance");
await click('[data-act="ui-layout"][data-v="app"]'); await click("#wl-review .btn.primary"); await sleep(300);
ok("switching back to App restores the default", await ev(`document.documentElement.dataset.layout === "app"`) && (await store())?.layout === "app");

console.log("--- 3. Coming up today and the score card");
await goto("#/home");
ok("Coming up lists water to go and no food logged", await ev(`(() => { const t = document.querySelector("#wlComingUp")?.textContent || ""; return /Water: .* to go/.test(t) && /No food logged yet today/.test(t); })()`));
ok("no score yet while nothing is logged and no workout target data exists", await ev(`!!document.querySelector("#wlScore") === (S.profiles[0].workoutGoal != null)`));
await ev(`(() => { const t = today(); setVital(t, "water", 1350); addEntry("meals", { id: uid(), date: t, slot: "lunch", name: "Test", cal: 1000, extras: [] }); render(); return true; })()`);
await goto("#/home");
const sc = await ev(`({ n: document.querySelector("#wlScore .ws-num")?.textContent, t: document.querySelector("#wlScore")?.textContent })`);
ok("score = weighted mean of activity 0 (30), water 50 (20), nutrition 100 (20) = 43", sc?.n === "43", JSON.stringify(sc));
ok("the card says what the number is and lists parts with no data", /not your health/.test(sc?.t || "") && /Activity/.test(sc?.t || "") && /Water/.test(sc?.t || ""));
ok("no sample numbers: the card disappears with no data", await ev(`(() => { const L = S.logs[S.activeId]; const m = monthOf(today()); setVital(today(), "water", null); S.profiles[0].workoutGoal = null; S.profiles[0].calorieGoal = null; render(); return !document.querySelector("#wlScore"); })()`));
ok("the score formula is in a details block with a 44px summary", await ev(`(() => { S.profiles[0].workoutGoal = 4; render(); const s = document.querySelector("#wlScore details summary"); return !!s && s.getBoundingClientRect().height >= 43.5; })()`));
ok("Coming up rows are tappable and at least 44px", await ev(`[...document.querySelectorAll("#wlComingUp a")].length > 0 && [...document.querySelectorAll("#wlComingUp a")].every(a => a.getBoundingClientRect().height >= 43.5)`));
await view(375, 812);
ok("Home fits 375px", await ev(`document.documentElement.scrollWidth <= innerWidth + 2`));

console.log("--- 4. Offline note");
await view(1200);
await ev(`localStorage.removeItem("wlh.offlinetoast"); true`);
await send("Page.reload"); await sleep(500);
ok("once a worker is active a quiet note lands in the bell, once", await waitFor(`localStorage.getItem("wlh.offlinetoast") === "1" && document.body.innerText.length > 0`, 25000));
ok("it is a bell note, not a toast", await ev(`!document.querySelector(".swipe-toast") && Object.keys(localStorage).some(k => k.startsWith("wlh.notif.") && /ready to work offline/i.test(localStorage.getItem(k)))`));
ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} });
process.exit(fail ? 1 : 0);
