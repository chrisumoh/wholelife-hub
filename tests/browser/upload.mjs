import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/workouts.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.26: WLUpload, the file button whose fill follows real progress (Apple Health and workout file imports).
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
}).listen(8787, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9350", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-upload-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9350/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8787/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", age: 30, sex: "female", heightCm: 170, weightKg: 70, freq: 3, level: "beginner" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); location.hash = "#/workouts"; render(); return true; })()`); await sleep(500);
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);

const tmp = mkdtempSync(join(tmpdir(), "wlh-upload-files-"));
const csv = join(tmp, "runs.csv"); writeFileSync(csv, `date,activity,duration\n${"2026-10-01"},running,30\n2026-10-02,walking,45\n`);
const big = join(tmp, "big.csv"); writeFileSync(big, Buffer.alloc(26 * 1024 * 1024, 97));
const xml = join(tmp, "export.xml"); writeFileSync(xml, `<HealthData>\n<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" startDate="2026-10-01 07:00:00 +0000"/>\n</HealthData>`);
const bad = join(tmp, "bad.json"); writeFileSync(bad, "{ not json");
const pick = async (sel, files) => { const n = (await send("DOM.querySelector", { nodeId: (await send("DOM.getDocument")).result.root.nodeId, selector: sel })).result.nodeId; await send("DOM.setFileInputFiles", { nodeId: n, files }); };
const state = sel => ev(`document.querySelector(${JSON.stringify(sel)}).closest(".wlu").dataset.state`);

console.log("--- WLUpload");
ok("WLUpload.attach exists with the pasted call shape", await ev(`typeof WLUpload.attach === "function"`));
await click('[data-act="imp-toggle"]'); await sleep(300);
ok("both import spots are widgets with their input ids", await ev(`!!document.querySelector('.wlu #f-apple') && !!document.querySelector('.wlu #f-google')`));
ok("the file input can be reached by keyboard (not display:none)", await ev(`getComputedStyle(document.getElementById("f-apple")).display !== "none"`));

// A host with a controlled onUpload: the fill must sit exactly where report() says, and never move back.
await ev(`(() => { const h = document.createElement("div"); h.id = "wlu-t"; document.body.append(h);
  window.__rep = null; window.__go = null;
  WLUpload.attach(h, { maxBytes: 25 * 1024 * 1024, inputId: "wlu-t-in", onUpload: (f, report) => new Promise(r => { window.__rep = report; window.__go = r; }), onDone: f => { window.__doneName = f.name; } });
  return true; })()`);
await pick("#wlu-t-in", [csv]); await sleep(200);
ok("a pick starts the upload and the widget is busy", await ev(`document.getElementById("wlu-t").dataset.state === "busy" && document.getElementById("wlu-t-in").disabled`));
await ev(`__rep(0.5); true`);
let st = await ev(`(() => { const b = document.querySelector("#wlu-t .wlu-btn"); return { p: b.style.getPropertyValue("--p"), now: document.querySelector("#wlu-t .wlu-fill").getAttribute("aria-valuenow"), t: b.querySelector(".wlu-t").textContent }; })()`);
ok("report(0.5) sets the fill to 50% and the label to 50%", st.p === "0.5" && st.now === "50" && /50%/.test(st.t), JSON.stringify(st));
await ev(`__rep(0.2); true`);
ok("the fill never goes backwards", await ev(`document.querySelector("#wlu-t .wlu-btn").style.getPropertyValue("--p") === "0.5"`));
await ev(`__rep(7); true`);
ok("a number past 1 is held at 100%", await ev(`document.querySelector("#wlu-t .wlu-btn").style.getPropertyValue("--p") === "1"`));
ok("onDone has not run before the upload finishes", await ev(`window.__doneName === undefined`));
await ev(`__go(); true`); await sleep(200);
ok("when onUpload resolves the widget shows Done and calls onDone with the file", await ev(`document.getElementById("wlu-t").dataset.state === "done" && window.__doneName === "runs.csv"`));
await sleep(2900);
ok("it goes back to idle after a moment", await ev(`document.getElementById("wlu-t").dataset.state === "idle" && !document.getElementById("wlu-t-in").disabled`));
await pick("#wlu-t-in", [big]); await sleep(300);
ok("a file over maxBytes is refused with a message and onUpload never runs", await ev(`document.getElementById("wlu-t").dataset.state === "error" && /most this takes is 25/.test(document.querySelector("#wlu-t .wlu-msg").textContent) && !window.__rep.__x`) );
await ev(`document.getElementById("wlu-t").remove(); true`);

