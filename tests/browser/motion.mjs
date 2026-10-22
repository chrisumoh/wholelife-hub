import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/motion.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.20: the sliding selection ring, the animated underline on external links, toasts at the top right, the pulse on the bell's badge,
// widgets that turn over to show more, and the clean-ups of the dish rows, the coach card and the weekly check-in.
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
}).listen(8795, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9358", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-motion-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9358/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
await view(1200);
await send("Page.navigate", { url: "http://127.0.0.1:8795/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", calorieGoal: 2000, workoutGoal: 4, weightKg: 70, heightCm: 170, age: 30, sex: "female", goal: "build", coachPersona: "enforcer", coachName: "Coach Henry",
  widgets: [{ k: "calories", size: "s" }, { k: "steps", size: "m" }, { k: "meals", size: "m" }, { k: "coach", size: "l" }] });
  S.profiles = [p]; S.activeId = p.id; S.logs = {};
  for (let d = 0; d < 6; d++) { const date = addDays(today(), -d); addEntry("meals", { id: uid(), date, slot: "lunch", name: "Jollof rice", cal: 500 + d * 30, dish: "jollof", extras: [], est: false }); setVital(date, "steps", 8000 + d * 100); }
  saveProfile(); await flush(); render(); return true; })()`);
await ev(`P().widgets.find(w => w.k === "coach").size = "l"; render(); true`);
await goto("#/home");

console.log("--- 1. the selection ring slides");
await goto("#/coach");
const hasSeg = await waitFor(`!!document.querySelector('.seg [aria-pressed="true"]')`, 3000);
if (!hasSeg) await ev(`P().coachPersona = "strategist"; saveProfile(); render(); true`);
ok("a single-choice group has one ring, inside it", await waitFor(`document.querySelectorAll(".seg:not(.wseg) > .focus-ring").length >= 1 && [...document.querySelectorAll(".seg:not(.wseg)")].every(s => s.querySelectorAll(":scope > .focus-ring").length <= 1)`, 4000));
const ringInfo = await ev(`(() => { const box = [...document.querySelectorAll(".seg:not(.wseg)")].find(s => s.querySelector(".focus-ring") && s.querySelectorAll("button").length > 1); if (!box) return null; const on = box.querySelector('[aria-pressed="true"]'), r = box.querySelector(".focus-ring"), b = box.getBoundingClientRect(), o = on.getBoundingClientRect(), g = r.getBoundingClientRect(); window.__ring = r; window.__box = box; return { dx: Math.abs(g.left - o.left), dw: Math.abs(g.width - o.width), dh: Math.abs(g.height - o.height), label: box.getAttribute("aria-label"), border: getComputedStyle(r).borderTopWidth, anim: getComputedStyle(r).transitionProperty }; })()`);
ok("the ring sits exactly on the chosen option", ringInfo && ringInfo.dx < 1.5 && ringInfo.dw < 1.5 && ringInfo.dh < 1.5, JSON.stringify(ringInfo));
ok("it has a thin border and animates position and size", ringInfo && /^1(\.5)?px$/.test(ringInfo.border) && /translate/.test(ringInfo.anim) && /width/.test(ringInfo.anim) && /height/.test(ringInfo.anim), JSON.stringify(ringInfo));
await shot("ring-before");
await ev(`(() => { const b = [...window.__box.querySelectorAll("button")].find(x => x.getAttribute("aria-pressed") !== "true"); b.click(); return true; })()`);
await sleep(120);
const mid = await ev(`(() => { const r = window.__ring; return { same: r === window.__box.querySelector(".focus-ring"), connected: r.isConnected, still: r.classList.contains("still") }; })()`);
ok("choosing another option moves the same ring (it is not redrawn), and it animates", mid.same && mid.connected && !mid.still, JSON.stringify(mid));
await sleep(700);
ok("after the move it sits on the new choice", await ev(`(() => { const on = window.__box.querySelector('[aria-pressed="true"]'), g = window.__ring.getBoundingClientRect(), o = on.getBoundingClientRect(); return Math.abs(g.left - o.left) < 1.5 && Math.abs(g.width - o.width) < 1.5; })()`));
ok("the ring is not read out or focusable", await ev(`window.__ring.getAttribute("aria-hidden") === "true" && getComputedStyle(window.__ring).pointerEvents === "none"`));

ok("the day strip and the page numbers get a ring that moves with the choice", await (async () => {
  await ev(`(() => { const d = document.createElement("div"); d.id = "rt2"; d.style.cssText = "position:fixed;top:0;left:0;z-index:9;background:#fff"; d.innerHTML = '<div class="rdays"><button class="rday" aria-pressed="true">M</button><button class="rday" aria-pressed="false">T</button></div><nav class="pager"><ul><li><button class="pg on" aria-current="page">1</button></li><li><button class="pg">2</button></li></ul></nav>'; document.body.append(d); ringSync(); return true; })()`);
  const n = await ev(`document.querySelectorAll("#rt2 .rdays > .focus-ring, #rt2 .pager ul > .focus-ring").length`);
  const x0 = await ev(`document.querySelector("#rt2 .rdays .focus-ring").style.getPropertyValue("--x")`);
  await ev(`(() => { const [a, b] = document.querySelectorAll("#rt2 .rday"); a.setAttribute("aria-pressed", "false"); b.setAttribute("aria-pressed", "true"); ringSync(); return true; })()`); await sleep(100);
  const x1 = await ev(`document.querySelector("#rt2 .rdays .focus-ring").style.getPropertyValue("--x")`);
  await ev(`document.getElementById("rt2").remove(); true`);
  return n === 2 && x0 !== x1;
})());

console.log("--- 2. external links");
await ev(`document.querySelector("#app").insertAdjacentHTML("beforeend", '<p id="xl" style="position:fixed;left:40px;top:300px;z-index:9999;background:#fff;color:#111;padding:8px">Read <a id="xa" href="https://example.com/x">the source</a> or <a id="ia" href="#/home">go home</a> or <span class="links"><a id="la" href="https://example.com/y">a recipe search</a></span></p>'); true`);
const lnk = await ev(`(() => { const a = document.getElementById("xa"), cs = getComputedStyle(a), af = getComputedStyle(a, "::after"); const i = getComputedStyle(document.getElementById("ia"), "::after"); const l = getComputedStyle(document.getElementById("la"), "::after"); return { deco: cs.textDecorationLine, pos: cs.position, content: af.content, tf: af.transform, h: af.height, internal: i.content, list: l.content, tr: af.transitionDuration, ease: af.transitionTimingFunction }; })()`);
ok("an external link has a soft underline and a hidden animated line", lnk.deco === "underline" && lnk.pos === "relative" && lnk.content !== "none" && /matrix\(0,/.test(lnk.tf), JSON.stringify(lnk));
ok("the line is 2px and draws in over 0.4s", lnk.h === "2px" && lnk.tr === "0.4s" && /cubic-bezier\(0.65, 0, 0.35, 1\)/.test(lnk.ease), JSON.stringify(lnk));
ok("links inside the app and the recipe-search chips are left alone", lnk.internal === "none" && lnk.list === "none", JSON.stringify(lnk));
const pt = await ev(`(() => { const r = document.getElementById("xa").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y }); await sleep(700);
ok("hovering draws the line across the whole link", await ev(`getComputedStyle(document.getElementById("xa"), "::after").transform === "matrix(1, 0, 0, 1, 0, 0)"`));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 }); await ev(`document.getElementById("xl").remove(); true`);

