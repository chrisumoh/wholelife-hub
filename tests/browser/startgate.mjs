import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/startgate.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.35: the sign-in screen shown at startup. Faked Supabase.
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
}).listen(8798, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9371", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-startgate-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9371/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*", "*/vendor/supabase*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";

await view(1440);
await send("Page.navigate", { url: "http://127.0.0.1:8798/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const pick = (m, y) => ev(`(() => { const a = document.getElementById("ag-m"), b = document.getElementById("ag-y"); a.value = ${JSON.stringify(String(m))}; b.value = ${JSON.stringify(String(y))}; return true; })()`);
const submitGate = async () => { await ev(`document.querySelector('form[data-form="age-gate"]').requestSubmit(); true`); await sleep(350); };
const fresh = async () => { await ev(`(() => { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('__startgate','1'); return true; })()`); await send("Page.reload"); await sleep(500); return waitFor(READY, 15000); };
const CY = await ev(`new Date().getFullYear()`);


const gate = `!!document.getElementById("sb-email") && !!document.querySelector('[data-act="start-skip"]') && !!document.querySelector('[data-act="sb-google"]')`;
const reload = async () => { await send("Page.reload"); await sleep(500); return waitFor(READY, 15000); };

console.log("--- first visit");
await fresh();
ok("signed out: the sign-in card shows before the welcome screen", await ev(gate) && await ev(`!document.querySelector('[data-act="ob-next"]')`));
ok("it offers Google and email, and continuing without an account", await ev(`/Continue with Google/.test(document.body.textContent) && /Continue without an account/.test(document.body.textContent)`));
ok("Create an account switches the card in place", await (async () => { await click('[data-act="sb-mode"][data-v="up"]'); await sleep(200); return ev(`!!document.getElementById("sb-agree") && ${gate}`); })());
ok("the page title is Sign in", await ev(`/Sign in/.test(document.title)`));

console.log("--- continue without an account");
await click('[data-act="start-skip"]'); await sleep(300);
ok("the welcome screen opens", await ev(`!!document.querySelector('[data-act="ob-next"]') && !document.getElementById("sb-email")`));
ok("the choice is remembered", await ev(`localStorage.getItem("wlh.startskip") === "1"`));
await reload();
ok("a reload goes straight to the welcome screen", await ev(`!!document.querySelector('[data-act="ob-next"]') && !document.getElementById("sb-email")`));

console.log("--- exceptions");
await fresh();
await ev(`location.hash = "#/terms"; true`); await sleep(400);
ok("the Terms page opens, not the sign-in card", await ev(`!document.getElementById("sb-email") && /Terms/.test(document.body.textContent)`));
await fresh();
await ev(`localStorage.setItem("wlh.ageblock", String(Date.now() + 3600000)); true`); await reload();
ok("no sign-in card while the under-13 block is active", await ev(`!document.getElementById("sb-email")`));

console.log("--- signed in");
await fresh();
await ev(`SB.client.auth.signInWithPassword({ email: "a@b.co", password: "password1" }).then(() => true)`); await sleep(500);
await ev(`localStorage.removeItem("wlh.startskip"); true`);
await reload();
ok("a signed-in person never sees it", await ev(`!!SB.user && !document.getElementById("sb-email")`));

console.log("--- hold to delete a profile");
await fresh();
await ev(`localStorage.setItem("wlh.startskip", "1"); (async () => { const mk = n => { const p = newProfile(n); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); return p; }; S.profiles = [mk("Ada"), mk("Bo")]; S.activeId = S.profiles[0].id; saveProfile(); await flush(); location.hash = "#/settings/household"; render(); return true; })()`); await sleep(500);
const bo = `S.profiles[1].id`;
await ev(`document.querySelector('[data-act="del-profile"][data-id="' + ${bo} + '"]').click(); true`); await sleep(200);
const ptr = (t, id = 1) => ev(`(() => { const b = document.querySelector("[data-hold]"); b.dispatchEvent(new PointerEvent(${JSON.stringify(t)}, { bubbles: true, pointerId: ${id}, isPrimary: true, button: 0, clientX: b.getBoundingClientRect().left + 5, clientY: b.getBoundingClientRect().top + 5 })); return true; })()`);
ok("the confirm shows a hold button, not a plain Delete", await ev(`!!document.querySelector("[data-hold=del-profile-yes]") && !document.querySelector('[data-act="del-profile-yes"]')`));
ok("a plain click deletes nothing", await ev(`document.querySelector("[data-hold]").click(); S.profiles.length === 2`));
await ptr("pointerdown"); await sleep(600); await ptr("pointerup"); await sleep(500);
ok("an early release deletes nothing and drains the fill", await ev(`S.profiles.length === 2 && +document.querySelector("[data-hold]").style.getPropertyValue("--hp") === 0`));
await ptr("pointerdown"); await sleep(900);
ok("halfway the fill is part full", await ev(`(() => { const v = +document.querySelector("[data-hold]").style.getPropertyValue("--hp"); return v > .3 && v < .9; })()`));
await sleep(1000);
ok("holding it through deletes the profile", await ev(`S.profiles.length === 1 && S.profiles[0].name === "Ada"`));

ok("no page errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} });
process.exit(fail ? 1 : 0);
