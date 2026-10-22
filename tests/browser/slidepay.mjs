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
}).listen(8796, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9361", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-slidepay-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9361/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8796/index.html" }); await sleep(500);
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


const LOCKED = "http://127.0.0.1:8796/index.html?premium=0#/premium";
const rectOf = sel => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const val = () => ev(`+document.querySelector(".sc-handle").getAttribute("aria-valuenow")`);
const phase = () => ev(`document.querySelector(".sc").dataset.phase`);
const key = k => ev(`document.querySelector(".sc-handle").dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })); true`);

await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); return true; })()`);
await send("Page.navigate", { url: LOCKED }); await sleep(500); ok("locked premium page loads", await waitFor(READY, 15000)); await sleep(900);
// The real checkout links are tested in their own section below; here they are blanked so the "not live" path is exercised.
await ev(`window.__links = { ...CHECKOUT_URLS }; CHECKOUT_URLS.monthly = ""; CHECKOUT_URLS.yearly = ""; true`);

console.log("--- the slider is there and accessible");
ok("the Premium page shows the slide-to-pay control", await ev(`!!document.querySelector(".prem-cta-bar .sc .sc-handle")`));
ok("the handle is a slider with a name, 0% and a 44px+ touch size", await ev(`(() => { const h = document.querySelector(".sc-handle"), r = h.getBoundingClientRect(); return h.getAttribute("role") === "slider" && /Slide to pay/.test(h.getAttribute("aria-label")) && h.getAttribute("aria-valuenow") === "0" && r.width >= 44 && r.height >= 44 && h.tabIndex === 0; })()`));
ok("the old Continue button is gone", await ev(`!document.querySelector('.prem-cta-bar [data-act="prem-cta"]')`));

console.log("--- dragging with a pointer");
let h = await rectOf(".sc-handle"), tr = await rectOf(".sc-track");
const cy = h.y + h.h / 2, cx = h.x + h.w / 2, span = tr.w - h.w - 8;
await mouse("mousePressed", cx, cy); await mouse("mouseMoved", cx + span * 0.5, cy); await sleep(80);
const mid = await val();
ok("dragging halfway moves the handle and updates the slider value", mid > 35 && mid < 65, String(mid));
ok("the label fades as you slide", await ev(`+getComputedStyle(document.querySelector(".sc-label")).opacity < 0.5`));
await mouse("mouseReleased", cx + span * 0.5, cy); await sleep(700);
ok("letting go early springs back to the start with nothing triggered", await val() === 0 && await phase() === "idle" && !(await ev(`!!document.querySelector(".toast")`)));
await mouse("mousePressed", cx, cy); await mouse("mouseMoved", cx + span * 1.2, cy); await sleep(60); await mouse("mouseReleased", cx + span * 1.2, cy); await sleep(150);
ok("sliding all the way gives the honest not-available state, never a paid state", await phase() === "error" && await ev(`/Not available yet/.test(document.querySelector(".sc").textContent) && !/Paid|Payment successful/i.test(document.querySelector(".sc").textContent)`));
ok("and says payments aren't live", await ev(`/aren't live/.test(document.body.textContent)`));
ok("nothing was bought: Premium is not on and no receipt shows", await ev(`!P().premium?.active && !document.getElementById("pop-receipt")`));
await sleep(2000);
ok("then it resets so it can be tried again", await phase() === "idle" && await val() === 0);

