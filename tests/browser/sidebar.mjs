import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run from the repo root:  node tests/browser/sidebar.mjs   (needs Node 22+, Python 3 and Chrome)
// Checks the 8.1.16 sidebar: floating card geometry, profile switcher, search, count badges,
// escaping, keyboard, the phone/tablet drawer, and every theme in light, dark and OLED.
// Set SHOTS=<dir> to also save a screenshot of each size and theme. The supabase-js CDN script is
// replaced with fake-supabase.js, so no real account is touched.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOTS = process.env.SHOTS || "";
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
procs.push(spawn("python", ["-m", "http.server", "8767", "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" }));
procs.push(spawn(CHROME, ["--headless=new", "--remote-debugging-port=9335", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-sb-"))}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" }));
await sleep(2500);
const list = await (await fetch("http://127.0.0.1:9335/json/list")).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = []; const dialogs = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  else if (d.method === "Page.javascriptDialogOpening") { dialogs.push(d.params.message); send("Page.handleJavaScriptDialog", { accept: true }); }
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval failed: " + expr); return r.result.result.value; };
const waitFor = async (expr, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(120); } return false; };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };
const key = (k, mods = 0, code = k) => send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, modifiers: mods, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : ({ Escape: 27, Enter: 13, ArrowDown: 40, ArrowUp: 38 })[k] || 0 }).then(() => send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, modifiers: mods }));
const size = (w, h) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
const shot = async name => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(SHOTS, name + ".png"), Buffer.from(r.result.data, "base64")); };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const ready = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
const boot = async (hash = "") => { await send("Page.navigate", { url: "http://127.0.0.1:8767/index.html" + hash }); await sleep(500); return waitFor(ready, 15000); };

const NAME = "<img src=x onerror=alert(1)>";
await size(1440, 900);
ok("boot", await boot(), JSON.stringify(errors));
// Two profiles (the first has a markup name), one meal, two snacks and no workouts today.
await ev(`(async () => {
  const a = newProfile(${JSON.stringify(NAME)}); a.onboarded = true; a.coachPrompted = true; a.tourSeen = true;
  const b = newProfile("Ama"); b.onboarded = true; b.coachPrompted = true; b.tourSeen = true;
  S.profiles.push(a, b); S.activeId = a.id;
  const L = logFor(a.id, monthOf(today()));
  L.meals.push({ id: "m1abcd", date: today(), at: Date.now(), slot: "lunch", name: "Jollof rice", cal: 600, dish: null, extras: [], est: false, photo: null });
  for (const i of [1, 2]) L.snacks.push({ id: "s" + i + "abcd", date: today(), at: Date.now(), name: "Plantain chips", cal: 150 });
  markAll(); await flush(); })()`);
ok("boot with data", await boot("#/home"), JSON.stringify(errors));
await sleep(500);

console.log("--- structure and card geometry at 1440px");
const g = await ev(`(() => { const s = document.querySelector(".side"), r = s.getBoundingClientRect(), cs = getComputedStyle(s);
  return { w: Math.round(r.width), x: Math.round(r.left), top: Math.round(r.top), radius: cs.borderTopLeftRadius, border: cs.borderTopWidth + " " + cs.borderTopStyle, shadow: cs.boxShadow,
    kids: [...s.children].map(c => c.className.split(" ")[0] || c.tagName), grp: [...s.querySelectorAll(".nav .grp")].map(x => x.textContent),
    mainLeft: Math.round(document.querySelector(".main").getBoundingClientRect().left) }; })()`);
