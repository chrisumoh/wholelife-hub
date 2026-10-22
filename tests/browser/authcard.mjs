import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/receipt.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.11: the sign-in card (Google + email) in onboarding and in the Account popup. Faked Supabase.
// The app is served with a faked Supabase, so no real account is touched.
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9362", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-authcard-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9362/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8797/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const pick = (m, y) => ev(`(() => { const a = document.getElementById("ag-m"), b = document.getElementById("ag-y"); a.value = ${JSON.stringify(String(m))}; b.value = ${JSON.stringify(String(y))}; return true; })()`);
const submitGate = async () => { await ev(`document.querySelector('form[data-form="age-gate"]').requestSubmit(); true`); await sleep(350); };
const fresh = async () => { await ev(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`); await send("Page.reload"); await sleep(500); return waitFor(READY, 15000); };
const CY = await ev(`new Date().getFullYear()`);


console.log("--- onboarding: the card comes after the age question");
await fresh();
ok("welcome screen first", await ev(`!!document.querySelector('[data-act="ob-next"]') && !document.getElementById("sb-email")`));
await click('[data-act="ob-next"]'); await sleep(250);
ok("the age question still comes first, with no sign-in card yet", await ev(`!!document.getElementById("ag-m") && !document.getElementById("sb-email")`));
await pick(6, CY - 30); await submitGate();
ok("then the sign-in card appears", await ev(`!!document.getElementById("sb-email") && !!document.querySelector('[data-act="sb-google"]') && UI.obStep === 0`));
ok("title and description are the Create your account copy", await ev(`document.querySelector("h1")?.textContent === "Create your account" && /follows you/.test(document.querySelector(".auth-desc")?.textContent || "")`));
ok("it offers only Google and email: no Apple or GitHub", await ev(`!/Apple|GitHub/i.test(document.querySelector(".auth-ob").textContent)`));
ok("the form comes before Google, then the switch link", await ev(`(() => { const f = document.querySelector("form[data-form='sb-auth']"), g = document.querySelector('[data-act="sb-google"]'), s = document.querySelector(".auth-links"); const o = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); return o(f, g) && o(g, s); })()`));
ok("sign-up has name, email, password, the Terms tick and a Create account button", await ev(`!!document.getElementById("sb-name") && !!document.getElementById("sb-email") && !!document.getElementById("sb-pass") && !!document.getElementById("sb-agree") && /Create account/.test(document.querySelector("form button[type=submit]").textContent)`));
ok("it says 'Already have an account? Sign in'", await ev(`/Already have an account\?/.test(document.querySelector(".auth-links").textContent)`));
ok("the buttons are 44px tall or more", await ev(`[...document.querySelectorAll(".auth-ob .auth-link, .auth-ob .auth-google, .auth-ob button[type=submit]")].every(b => b.getBoundingClientRect().height >= 44 - 1) `), await ev(`JSON.stringify([...document.querySelectorAll(".auth-ob .auth-link, .auth-ob .auth-google, .auth-ob button[type=submit]")].map(b => Math.round(b.getBoundingClientRect().height)))`));

console.log("--- the form");
await ev(`document.getElementById("sb-email").value = "ada@example.com"; document.getElementById("sb-pass").value = "longenough1"; document.getElementById("sb-name").value = "  Ada Obi "; true`);
await ev(`document.querySelector("form[data-form='sb-auth']").requestSubmit(); true`); await sleep(300);
ok("submitting without the Terms tick sends nothing", await ev(`!(window.__signUps || []).length && /Tick the box/.test(document.body.textContent)`));
await ev(`const c = document.getElementById("sb-agree"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); true`); await sleep(150);
await ev(`document.getElementById("sb-email").value = "ada@example.com"; document.getElementById("sb-pass").value = "longenough1"; document.getElementById("sb-name").value = "  Ada Obi "; document.querySelector("form[data-form='sb-auth']").requestSubmit(); true`); await sleep(500);
ok("Create account sends the sign-up with the consent version and the trimmed name", await ev(`(() => { const s = (window.__signUps || [])[0]; return !!s && s.email === "ada@example.com" && !!s.options.data.terms_version && s.options.data.full_name === "Ada Obi"; })()`));
ok("the 'check your email' message shows and the card stays", await ev(`/Check your email/.test(document.body.textContent) && !!document.getElementById("sb-email")`));
ok("after sign-up the card is on its sign-in form", await ev(`UI.acct === "in"`));
ok("switching shows 'Welcome back' sign-in copy with Forgot password and 'New here?'", await ev(`document.querySelector("h1").textContent === "Welcome back" && /Sign in to pick up/.test(document.querySelector(".auth-desc").textContent) && /Forgot password/.test(document.querySelector("form").textContent) && /New here\?/.test(document.querySelector(".auth-links").textContent) && !document.getElementById("sb-name")`));

console.log("--- Google");
await click('[data-act="sb-google"]'); await sleep(600);
ok("Google is wired to the same sign-in as before", await ev(`document.getElementById("auth-g-msg") !== null`));

console.log("--- skipping, and signing in");
await click('[data-act="ob-auth-go"]'); await sleep(300);
ok("Skip for now continues to Choose your coach", await ev(`UI.obStep === 1 && !UI.obAuth && /Choose your coach/.test(document.body.textContent)`));
await fresh(); await click('[data-act="ob-next"]'); await sleep(250); await pick(6, CY - 30); await submitGate();
await click('.auth-ob [data-act="sb-mode"][data-v="in"]'); await sleep(200);
await ev(`document.getElementById("sb-email").value = "ada@example.com"; document.getElementById("sb-pass").value = "password1"; document.querySelector("form[data-form='sb-auth']").requestSubmit(); true`); await sleep(900);
ok("signing in reloads into the signed-in app (the welcome screen), never leaving the card half-done", await waitFor(`!!SB.user && !!document.querySelector('[data-act="ob-next"]')`, 6000));
console.log("--- already signed in: the stop is skipped");
await fresh(); await ev(`(async () => { await SB.client.auth.signInWithPassword({ email: "ada@example.com", password: "password1" }); return true; })()`); await sleep(600);
await click('[data-act="ob-next"]'); await sleep(250); await pick(6, CY - 30); await submitGate();
ok("a signed-in person goes straight to Choose your coach", await ev(`UI.obStep === 1 && !UI.obAuth`));

console.log("--- under 13 never sees the card");
await fresh(); await click('[data-act="ob-next"]'); await sleep(250); await pick(6, CY - 8); await submitGate();
ok("the age block shows and there is no sign-in card", await ev(`!document.getElementById("sb-email") && !UI.obAuth`));
await ev(`localStorage.removeItem("wlh.ageblock"); true`);

console.log("--- the first-run tour offer");
await fresh();
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "", age: 30 }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); location.hash = "#/home"; render(); return true; })()`);
ok("the tour offer appears for a signed-out person", await waitFor(`!!document.querySelector(".tour-offer")`, 8000));
ok("it asks about saving to an account, with Google or email", await ev(`/account/.test(document.querySelector(".tour-offer").textContent) && /Google or email/.test(document.querySelector(".tour-offer").textContent)`));
await click('.tour-offer [data-act="tour-offer-auth"]'); await sleep(500);
ok("Sign in closes the offer and opens the sign-in card with Google", await ev(`!document.querySelector(".tour-offer") && !!document.querySelector('#pop-auth [data-act="sb-google"]') && document.getElementById("auth-title").textContent === "Welcome back"`));
ok("the tour was not marked as answered", await ev(`P().tourSeen === ""`));

console.log("--- the Account area");
await fresh();
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", age: 30 }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); location.hash = "#/settings/profile"; render(); return true; })()`); await sleep(600);
ok("signed out there is one Sign in button, not the old pair", await ev(`document.querySelectorAll('#sb-account [data-act="sb-open"]').length === 1 && !document.querySelector('#sb-account [data-v="up"]')`));
await click('#sb-account [data-act="sb-open"]'); await sleep(450);
ok("it opens the same card, with the lamp", await ev(`!!document.querySelector("#pop-auth .lamp") && document.getElementById("auth-title").textContent === "Welcome back" && !!document.querySelector('#pop-auth [data-act="sb-google"]')`));


ok("no exceptions", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} });
process.exit(fail ? 1 : 0);
