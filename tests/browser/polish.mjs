import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run from the repo root:  node tests/browser/polish.mjs   (needs Node 22+, Python 3 and Chrome)
// Checks the 8.1.21 polish rules (make-interfaces-feel-better): font smoothing, text wrapping,
// tabular numbers, concentric card radii, icon stroke, hit areas, press scale, will-change, image outlines.
// Walks the main pages at 1440px and 390px.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const SHOTS = process.argv[2]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
procs.push(spawn("python", ["-m", "http.server", "8771", "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" }));
procs.push(spawn(CHROME, ["--headless=new", "--remote-debugging-port=9339", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-pol-"))}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" }));
await sleep(2500);
const list = await (await fetch("http://127.0.0.1:9339/json/list")).json();
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
const boot = async (hash = "") => { await send("Page.navigate", { url: "http://127.0.0.1:8771/index.html" + hash }); await sleep(500); return waitFor(ready, 15000); };
const go = async hash => { await ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(500); };

await view(1440);
ok("boot", await boot(), JSON.stringify(errors));
await ev(`(async () => { const p = newProfile("Ada"); p.onboarded = true; p.coachPrompted = true; p.tourSeen = "dismissed"; S.profiles.push(p); S.activeId = p.id; markAll(); await flush(); })()`);
const ROUTES = ["home", "nutrition", "snacks", "workouts", "recipes", "culture", "coach", "health", "awards", "settings/profile", "settings/appearance", "settings/privacy", "premium"];
// Small targets: links, buttons, summaries, sliders. Inline links inside sentences and inputs inside a
// clickable label are left out (the sentence or label is the target). The owner-code tap line is hidden.
const SMALL = `[...document.querySelectorAll(".app a[href], .app button, .app summary, .app [role=slider], .app [role=tab], .app input:not([type=hidden]), .app select")]
  .filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width && r.height && cs.visibility !== "hidden" && !e.closest(".sr-only,[aria-hidden=true],.brandline") && !(e.matches("input") && e.closest("label")) && !(e.matches("a:not([class])") && e.closest("p,li")); })
  .filter(e => { const r = e.getBoundingClientRect(), ext = [getComputedStyle(e, "::before"), getComputedStyle(e, "::after")].some(s => s.content !== "none" && s.position === "absolute" && parseFloat(s.height) >= MIN); return (r.height < MIN - 0.5 || r.width < MIN - 0.5) && !ext; })
  .map(e => (e.className || e.tagName) + ":" + (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 20) + " " + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height))`;

console.log("--- typography");
ok("font smoothing on the root", await ev(`getComputedStyle(document.documentElement).webkitFontSmoothing === "antialiased"`));
await boot("#/coach"); await sleep(400);
ok("short body text avoids orphans (text-wrap: pretty)", await ev(`[...document.querySelectorAll(".app p")].filter(p => !p.closest(".legal")).every(p => getComputedStyle(p).textWrap === "pretty" || getComputedStyle(p).textWrapStyle === "pretty")`));
ok("headings stay balanced", await ev(`[...document.querySelectorAll(".app h1,.app h2")].every(h => /balance/.test(getComputedStyle(h).textWrap + getComputedStyle(h).textWrapStyle))`));
await boot("#/home"); await sleep(400);
ok("rings count uses tabular numbers", await ev(`getComputedStyle(document.querySelector(".rleg-head b")).fontVariantNumeric.includes("tabular-nums")`));
await boot("#/recipes"); await sleep(400);
ok("recipe count uses tabular numbers", await ev(`getComputedStyle(document.querySelector("#sec-recipes .row.between>.small")).fontVariantNumeric.includes("tabular-nums")`));

console.log("--- surfaces");
await boot("#/home"); await sleep(400);
const rad = await ev(`(() => { const c = document.querySelector(".app .mcard.meals-w"), d = c.querySelector(".dish"), cs = getComputedStyle(c), ds = getComputedStyle(d), gap = d.getBoundingClientRect().left - c.getBoundingClientRect().left;
  return { outer: parseFloat(cs.borderTopLeftRadius), inner: parseFloat(ds.borderTopLeftRadius), gap: Math.round(gap) }; })()`);