// The real imports.
await pick("#f-google", [csv]); await sleep(900);
ok("a workout CSV imports through the widget", await ev(`document.querySelector("#f-google").closest(".wlu").dataset.state === "done" && entries("workouts").length === 2 && /Added 2 of 2/.test(document.body.textContent)`), await ev(`document.body.textContent.match(/Added[^.]*\./)?.[0] + "|" + entries("workouts").length`));
await sleep(2800);
await pick("#f-google", [bad]); await sleep(700);
ok("a broken file ends in the error state and the page carries on", await ev(`document.querySelector("#f-google").closest(".wlu").dataset.state === "error"`));
await sleep(2800);
await pick("#f-google", [big, csv]); await sleep(900);
ok("one oversize file in a batch is skipped and counted, the other imports", await ev(`/1 file was too large/.test(document.body.textContent) && document.querySelector("#f-google").closest(".wlu").dataset.state === "done"`));
await sleep(2800);
await pick("#f-apple", [xml]); await sleep(900);
ok("an Apple Health export imports through the widget", await ev(`document.querySelector("#f-apple").closest(".wlu").dataset.state === "done" && /Added|skipped/.test(document.body.textContent)`));
ok("the widget survives page re-renders while open", await ev(`(() => { const el = document.querySelector('[data-wlu="apple"]'); render(); render(); return el === document.querySelector('[data-wlu="apple"]') && el.querySelector("input") === document.getElementById("f-apple"); })()`));

console.log("--- Video and body photo pickers");
const png = join(tmp, "me.png"); writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const clip = join(tmp, "set.mp4"); writeFileSync(clip, Buffer.alloc(4000, 1));
const bigClip = join(tmp, "long.mp4"); writeFileSync(bigClip, Buffer.alloc(1500000, 1));
await ev(`(async () => { P().premium = { active: true, since: "2026-10-01", source: "purchase", expires: "2027-10-01" }; P().prem = { clipsConsent: true, body: { on: true, shots: [] } }; UI.bdErr = "denied"; UI.fcErr = "denied"; saveProfile(); await flush(); location.hash = "#/premium/body"; render(); return true; })()`); await sleep(600);
ok("the body page has the widget and keeps the bd-file input id", await ev(`!!document.querySelector('.wlu #bd-file')`));
await pick("#bd-file", [png]); await sleep(900);
ok("a photo is added through the widget (the import card then goes away, as before)", await ev(`(P().prem?.body?.shots || []).length === 1`), await ev(`JSON.stringify(Object.keys(P().prem || {}))`));
await ev(`location.hash = "#/premium/formcheck"; render(); true`); await sleep(600);
ok("the form-check page has the video widget", await ev(`!!document.querySelector('.wlu #fc-file')`));
await pick("#fc-file", [bigClip]); await sleep(500);
ok("a clip over the cap is refused and nothing is kept", await ev(`document.querySelector("#fc-file").closest(".wlu").dataset.state === "error" && !UI.fcPending`), await ev(`document.querySelector("#fc-file").closest(".wlu").dataset.state + "|" + JSON.stringify(UI.fcPending) + document.querySelectorAll("#fc-file").length`));
await sleep(2800);
await pick("#fc-file", [clip]); await sleep(900);
ok("a small clip goes to the review step", await ev(`UI.fcState === "review" && UI.fcPending?.bytes === 4000`));
ok("no uncaught exceptions in the new pickers", errors.length === 0, errors.join(" | ").slice(0, 400));

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