ok("card is 260px wide", g.w === 260, JSON.stringify(g));
ok("card floats 12px from the edge", g.x === 12 && g.top === 12, JSON.stringify(g));
ok("20px radius, 1px solid border, no shadow", g.radius === "20px" && g.border === "1px solid" && g.shadow === "none", JSON.stringify(g));
ok("order: profile, search, nav, bottom", JSON.stringify(g.kids) === JSON.stringify(["sb-prof", "sb-search", "nav", "sb-foot"]), JSON.stringify(g.kids));
ok("section labels", JSON.stringify(g.grp) === JSON.stringify(["Overview", "Log", "Plan", "Progress", "Premium"]), JSON.stringify(g.grp));
const routes = await ev(`[...document.querySelectorAll(".side a[href]")].map(a => a.getAttribute("href"))`);
for (const r of ["#/home", "#/nutrition", "#/snacks", "#/workouts", "#/recipes", "#/culture", "#/coach", "#/health", "#/awards", "#/settings", "#/contact"]) ok("destination kept " + r, routes.includes(r), JSON.stringify(routes));
ok("Premium row kept", await ev(`!!document.querySelector(".side .prem-trigger, .side .upsell")`));
ok("every nav row keeps its gradient tile", await ev(`[...document.querySelectorAll(".side .nav a")].every(a => a.querySelector(".si-tile"))`));

console.log("--- count badges are real numbers");
const badges = await ev(`Object.fromEntries([...document.querySelectorAll(".side .nav a")].map(a => [a.dataset.label, a.querySelector(".sb-badge > [aria-hidden]")?.textContent || ""]))`);
ok("Meals shows 1, Snacks shows 2", badges.Meals === "1" && badges.Snacks === "2", JSON.stringify(badges));
ok("Workouts (none today) shows no badge", badges["Workouts & imports"] === "", JSON.stringify(badges));
ok("no other row has a badge", Object.entries(badges).every(([k, v]) => ["Meals", "Snacks"].includes(k) || v === ""), JSON.stringify(badges));
ok("badge has a spoken label", await ev(`document.querySelector('.side a[data-label="Meals"] .sr-only').textContent.includes("1 today")`));

console.log("--- profile name is escaped");
ok("no element was made from the name", await ev(`!document.querySelector('img[src="x"]') && !document.querySelector("[onerror]")`));
ok("name shows as text", await ev(`document.querySelector(".sb-who b").textContent === ${JSON.stringify(NAME)}`));
ok("no alert ran", dialogs.length === 0, JSON.stringify(dialogs));

console.log("--- profile switcher");
ok("menu starts closed", await ev(`document.getElementById("sb-prof-menu").hidden && document.querySelector(".sb-prof-btn").getAttribute("aria-expanded") === "false"`));
await ev(`document.querySelector(".sb-prof-btn").click()`);
ok("click opens the menu", await ev(`!document.getElementById("sb-prof-menu").hidden && document.querySelector(".sb-prof-btn").getAttribute("aria-expanded") === "true"`));
ok("lists both profiles, active one checked", await ev(`(() => { const i = [...document.querySelectorAll("#sb-prof-menu [role=menuitemradio]")]; return i.length === 2 && i[0].getAttribute("aria-checked") === "true" && i[1].getAttribute("aria-checked") === "false" && i[1].textContent.includes("Ama"); })()`));
ok("focus moved into the menu", await ev(`document.activeElement.closest("#sb-prof-menu") !== null`));
await key("ArrowDown");
ok("arrow keys move through the menu", await ev(`document.activeElement.textContent.includes("Ama")`));
await key("Escape");
ok("Escape closes it and returns focus to the button", await ev(`document.getElementById("sb-prof-menu").hidden && document.activeElement === document.querySelector(".sb-prof-btn")`));
await ev(`document.querySelector(".sb-prof-btn").click(); document.querySelectorAll("#sb-prof-menu [role=menuitemradio]")[1].click()`);
await sleep(300);
ok("choosing a profile switches to it", await ev(`P().name === "Ama" && document.querySelector(".sb-who b").textContent === "Ama"`));
ok("menu is closed after switching", await ev(`document.getElementById("sb-prof-menu").hidden`));
await ev(`document.querySelector(".sb-prof-btn").click()`);
ok("Add a profile and Manage profiles are offered", await ev(`!!document.querySelector('#sb-prof-menu [data-act="sb-add-prof"]') && !!document.querySelector('#sb-prof-menu a[href="#/settings/household"]')`));
await ev(`document.body.click()`);
ok("a click outside closes it", await ev(`document.getElementById("sb-prof-menu").hidden`));
await ev(`S.activeId = S.profiles[0].id; render()`);

