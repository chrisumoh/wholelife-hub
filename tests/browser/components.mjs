import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run from the repo root:  node tests/browser/components.mjs   (needs Node 22+, Python 3 and Chrome)
// Checks the 8.1.17 components: labelled fields, the tour offer and tour card, warning cards,
// breadcrumb, link buttons, the date picker and the dropdowns, at 1440px and 375px, light and dark.
// Set SHOTS=<dir> to also save screenshots. The supabase-js CDN script is
// replaced with fake-supabase.js, so no real account is touched.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOTS = process.env.SHOTS || "";
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
procs.push(spawn("python", ["-m", "http.server", "8768", "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" }));
procs.push(spawn(CHROME, ["--headless=new", "--remote-debugging-port=9336", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-cmp-"))}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" }));
await sleep(2500);
const list = await (await fetch("http://127.0.0.1:9336/json/list")).json();
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
const boot = async (hash = "") => { await send("Page.navigate", { url: "http://127.0.0.1:8768/index.html" + hash }); await sleep(500); return waitFor(ready, 15000); };


const NAME = "<img src=x onerror=alert(1)>";
const click = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const focusEl = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e?.focus(); return document.activeElement === e; })()`);
await size(1440, 900);
ok("boot", await boot(), JSON.stringify(errors));
await ev(`(async () => {
  const a = newProfile("Chris"); a.onboarded = true; a.coachPrompted = true; a.tourSeen = "";
  const b = newProfile(${JSON.stringify(NAME)}); b.onboarded = true; b.coachPrompted = true; b.tourSeen = "done";
  S.profiles.push(a, b); S.activeId = a.id; markAll(); await flush(); })()`);

console.log("--- tour offer (Announcement)");
ok("boot on Summary", await boot("#/home"));
ok("offer appears", await waitFor(`!!document.querySelector(".tour-offer.ann")`, 5000));
const offer = await ev(`(() => { const o = document.querySelector(".tour-offer"); return { role: o.getAttribute("role"), ic: !!o.querySelector(".ann-ic svg"), t: o.querySelector(".ann-t")?.textContent, d: !!o.querySelector(".ann-d"),
  x: o.querySelector(".ann-x")?.getAttribute("aria-label"), act: o.querySelector(".ann-act")?.textContent.trim(), actW: Math.round(o.querySelector(".ann-act").getBoundingClientRect().width), w: Math.round(o.getBoundingClientRect().width),
  xs: Math.round(o.querySelector(".ann-x").getBoundingClientRect().width) }; })()`);
ok("icon, title, description, close and one action", offer.role === "dialog" && offer.ic && offer.t === "New to Whole Life Hub?" && offer.d && offer.x === "Not now" && offer.act === "Take the tour", JSON.stringify(offer));
ok("action is full width, close is 44px", offer.w - offer.actW <= 34 && offer.xs >= 44, JSON.stringify(offer));
await shot("offer-1440");
await click(".tour-offer .ann-x"); await sleep(400);
ok("close = Not now: offer gone and saved as dismissed", await ev(`!document.querySelector(".tour-offer") && P().tourSeen === "dismissed"`));

console.log("--- tour card");
await ev(`tourStart("quick")`); await sleep(1500);
const card = await ev(`(() => { const c = document.querySelector(".tour-card"); return { ann: c.classList.contains("ann"), x: c.querySelector(".ann-x")?.getAttribute("aria-label"), dots: c.querySelectorAll(".tour-dots i").length, on: [...c.querySelectorAll(".tour-dots i")].findIndex(i => i.classList.contains("on")), next: !!c.querySelector('[data-act="tour-next"]'), back: !!c.querySelector('[data-act="tour-back"]') }; })()`);
ok("card has close (Skip tour), 6 dots on the first, Next and no Back", card.ann && card.x === "Skip tour" && card.dots === 6 && card.on === 0 && card.next && !card.back, JSON.stringify(card));
await shot("tour-1440");
await click('.tour-card [data-act="tour-next"]'); await sleep(1500);
ok("Next moves to step 2 and shows Back", await ev(`TOUR.i === 1 && !!document.querySelector('.tour-card [data-act="tour-back"]') && document.querySelectorAll(".tour-dots i.done").length === 1`));
await key("Escape"); await sleep(300);
ok("Escape ends the tour", await ev(`!TOUR.on && !document.querySelector(".tour")`));
await ev(`tourStart("settings")`); await sleep(1500); await click('.tour-card [data-act="tour-next"]'); await sleep(1500);
ok("last step: close says Close tour", await ev(`document.querySelector(".tour-card .ann-x")?.getAttribute("aria-label") === "Close tour"`));
await click(".tour-card .ann-x"); await sleep(300);
ok("closing the last step ends the tour", await ev(`!TOUR.on`));
await ev(`location.hash = "#/home"`); await sleep(400);

console.log("--- fields (Input)");
ok("settings", await boot("#/settings/profile"));
const f = await ev(`(() => { const e = document.getElementById("sb-email"), p = document.getElementById("sb-pass");
  return { el: document.querySelector('label[for="sb-email"]')?.textContent, pl: document.querySelector('label[for="sb-pass"]')?.textContent, req: e.required && p.required, lead: !!e.parentElement.querySelector(".fx-lead") && !!p.parentElement.querySelector(".fx-lead"),
    eye: p.parentElement.querySelector(".fx-eye")?.getAttribute("aria-label"), h: Math.round(e.getBoundingClientRect().height), r: getComputedStyle(e).borderTopLeftRadius, pad: parseFloat(getComputedStyle(e).paddingLeft),
    star: getComputedStyle(document.querySelector('label[for="sb-email"] .fx-req')).color }; })()`);
ok("labels with a required mark", f.el === "Email*" && f.pl === "Password*" && f.req, JSON.stringify(f));
ok("leading icons and a show-password button", f.lead && f.eye === "Show password", JSON.stringify(f));
ok("44px tall, 12px radius, text clear of the icon", f.h >= 44 && f.r === "12px" && f.pad >= 38, JSON.stringify(f));
await ev(`document.getElementById("sb-pass").value = "secret12"; true`);
await click('[data-fx-eye="sb-pass"]');
ok("show password: text, pressed, label Hide", await ev(`document.getElementById("sb-pass").type === "text" && document.querySelector("[data-fx-eye]").getAttribute("aria-pressed") === "true" && document.querySelector("[data-fx-eye]").getAttribute("aria-label") === "Hide password" && document.getElementById("sb-pass").value === "secret12"`));
await click('[data-fx-eye="sb-pass"]');
ok("hide again", await ev(`document.getElementById("sb-pass").type === "password"`));
await focusEl("#sb-email"); await sleep(250);
const ring = await ev(`getComputedStyle(document.getElementById("sb-email")).boxShadow`);
ok("focus ring shows", /4px/.test(ring) && ring !== "none", ring);
await ev(`document.getElementById("sb-email").value = "not-an-email"; document.querySelector('#sb-account button[type=submit]').click(); true`); await sleep(400);
ok("bad email: field invalid and the message shows", await ev(`document.getElementById("sb-email").getAttribute("aria-invalid") === "true" && /valid email/.test(document.getElementById("sb-account").textContent)`));
ok("invalid border is the bad colour", await ev(`(() => { const d = document.createElement("i"); d.style.color = "var(--bad)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return getComputedStyle(document.getElementById("sb-email")).borderTopColor === c; })()`));
await click('[data-act="sb-mode"][data-v="up"]'); await sleep(300);
ok("create account: hint under the password, linked by aria-describedby", await ev(`(() => { const p = document.getElementById("sb-pass"); const h = document.getElementById(p.getAttribute("aria-describedby")); return !!h && /8 characters/.test(h.textContent); })()`));
await shot("fields-1440");
ok("privacy page", await boot("#/settings/privacy"));
ok("passcode fields fit their columns", await ev(`["sp1","sp2"].every(id => { const i = document.getElementById(id), b = i.closest(".fx").getBoundingClientRect(), r = i.getBoundingClientRect(); return r.right <= b.right + 1 && r.width > 100; })`));
ok("coach question box uses the field style", await boot("#/coach") && await ev(`getComputedStyle(document.getElementById("coach-q")).borderTopLeftRadius === "12px"`));
ok("meal name box uses the field style", await boot("#/nutrition") && await ev(`(() => { const s = getComputedStyle(document.getElementById("m-name")); return s.borderTopLeftRadius === "12px" && s.borderTopStyle === "solid"; })()`));

console.log("--- date picker");
await ev(`document.getElementById("m-date").scrollIntoView({ block: "center" }); true`);
const before = await ev(`document.getElementById("m-date").value`);
await click('[data-dp="m-date"]'); await sleep(400);
const dp = await ev(`(() => { const p = document.querySelector(".dp-pop"); return { open: !!p && p.getAttribute("role") === "dialog", exp: document.querySelector('[data-dp="m-date"]').getAttribute("aria-expanded"),
  focus: document.activeElement?.dataset.dpDay, picks: [...p.querySelectorAll(".dp-pick")].map(b => b.textContent), future: [...p.querySelectorAll(".dp-day")].filter(b => b.dataset.dpDay > today()).every(b => b.disabled),
  next: p.querySelector('[data-dp-mon="1"]').disabled, apply: !p.querySelector("[data-dp-apply]").disabled }; })()`);
ok("opens as a dialog, focus on the field's date", dp.open && dp.exp === "true" && dp.focus === before, JSON.stringify(dp));
ok("quick picks, future days and next month disabled (max is today)", dp.picks.join() === "Today,Yesterday,2 days ago,A week ago" && dp.future && dp.next, JSON.stringify(dp));
await shot("datepicker-1440");
await key("ArrowLeft"); await sleep(100);
ok("ArrowLeft moves one day", await ev(`document.activeElement?.dataset.dpDay === addDays(${JSON.stringify(before)}, -1)`));
await key("ArrowUp"); await sleep(100);
ok("ArrowUp moves a week", await ev(`document.activeElement?.dataset.dpDay === addDays(${JSON.stringify(before)}, -8)`));
await key("Enter"); await sleep(150);
ok("Enter picks it but the field is unchanged until Apply", await ev(`DP.sel === addDays(${JSON.stringify(before)}, -8) && document.getElementById("m-date").value === ${JSON.stringify(before)}`));
await key("Escape"); await sleep(250);
ok("Escape cancels: popup gone, value kept, focus back on the button", await ev(`!document.querySelector(".dp-pop") && document.getElementById("m-date").value === ${JSON.stringify(before)} && document.activeElement?.dataset.dp === "m-date"`));
await click('[data-dp="m-date"]'); await sleep(300);
await click('[data-dp-pick]:nth-child(2)'); await sleep(100); await click("[data-dp-apply]"); await sleep(500);
ok("Yesterday + Apply sets the date and fires change (page follows it)", await ev(`document.getElementById("m-date").value === addDays(today(), -1) && UI.navDate === addDays(today(), -1)`));
await click('[data-dp="m-date"]'); await sleep(300); await ev(`document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })); true`); await sleep(250);
ok("click outside closes", await ev(`!document.querySelector(".dp-pop")`));
ok("every date field has a calendar button", await ev(`[...document.querySelectorAll('input[type=date]')].every(i => i.nextElementSibling?.dataset.dp === i.id)`));

console.log("--- dropdowns");
const dd = await ev(`[...document.querySelectorAll("select[data-dd]")].map(s => ({ id: s.id, txt: s.nextElementSibling?.querySelector(".dd-v")?.textContent, opt: s.selectedOptions[0]?.text, tab: s.tabIndex, hid: s.getAttribute("aria-hidden"), lab: s.nextElementSibling?.getAttribute("aria-label") }))`);
ok("each dropdown button shows its select's option", dd.length >= 3 && dd.every(x => x.txt === x.opt && x.tab === -1 && x.hid === "true"), JSON.stringify(dd));
ok("button names say field and value", dd.every(x => x.lab && x.lab.includes(x.opt)), JSON.stringify(dd));
await click("#m-slot + .dd-trig"); await sleep(300);
const pop = await ev(`(() => { const p = document.querySelector(".dd-pop"); return { role: p?.getAttribute("role"), n: p?.querySelectorAll('[role=option]').length, sel: p?.querySelector('[aria-selected=true]')?.textContent, exp: document.querySelector("#m-slot + .dd-trig").getAttribute("aria-expanded"), r: p && getComputedStyle(p).borderTopLeftRadius }; })()`);
ok("opens a listbox with the current option selected", pop.role === "listbox" && pop.n === 3 && pop.sel === await ev(`document.getElementById("m-slot").selectedOptions[0].text`) && pop.exp === "true" && pop.r === "16px", JSON.stringify(pop));
await shot("dropdown-1440");
const start = await ev(`document.getElementById("m-slot").selectedIndex`);
await key(start === 0 ? "ArrowDown" : "ArrowUp"); await key("Enter"); await sleep(300);
ok("arrow + Enter changes the select and closes", await ev(`document.getElementById("m-slot").selectedIndex !== ${start} && !document.querySelector(".dd-pop") && document.activeElement?.classList.contains("dd-trig")`));
ok("button text follows", await ev(`document.querySelector("#m-slot + .dd-trig .dd-v").textContent === document.getElementById("m-slot").selectedOptions[0].text`));
ok("recipes", await boot("#/recipes"));
await click("#rf-r + .dd-trig"); await sleep(300);
await ev(`document.querySelector('.dd-pop [data-dd-i="1"]').click(); true`); await sleep(400);
ok("picking a region filters recipes (change handler ran)", await ev(`UI.recFilter.r !== "" && document.getElementById("rf-r").value === UI.recFilter.r`));
await click("#rf-r + .dd-trig"); await sleep(300); await key("Escape"); await sleep(250);
ok("Escape closes and returns focus", await ev(`!document.querySelector(".dd-pop") && document.activeElement === document.querySelector("#rf-r + .dd-trig")`));
await focusEl("#rf-s + .dd-trig"); await key("ArrowDown"); await sleep(300);
ok("ArrowDown on the button opens it", await ev(`!!document.querySelector(".dd-pop")`));
await key("Escape"); await sleep(200);

console.log("--- link buttons");
ok("a recipe page", await boot("#/recipes/" + await ev(`DISHES[0].id`)));
ok("recipe: web links are link buttons opening a new tab", await ev(`(() => { const a = [...document.querySelectorAll(".links a.lbtn")]; return a.length >= 3 && a.every(x => x.target === "_blank" && x.rel.includes("noopener") && x.querySelector(".sr-only")); })()`));
ok("summary", await boot("#/home"));
ok("Edit widgets is a link button, Build a plan a link", await ev(`document.querySelector('button.lbtn[data-act="edit-pins"]') && !!document.querySelector('a.lbtn[href="#/recipes"]')`));
const lb = await ev(`(() => { const b = document.querySelector('button.lbtn[data-act="edit-pins"]'), cs = getComputedStyle(b); return { bg: cs.backgroundColor, border: cs.borderTopWidth, color: cs.color }; })()`);
ok("no fill, no border", (lb.bg === "rgba(0, 0, 0, 0)" || lb.bg === "transparent") && lb.border === "0px", JSON.stringify(lb));

console.log("--- breadcrumb");
ok("settings tab", await boot("#/settings/profile"));
const bc = await ev(`(() => { const n = document.querySelector(".ph-text .crumbs"); return { label: n.getAttribute("aria-label"), items: [...n.querySelectorAll(".crumb")].map(c => [c.tagName, c.textContent.trim(), !!c.querySelector("svg"), c.getAttribute("aria-current")]), seps: [...n.querySelectorAll(".crumb-sep")].every(s => s.getAttribute("aria-hidden") === "true") }; })()`);
ok("Home and Settings are links with icons, the page is plain text", JSON.stringify(bc.items) === JSON.stringify([["A","Home",true,null],["A","Settings",true,null],["SPAN","Profile",false,"page"]]) && bc.label === "Breadcrumb" && bc.seps, JSON.stringify(bc));

console.log("--- warning cards");
ok("household", await boot("#/settings/household"));
await ev(`document.querySelectorAll('[data-act="del-profile"]')[1].click(); true`); await sleep(400);
const w = await ev(`(() => { const a = document.querySelector(".ann-bad"); return { role: a?.getAttribute("role"), t: a?.querySelector(".ann-t")?.textContent, btns: [...a.querySelectorAll(".ann-acts button")].map(b => b.textContent), x: a.querySelector(".ann-x")?.getAttribute("aria-label"), img: !!a.querySelector("img") }; })()`);
ok("delete warning: alert card, name shown as text, Keep and Delete", w.role === "alert" && w.t === `Delete ${NAME}?` && !w.img && w.btns.join() === "Keep,Delete" && w.x === "Keep", JSON.stringify(w));
await shot("warning-1440");
await click(".ann-bad .ann-x"); await sleep(300);
ok("close keeps the profile", await ev(`!document.querySelector(".ann-bad") && S.profiles.length === 2`));
ok("privacy", await boot("#/settings/privacy"));
await click('[data-act="erase-all-ask"]'); await sleep(300);
ok("delete-everything warning has Cancel and Confirm delete", await ev(`(() => { const a = document.querySelector(".ann-bad"); return !!a && [...a.querySelectorAll(".ann-acts button")].map(b => b.textContent).join() === "Cancel,Confirm delete" && !!a.querySelector('a[href="#/refunds"]'); })()`));
await click('.ann-bad [data-act="erase-all-no"]'); await sleep(300);
ok("Cancel keeps everything", await ev(`!document.querySelector(".ann-bad") && S.profiles.length === 2`));
ok("notes keep their text with an icon", await ev(`(() => { const n = document.querySelector(".note"); if (!n) return true; return getComputedStyle(n, "::before").content !== "none"; })()`));

console.log("--- phone (375px) and dark");
await size(375, 812);
ok("nutrition at 375px", await boot("#/nutrition"));
await ev(`document.getElementById("m-date").scrollIntoView({ block: "center" }); true`);
await click('[data-dp="m-date"]'); await sleep(400);
const sheet = await ev(`(() => { const r = document.querySelector(".dp-pop").getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(innerWidth - r.right), b: Math.round(innerHeight - r.bottom), over: document.documentElement.scrollWidth > innerWidth, day: Math.round(document.querySelector(".dp-day").getBoundingClientRect().height) }; })()`);
ok("date picker is a bottom sheet with 44px days", sheet.l === 8 && sheet.r === 8 && sheet.b >= 8 && sheet.b <= 50 && !sheet.over && sheet.day >= 44, JSON.stringify(sheet));
await shot("datepicker-375");
await key("Escape"); await sleep(200);
await ev(`document.getElementById("m-portion").scrollIntoView({ block: "center" }); true`);
await click("#m-portion + .dd-trig"); await sleep(300);
ok("dropdown fits the screen", await ev(`(() => { const r = document.querySelector(".dd-pop").getBoundingClientRect(); return r.left >= 8 && r.right <= innerWidth - 8 && document.querySelectorAll(".dd-item")[0].getBoundingClientRect().height >= 40; })()`));
await key("Escape");
ok("settings at 375px", await boot("#/settings/profile"));
ok("breadcrumb stays on one line", await ev(`(() => { const c = [...document.querySelectorAll(".ph-text .crumbs > *")].map(x => { const r = x.getBoundingClientRect(); return (r.top + r.bottom) / 2; }); return Math.max(...c) - Math.min(...c) < 4; })()`));
await ev(`(() => { const p = P(); p.look = { ...(p.look || {}), mode: "dark" }; saveProfile(); applyLook(p); render(); })()`); await sleep(400);
const dk = await ev(`(() => { const e = document.getElementById("sb-email"), cs = getComputedStyle(e); return { bg: cs.backgroundColor, color: cs.color, line: cs.borderTopColor }; })()`);
ok("dark: field is dark with light text", /^rgb\((\d+), (\d+), (\d+)\)$/.test(dk.bg) && dk.bg.match(/\d+/g).slice(0, 3).every(n => +n < 80) && dk.color.match(/\d+/g).slice(0, 3).every(n => +n > 200), JSON.stringify(dk));
await shot("fields-375-dark");
await ev(`(() => { const p = P(); p.look = { ...(p.look || {}), mode: "light" }; saveProfile(); applyLook(p); render(); })()`);

ok("no uncaught page errors", errors.length === 0, JSON.stringify(errors));
ok("no alert() ran", dialogs.length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
procs.forEach(p => p.kill());
process.exit(fail ? 1 : 0);
