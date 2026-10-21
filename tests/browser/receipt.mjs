import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/receipt.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.3.2: the receipt that prints after a paid Premium activation. Faked Supabase; the payment call is stubbed, no real purchase is made.
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
}).listen(8795, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9358", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-receipt-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9358/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8795/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const pick = (m, y) => ev(`(() => { const a = document.getElementById("ag-m"), b = document.getElementById("ag-y"); a.value = ${JSON.stringify(String(m))}; b.value = ${JSON.stringify(String(y))}; return true; })()`);
const submitGate = async () => { await ev(`document.querySelector('form[data-form="age-gate"]').requestSubmit(); true`); await sleep(350); };
const fresh = async () => { await ev(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`); await send("Page.reload"); await sleep(500); return waitFor(READY, 15000); };
const CY = await ev(`new Date().getFullYear()`);

const PROFILE = `(async () => { localStorage.clear(); return true; })()`;
await ev(PROFILE); await send("Page.reload"); await sleep(500); await waitFor(READY, 15000);
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); render(); return true; })()`);
await sleep(800);

const FULL = { orderNo: "WLH-1", date: "21 OCT 2026", currency: "USD", items: [{ label: "Premium Monthly", amount: 10 }], taxes: [{ label: "VAT 20%", amount: 2 }], total: 12 };
const txt = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent || ""`);
const open = r => ev(`showPurchaseReceipt(${JSON.stringify(r)}, "monthly"); true`);
const shut = async () => { await ev(`document.querySelector('#pop-receipt [data-pop="close"].btn')?.click(); true`); await sleep(400); };

console.log("--- receipt with full data");
await open(FULL); await sleep(150);
const t = await txt("#pop-receipt");
ok("shows the heading, the plan line, the tax line and the total", /Payment successful/.test(t) && /Premium Monthly/.test(t) && /VAT 20%/.test(t) && /TOTAL/.test(t) && /\$12\.00/.test(t) && /\$2\.00/.test(t) && /\$10\.00/.test(t), t);
ok("no missing-data note when everything was supplied", !/didn't send/.test(t));
ok("the paper starts tucked in the slot", await ev(`new DOMMatrix(getComputedStyle(document.getElementById("rc-paper")).transform).m42 < -50`));
ok("and prints out to rest at 0", await waitFor(`Math.abs(new DOMMatrix(getComputedStyle(document.getElementById("rc-paper")).transform).m42) < 0.5`, 6000));
ok("the window is sized to the paper", await ev(`document.getElementById("rc-window").offsetHeight >= document.getElementById("rc-paper").offsetHeight`));
ok("the dialog is labelled and focus is inside it", await waitFor(`(() => { const c = document.querySelector("#pop-receipt .pop-card"); return !!c && c.getAttribute("role") === "dialog" && !!c.getAttribute("aria-label") && c.contains(document.activeElement); })()`));
await ev(`document.querySelector('[data-act="rcpt-again"]').click(); true`); await sleep(120);
ok("Print again tucks the paper back and reprints", await ev(`new DOMMatrix(getComputedStyle(document.getElementById("rc-paper")).transform).m42 < -5`) && await waitFor(`Math.abs(new DOMMatrix(getComputedStyle(document.getElementById("rc-paper")).transform).m42) < 0.5`, 6000));
await shut();
ok("Done closes it", await ev(`!document.getElementById("pop-receipt")`));

console.log("--- receipt with missing data");
await open({}); await sleep(200);
const t2 = await txt("#pop-receipt");
ok("no money amounts, no TOTAL and no tax are invented", !/\$|TOTAL|VAT|Tax/.test(t2.replace(/Payment successful/, "")), t2);
ok("it says what the provider didn't send", /didn't send the currency, price, tax, total/.test(t2), t2);
await shut();
await open({ currency: "USD", items: [{ label: "Premium Yearly", amount: 50 }] }); await sleep(200);
const t3 = await txt("#pop-receipt");
ok("price only: shows the price, no TOTAL (tax unknown), says tax and total are missing", /Premium Yearly/.test(t3) && /\$50\.00/.test(t3) && !/TOTAL/.test(t3) && /didn't send the tax, total/.test(t3), t3);
await shut();
await open({ currency: "USD", items: [{ label: "Premium Yearly", amount: 50 }], taxes: [] }); await sleep(200);
const t4 = await txt("#pop-receipt");
ok("no total from the provider: none is added up, and the note says so", !/TOTAL/.test(t4) && /didn't send the total/.test(t4), t4);
await shut();

await open({ items: [{ label: "Premium Yearly", amount: 50 }], total: 50 }); await sleep(200);
const t5 = await txt("#pop-receipt");
ok("no currency from the provider: no amounts are shown and the note says so", !/\$|50/.test(t5.replace(/Payment successful/, "")) && /didn't send the currency/.test(t5), t5);
await shut();

await open({ currency: "USD", items: [{ label: "Premium Yearly" }], taxes: [{ label: "VAT" }], total: 50 }); await sleep(200);
const t6 = await txt("#pop-receipt");
ok("labels sent without amounts are kept, with no NaN, and the note names the missing amounts", /Premium Yearly/.test(t6) && /VAT/.test(t6) && !/NaN/.test(t6) && /didn't send the price, tax\b/.test(t6), t6);
await shut();

console.log("--- long provider text on a phone");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 700, deviceScaleFactor: 1, mobile: true });
const LONG = "9f8e7d6c-5b4a-3210-fedc-ba9876543210-" + "X".repeat(40);
await open({ orderNo: LONG, date: "21 OCT 2026", currency: "USD", items: [{ label: "Premium" + "Y".repeat(60), amount: 1234567.89 }], taxes: [{ label: "VAT" + "Z".repeat(60), amount: 2 }], total: 1234569.89 }); await sleep(3000);
ok("long order number and labels wrap inside the paper, amounts stay whole", await ev(`(() => { const p = document.getElementById("rc-paper"), w = p.getBoundingClientRect(); const els = [...p.querySelectorAll(".rc-meta,.rc-row>span")]; return els.every(e => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= w.right + 1) && p.scrollWidth <= p.clientWidth + 1 && [...p.querySelectorAll(".rc-row>span:last-child")].every(e => getComputedStyle(e).whiteSpace === "nowrap"); })()`));
await shut();

console.log("--- safety and motion");
await open({ items: [{ label: '<img src=x onerror="window.__x=1">', amount: 1 }], orderNo: '"><b>', total: 1 }); await sleep(200);
ok("provider text is escaped, never run as markup", await ev(`!window.__x && !document.querySelector("#pop-receipt img") && !document.querySelector("#pop-receipt .rc-meta b")`));
await shut();
await ev(`document.documentElement.dataset.motion = "reduced"; true`);
await open(FULL); await sleep(100);
ok("Reduced motion: the paper is already printed, no transition", await ev(`(() => { const p = document.getElementById("rc-paper"), m = new DOMMatrix(getComputedStyle(p).transform); return Math.abs(m.m42) < 0.5 && parseFloat(getComputedStyle(p).transitionDuration) < 0.001; })()`));
await shut();
await ev(`delete document.documentElement.dataset.motion; true`);

console.log("--- wiring to activation");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 700, deviceScaleFactor: 1, mobile: true });
const beta = await ev(`(async () => { await activateLicense(); return { receipt: !!document.getElementById("pop-receipt"), premium: P().premium.source }; })()`);
ok("today's activation (beta stub) shows no receipt and grants nothing", !beta.receipt && beta.premium !== "purchase", JSON.stringify(beta));
await ev(`(async () => { window.__v = validateLicenseKey; validateLicenseKey = async () => ({ state:"valid", plan:"yearly", expires:null, receipt:${JSON.stringify(FULL)} }); await activateLicense(); return true; })()`); await sleep(300);
ok("a valid purchase turns Premium on and prints the receipt", await ev(`P().premium.active === true && P().premium.source === "purchase" && !!document.getElementById("pop-receipt")`));
ok("the receipt fits a 375px phone with no sideways scroll", await ev(`(() => { const c = document.querySelector("#pop-receipt .pop-card"); return c.scrollWidth <= c.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth; })()`));
await shut();
await ev(`validateLicenseKey = async () => ({ state:"valid" }); true`);
await ev(`activateLicense(); true`); await sleep(300);
ok("a valid key with no receipt data still activates and shows an honest receipt", await ev(`!!document.getElementById("pop-receipt") && /didn't send/.test(document.getElementById("pop-receipt").textContent)`));

console.log("--- ?previewreceipt=1");
await send("Page.navigate", { url: "http://127.0.0.1:8795/index.html" }); await sleep(500); await waitFor(READY, 15000);
await fresh(); await sleep(900);
ok("without the parameter no receipt appears", await ev(`!document.getElementById("pop-receipt")`));
await send("Page.navigate", { url: "http://127.0.0.1:8795/index.html?previewreceipt=1" }); await sleep(500); await waitFor(READY, 15000); await sleep(900);
ok("with ?previewreceipt=1 the receipt shows, marked as a sample", await ev(`!!document.getElementById("pop-receipt") && /SAMPLE/.test(document.getElementById("pop-receipt").textContent) && /12\\.00/.test(document.getElementById("pop-receipt").textContent)`));
ok("the preview buys nothing and saves no Premium entitlement", await ev(`!(S.profiles || []).some(p => p.premium?.source === "purchase" || p.premium?.active)`));
ok("the preview says plainly it is a sample, not a payment", await ev(`(() => { const t = document.getElementById("pop-receipt").textContent, c = document.querySelector("#pop-receipt .pop-card"); return /Sample receipt/.test(t) && /No payment was made/.test(t) && !/Payment successful/.test(t) && !/PAID/.test(t) && !/Thank you for your purchase/.test(t) && /Sample receipt/.test(c.getAttribute("aria-label") || ""); })()`));

console.log("--- the preview leaves an existing paid entitlement alone");
await send("Page.navigate", { url: "http://127.0.0.1:8795/index.html" }); await sleep(500); await waitFor(READY, 15000);
await fresh();
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); p.premium = { active: true, since: "2026-10-01", source: "purchase", expires: "2027-10-01" }; S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); render(); return true; })()`);
await sleep(600);
const before = await ev(`JSON.stringify(P().premium)`);
await send("Page.navigate", { url: "http://127.0.0.1:8795/index.html?previewreceipt=1" }); await sleep(500); await waitFor(READY, 15000); await sleep(900);
ok("with a paid profile the sample receipt still shows", await ev(`/Sample receipt/.test(document.getElementById("pop-receipt")?.textContent || "")`));
ok("the entitlement is unchanged while the preview is open", await ev(`JSON.stringify(P().premium)`) === before, before);
await send("Page.navigate", { url: "http://127.0.0.1:8795/index.html" }); await sleep(500); await waitFor(READY, 15000); await sleep(900);
ok("after reloading without the parameter the saved entitlement is unchanged and no receipt shows", await ev(`JSON.stringify(P().premium)`) === before && await ev(`!document.getElementById("pop-receipt")`), before);

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