console.log("--- 3. toasts at the top right");
await ev(`toast("First toast", "success"); true`); await sleep(120); await ev(`toast("Second toast", "info"); true`); await sleep(900);
const ts = await ev(`(() => { const st = document.getElementById("st-stack"), r = st.getBoundingClientRect(), t = [...st.querySelectorAll(".swipe-toast")].map(x => ({ txt: x.textContent.trim().slice(0, 12), top: x.getBoundingClientRect().top, right: x.getBoundingClientRect().right })); return { top: r.top, right: innerWidth - r.right, bottomGap: innerHeight - r.bottom, t, tr: getComputedStyle(st.querySelector(".swipe-toast__lift")).transitionDuration + "|" + getComputedStyle(st.querySelector(".swipe-toast__lift")).transitionTimingFunction }; })()`);
await shot("toasts");
ok("the stack is pinned to the top right", ts.top >= 0 && ts.top < 60 && ts.right < 40 && ts.bottomGap > 300, JSON.stringify(ts));
ok("the newest toast is at the top of the stack", ts.t.length === 2 && ts.t[0].txt.startsWith("Second") && ts.t[0].top < ts.t[1].top, JSON.stringify(ts.t));
ok("toasts spring in over half a second with the requested curve", /0\.5s/.test(ts.tr) && /cubic-bezier\(0\.18, 1\.25, 0\.4, 1\)/.test(ts.tr), ts.tr);
const mounted = await ev(`(() => { const l = document.querySelector("#st-stack .swipe-toast__lift"); const t = getComputedStyle(l); return { op: t.opacity, tf: t.transform }; })()`);
ok("a shown toast is fully visible and in place", mounted.op === "1" && (mounted.tf === "none" || mounted.tf === "matrix(1, 0, 0, 1, 0, 0)"), JSON.stringify(mounted));
await ev(`document.querySelector("#st-stack .swipe-toast").dataset.phase = "closing"; true`); await sleep(150);
const closing = await ev(`getComputedStyle(document.querySelector("#st-stack .swipe-toast .swipe-toast__lift")).transform`);
ok("a closing toast shrinks and slides up", (() => { const m = /matrix\(([^)]*)\)/.exec(closing); if (!m) return false; const v = m[1].split(",").map(Number); return v[0] < 1 && v[5] < 0; })(), closing);
await ev(`document.querySelectorAll("#st-stack .swipe-toast").forEach(t => t._st?.close("escape")); true`); await sleep(600);

