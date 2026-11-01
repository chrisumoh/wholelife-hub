import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { findPlaceholders, badDmcaValues } from "../legal-placeholders.mjs";

// Run from the repo root:  node tests/browser/legal-release.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// RELEASE GATE for the legal pages (build 8.4.1). It FAILS while any owner-supplied fact is still a bracketed placeholder
// (DMCA agent name and email, court district, governing law, liability cap, contact details), on the rendered page including
// the text folded behind "Read more". It is kept out of run-all.mjs on purpose: it is red until the owner fills the values in.
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
}).listen(8781, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9344", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-legalrel-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9344/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8781/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const pick = (m, y) => ev(`(() => { const a = document.getElementById("ag-m"), b = document.getElementById("ag-y"); a.value = ${JSON.stringify(String(m))}; b.value = ${JSON.stringify(String(y))}; return true; })()`);
const submitGate = async () => { await ev(`document.querySelector('form[data-form="age-gate"]').requestSubmit(); true`); await sleep(350); };
const fresh = async () => { await ev(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`); await send("Page.reload"); await sleep(500); return waitFor(READY, 15000); };
const CY = await ev(`new Date().getFullYear()`);

await view(1440);
await send("Page.navigate", { url: "http://127.0.0.1:8781/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { localStorage.clear(); const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", age: 30 }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); render(); return true; })()`);

const ROUTES = [["eula", "End User License Agreement"], ["dmca", "Copyright / DMCA Policy"], ["terms", "Terms"], ["privacy-policy", "Privacy Policy"], ["refunds", "Refund"], ["contact", "Contact"]];
for (const [route, heading] of ROUTES) {
  await ev(`LEGAL_FOLD.clear(); location.hash = "#/${route}"; true`); await sleep(500); // LEGAL_FOLD keeps earlier pages, so empty it to scan only this page
  // the scan below must run on the real page, so a route that failed to render cannot pass by being empty
  ok(`#/${route} is on screen`, await ev(`new RegExp(${JSON.stringify(heading)}, "i").test(document.querySelector("main h1, main h2, .legal h2, h1, h2")?.textContent || "")`), await ev(`document.querySelector("h1, h2")?.textContent`));
  const txt = await ev(`document.body.innerText + " " + [...LEGAL_FOLD.values()].map(e => { const d = document.createElement("div"); d.innerHTML = e.html; return d.textContent; }).join(" ")`);
  const found = findPlaceholders(txt);
  ok(`#/${route} renders no bracketed placeholder`, found.length === 0, "still shows: " + found.join(" | "));
}

// the values behind the pages, read from the running app, so a blank or non-email value fails too
const v = await ev(`({ agentName: DMCA_AGENT_NAME, agentEmail: DMCA_AGENT_EMAIL, district: DMCA_DISTRICT, law: LEGAL_GOVERNING_LAW, cap: LEGAL_LIABILITY_CAP })`);
const bad = badDmcaValues(v);
ok("the DMCA agent, court district, governing law and liability cap are all filled in with real values", bad.length === 0, "owner must supply: " + bad.join(", "));
const c = await ev(`({ name: LEGAL_BUSINESS_NAME, addr: MAILING_ADDRESS, email: CONTACT_EMAIL })`);
ok("the contact business name, mailing address and support email are filled in", [c.name, c.addr, c.email].every(x => x && !findPlaceholders(x).length) && /@/.test(c.email), JSON.stringify(c));

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
