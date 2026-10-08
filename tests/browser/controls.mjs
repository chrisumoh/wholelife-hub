import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run from the repo root:  node tests/browser/controls.mjs [screenshot-dir]   (needs Node 22+, Python 3 and Chrome)
// Checks the 8.1.19 form controls in a real browser: custom select (keyboard + ARIA), date picker,
// textarea auto-resize, password reveal, 44px touch targets, no horizontal scroll at 375/820/1440px.
// With a directory argument it also saves screenshots (light, dark and each theme).
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const SHOTS = process.argv[2]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
procs.push(spawn("python", ["-m", "http.server", "8767", "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" }));
procs.push(spawn(CHROME, ["--headless=new", "--remote-debugging-port=9335", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-ctl-"))}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" }));
await sleep(2500);
const list = await (await fetch("http://127.0.0.1:9335/json/list")).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const waitFor = async (expr, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(120); } return false; };
const VK = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, Enter: 13, Escape: 27, Tab: 9 };
const key = async (k, extra = {}) => { const code = k.length === 1 ? { text: k } : { windowsVirtualKeyCode: VK[k], code: k, ...(k === "Enter" ? { text: "\r" } : {}) }; await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, ...code, ...extra }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, ...(k.length === 1 ? {} : { windowsVirtualKeyCode: VK[k], code: k }) }); await sleep(40); };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };
const view = async (w, h = 900, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
const shot = async name => { if (!SHOTS) return; const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(SHOTS, name + ".png"), Buffer.from(r.result.data, "base64")); };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable"); await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const ready = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
const boot = async (hash = "") => { await send("Page.navigate", { url: "http://127.0.0.1:8767/index.html" + hash }); await sleep(500); return waitFor(ready, 15000); };
const go = async hash => { await ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(500); };

await view(1440);
ok("boot", await boot(), JSON.stringify(errors));
await ev(`(async () => { const p = newProfile("Ada"); p.onboarded = true; p.coachPrompted = true; p.tourSeen = "dismissed"; S.profiles.push(p); S.activeId = p.id; markAll(); await flush(); render(); return true; })()`);
ok("boot again", await boot("#/nutrition"));
await sleep(600);

console.log("--- select");
ok("custom trigger replaces the visible select", await ev(`(() => { const s = document.getElementById("m-slot"); return !!s._wl && getComputedStyle(s).display === "none" && s._wl.getAttribute("role") === "combobox"; })()`));
ok("trigger shows the selected option", await ev(`(() => { const s = document.getElementById("m-slot"); return s._wl.textContent.trim() === s.selectedOptions[0].text; })()`));
await ev(`document.getElementById("m-slot")._wl.focus()`);
await key("ArrowDown");
ok("ArrowDown opens the listbox", await ev(`!!document.querySelector('.wl-list[role=listbox]') && document.getElementById("m-slot")._wl.getAttribute("aria-expanded") === "true"`));
ok("options have role=option and one is selected", await ev(`(() => { const o = [...document.querySelectorAll('.wl-list [role=option]')]; return o.length === document.getElementById("m-slot").options.length && o.filter(x => x.getAttribute("aria-selected") === "true").length === 1; })()`));
ok("aria-activedescendant points at an option", await ev(`(() => { const t = document.getElementById("m-slot")._wl; const a = document.getElementById(t.getAttribute("aria-activedescendant")); return !!a && a.getAttribute("role") === "option"; })()`));
await key("End"); const last = await ev(`document.querySelector('.wl-opt.act').textContent`);
await key("Home"); const firstT = await ev(`document.querySelector('.wl-opt.act').textContent`);
ok("Home and End move to the first and last option", firstT !== last && last === await ev(`[...document.getElementById("m-slot").options].pop().text`) && firstT === await ev(`document.getElementById("m-slot").options[0].text`), `${firstT} / ${last}`);
await key("Escape");
ok("Escape closes and keeps focus on the trigger", await ev(`!document.querySelector('.wl-list') && document.activeElement === document.getElementById("m-slot")._wl`));
await key("ArrowDown"); await key("End"); await key("Enter");
ok("Enter picks the active option and fires change", await ev(`(() => { const s = document.getElementById("m-slot"); return s.selectedIndex === s.options.length - 1 && s._wl.textContent.trim() === s.selectedOptions[0].text; })()`));
ok("Enter closed the list", await ev(`!document.querySelector('.wl-list')`));
await ev(`window.__ch = 0; document.addEventListener("change", e => { if (e.target.id === "m-slot") window.__ch++; })`);
await key("ArrowDown"); await key("l"); await key("Enter");
ok("type-ahead jumps to the option starting with that letter", await ev(`document.getElementById("m-slot").selectedOptions[0].text.toLowerCase().startsWith("l") && window.__ch === 1`), await ev(`document.getElementById("m-slot").selectedOptions[0].text`));
await ev(`document.getElementById("m-slot")._wl.click()`);
await sleep(50);
await ev(`document.querySelector('.wl-opt[data-i="0"]').click()`);
ok("clicking an option selects it", await ev(`document.getElementById("m-slot").selectedIndex === 0 && !document.querySelector('.wl-list')`));