console.log("--- with checkout links set");
await ev(`Object.assign(CHECKOUT_URLS, window.__links); window.__opened = []; HTMLAnchorElement.prototype.click = function(){ window.__opened.push({ href: this.href, target: this.target, rel: this.rel }); }; true`);
ok("both links are real Lemon Squeezy checkout links", await ev(`Object.values(CHECKOUT_URLS).every(u => /^https:\\/\\/[a-z0-9-]+\\.lemonsqueezy\\.com\\/checkout\\/buy\\/[0-9a-f-]{36}$/.test(u)) && CHECKOUT_URLS.monthly !== CHECKOUT_URLS.yearly`));
await key("End"); await sleep(150);
ok("sliding all the way opens the yearly checkout (the default plan) in a new tab", await ev(`window.__opened.length === 1 && window.__opened[0].href === CHECKOUT_URLS.yearly && window.__opened[0].target === "_blank" && /noopener/.test(window.__opened[0].rel)`));
ok("the control says the checkout opened, not that anything was paid", await phase() === "open" && await ev(`/Checkout opened/.test(document.querySelector(".sc").textContent) && !/Paid|Payment successful/i.test(document.querySelector(".sc").textContent)`));
ok("nothing is unlocked by opening checkout", await ev(`!P().premium?.active && !document.getElementById("pop-receipt")`));
await sleep(2000);
await ev(`document.querySelector('[data-act="prem-plan"][data-v="monthly"]').click(); true`); await sleep(200);
await key("End"); await sleep(150);
ok("choosing Monthly opens the monthly checkout", await ev(`window.__opened.length === 2 && window.__opened[1].href === CHECKOUT_URLS.monthly`));
await sleep(2000);
ok("the plan rows show the real prices and a saving worked out from them", await ev(`(() => { const t = document.querySelector(".prem-store-page").textContent; return /\\$7\\.99/.test(t) && /\\$59\\.99/.test(t) && planSavePct() === 37 && /Save 37%/.test(document.querySelector('[data-v="yearly"] .ps-disc').textContent); })()`));
ok("no placeholder text is left on the plan rows or the fine print", await ev(`!/\\[PRICE\\]|\\[REAL|TBA/.test(document.querySelector(".prem-store-page").textContent)`));
await ev(`window.__amt = PREMIUM_PLANS.map(p => p.amount); PREMIUM_PLANS.forEach(p => delete p.amount); render(); true`); await sleep(200);
ok("without real prices it says Save yearly and invents no number", await ev(`(() => { const d = document.querySelector('[data-v="yearly"] .ps-disc').textContent; return /^Save yearly$/.test(d) && planSavePct() === null && /Price TBA/.test(document.querySelector(".prem-store-page").textContent); })()`));
await ev(`PREMIUM_PLANS.forEach((p, i) => { p.amount = window.__amt[i]; }); render(); true`);

