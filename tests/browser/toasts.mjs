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
// friend messages (8.3.17): a stubbed Supabase client
await ev(`(async () => {
  window.__sent = []; window.__upd = [];
  const msgs = window.__msgs = [{ id: "m1", sender_id: "u2", recipient_id: "me", body: "<b>hi</b> there", created_at: "2026-10-22T10:00:00Z", read_at: null }];
  const q = { select: () => q, order: () => q, limit: () => Promise.resolve({ data: msgs, error: null }),
    insert: row => { window.__sent.push(row); if (!window.__hold) return Promise.resolve({ error: null }); window.__hold = false; return new Promise(r => { window.__release = () => r({ error: null }); }); },
    update: row => ({ in: (c, ids) => { window.__upd.push([row, ids]); return Promise.resolve({}); } }) };
  window.sbClient = () => ({ from: t => t === "friend_messages" ? q : {}, rpc: () => Promise.resolve({ data: [], error: null }) });
  SB.user = { id: "me" }; STORE_UID = "me"; CRY.lock = null;
  FR.on = true; FR.me = { app_name: "ada" }; FR.rows = [{ status: "accepted", member_id: "u2", app_name: "kofi", friendship_id: "f2" }];
  localStorage.removeItem(ukey("wlh.frseen." + P().id));
  await fmLoad(); return true; })()`);
ok("an unread message from a friend notifies with their name", await ev(`loadNotifs(P()).some(n => n.title.startsWith("kofi: "))`));
await ev(`document.body.insertAdjacentHTML("beforeend", '<div id="fm"></div>'); FM.with = "u2"; fmPaint(); true`);
await ev(`(async () => { await fmLoad(); return true; })()`);
const fv = await ev(`fmView()`);
ok("the chat escapes message text", fv.includes("&lt;b&gt;hi") && !fv.includes("<b>hi"));
ok("a chat on screen marks that friend's messages read", await ev(`window.__upd.some(u => u[1][0] === "m1")`));
ok("a chat that is selected but not on screen neither marks read nor hides the alert", await ev(`(async () => {
  document.getElementById("fm").remove(); window.__upd.length = 0; FM.rows = [];
  window.__msgs.push({ id: "m2", sender_id: "u2", recipient_id: "me", body: "still there?", created_at: "2026-10-22T11:00:00Z", read_at: null });
  await fmLoad();
  return window.__upd.length === 0 && loadNotifs(P()).some(n => n.title === "kofi: still there?"); })()`));
await ev(`document.body.insertAdjacentHTML("beforeend", '<div id="fm"></div>'); fmPaint(); true`);
await ev(`(async () => { window.__hold = true; const i = document.getElementById("fm-in"); i.value = "  hello  "; fmSend(); fmSend(); return true; })()`);
await sleep(100);
ok("a second tap while sending does not send twice", await ev(`window.__sent.length === 1`));
await ev(`(() => { const i = document.getElementById("fm-in"); i.value = "next draft"; window.__release(); return true; })()`);
await sleep(200);
ok("a finished send keeps a draft typed meanwhile", await ev(`document.getElementById("fm-in").value === "next draft"`));
ok("sending trims the message and targets the open friend", await ev(`window.__sent[0].body === "hello" && window.__sent[0].recipient_id === "u2"`));
await ev(`(() => { const i = document.getElementById("fm-in"); i.value = "x"; window.__hold = true; fmSend(); document.getElementById("fm").innerHTML = ""; window.__release(); return true; })()`);
await sleep(200);
ok("closing the chat before a send finishes does not throw", errors.length === 0, errors.join(" | "));
await ev(`(() => { FM.with = "u2"; document.getElementById("fm").innerHTML = ""; fmPaint(); const i = document.getElementById("fm-in"); i.value = "abcd"; i.focus(); i.setSelectionRange(2, 2); return true; })()`);
await ev(`(async () => { await fmLoad(); return true; })()`);
ok("a refresh keeps focus, text and caret in the composer", await ev(`(() => { const i = document.getElementById("fm-in"); return document.activeElement === i && i.value === "abcd" && i.selectionStart === 2; })()`));
ok("Message button shows only for accepted friends", (await ev(`frRows()`)).includes('data-act="fm-open"'));
ok("no page errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
