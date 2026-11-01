import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/coachchat.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.4.1: the Coach page chat. Signed out it asks to sign in; signed in it asks for an opt-in first and sends nothing until it is given; then it posts the question with consent to the wl-coach function and shows the reply as text.
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
}).listen(8792, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9355", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-coachchat-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9355/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*", "*/vendor/supabase*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";

await view(420);
await send("Page.navigate", { url: "http://127.0.0.1:8792/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles = [p]; S.activeId = p.id; true })()`);
const goCoach = async () => { await ev(`location.hash = "#/coach"; render(); true`); await sleep(400); };
const txt = () => ev(`document.getElementById("wlc")?.innerText || ""`);

await ev(`SB.user = null; true`); await goCoach();
ok("signed out: asks to sign in and has no send button", /Sign in to chat/.test(await txt()) && !(await ev(`!!document.querySelector('[data-act="wlc-send"]')`)));

await ev(`SB.user = { id: "u_me", email: "me@example.com" }; window.__calls = [];
  window.fetch = async (u, o) => { if (String(u).includes("/functions/v1/wl-coach")) { window.__calls.push({ u: String(u), o }); return new Response(JSON.stringify({ state: window.__reply || "ok", reply: "Eggs <b>and</b> plantain." }), { status: 200 }); } return new Response("{}", { status: 404 }); };
  sbClient().auth.getSession = async () => ({ data: { session: { access_token: "tok-123" } } });
  window.__rpc = []; window.__rpcFail = false; sbClient().rpc = async (n, a) => { window.__rpc.push({ n, a }); return window.__rpcFail ? { error: { message: "down" } } : { error: null }; };
  try { localStorage.removeItem("wlh.coachwd"); } catch {} true`);
await goCoach();
const t0 = await txt();
ok("signed in, no consent: names Anthropic, the account storage and review, and offers Allow", /Anthropic/.test(t0) && /saved in your account/.test(t0) && /read by the app's owner/.test(t0) && await ev(`!!document.querySelector('[data-act="wlc-optin"]')`));
ok("no consent: there is no question box, and nothing was sent", !(await ev(`!!document.getElementById("wlc-q")`)) && (await ev(`window.__calls.length`)) === 0);
await ev(`wlCoachSend(); true`); await sleep(200);
ok("calling send without consent still sends nothing", (await ev(`window.__calls.length`)) === 0);

// The choice must reach the account first: if saving it fails, the switch stays off and nothing is sent.
await ev(`window.__rpcFail = true; document.querySelector('[data-act="wlc-optin"]').click(); true`); await sleep(300);
ok("if the account record cannot be saved, consent stays off and says so", await ev(`P().coachChatConsent !== true && !!document.querySelector('[data-act="wlc-optin"]') && !!document.querySelector('#wlc [role="alert"]')`) && /Nothing was sent/.test(await txt()));
ok("after a failed save, focus returns to the Allow button", await ev(`document.activeElement?.dataset?.act === "wlc-optin"`));
ok("a failed opt-in does not appear in the consent history", !(await ev(`historyGet().some(h => h.k === "coach-on")`)));
await ev(`window.__rpcFail = false; document.querySelector('[data-act="wlc-optin"]').click(); true`); await sleep(300);
ok("Allow records the choice on the account with the terms version", await ev(`window.__rpc.some(c => c.n === "coach_consent_set" && c.a.p_on === true && c.a.p_version === TERMS_VERSION)`));
ok("Allow records the choice and shows the question box", await ev(`P().coachChatConsent === true && !!document.getElementById("wlc-q")`));
ok("after Allow, focus moves to the question box", await ev(`document.activeElement?.id === "wlc-q"`));
ok("the choice is in the consent history", await ev(`historyGet().some(h => h.k === "coach-on")`));
ok("the send button is 44px tall", (await ev(`document.querySelector('[data-act="wlc-send"]').getBoundingClientRect().height`)) >= 44);

await ev(`document.getElementById("wlc-q").value = "What should I eat?"; document.querySelector('[data-act="wlc-send"]').click(); true`);
ok("the reply shows as plain text", await waitFor(`document.getElementById("wlc-log")?.innerText.includes("plantain")`) && !(await ev(`!!document.querySelector("#wlc-log b")`)));
const c = await ev(`window.__calls[0]`);
ok("it posts the question with the person's token", !!c && c.u.endsWith("/functions/v1/wl-coach") && c.o.headers.authorization === "Bearer tok-123" && c.o.body === JSON.stringify({ message: "What should I eat?" }));
ok("the request carries no client-side consent flag (the account record is what counts)", !/consent/.test(c.o.body));

await ev(`window.__reply = "rate_limited"; document.getElementById("wlc-q").value = "again"; document.querySelector('[data-act="wlc-send"]').click(); true`); await sleep(500);
ok("a rate limit says so and keeps the question", /a lot this hour/.test(await txt()) && await ev(`document.getElementById("wlc-q").value === "again"`));

// A stale tab: the account says consent was withdrawn elsewhere. The server answers 403 and this screen follows it.
await ev(`window.__reply = "consent_required"; document.getElementById("wlc-q").value = "stale"; document.querySelector('[data-act="wlc-send"]').click(); true`); await sleep(500);
ok("a refusal from the account switches this screen back to the opt-in", await ev(`P().coachChatConsent === false && !!document.querySelector('[data-act="wlc-optin"]') && !document.getElementById("wlc-q")`));
ok("an account refusal is not shown as a generic failure", !/couldn't answer/.test(await txt()));
await ev(`window.__reply = "ok"; document.querySelector('[data-act="wlc-optin"]').click(); true`); await sleep(300);
ok("allowing again restores the question box", await ev(`P().coachChatConsent === true && !!document.getElementById("wlc-q")`));

await ev(`window.__calls.length = 0; window.__rpc.length = 0; document.querySelector('[data-act="consent-coach-toggle"]') || (location.hash = "#/settings/privacy", render()); true`); await sleep(500);
await ev(`window.__rpcFail = true; document.querySelector('[data-act="consent-coach-toggle"]').click(); true`); await sleep(300);
ok("turning it off in Privacy & security withdraws consent here at once, even if the account call fails", await ev(`P().coachChatConsent === false && historyGet().some(h => h.k === "coach-off")`));
ok("a failed withdrawal is remembered for retry", await ev(`localStorage.getItem("wlh.coachwd") === "u_me"`));
await ev(`wlCoachSend(); true`); await sleep(200);
ok("with it off, a direct send call posts nothing", (await ev(`window.__calls.length`)) === 0);
await ev(`window.__rpcFail = false; window.__rpc.length = 0; coachWithdrawRetry(); true`); await sleep(300);
ok("the retry tells the account to withdraw and clears the note", await ev(`window.__rpc.length === 1 && window.__rpc[0].a.p_on === false && localStorage.getItem("wlh.coachwd") === null`));
await ev(`P().coachChatConsent = true; window.__rpc.length = 0; true`);
await ev(`location.hash = "#/settings/privacy"; render(); document.querySelector('[data-act="consent-coach-toggle"]').click(); true`); await sleep(300);
ok("a normal withdrawal calls the account once and leaves nothing to retry", await ev(`window.__rpc.length === 1 && window.__rpc[0].a.p_on === false && localStorage.getItem("wlh.coachwd") === null`));
await goCoach();
ok("after withdrawing, the opt-in shows again", await ev(`!!document.querySelector('[data-act="wlc-optin"]')`));
ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