console.log("--- date picker");
ok("date input became a picker button", await ev(`(() => { const d = document.getElementById("m-date"); return !!d._wl && d.type === "hidden" && /\\d{4}/.test(d._wl.textContent); })()`));
await ev(`document.getElementById("m-date")._wl.click()`); await sleep(100);
ok("calendar opens with focus on a day", await ev(`!!document.querySelector('.wl-cal[role=dialog]') && document.activeElement.classList.contains("wl-day")`));
ok("days after max are disabled", await ev(`(() => { const t = document.getElementById("m-date").max; return [...document.querySelectorAll(".wl-day")].every(b => (b.dataset.d > t) === b.disabled); })()`));
await key("ArrowLeft"); await key("Enter");
ok("keyboard picks the previous day and fires change", await ev(`(() => { const d = document.getElementById("m-date"); return d.value === addDays(today(), -1) && !document.querySelector('.wl-cal'); })()`), await ev(`document.getElementById("m-date")?.value`));
await sleep(500);
ok("the page followed the picked date (existing change handler)", await ev(`UI.navDate === addDays(today(), -1)`));
await ev(`document.getElementById("m-date")._wl.click()`); await sleep(100); await key("Escape");
ok("Escape closes the calendar and returns focus", await ev(`!document.querySelector('.wl-cal') && document.activeElement === document.getElementById("m-date")._wl`));
ok("no native date inputs left on the page", await ev(`!document.querySelector("input[type=date]")`));

console.log("--- textarea");
await go("#/coach"); await sleep(600);
const ta = await ev(`(() => { const t = document.querySelector("textarea"); return !!t; })()`);
ok("coach page has a textarea", ta);
const sizes = await ev(`(() => {
  const t = document.getElementById("coach-q"); const out = {};
  const cs = getComputedStyle(t); const lh = parseFloat(cs.lineHeight);
  const set = n => { t.value = Array.from({length:n}, (_, i) => "line " + i).join("\\n"); t.dispatchEvent(new Event("input", {bubbles:true})); return t.offsetHeight; };
  out.lh = lh; out.resize = cs.resize; out.h0 = set(1); out.h2 = set(2); out.h3 = set(3); out.h8 = set(8); out.h12 = set(12); out.of = getComputedStyle(t).overflowY; out.of8 = (set(8), getComputedStyle(t).overflowY); return out; })()`);
ok("hides the drag handle", sizes.resize === "none", JSON.stringify(sizes));
ok("starts at 2 rows (1 line of text is still 2 rows tall)", sizes.h0 === sizes.h2, JSON.stringify(sizes));
ok("grows one line at a time", Math.abs((sizes.h3 - sizes.h2) - sizes.lh) <= 1.5, JSON.stringify(sizes));
ok("stops at 8 rows then scrolls", sizes.h12 === sizes.h8 && sizes.of === "auto" && sizes.of8 === "hidden", JSON.stringify(sizes));

console.log("--- buttons, segments, touch targets");
const small = async () => ev(`(() => [...document.querySelectorAll(".btn,.chip,.nav a,.icon-btn,.theme-chip,.season-chip,.reco-dot,.seg button,.seg-display button,.wl-sel,.wl-date,input:not([type=hidden]):not([type=range]):not([type=checkbox]):not([type=file]),select:not(.wl-native),textarea")].filter(e => e.getClientRects().length && !e.closest(".rs-thumb")).map(e => [e, { height: e.offsetHeight }]).filter(([e, r]) => r.height < 43.5 && r.height > 0).map(([e, r]) => (e.className || e.tagName) + ":" + Math.round(r.height) + ":" + (e.textContent || e.id || "").trim().slice(0, 20)))()`);
for (const route of ["#/home", "#/nutrition", "#/workouts", "#/coach", "#/settings", "#/snacks", "#/recipes"]) {
  await go(route); await sleep(500);
  const s = await small();
  ok(`${route}: every button, chip, segment and field is at least 44px tall`, s.length === 0, JSON.stringify(s.slice(0, 6)));
}
await go("#/settings"); await sleep(500);
ok("lb/kg segmented control is 44px", await ev(`(() => { const b = document.querySelector('.seg [data-act="units"]'); return !!b && b.getBoundingClientRect().height >= 44; })()`));
ok("arrow keys move focus along a segmented control", await (async () => { await ev(`document.querySelector('.seg [data-act="units"]').focus()`); await key("ArrowRight"); return ev(`document.activeElement.dataset.v === "metric"`); })());