console.log("--- search");
await key("k", 2, "KeyK"); // Ctrl+K
ok("Ctrl+K focuses the sidebar search", await waitFor(`document.activeElement?.id === "sb-q"`));
ok("the palette did not open", await ev(`!PAL.open`));
await ev(`(() => { const q = document.getElementById("sb-q"); q.value = "rec"; q.dispatchEvent(new Event("input", { bubbles: true })); })()`);
let vis = await ev(`[...document.querySelectorAll(".side .nav [data-label]:not([hidden])")].map(a => a.dataset.label)`);
ok("typing filters the rows", JSON.stringify(vis) === JSON.stringify(["Recipes & meal plans"]), JSON.stringify(vis));
ok("groups with no match are hidden", await ev(`[...document.querySelectorAll(".side .navgrp")].filter(g => !g.hidden).length === 1`));
await ev(`(() => { const q = document.getElementById("sb-q"); q.value = "zzz"; q.dispatchEvent(new Event("input", { bubbles: true })); })()`);
ok("no match shows a message", await ev(`!document.querySelector(".sb-none").hidden`));
await key("Escape");
ok("Escape clears the search and shows every row", await ev(`document.getElementById("sb-q").value === "" && document.querySelectorAll(".side .nav [data-label][hidden]").length === 0 && document.querySelector(".sb-none").hidden`));
await ev(`(() => { const q = document.getElementById("sb-q"); q.value = "coach"; q.dispatchEvent(new Event("input", { bubbles: true })); q.focus(); })()`);
await key("Enter");
ok("Enter opens the first match", await waitFor(`location.hash === "#/coach"`));
ok("the search is cleared after navigating", await ev(`document.getElementById("sb-q").value === ""`));
await key("k", 10, "KeyK"); // Ctrl+Shift+K (CDP modifiers: Alt 1, Ctrl 2, Meta 4, Shift 8)
ok("Ctrl+Shift+K still opens the quick-jump palette", await ev(`PAL.open`));
await key("Escape"); await sleep(300);

console.log("--- bottom block");
ok("Support and Settings link out", await ev(`document.querySelector('.sb-links a[href="#/contact"]') && document.querySelector('.sb-links a[href="#/settings"]')`));
ok("guest sees Sign in, not Sign out", await ev(`!!document.querySelector('.sb-acct a[href="#/settings/profile"]') && !document.querySelector('[data-act="side-out"]')`));
await ev(`window.__old = 1; SB.client.auth.signInWithPassword({email:"ama@example.com",password:"password1"}).then(()=>true)`);
await waitFor(`window.__old === undefined && ${ready}`, 15000);
if (await ev(`!!UI.guestPrompt`)) await ev(`sbGuestImport()`); // this browser held guest data, so the app asks first
await waitFor(`!!document.querySelector(".sb-email")`, 15000);
ok("signed in: the account card shows the email", await ev(`document.querySelector(".sb-email").textContent === "ama@example.com"`));
ok("signed in: Sign out is offered", await ev(`!!document.querySelector('[data-act="side-out"]')`));

console.log("--- touch targets and keyboard");
const small = await ev(`[...document.querySelectorAll(".side a, .side button, .side input")].filter(e => e.offsetParent && !e.closest("[hidden]")).map(e => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.height < 44 || r.width < 44).map(([e, r]) => (e.dataset.act || e.dataset.label || e.id || e.className) + " " + Math.round(r.width) + "x" + Math.round(r.height))`);
ok("every interactive control is at least 44px", small.length === 0, JSON.stringify(small));
ok("nav rows are real links reachable by Tab", await ev(`[...document.querySelectorAll(".side .nav a")].every(a => a.tabIndex === 0)`));

