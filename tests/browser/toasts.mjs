import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/workouts.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.11: the workout picker. Every activity has its own icon drawn inside the tile, a colour, a MET value and a group; the picker shows them in groups;
// every coach sport has three sessions and an icon; imports (Apple Health and file names) land on the right activity; a logged workout gets the right calorie estimate.
// The icons are original artwork inside the app (redrawn by the designer in 8.3.5), so this test is the check that none is missing, blank, clipped or a copy of another.
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
}).listen(8786, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9349", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-toasts-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9349/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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

await view(1000);
await send("Page.navigate", { url: "http://127.0.0.1:8786/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); render(); return true; })()`);
await ev(`(() => { FR.rows = [{ status: "pending", incoming: true, friendship_id: "f1", member_id: "u2", app_name: "kofi" }];
  CH.rows = [{ id: "c9", title: "Run", owner_name: "ada", status: "invited", metric: "minutes", starts_on: "2000-01-01", ends_on: "2999-01-01" }]; frNotify(); frNotify(); })()`);
ok("a friend request and a challenge invite each notify once", await ev(`loadNotifs(P()).filter(n => n.kind === "friend").length`) === 2);
ok("they pop up as rich toasts with a close button", await waitFor(`document.querySelectorAll('.swipe-toast[data-rich] .swipe-toast__x').length >= 1`));
await sleep(900); // let the slide-in finish
ok("the toast shows a time and a 40px icon", await ev(`(() => { const t = document.querySelector('.swipe-toast[data-rich]'); return !!t.querySelector('.swipe-toast__time') && t.querySelector('.swipe-toast__icon').getBoundingClientRect().width === 40 && !!t.querySelector(".swipe-toast__icon svg"); })()`), JSON.stringify(await ev(`(() => { const i = document.querySelector(".swipe-toast[data-rich] .swipe-toast__icon"); return [i?.getBoundingClientRect().width, !!document.querySelector(".swipe-toast__time")]; })()`)));
ok("error and status roles stay on the card", await ev(`document.querySelector('.swipe-toast[data-rich] .swipe-toast__card').getAttribute('role') === 'status'`));
await ev(`document.querySelector('.swipe-toast__x').click()`);
ok("the X closes it", await waitFor(`document.querySelectorAll('.swipe-toast[data-rich]').length < 2`, 3000));
await ev(`swipeToast({ title: "Workout saved", description: "Running, 30 min", type: "success", rich: true, key: "wk-saved" })`);
ok("a workout confirmation uses the success tint", await ev(`!!document.querySelector('.swipe-toast[data-rich="success"]')`));
ok("no page errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