console.log("--- licence key")
await ev(`localStorage.removeItem(ukey("wlh.lic")); window.__calls = []; window.__reply = { state: "valid", plan: "yearly", instance: "dev-1", receipt: { orderNo: "1", currency: "USD", items: [{ label: "Test", amount: 1 }], taxes: [], total: 1 } }; window.fetch = async (u, o) => { if (!/functions\\/v1\\/license/.test(u)) return new Response("{}", { status: 404 }); window.__calls.push(JSON.parse(o.body)); return new Response(JSON.stringify(window.__reply), { status: 200 }); }; true`);
ok("an empty key is refused without calling the server", await ev(`validateLicenseKey("  ").then(r => r.state === "invalid" && window.__calls.length === 0)`));
ok("a valid key is passed on and returns the plan and receipt", await ev(`validateLicenseKey("abc").then(r => r.state === "valid" && r.plan === "yearly" && r.receipt.orderNo === "1" && r.lic.i === "dev-1" && window.__calls[0].key === "abc" && window.__calls[0].instance === undefined)`));
ok("an unrecognised, expired or full key gets a plain message", await ev(`(async () => { const out = []; for (const st of ["invalid", "expired", "limit"]) { window.__reply = { state: st }; const r = await validateLicenseKey("abc"); out.push(r.state === st && !!r.message); } return out.every(Boolean); })()`));
ok("a server error says so and grants nothing", await ev(`(async () => { window.__reply = { state: "error" }; const r = await validateLicenseKey("abc"); return r.state === "error" && !!r.message; })()`));
ok("a network failure is an error, not an invalid key", await ev(`(async () => { window.fetch = async () => { throw new TypeError("offline"); }; const r = await validateLicenseKey("abc"); return r.state === "error"; })()`));
ok("a re-check never ends Premium when the server can't be reached", await ev(`(async () => { setPremium("purchase", null); licSave(P().id, { k: "abc", i: "dev-1", d: "2000-01-01" }); await licRecheck(); return P().premium.active === true; })()`));
ok("a re-check ends Premium when the key has expired or been refunded", await ev(`(async () => { window.fetch = async () => new Response(JSON.stringify({ state: "expired" }), { status: 200 }); await licRecheck(); return P().premium.active === false && licLoad(P().id) === null; })()`));
console.log("--- one key per profile, and outages never revoke")
ok("a provider outage or rate limit never ends Premium or removes the key", await ev(`(async () => { const a = P(); setPremium("purchase", null); licSave(a.id, { k: "A", i: "ia", d: "2000-01-01" }); let ok = true; for (const st of ["error", "garbage"]) { window.fetch = async () => new Response(JSON.stringify({ state: st }), { status: 200 }); await licRecheck(); ok = ok && a.premium.active === true && !!licLoad(a.id); } window.fetch = async () => new Response("down", { status: 503 }); await licRecheck(); return ok && a.premium.active === true && !!licLoad(a.id); })()`));
ok("each profile keeps its own key and a second profile's key cannot decide the first's Premium", await ev(`(async () => { const a = P(); setPremium("purchase", null); licSave(a.id, { k: "A", i: "ia", d: "2000-01-01" });
  const b = newProfile("Bo"); Object.assign(b, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); S.profiles.push(b); S.activeId = b.id; setPremium("purchase", null); licSave(b.id, { k: "B", i: "ib", d: "2000-01-01" });
  const sent = []; window.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ state: "invalid" }), { status: 200 }); };
  await licRecheck();
  const out = sent.length === 1 && sent[0].key === "B" && b.premium.active === false && licLoad(b.id) === null && a.premium.active === true && licLoad(a.id)?.k === "A";
  S.activeId = a.id; sent.length = 0; window.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ state: "valid" }), { status: 200 }); };
  await licRecheck(); return out && sent.length === 1 && sent[0].key === "A" && a.premium.active === true; })()`));
ok("an answer that arrives after the profile changed is dropped", await ev(`(async () => { const a = P(), b = S.profiles.find(x => x.name === "Bo"); setPremium("purchase", null); licSave(a.id, { k: "A", i: "ia", d: "2000-01-01" });
  window.fetch = async () => { S.activeId = b.id; return new Response(JSON.stringify({ state: "invalid" }), { status: 200 }); };
  await licRecheck(); S.activeId = a.id; return a.premium.active === true && licLoad(a.id)?.k === "A"; })()`));
ok("deleting a profile removes its key", await ev(`(() => { const b = S.profiles.find(x => x.name === "Bo"); licSave(b.id, { k: "B", i: "ib", d: "x" }); dropProfile(b.id); return licLoad(b.id) === null && !S.profiles.some(x => x.id === b.id); })()`));
ok("the keys live under wlh.lic so Delete everything and sign-out clean them", await ev(`LS_USER_BASES.includes("wlh.lic") && Object.keys(localStorage).some(k => k.startsWith("wlh.lic"))`));
ok("the subscription panel no longer says nothing can charge you, and it has a real manage link", await ev(`(() => { const h = subscriptionPanel(P()); const d = document.createElement("div"); d.innerHTML = h; const a = [...d.querySelectorAll("a")].find(x => /Manage subscription/.test(x.textContent)); return !/can charge you|payments are not live/i.test(d.textContent) && !!a && a.href === "https://app.lemonsqueezy.com/my-orders" && a.target === "_blank" && /noopener/.test(a.rel); })()`));
const legalOut = await ev(`(async () => { const out = []; for (const h of ["#/refunds", "#/terms"]) { location.hash = h; await new Promise(r => setTimeout(r, 700)); const c = document.body.cloneNode(true); c.querySelectorAll("script,style").forEach(n => n.remove()); const t = c.textContent; out.push({ h, gone: !/payments (are )?not live/i.test(t), named: /Lemon Squeezy/.test(t) }); } location.hash = "#/premium"; await new Promise(r => setTimeout(r, 700)); return out; })()`);
ok("the Refunds and Terms pages no longer say payments are not live", legalOut.every(x => x.gone) && legalOut[0].named && /Payments are taken by Lemon Squeezy, our payment provider, on its own checkout page; the app never sees your card details/.test(readFileSync(join(REPO, "index.html"), "utf8")) && !/Payments are not live yet in this build/.test(readFileSync(join(REPO, "index.html"), "utf8")), JSON.stringify(legalOut));
await ev(`P().premium = null; CHECKOUT_URLS.monthly = ""; CHECKOUT_URLS.yearly = ""; render(); true`); // the gesture tests below use the "not live" path