console.log("--- desktop rail (collapsed)");
await ev(`setRail(true)`); await sleep(700);
const rail = await ev(`(() => { const s = document.querySelector(".side").getBoundingClientRect(); return { w: Math.round(s.width), search: getComputedStyle(document.querySelector(".sb-search")).display, who: getComputedStyle(document.querySelector(".sb-who")).display, lab: getComputedStyle(document.querySelector(".sb-lab")).display, over: document.documentElement.scrollWidth > innerWidth }; })()`);
ok("rail card is 64px with labels and search hidden", rail.w === 64 && rail.search === "none" && rail.who === "none" && rail.lab === "none" && !rail.over, JSON.stringify(rail));
await shot("1440-rail");
await key("k", 2, "KeyK");
ok("Ctrl+K expands the rail and focuses the search", await waitFor(`!document.querySelector(".app.rail") && document.activeElement?.id === "sb-q"`));
await ev(`document.activeElement.blur()`);

console.log("--- 1440px: every theme in light, dark and OLED");
const themes = ["forest", "ocean", "sunset", "midnight"], modes = ["light", "dark", "oled"];
for (const th of themes) for (const mode of modes) {
  await ev(`(() => { const p = P(); p.look = { ...(p.look || {}), theme: ${JSON.stringify(th)}, mode: ${JSON.stringify(mode)} }; saveProfile(); applyLook(p); render(); })()`);
  await sleep(250);
  const c = await ev(`(() => { const s = document.querySelector(".side"), cs = getComputedStyle(s), a = document.querySelector('.side .nav a[aria-current="page"]'), lab = document.querySelector(".side .nav a:not([aria-current]) .sb-lab");
    return { bg: cs.backgroundColor, text: getComputedStyle(lab).color, scheme: document.documentElement.dataset.scheme, over: document.documentElement.scrollWidth > innerWidth, clip: [...s.querySelectorAll(".sb-who b,.sb-email")].some(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== "ellipsis") }; })()`);
  const lum = css => { let m = css.match(/[\d.]+/g).map(Number); if (css.startsWith("color(")) m = m.map(v => v * 255); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
  const alpha = (css => { const m = css.match(/[\d.]+/g).map(Number); return m.length > 3 ? m[3] : 1; })(c.bg);
  const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  const r = ratio(lum(c.text), lum(c.bg));
  ok(`${th} / ${mode}: scheme ${c.scheme}, label contrast ${r.toFixed(1)}:1, no overflow`, r >= 4.5 && !c.over && !c.clip && alpha > 0.5, JSON.stringify(c));
  await shot(`1440-${th}-${mode}`);
}

console.log("--- 820px (tablet) and 375px (phone): drawer");
for (const [w, h] of [[820, 1100], [375, 740]]) {
  await ev(`(() => { const p = P(); p.look = { ...(p.look || {}), theme: "forest", mode: "light" }; saveProfile(); applyLook(p); render(); })()`);
  await size(w, h); await ev(`render()`); await sleep(500);
  const closed = await ev(`(() => { const s = document.querySelector(".side"), r = s.getBoundingClientRect(); return { right: Math.round(r.right), vis: getComputedStyle(s).visibility, scrim: getComputedStyle(document.querySelector(".scrim")).visibility, over: document.documentElement.scrollWidth > innerWidth }; })()`);
  ok(`${w}px: drawer is closed, off screen and out of the tab order`, closed.right <= 0 && closed.vis === "hidden" && !closed.over, JSON.stringify(closed));
  const tog = await ev(`(() => { const b = [...document.querySelectorAll(".page-head .menu-toggle")][0], r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), exp: b.getAttribute("aria-expanded") }; })()`);
  ok(`${w}px: menu toggle is at least 44px`, tog.w >= 44 && tog.h >= 44 && tog.exp === "false", JSON.stringify(tog));
  await ev(`document.querySelector(".page-head .menu-toggle").click()`); await sleep(700);
  const open = await ev(`(() => { const s = document.querySelector(".side"), r = s.getBoundingClientRect(), sc = document.querySelector(".scrim").getBoundingClientRect(), b = document.querySelector(".page-head .menu-toggle");
    const bar = n => document.querySelector(".page-head .menu-toggle .bar-" + n).getBoundingClientRect();
    return { x: Math.round(r.left), w: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(innerHeight - r.bottom), radius: getComputedStyle(s).borderTopLeftRadius, vis: getComputedStyle(s).visibility, scrimFull: sc.width === innerWidth && sc.height === innerHeight, scrimOn: getComputedStyle(document.querySelector(".scrim")).visibility, exp: b.getAttribute("aria-expanded"), over: document.documentElement.scrollWidth > innerWidth }; })()`);
  ok(`${w}px: drawer is a 260px floating card with the full-screen scrim`, open.x === 8 && open.w === Math.min(260, w - 16) && open.top === 8 && open.bottom === 8 && open.radius === "20px" && open.vis === "visible" && open.scrimFull && open.scrimOn === "visible" && open.exp === "true" && !open.over, JSON.stringify(open));
  const morph = await ev(`(() => { const b = document.querySelector(".page-head .menu-toggle"), br = b.getBoundingClientRect(), ic = b.querySelector(".menu-icon").getBoundingClientRect(); return Math.abs((ic.left + ic.width / 2) - (br.left + br.width / 2)) <= 0.5 && Math.abs((ic.top + ic.height / 2) - (br.top + br.height / 2)) <= 0.5; })()`);
  ok(`${w}px: the toggle's glyph stays centred (arrow state)`, morph);
  const clipped = await ev(`(() => { const s = document.querySelector(".side").getBoundingClientRect(); return [...document.querySelectorAll(".side .sb-prof, .side .sb-search, .side .sb-foot")].filter(e => { const r = e.getBoundingClientRect(); return r.right > s.right + 1 || r.left < s.left - 1; }).length; })()`);
  ok(`${w}px: nothing sticks out of the card`, clipped === 0);
  await shot(`${w}-drawer-open`);
  await key("Escape"); await sleep(600);
  ok(`${w}px: Escape closes the drawer`, await ev(`!UI.menu && getComputedStyle(document.querySelector(".side")).visibility === "hidden"`));
  await ev(`document.querySelector(".page-head .menu-toggle").click()`); await sleep(500);
  await ev(`document.querySelector(".scrim").click()`); await sleep(600);
  ok(`${w}px: the scrim closes the drawer`, await ev(`!UI.menu`));
  await ev(`document.querySelector(".page-head .menu-toggle").click()`); await sleep(500);
  await ev(`document.querySelector('.side .nav a[href="#/snacks"]').click()`); await sleep(700);
  ok(`${w}px: choosing a destination navigates and closes the drawer`, await ev(`location.hash === "#/snacks" && !UI.menu`));
  for (const th of ["ocean", "sunset", "midnight"]) for (const mode of ["light", "dark"]) {
    await ev(`(() => { const p = P(); p.look = { ...(p.look || {}), theme: ${JSON.stringify(th)}, mode: ${JSON.stringify(mode)} }; saveProfile(); applyLook(p); render(); setMenu(true); })()`); await sleep(500);
    const t = await ev(`(() => { const s = document.querySelector(".side"); return { vis: getComputedStyle(s).visibility, bg: getComputedStyle(s).backgroundColor, over: document.documentElement.scrollWidth > innerWidth }; })()`);
    ok(`${w}px ${th}/${mode}: drawer opaque, no horizontal scroll`, t.vis === "visible" && !/,\s*0\)$/.test(t.bg) && !t.over, JSON.stringify(t));
    if (w === 375) await shot(`375-${th}-${mode}`);
    await ev(`setMenu(false)`); await sleep(400);
  }
}

ok("no uncaught page errors", errors.length === 0, JSON.stringify(errors));
ok("no alert() ran", dialogs.length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => p.kill());
process.exit(fail ? 1 : 0);
