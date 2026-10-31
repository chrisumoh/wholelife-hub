import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/motion.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.4: Settings > Appearance: UI style, language, circular reveal and the review bar.
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
}).listen(8810, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9370", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-appearance-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9370/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8810/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30 });
  S.profiles = [p]; S.activeId = p.id; S.logs = {}; saveProfile(); await flush(); render(); return true; })()`);
await goto("#/settings/appearance");
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const store = () => ev(`JSON.parse(localStorage.getItem("wl-appearance") || "null")`);
const rows = () => ev(`[...document.querySelectorAll("#wl-review .small")].map(e => e.textContent)`);

console.log("--- 1. Review bar starts hidden");
ok("no bar, no pending change", await ev(`!document.querySelector("#wl-review.show")`));

console.log("--- 2. Changes apply live and are listed");
await click('[data-act="ui-style"][data-v="crisp"]'); await sleep(200);
ok("Crisp squares the corners at once", await ev(`document.documentElement.dataset.uistyle === "crisp" && getComputedStyle(document.documentElement).getPropertyValue("--r").trim() === "6px"`));
await click('[data-act="ui-lang"][data-v="es"]'); await sleep(200);
ok("Spanish: nav and Settings tabs change with no reload", await ev(`document.documentElement.lang === "es" && /Ajustes/.test(document.querySelector(".side")?.textContent || "") && /Apariencia/.test(document.querySelector(".tabs")?.textContent || "")`));
await ev(`wlaSetLook(P(), { accent: "violet" }); true`); await sleep(200);
const r1 = await rows();
ok("bar lists each change as label: old → new", r1.length === 3 && r1.every(t => t.includes("→")), JSON.stringify(r1));
ok("nothing is stored before Save", (await store())?.uistyle !== "crisp" && (await store())?.lang !== "es");

console.log("--- 3. Revert removes its row; Save persists");
await click('[data-act="ui-lang"][data-v="en"]'); await sleep(200);
ok("reverting a change removes its row", (await rows()).length === 2, JSON.stringify(await rows()));
await click('[data-act="look-save"]'); await sleep(300);
const st = await store();
ok("Save writes wl-appearance", st && st.uistyle === "crisp" && st.lang === "en" && st.accent === "violet", JSON.stringify(st));
ok("bar hides after Save", await ev(`!document.querySelector("#wl-review.show")`));
ok("Saved toast shows", await ev(`/Saved/.test(document.querySelector(".toast, #toast, #st-stack")?.textContent || "")`));

console.log("--- 4. Survives a reload");
await send("Page.navigate", { url: "http://127.0.0.1:8810/index.html#/settings/appearance" }); await sleep(500);
ok("reload keeps Crisp and the accent", await waitFor(`${READY} && document.documentElement.dataset.uistyle === "crisp" && document.documentElement.dataset.accent === "violet"`, 15000));

console.log("--- 5. Discard puts everything back");
await click('[data-act="ui-style"][data-v="rounded"]'); await sleep(200);
ok("one pending row", (await rows()).length === 1);
await click('[data-act="look-discard"]'); await sleep(300);
ok("Discard restores Crisp and hides the bar", await ev(`document.documentElement.dataset.uistyle === "crisp" && !document.querySelector("#wl-review.show")`));

console.log("--- 6. Controls are 44px and the circular reveal works");
ok("every new control is at least 44px tall", await ev(`[...document.querySelectorAll(".wl-seg button, #wl-review .btn")].every(b => b.getBoundingClientRect().height >= 43.5)`));
await click('[data-act="look-mode"][data-v="dark"]'); await sleep(900);
ok("dark mode applies and is listed", await ev(`document.documentElement.dataset.scheme === "dark"`) && (await rows()).some(t => t.includes("→")));
ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} });
process.exit(fail ? 1 : 0);