console.log("--- password reveal and auth card");
await go("#/settings"); await sleep(500);
await ev(`document.querySelector('[data-act="sb-open"]')?.click()`); await sleep(500);
ok("auth popup is open with the email field focused", await ev(`!!document.querySelector("#pop-auth") && document.activeElement?.id === "sb-email"`));
await ev(`document.querySelector('#pop-auth [data-act="sb-mode"][data-v="in"]')?.click()`);
ok("password field has a reveal button", await ev(`!!document.querySelector("#pop-auth #sb-pass") && !!document.querySelector("#pop-auth .in-btn")`));
await ev(`document.querySelector("#pop-auth .in-btn").click()`);
ok("reveal switches the field to text and back", await ev(`(() => { const p = document.getElementById("sb-pass"), b = document.querySelector("#pop-auth .in-btn"); const a = p.type === "text" && b.getAttribute("aria-pressed") === "true"; b.click(); return a && p.type === "password"; })()`));
await shot("auth-1440-light");
await key("Escape"); await sleep(400);
ok("Escape closes the popup and returns focus to the opener", await ev(`!document.querySelector("#pop-auth") && document.activeElement?.dataset?.act === "sb-open"`));

console.log("--- layout at 375 / 820 / 1440, schemes and themes");
const looks = [["light", null], ["dark", null], ["oled", null], ["dark", "forest"], ["dark", "ocean"], ["dark", "sunset"], ["dark", "midnight"]];
for (const [w, mobile] of [[375, true], [820, false], [1440, false]]) {
  await view(w, 900, mobile); await sleep(300);
  for (const route of ["#/nutrition", "#/settings", "#/workouts"]) {
    await go(route); await sleep(500);
    const over = await ev(`document.documentElement.scrollWidth - innerWidth`);
    ok(`${w}px ${route}: no horizontal scroll`, over <= 0, String(over));
  }
  for (const [mode, theme] of looks) {
    await ev(`(() => { const p = P(); p.look = { ...(p.look || {}), mode: ${JSON.stringify(mode)}, theme: ${JSON.stringify(theme)} }; applyLook(); render(); return true; })()`);
    await go("#/nutrition"); await sleep(400);
    await shot(`nutrition-${w}-${mode}${theme ? "-" + theme : ""}`);
    if (!theme && mode !== "oled") { await go("#/settings"); await sleep(400); await shot(`settings-${w}-${mode}`); }
  }
}
for (const [w, mobile] of [[375, true], [1440, false]]) {
  for (const mode of ["light", "dark"]) {
    await view(w, 900, mobile);
    await ev(`(() => { const p = P(); p.look = { ...(p.look || {}), mode: ${JSON.stringify(mode)}, theme: null }; applyLook(); render(); return true; })()`);
    await go("#/nutrition"); await sleep(500);
    await ev(`(async () => { document.getElementById("m-slot")._wl.scrollIntoView({ block: "center", behavior: "instant" }); await new Promise(r => setTimeout(r, 400)); document.getElementById("m-slot")._wl.click(); })()`); await sleep(300);
    await shot(`form-select-open-${w}-${mode}`); await key("Escape");
    await ev(`(async () => { document.getElementById("m-date")._wl.scrollIntoView({ block: "center", behavior: "instant" }); await new Promise(r => setTimeout(r, 400)); document.getElementById("m-date")._wl.click(); })()`); await sleep(300);
    await shot(`form-date-open-${w}-${mode}`); await key("Escape");
  }
}
console.log("--- touch device (pointer: coarse): native select");
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
await view(375, 900, true);
ok("boot with touch emulation", await boot("#/nutrition"));
await sleep(600);
ok("pointer is coarse", await ev(`matchMedia("(pointer: coarse)").matches`));
ok("the native select is shown, with no custom trigger", await ev(`(() => { const s = document.getElementById("m-slot"); return !s._wl && !document.querySelector(".wl-sel") && getComputedStyle(s).display !== "none" && s.offsetHeight >= 44; })()`));
ok("the native select is styled (custom arrow, border)", await ev(`(() => { const c = getComputedStyle(document.getElementById("m-slot")); return c.appearance === "none" && c.backgroundImage.includes("svg") && c.borderTopWidth === "1px"; })()`));
ok("dates stay native on touch: a real date input, no custom picker, 44px tall", await ev(`(() => { const d = document.getElementById("m-date"); return d.type === "date" && !d._wl && !document.querySelector(".wl-date") && d.offsetHeight >= 44 && d.max === today(); })()`));
await shot("form-native-select-375");
await send("Emulation.setTouchEmulationEnabled", { enabled: false });
await view(1440);
console.log("--- no uncaught exceptions");
ok("no exceptions", errors.length === 0, JSON.stringify(errors.slice(0, 3)));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => p.kill());
process.exit(fail ? 1 : 0);