ok("meals widget and its dish tiles are concentric (outer = inner + gap, within 2px)", Math.abs(rad.outer - (rad.inner + rad.gap)) <= 2, JSON.stringify(rad));
const rr = await ev(`(() => { const c = document.getElementById("rings"), r = c.querySelector(".rleg"); return { outer: parseFloat(getComputedStyle(c).borderTopLeftRadius), inner: parseFloat(getComputedStyle(r).borderTopLeftRadius) }; })()`);
ok("Today at a glance 28px with 12px ring rows", rr.outer === 28 && rr.inner === 12, JSON.stringify(rr));
await boot("#/nutrition"); await sleep(400);
ok("stat labels sit flush with their number (no nested box)", await ev(`(() => { const d = document.querySelector(".stats div div"); if (!d) return true; const s = getComputedStyle(d); return s.paddingLeft === "0px" && s.backgroundColor === "rgba(0, 0, 0, 0)"; })()`));
ok("button with a leading icon: icon side 2px tighter", await ev(`(() => { const b = [...document.querySelectorAll(".app .btn")].find(x => x.firstElementChild?.matches("svg.ico") && x.textContent.trim()); return !b || getComputedStyle(b.firstElementChild).marginLeft === "-2px"; })()`));
ok("icons beside regular text 1.5px, on buttons 2px", await ev(`(() => { const b = document.querySelector(".app .btn>svg.ico"); return !b || getComputedStyle(b).strokeWidth === "2px"; })()`) && await ev(`(() => { const i = document.createElement("span"); i.innerHTML = icon("plus"); document.querySelector(".app .card").append(i); const w = getComputedStyle(i.firstElementChild).strokeWidth; i.remove(); return w === "1.5px"; })()`));
const io = await ev(`(() => { const i = document.createElement("img"); document.querySelector(".app .card").append(i); const s = getComputedStyle(i); const r = { w: s.outlineWidth, off: s.outlineOffset, c: s.outlineColor, scheme: document.documentElement.dataset.scheme }; i.remove(); return r; })()`);
ok("images get a neutral 1px inset outline (white in dark, black in light)", io.w === "1px" && io.off === "-1px" && io.c === (io.scheme === "light" ? "oklch(0 0 0 / 0.1)" : "oklch(1 0 0 / 0.1)"), JSON.stringify(io));

console.log("--- hit areas (40px with a mouse)");
for (const r of ROUTES) {
  await boot("#/" + r); await sleep(350);
  const small = await ev(`(() => { const MIN = 40; return ${SMALL}; })()`);
  ok(`${r}: every control at least 40px`, small.length === 0, JSON.stringify(small.slice(0, 6)));
}

console.log("--- motion");
await boot("#/home"); await sleep(300);
const press = await ev(`(() => { const sheets = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } });
  const last = sel => { let v = null; for (const r of sheets) if (r.selectorText && r.selectorText.includes(":active") && r.selectorText.includes(sel) && /scale\\(/.test(r.style.transform)) v = r.style.transform; return v; };
  return { btn: last(".btn"), chip: last(".chip"), card: last("a.card") }; })()`);
ok("buttons and chips press to exactly 0.96, cards to 0.98", press.btn === "scale(0.96)" && press.chip === "scale(0.96)" && press.card === "scale(0.98)", JSON.stringify(press));
ok("no permanent will-change on buttons and cards", await ev(`[".app .btn", ".app .mcard"].every(s => { const e = document.querySelector(s); return !e || getComputedStyle(e).willChange === "auto"; })`));
ok("no will-change on widget caustics", await ev(`getComputedStyle(document.querySelector(".app .mcard"), "::before").willChange === "auto"`));

console.log("--- phone (390px)");
await view(390, 844, true);
await boot("#/home"); await sleep(400);
ok("cards are 24px on phones (12px padding + 12px tiles)", await ev(`getComputedStyle(document.querySelector(".app .card")).borderTopLeftRadius === "24px"`));
ok("no horizontal scroll", await ev(`document.documentElement.scrollWidth <= innerWidth`));

ok("no uncaught page errors", errors.length === 0, JSON.stringify(errors));
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => p.kill());
process.exit(fail ? 1 : 0);