console.log("--- cancelled and multi-finger gestures");
// Synthetic pointer events: a cancelled drag must never confirm, and a second finger must not confirm twice.
const pe = (type, id, x) => ev(`(() => { const t = document.querySelector(".sc-track"); t.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { pointerId: ${id}, clientX: ${x}, clientY: ${cy}, button: 0, bubbles: true, cancelable: true })); return true; })()`);
await ev(`window.__tt = 0; const o = window.premiumCtaTap; window.premiumCtaTap = () => { window.__tt++; return o(); }; true`);
await pe("pointerdown", 1, cx); await pe("pointermove", 1, cx + span * 1.2); await pe("pointercancel", 1, cx + span * 1.2); await sleep(500);
ok("cancelling a drag at the end of the track does not confirm", await ev(`window.__tt`) === 0 && await phase() === "idle" && await val() === 0);
await pe("pointerdown", 1, cx); await pe("pointerdown", 2, cx); await pe("pointermove", 1, cx + span * 1.2); await pe("pointerup", 1, cx + span * 1.2); await sleep(150);
ok("a second finger on the track confirms at most once", await ev(`window.__tt`) === 1 && await phase() === "error");
await pe("pointerup", 2, cx); await sleep(2200);
ok("a stray second pointer does not leave the control stuck", await phase() === "idle" && await val() === 0 && await ev(`!("held" in document.querySelector(".sc").dataset)`));

console.log("--- keyboard");
await ev(`document.querySelector(".sc-handle").focus(); true`);
await key("ArrowRight"); await key("ArrowRight"); await key("ArrowRight");
ok("arrow keys move it in steps", await val() === 30, String(await val()));
await key("ArrowLeft"); ok("left arrow moves it back", await val() === 20);
await key("Home"); ok("Home resets it", await val() === 0);
await key("End"); await sleep(150);
ok("End confirms, ending in the same honest state", await phase() === "error");
await sleep(2000);
await key("Enter"); await sleep(150);
ok("Enter confirms too", await phase() === "error");
await sleep(2000);

console.log("--- reduced motion");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await key("End"); await sleep(150);
ok("with reduced motion it still works (no shake animation)", await phase() === "error" && await ev(`getComputedStyle(document.querySelector(".sc-track")).animationName === "none"`));
await sleep(2000);
await send("Emulation.setEmulatedMedia", { features: [] });

console.log("--- layout and themes");
for (const [w, hh] of [[375, 667], [820, 900], [1440, 900]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: hh, deviceScaleFactor: 1, mobile: w < 600 }); await sleep(300);
  const m = await ev(`(() => { const t = document.querySelector(".sc-track").getBoundingClientRect(); return { fits: t.left >= 0 && t.right <= innerWidth, noX: document.documentElement.scrollWidth <= innerWidth, tall: t.height >= 44 }; })()`);
  ok(`${w}px: the slider fits with no sideways scroll`, m.fits && m.noX && m.tall, JSON.stringify(m));
}
for (const sch of ["light", "dark"]) {
  await ev(`document.documentElement.dataset.scheme = ${JSON.stringify(sch)}; true`); await sleep(200);
  ok(`${sch}: track and handle have colour`, await ev(`getComputedStyle(document.querySelector(".sc-track")).backgroundColor !== "rgba(0, 0, 0, 0)" && getComputedStyle(document.querySelector(".sc-handle")).backgroundColor !== "rgba(0, 0, 0, 0)"`));
}

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
