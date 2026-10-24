import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/legal.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.9: the neutral age screen (birth month and year, nothing pre-selected, no age limit named, a 24-hour retry block, only the age kept)
// and the Terms and Privacy Policy agreement at sign-up (unticked box, underlined accent links, the version and time saved with the account and on the device).
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
}).listen(8780, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9343", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-legal-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9343/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8780/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const pick = (m, y) => ev(`(() => { const a = document.getElementById("ag-m"), b = document.getElementById("ag-y"); a.value = ${JSON.stringify(String(m))}; b.value = ${JSON.stringify(String(y))}; return true; })()`);
const submitGate = async () => { await ev(`document.querySelector('form[data-form="age-gate"]').requestSubmit(); true`); await sleep(350); };
const fresh = async () => { await ev(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`); await send("Page.reload"); await sleep(500); return waitFor(READY, 15000); };
const CY = await ev(`new Date().getFullYear()`);

console.log("--- 1. the age screen is neutral");
await fresh();
ok("a new visitor sees the welcome screen first", await ev(`!!document.querySelector('[data-act="ob-next"]') && !document.querySelector(".agate")`));
await click('[data-act="ob-next"]'); await sleep(300);
const g = await ev(`(() => { const m = document.getElementById("ag-m"), y = document.getElementById("ag-y"); const txt = [...document.querySelectorAll(".agate h1, .agate p, .agate label > :first-child, .agate .note")].map(e => e.textContent).join(" "); return { has: !!m && !!y, mv: m?.value, yv: y?.value, mFirst: m?.options[0].textContent, yFirst: y?.options[0].textContent, txt, years: y ? y.options.length : 0, newest: y?.options[1]?.textContent, heading: document.querySelector(".agate h1")?.textContent, profiles: S.profiles.length }; })()`);
ok("it asks for a birth month and a birth year", g.has && g.heading === "When were you born?", JSON.stringify(g));
ok("nothing is pre-selected (both start on a blank 'Month' and 'Year')", g.mv === "" && g.yv === "" && g.mFirst === "Month" && g.yFirst === "Year", JSON.stringify(g));
ok("the year list is not trimmed to adults (starts this year)", +g.newest === CY && g.years >= 100, `${g.newest} ${g.years}`);
ok("the screen never names an age limit", !/13|thirteen|under|older|years old|minimum|allowed|eligible/i.test(g.txt), g.txt);
ok("it says only the age is kept, not the birth date", /We keep your age, not your birth date/.test(g.txt), g.txt);
await submitGate();
ok("Continue with nothing chosen asks for a month and a year and goes no further", await ev(`document.querySelector(".agate .note")?.textContent === "Choose a month and a year." && !!document.getElementById("ag-m") && S.profiles.length === 0`));
await ev(`document.querySelector('[data-act="ag-back"]').click(); true`); await sleep(250);
ok("Back returns to the welcome screen", await ev(`!!document.querySelector('[data-act="ob-next"]') && !document.querySelector(".agate")`));

console.log("--- 2. someone under the line gets a plain screen, nothing is kept, and cannot retry");
await click('[data-act="ob-next"]'); await sleep(300);
await pick(12, CY - 12); await submitGate();
const b = await ev(`({ h: document.querySelector(".agate h1")?.textContent, txt: document.querySelector(".agate").textContent, until: +localStorage.getItem("wlh.ageblock"), form: !!document.getElementById("ag-m"), profiles: S.profiles.length, all: JSON.stringify([S.profiles, S.logs, UI.obDraft]) + Object.keys(localStorage).map(k => k + "=" + localStorage.getItem(k)).join("|") })`);
ok("they see 'We can't set up a profile on this device' with no reason given", b.h === "We can't set up a profile on this device" && !/13|under|age|old|child|young/i.test(b.txt.replace(/profile/gi, "")) && !b.form, JSON.stringify([b.h, b.txt]));
ok("the device remembers it for about 24 hours", b.until - Date.now() > 23.9 * 3600e3 && b.until - Date.now() <= 24 * 3600e3 + 5000, String(b.until - Date.now()));
ok("no profile, no age and no birth year are kept", b.profiles === 0 && !new RegExp(String(CY - 12)).test(b.all) && !/"age":1\d/.test(b.all.replace(/"age":null/g, "")), b.all.slice(0, 200));
await send("Page.reload"); await sleep(500); await waitFor(READY, 15000);
await click('[data-act="ob-next"]'); await sleep(300);
ok("after a reload, 'Set up my hub' shows the same screen and no form", await ev(`document.querySelector(".agate h1")?.textContent === "We can't set up a profile on this device" && !document.getElementById("ag-y")`));
await ev(`location.reload(); true`); await sleep(600); await waitFor(READY, 15000);
await click('[data-act="ob-skip"]'); await sleep(300);
ok("'Skip setup' cannot be used to get round it", await ev(`document.querySelector(".agate h1")?.textContent === "We can't set up a profile on this device" && S.profiles.length === 0`));
await ev(`localStorage.setItem("wlh.ageblock", String(Date.now() - 1000)); true`); await send("Page.reload"); await sleep(500); await waitFor(READY, 15000);
await click('[data-act="ob-next"]'); await sleep(300);
ok("once the 24 hours are over the age question comes back", await ev(`!!document.getElementById("ag-y") && !localStorage.getItem("wlh.ageblock") || +localStorage.getItem("wlh.ageblock") < Date.now()`));

console.log("--- 2b. a second open tab cannot get round the block");
await fresh(); await click('[data-act="ob-next"]'); await sleep(250);
await pick(6, CY - 30);   // an adult answer is chosen but not sent yet, as in a tab that was left open
await ev(`localStorage.setItem("wlh.ageblock", String(Date.now() + 3600e3)); true`); // another tab has just turned someone away
await submitGate();
ok("sending the adult answer now shows the plain screen and creates no profile", await ev(`document.querySelector(".agate h1")?.textContent === "We can't set up a profile on this device" && S.profiles.length === 0 && UI.obGateOk === false`));
await ev(`localStorage.removeItem("wlh.ageblock"); true`); await send("Page.reload"); await sleep(500); await waitFor(READY, 15000);
await click('[data-act="ob-skip"]'); await sleep(250); await pick(6, CY - 30);
await ev(`localStorage.setItem("wlh.ageblock", String(Date.now() + 3600e3)); true`); await submitGate();
ok("the same through 'Skip setup': no profile while the block is on", await ev(`S.profiles.length === 0 && !!document.querySelector(".agate") && document.querySelector(".agate h1")?.textContent === "We can't set up a profile on this device"`));
await ev(`localStorage.removeItem("wlh.ageblock"); true`); await send("Page.reload"); await sleep(500); await waitFor(READY, 15000);
await click('[data-act="ob-next"]'); await sleep(250); await pick(6, CY - 30); await submitGate(); // reaches step 1 with the gate passed
await ev(`localStorage.setItem("wlh.ageblock", String(Date.now() + 3600e3)); UI.obStep = 4; UI.obChoice = "fresh"; render(); true`); await sleep(300);
await click('[data-act="ob-finish"]'); await sleep(500);
ok("a block that starts after the question was answered still stops the profile being created", await ev(`S.profiles.length === 0 && document.querySelector(".agate h1")?.textContent === "We can't set up a profile on this device"`));
await ev(`localStorage.removeItem("wlh.ageblock"); true`);

console.log("--- 3. the line itself, and what is kept for an adult");
const edge = async (m, y) => { await pick(m, y); await submitGate(); return ev(`({ blocked: document.querySelector(".agate h1")?.textContent === "We can't set up a profile on this device", step: UI.obStep, auth: !!UI.obAuth, age: UI.obDraft?.age ?? null })`); };
await fresh(); await click('[data-act="ob-next"]'); await sleep(250);
const cm = await ev(`new Date().getMonth() + 1`);
const e13 = await ev(`(() => ({ month: ${cm}, y: ${CY - 13}, age: ageFromMonthYear(${cm}, ${CY - 13}), prev: ageFromMonthYear(${cm === 1 ? 12 : cm - 1}, ${cm === 1 ? CY - 14 : CY - 13}) }))()`);
ok("birth month the same as this month, 13 years ago, is treated as not yet 13 (the day is not asked)", e13.age === 12, JSON.stringify(e13));
ok("a month earlier it is 13", e13.prev === 13, JSON.stringify(e13));
let r = await edge(cm, CY - 13); ok("exactly this month 13 years ago: blocked", r.blocked, JSON.stringify(r));
await ev(`localStorage.removeItem("wlh.ageblock"); true`); await send("Page.reload"); await sleep(500); await waitFor(READY, 15000); await click('[data-act="ob-next"]'); await sleep(250);
r = await edge(cm === 1 ? 12 : cm - 1, cm === 1 ? CY - 14 : CY - 13); ok("the month before: let through past the age question with age 13", !r.blocked && (r.step === 1 || r.auth) && r.age === 13, JSON.stringify(r));
await fresh(); await click('[data-act="ob-next"]'); await sleep(250);
r = await edge(1, CY - 30); const exp = await ev(`ageFromMonthYear(1, ${CY - 30})`);
ok("an adult goes on past the age question with only the age as a number", !r.blocked && (r.step === 1 || r.auth) && r.age === exp, JSON.stringify(r));
ok("the draft holds an age and no birth month or year", await ev(`!/birth|born|dob/i.test(Object.keys(UI.obDraft).join(","))`));
await ev(`(() => { UI.obDraft.name = "Ada"; UI.obStep = 3; render(); return true; })()`); await sleep(300);
ok("step 3 no longer has an Age box", await ev(`!document.getElementById("ob-age")`));
await ev(`(() => { UI.obStep = 4; render(); return true; })()`); await sleep(300);
ok("step 4 no longer has an 'I confirm I'm 13' box and can finish once a start is chosen", await ev(`!document.getElementById("ob-age-confirm") && !/confirm I'm 13/i.test(document.body.innerText)`));
await click('[data-act="ob-choice"][data-v="fresh"]'); await sleep(200); await click('[data-act="ob-finish"]'); await sleep(1600);
ok("the profile is created with that age", await ev(`S.profiles.length === 1 && S.profiles[0].age === ${exp} && S.profiles[0].onboarded === true`), await ev(`JSON.stringify(S.profiles.map(p => p.age))`));
ok("no birth date field was saved anywhere", await ev(`!/birth|born|dob/i.test(Object.keys(S.profiles[0]).join(",")) && !/birth|born|dob/i.test(Object.keys(localStorage).join(","))`));
await fresh(); await click('[data-act="ob-skip"]'); await sleep(300);
ok("'Skip setup and start empty' asks the age question first", await ev(`!!document.getElementById("ag-y") && S.profiles.length === 0`));
await pick(6, CY - 40); await submitGate(); await sleep(1600);
ok("after a good answer, skipping creates a profile with that age", await ev(`S.profiles.length === 1 && S.profiles[0].age >= 39 && S.profiles[0].age <= 40`), await ev(`JSON.stringify(S.profiles.map(p => p.age))`));
await ev(`(() => { const p = P(); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed" }); saveProfile(); return true; })()`);
await ev(`(() => { const q = P(); S.activeId = q.id; return true; })()`);
await ev(`location.hash = "#/settings/household"; true`); await sleep(500);
await click('[data-act="new-profile"]'); await sleep(400);
ok("'Add a profile' (Household) opens the welcome screen", await ev(`!!document.querySelector('[data-act="ob-next"]') && !document.querySelector(".agate")`));
await click('[data-act="ob-next"]'); await sleep(300);
ok("adding another profile asks the age question again", await ev(`!!document.getElementById("ag-y")`));

console.log("--- 4. agreeing to the Terms and Privacy Policy at sign-up");
await fresh();
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", age: 30 }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); location.hash = "#/settings/profile"; render(); return true; })()`); await sleep(500);
await click('[data-act="sb-open"][data-v="in"]'); await sleep(400); await click('#pop-auth [data-act="sb-mode"][data-v="up"]'); await sleep(250);
const ag = await ev(`(() => { const c = document.getElementById("sb-agree"), l = c?.closest("label"); const links = [...(l?.querySelectorAll("a") || [])]; const cs = links.map(a => getComputedStyle(a)); const acc = (() => { const t = document.createElement("i"); t.style.color = "var(--accent)"; document.body.append(t); const v = getComputedStyle(t).color; t.remove(); return v; })();
  return { has: !!c, checked: c?.checked, text: l?.textContent.trim(), hrefs: links.map(a => a.getAttribute("href")), blank: links.every(a => a.target === "_blank" && /noopener/.test(a.rel)), underlined: cs.every(x => x.textDecorationLine === "underline"), accent: cs.every(x => x.color === acc), h: l ? l.getBoundingClientRect().height : 0, box: c ? c.getBoundingClientRect().width : 0 }; })()`);
ok("Create account has an agree box that starts unticked", ag.has && ag.checked === false, JSON.stringify(ag));
ok("it reads 'I agree to the Terms and the Privacy Policy.'", ag.text === "I agree to the Terms and the Privacy Policy.", ag.text);
ok("the two links go to the Terms and the Privacy Policy, open in a new tab, are accent blue and underlined", JSON.stringify(ag.hrefs) === '["#/terms","#/privacy-policy"]' && ag.blank && ag.underlined && ag.accent, JSON.stringify(ag));
ok("the box and its row are easy to tap (22px box, 44px row)", ag.box >= 21.9 && ag.h >= 43.9, `${ag.box} ${ag.h}`);
await ev(`(() => { document.getElementById("sb-email").value = "ada@example.com"; document.getElementById("sb-pass").value = "longenough1"; document.querySelector('form[data-form="sb-auth"]').requestSubmit(); return true; })()`); await sleep(400);
const noTick = await ev(`({ msg: document.querySelector("#pop-auth .note")?.textContent, calls: (window.__signUps || []).length })`);
ok("submitting without the tick shows a message and creates nothing", noTick.msg === "Tick the box to agree to the Terms and the Privacy Policy." && noTick.calls === 0, JSON.stringify(noTick));
ok("the email stays filled in after that message", await ev(`document.getElementById("sb-email").value === "ada@example.com"`));
await ev(`(() => { const c = document.getElementById("sb-agree"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); document.getElementById("sb-pass").value = "longenough1"; document.querySelector('form[data-form="sb-auth"]').requestSubmit(); return true; })()`); await sleep(500);
const su = await ev(`({ calls: window.__signUps || [], saved: localStorage.getItem("wlh.consent"), tv: TERMS_VERSION, now: Date.now() })`);
const d0 = su.calls[0]?.options?.data;
ok("sign-up is sent once with the terms version and the time of agreement", su.calls.length === 1 && d0?.terms_version === su.tv && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(d0?.terms_accepted_at || "") && Math.abs(Date.parse(d0.terms_accepted_at) - su.now) < 60000, JSON.stringify(su.calls));
ok("the version is the date the legal pages were last updated", await ev(`TERMS_VERSION === "2026-10-24" && LEGAL_UPDATED === "24 October 2026"`));
ok("the same version and time are saved on this device", (() => { try { const c = JSON.parse(su.saved); return c.v === su.tv && c.at === d0.terms_accepted_at; } catch { return false; } })(), su.saved);
ok("sign-up adds a 'terms' entry to the on-device history", await ev(`historyGet().some(x => x.k === "terms")`));
ok("the confirmation message about the email link still shows", await ev(`/Check your email/.test(document.getElementById("pop-auth")?.textContent || "")`));
await ev(`(() => { document.querySelector('#pop-auth [data-act="sb-mode"][data-v="in"]')?.click(); return true; })()`); await sleep(300);
ok("Sign in has no agree box", await ev(`!document.getElementById("sb-agree")`));
await ev(`document.querySelector('#pop-auth [data-act="sb-mode"][data-v="up"]')?.click(); true`); await sleep(300);
ok("coming back to Create account starts unticked again", await ev(`document.getElementById("sb-agree")?.checked === false`));
await ev(`(() => { const c = document.getElementById("sb-agree"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
await ev(`document.querySelector('#pop-auth [data-act="sb-mode"][data-v="in"]')?.click(); true`); await sleep(250);
await ev(`document.querySelector('#pop-auth [data-act="sb-mode"][data-v="up"]')?.click(); true`); await sleep(250);
ok("ticking, switching to Sign in and back to Create account asks again (unticked)", await ev(`document.getElementById("sb-agree")?.checked === false`));
await ev(`(() => { const c = document.getElementById("sb-agree"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); document.querySelector('#pop-auth [data-pop="close"]').click(); return true; })()`); await sleep(400);
await click('[data-act="sb-open"][data-v="in"]'); await sleep(400); await click('#pop-auth [data-act="sb-mode"][data-v="up"]'); await sleep(250);
ok("ticking, closing the popup and opening Create account again asks again (unticked)", await ev(`document.getElementById("sb-agree")?.checked === false`));
ok("a failed submit keeps the tick for a retry in the same form", await (async () => { await ev(`(() => { const c = document.getElementById("sb-agree"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); document.getElementById("sb-email").value = "bad"; document.getElementById("sb-pass").value = "x"; document.querySelector('form[data-form="sb-auth"]').requestSubmit(); return true; })()`); await sleep(400); return ev(`document.getElementById("sb-agree")?.checked === true && !!document.querySelector("#pop-auth .note")`); })());
console.log("--- 4b. long legal sections fold behind Read more");
// The auth popup from the checks above is still open; close it so the page behind is what a person would see.
await ev(`closePopover("auth"); true`); await sleep(400);
await ev(`location.hash = "#/terms"; true`); await sleep(500);
ok("no other popup is open", await ev(`!document.querySelector(".pop-wrap")`));
ok("Terms keeps its headings and shows a Read more button for each long section", await ev(`document.querySelectorAll(".legal h3").length >= 8 && document.querySelectorAll(".legal .legal-more").length >= 5`));
ok("the folded text is not on the page until Read more is pressed", await ev(`!document.querySelector(".legal").textContent.includes("Because a passcode encrypts")`));
// Real mouse and keyboard input through the browser, not element.click(), so this is the path a person takes.
const centre = await ev(`(() => { const b = [...document.querySelectorAll(".legal-more")].find(b => b.previousElementSibling.previousElementSibling.textContent === "Your responsibilities"); b.setAttribute("data-t", "1"); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); await sleep(300);
const centre2 = await ev(`(() => { const r = document.querySelector("[data-t]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: centre2.x, y: centre2.y, button: "left", clickCount: 1 }); await sleep(600);
ok("Read more opens the full section in a popup with a close button", await ev(`/Because a passcode encrypts/.test(document.querySelector("#pop-legal")?.textContent || "") && !!document.querySelector("#pop-legal [data-pop='close']")`));
for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(600);
ok("Escape closes it", await ev(`!document.querySelector("#pop-legal")`));
ok("focus returns to the Read more button", await ev(`document.activeElement === document.querySelector("[data-t]")`));
ok("Not medical advice stays a red italic note", await ev(`(() => { const n = document.querySelector(".legal .note.legal-red"); if (!n) return false; const c = getComputedStyle(n); return c.fontStyle === "italic" && c.color !== getComputedStyle(document.body).color; })()`));

console.log("--- 5. the policy text matches what the app does");
await ev(`location.hash = "#/privacy-policy"; true`); await sleep(500);
// Long sections are folded behind "Read more" (8.2.25), so the policy text is the page plus every folded section.
const pol = await ev(`(document.querySelector("#sec-privacy-policy, .legal")?.textContent || document.body.textContent) + " " + [...LEGAL_FOLD.values()].map(e => { const d = document.createElement("div"); d.innerHTML = e.html; return d.textContent; }).join(" ")`);
ok("the Privacy Policy describes the birth month and year, that only the age is kept, and the 24-hour retry block", /birth month and year/.test(pol) && /never your birth date/.test(pol) && /24 hours/.test(pol) && !/13-and-over confirmation/.test(pol), pol.slice(pol.indexOf("Children") - 10, pol.indexOf("Children") + 450));

console.log("--- 6. the refunds page states the whole policy");
await ev(`location.hash = "#/refunds"; true`); await sleep(500);
const rf = await ev(`(() => { const live = document.querySelector(".legal")?.textContent || "";
  const folded = [...LEGAL_FOLD.values()].map(e => { const d = document.createElement("div"); d.innerHTML = e.html; return d.textContent; }).join(" ");
  return { live, all: live + " " + folded, more: document.querySelectorAll(".legal .legal-more").length }; })()`);
ok("refunds promises a full refund within 14 days of any charge", /14 days/.test(rf.live) && /full/i.test(rf.live) && /charge/i.test(rf.live), rf.live.slice(0, 300));
ok("the 14 days apply to renewals too, not just the first charge", /renewal/.test(rf.all));
ok("refunds says there is no pro-rata refund after the 14 days", /unused part|not refundable/.test(rf.all));
ok("refunds names Lemon Squeezy and the 5 to 10 day bank window", /Lemon Squeezy/.test(rf.all) && /10 days/.test(rf.all));
ok("cancelling is described separately from refunding", /separate/.test(rf.all));
ok("the charges that are always refunded are listed", /duplicate|twice/.test(rf.all) && /did not authorise|without your permission/.test(rf.all));
ok("statutory rights are preserved", /law gives you|law wins/.test(rf.all));
ok("a refund is stated to delete nothing", /Nothing is deleted|never deletes/.test(rf.all));
ok("the long sections fold behind Read more", rf.more >= 6, String(rf.more));
ok("the short version stays visible without a tap", /1\. The short version/.test(rf.live) && /Every payment for Premium has 14 days/.test(rf.live));
ok("the one-paragraph policy states the same 14-day promise", await ev(`/14 days/.test(REFUND_POLICY_TEXT) && /full/.test(REFUND_POLICY_TEXT) && /renewal/.test(REFUND_POLICY_TEXT) && /unused part/.test(REFUND_POLICY_TEXT)`));
ok("no placeholder text is left on the page, and the contact details are shown", !/\[YOUR|\[REFUND/.test(rf.all) && /wholelifehub@hotmail\.com/.test(rf.all) && /13022 Thunderhead Drive, Germantown, MD 20874/.test(rf.all));

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