console.log("--- 4. the bell's badge pulses");
await ev(`(() => { const p = P(); localStorage.removeItem("wlh.notif." + p.id); notify("test", "Reminder", "Log your lunch"); UI.bell = false; render(); return true; })()`);
await sleep(300);
const bell = await ev(`(() => { const b = document.querySelector(".bell-badge"); if (!b) return null; const a = getComputedStyle(b, "::after"); return { anim: a.animationName, dur: a.animationDuration, iter: a.animationIterationCount, bg: a.backgroundColor, content: a.content, pe: a.pointerEvents }; })()`);
ok("an unread count shows a badge with a pulse ring", bell && bell.anim === "bellPulse" && bell.dur === "1.8s" && bell.iter === "infinite" && bell.content !== "none", JSON.stringify(bell));
ok("the ring does not catch taps", bell && bell.pe === "none", JSON.stringify(bell));
await ev(`document.documentElement.dataset.motion = "reduced"; true`); await sleep(100);
ok("with reduced motion it stands still", await ev(`getComputedStyle(document.querySelector(".bell-badge"), "::after").animationName === "none"`));
await ev(`delete document.documentElement.dataset.motion; applyLook(); true`);
await shot("bell");

console.log("--- 5. widgets turn over");
await goto("#/home"); await sleep(300);
const fw = await ev(`(() => { const w = [...document.querySelectorAll(".wgrid .flipwrap")]; return { n: w.length, keys: w.map(x => x.querySelector(".face.front").dataset.k).join(), large: !!document.querySelector('.wgrid > .dcard[data-k="coach"]'), btn: w.every(x => x.querySelector(".flipbtn")), backEmpty: w.every(x => !x.querySelector(".face.back").firstChild) }; })()`);
ok("Small and Medium widgets can turn over; the Large one already shows everything", fw.n === 3 && fw.keys === "calories,steps,meals" && fw.large && fw.btn, JSON.stringify(fw));
ok("the backs are not built until they are opened", fw.backEmpty, JSON.stringify(fw));
await ev(`document.querySelector(".wsec").scrollIntoView(); true`); await sleep(300); await shot("home-front");
const before = await ev(`(() => { const w = document.querySelector('.flipwrap .face.front[data-k="calories"]').closest(".flipwrap"); const r = w.getBoundingClientRect(); return { w: r.width, h: r.height, label: w.querySelector(".flipbtn").getAttribute("aria-label") }; })()`);
await ev(`document.querySelector('.flipwrap .face.front[data-k="calories"]').closest(".flipwrap").querySelector(".flipbtn").click(); true`); await sleep(180);
await shot("home-turning");
const turning = await ev(`(() => { const i = document.querySelector('.flipwrap.flipped .face.front'); return i ? getComputedStyle(i).transform : null; })()`);
ok("tapping the corner button turns the card (a 3D rotation is under way)", turning && /matrix3d/.test(turning), turning);
await sleep(1800);
await shot("home-back");
const back = await ev(`(() => { const w = document.querySelector(".flipwrap.flipped"), f = w.querySelector(".face.front"), b = w.querySelector(".face.back"), r = w.getBoundingClientRect(), btn = w.querySelector(".flipbtn"); return { k: f.dataset.k, frontInert: f.inert, backInert: b.inert, text: b.textContent.replace(/\\s+/g, " ").trim().slice(0, 120), sections: b.querySelectorAll(".lsec").length, open: b.querySelector(".fb-open")?.getAttribute("href"), expanded: btn.getAttribute("aria-expanded"), label: btn.getAttribute("aria-label"), w: r.width, h: r.height, rot: getComputedStyle(f).transform, backVisible: getComputedStyle(b).backfaceVisibility }; })()`);
ok("the back of a Small card holds today against the average, and links to the page", back.k === "calories" && /Today/.test(back.text) && /7-day average/.test(back.text) && back.open === "#/nutrition", JSON.stringify(back));
ok("the card keeps its size when it turns over", Math.abs(back.w - before.w) < 1 && Math.abs(back.h - before.h) < 1, JSON.stringify([before, back]));
ok("the hidden face is inert; the shown one is not", back.frontInert === true && back.backInert === false, JSON.stringify(back));
ok("the button says what it will do", before.label === "More about Calories eaten" && back.label === "Back to Calories eaten" && back.expanded === "true", JSON.stringify([before, back]));
ok("it is turned half way round", /matrix3d\(-1/.test(back.rot), back.rot);
await ev(`render(); true`); await sleep(200);
ok("a re-render does not turn it back, and the back keeps its content", await ev(`(() => { const w = document.querySelector(".flipwrap.flipped"); return !!w && /7-day average/.test(w.querySelector(".face.back").textContent) && w.querySelector(".face.front").inert === true; })()`));
ok("a render under a focused Open link leaves the focus on it", await (async () => { await ev(`document.querySelector(".flipwrap.flipped .fb-open").focus(); render(); true`); await sleep(200); return ev(`document.activeElement?.classList.contains("fb-open") && !!document.activeElement.closest(".flipwrap.flipped")`); })());
ok("choosing a playback speed moves the ring", await (async () => {
  await ev(`(() => { const d = document.createElement("div"); d.id = "rt"; d.className = "seg sm"; d.style.cssText = "position:fixed;top:0;left:0;z-index:9"; d.innerHTML = ["0.25","0.5","1"].map(v => '<button data-act="fc-rate" data-v="' + v + '" aria-pressed="' + (v === "1") + '">' + v + '</button>').join(""); document.body.append(d); ringSync(); return true; })()`);
  const x0 = await ev(`document.querySelector("#rt .focus-ring").style.getPropertyValue("--x")`);
  await ev(`document.querySelector('#rt [data-v="0.25"]').click(); true`); await sleep(100);
  const x1 = await ev(`document.querySelector("#rt .focus-ring").style.getPropertyValue("--x")`);
  await ev(`document.getElementById("rt").remove(); true`);
  return x0 !== x1;
})());
await ev(`document.querySelector(".flipwrap.flipped .flipbtn").focus(); true`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(900);
ok("Escape turns it back and the focus stays on the button", await ev(`!document.querySelector(".flipwrap.flipped") && document.activeElement?.classList.contains("flipbtn") && document.querySelector('.face.front[data-k="calories"]').inert === false`));
ok("a Medium widget's back shows the full detail (several sections)", await (async () => { await ev(`document.querySelector('.flipwrap .face.front[data-k="meals"]').closest(".flipwrap").querySelector(".flipbtn").click(); true`); await sleep(900); return ev(`(() => { const b = document.querySelector('.flipwrap.flipped .face.back'); return !!b && /Planned for today/.test(b.textContent) && b.querySelectorAll('.lsec').length >= 3; })()`); })());
await ev(`document.querySelectorAll(".flipwrap.flipped .flipbtn").forEach(b => b.click()); true`); await sleep(700);
ok("in edit mode the cards are the plain ones (no flip, no extra wrappers)", await (async () => { await ev(`document.querySelector('.wsec[data-page="home"] [data-act="wl-edit"]').click(); true`); await sleep(300); const r = await ev(`({ wraps: document.querySelectorAll(".wgrid .flipwrap").length, cards: document.querySelectorAll(".wgrid > .dcard.editing").length })`); await ev(`document.querySelector('.wsec[data-page="home"] [data-act="wl-edit"]').click(); true`); await sleep(200); return r.wraps === 0 && r.cards === 4; })());
await view(375, 800); await sleep(300); await ev(`document.querySelector(".wsec").scrollIntoView(); document.querySelector(".flipwrap .flipbtn").click(); true`); await sleep(1200); await shot("phone-back"); await ev(`document.querySelector(".flipwrap.flipped .flipbtn").click(); true`); await sleep(900);
ok("on a phone the card still fits and the button is a 36px target inside it", await ev(`(() => { const w = document.querySelector(".flipwrap"), b = w.querySelector(".flipbtn").getBoundingClientRect(), r = w.getBoundingClientRect(); return b.width >= 36 && b.height >= 36 && b.right <= r.right + 0.5 && b.top >= r.top - 0.5 && document.documentElement.scrollWidth <= innerWidth + 1; })()`));
await view(1200);

console.log("--- 6. clean-ups");
await goto("#/nutrition"); await sleep(300);
const rows = await ev(`(() => { const r = [...document.querySelectorAll("#meals-today .li .grow")]; return r.map(g => { const b = g.querySelector("b"), t = g.querySelector(".tiny"); return { bd: getComputedStyle(b).display, td: getComputedStyle(t).display, same: Math.abs(b.getBoundingClientRect().left - t.getBoundingClientRect().left) < 1, below: t.getBoundingClientRect().top >= b.getBoundingClientRect().bottom - 1 }; }); })()`);
ok("a dish name and its details are on separate lines, not run together", rows.length === 3 && rows.every(x => x.bd === "block" && x.td === "block" && x.same && x.below), JSON.stringify(rows));
await shot("meals-clean");
await goto("#/coach"); await sleep(300);
const coach = await ev(`(() => { const h = document.querySelector(".hero"); const t = h.textContent.replace(/\\s+/g, " "); return { text: t.slice(0, 260), nameCount: (t.match(/Coach Henry/g) || []).length, pct: (t.match(/0%/g) || []).length, same: /Same as yesterday \\(\\d+%\\)/.test(t), oldLine: /You're at/.test(t) }; })()`);
ok("the coach card names the coach once", coach.nameCount === 1, JSON.stringify(coach));
ok("it does not repeat the percentage or print 0% twice", coach.pct <= 2 && coach.same && !coach.oldLine, JSON.stringify(coach));
await shot("coach-clean");
ok("with no food logged the check-in says so plainly", await ev(`(() => { const t = document.querySelector("#sec-coach").textContent; return t.length > 200 && !/Only 0 days/.test(t); })()`));
await goto("#/coach"); await ev(`document.getElementById("checkin")?.scrollIntoView(); true`); await sleep(200);
const ci = await ev(`(() => { const f = document.querySelector("#checkin .timeline .fill"); return f ? f.style.width : null; })()`);
ok("the weekly bar's fill shows what was done (nothing), not how far into the week it is", ci === "0%" || ci === "0px" || ci === "", JSON.stringify(ci));
await shot("checkin-clean");

console.log("--- 7. phone menu after scrolling, tips go to the bell (8.3.20)");
await view(390, 664); await goto("#/home");
await ev(`window.scrollTo(0, 1200); true`); await sleep(300);
const y0 = await ev(`scrollY`);
await ev(`lockPageScroll(true); true`); await sleep(200);
ok("opening the menu after scrolling keeps the page painted behind it (not a blank screen)", await ev(`(() => { const a = document.querySelector(".app").getBoundingClientRect(), b = document.body.getBoundingClientRect(); return b.bottom > innerHeight && a.bottom > innerHeight && a.top < 0; })()`), JSON.stringify(await ev(`document.body.getBoundingClientRect().toJSON()`)));
await ev(`lockPageScroll(false); true`); await sleep(100);
ok("closing it puts the page back where it was", Math.abs(await ev(`scrollY`) - y0) < 2);
await view(1280);
const nb = await ev(`(() => { const p = P(); saveNotifs(p, []); const before = document.querySelectorAll(".swipe-toast").length; bellNote("You can take the tour any time from Settings › Data & about.", "#/settings/about"); const l = loadNotifs(p); return { n: l.length, kind: l[0]?.kind, href: l[0]?.href, cards: document.querySelectorAll(".swipe-toast").length - before }; })()`);
ok("a tip lands in the bell's System tab with a link, and no card pops over the page", nb.n === 1 && nb.kind === "system" && nb.href === "#/settings/about" && nb.cards <= 0, JSON.stringify(nb));
await ev(`saveNotifs(P(), []); paintBell(); true`);

ok("no script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
