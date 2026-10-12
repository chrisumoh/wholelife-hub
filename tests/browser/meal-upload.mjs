import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run from the repo root:  node tests/browser/meal-upload.mjs   (needs Node 22+, Python 3, Chrome and internet for the CDN)
// This one runs the REAL supabase-js (the same pinned file index.html loads). Only the network is faked:
// every request to the Supabase project is caught in Chrome and answered the way PostgREST/GoTrue would,
// and the test asserts on the HTTP requests the app actually makes. No real account is touched.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const NO_SANDBOX = process.env.CI || process.env.NO_SANDBOX ? ["--no-sandbox"] : [];   // CI runners run Chrome as root
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
procs.push(spawn(PYTHON, ["-m", "http.server", "8767", "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" }));
procs.push(spawn(CHROME, ["--headless=new", "--remote-debugging-port=9335", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-up-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }));
// Wait for Chrome's debugging port instead of a fixed sleep: a cold start on a CI runner can take several seconds.
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9335/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
if (!list) { console.log("FAIL  Chrome did not start (set CHROME to its path)"); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(1); }
// Never leave Chrome or the server running if the test throws: a leftover Chrome on the same port would poison the next test.
process.on("exit", () => procs.forEach(p => { try { p.kill(); } catch {} }));
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === "Fetch.requestPaused") onPaused(d.params);
  else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval failed: " + expr); return r.result.result.value; };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(150); } return false; };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };

// ---- a small PostgREST + GoTrue stand-in, reached through Chrome's request interception ----
const SUPA = "https://zemxqbinpehkrkyvzlue.supabase.co";
// Optional: SUPABASE_JS=<path to supabase.js> serves the pinned library from disk instead of jsDelivr, for runs without internet.
// It must be the exact file the app pins (npm pack @supabase/supabase-js@<version>, dist/umd/supabase.js), or the integrity check fails.
const LOCAL_LIB = process.env.SUPABASE_JS ? readFileSync(process.env.SUPABASE_JS) : null;
const DB = { people: [], meal_logs: [] }, reqs = [], sim = { delay: 0 };
const b64u = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const USER = { id: "11111111-2222-3333-4444-555555555555", aud: "authenticated", role: "authenticated", email: "new@x.com", email_confirmed_at: "2026-10-06T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-10-06T00:00:00Z" };
const session = () => { const exp = Math.floor(Date.now() / 1000) + 3600; return { access_token: `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub: USER.id, exp, role: "authenticated" })}.sig`, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r" + Math.random().toString(36).slice(2), user: USER }; };
const CORS = [["access-control-allow-origin", "http://127.0.0.1:8767"], ["access-control-allow-headers", "*"], ["access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS"], ["access-control-expose-headers", "*"], ["content-type", "application/json"]].map(([name, value]) => ({ name, value }));
function answer(method, u, body, prefer) {
  const path = u.pathname;
  if (path.endsWith("/auth/v1/token")) return [200, session()];
  if (path.endsWith("/auth/v1/user")) return [200, USER];
  if (path.endsWith("/auth/v1/logout")) return [204, null];
  const m = path.match(/\/rest\/v1\/(people|meal_logs)$/); if (!m) return [404, { message: "unknown" }];
  const t = DB[m[1]];
  if (method === "GET") return [200, t.filter(r => !r.deleted_at)];
  if (method === "POST") {
    const out = [];
    for (const p of JSON.parse(body || "[]")) {
      if (m[1] === "meal_logs" && !DB.people.some(x => x.id === p.person_id)) return [409, { code: "23503", message: "violates foreign key constraint" }];
      let r = t.find(x => x.owner_id === p.owner_id && x.app_id === p.app_id);
      if (r) Object.assign(r, p); else { r = { id: crypto.randomUUID(), deleted_at: null, ...p }; t.push(r); }
      out.push(r);
    }
    return [201, /return=representation/.test(prefer) ? out.map(r => ({ id: r.id, app_id: r.app_id })) : null];
  }
  if (method === "PATCH") { const ids = (u.searchParams.get("app_id") || "").replace(/^in\.\(|\)$/g, "").split(","); t.filter(r => ids.includes(r.app_id)).forEach(r => Object.assign(r, JSON.parse(body))); return [204, null]; }
  return [405, {}];
}
function onPaused(p) {
  const { requestId, request } = p, u = new URL(request.url), method = request.method;
  if (u.hostname === "cdn.jsdelivr.net") return void send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "text/javascript" }, { name: "access-control-allow-origin", value: "*" }], body: LOCAL_LIB.toString("base64") });
  if (method === "OPTIONS") return void send("Fetch.fulfillRequest", { requestId, responseCode: 204, responseHeaders: CORS });
  const prefer = Object.entries(request.headers).find(([k]) => k.toLowerCase() === "prefer")?.[1] || "";
  const [code, json] = answer(method, u, request.postData, prefer);
  reqs.push({ method, path: u.pathname, code, q: u.search, body: request.postData || "" });
  setTimeout(() => send("Fetch.fulfillRequest", { requestId, responseCode: code, responseHeaders: CORS, body: json == null ? "" : Buffer.from(JSON.stringify(json)).toString("base64") }), sim.delay);
}
const posts = t => reqs.filter(r => r.method === "POST" && r.path === "/rest/v1/" + t && r.code < 300).length;
const trail = () => JSON.stringify(reqs.slice(-8).map(r => `${r.method} ${r.path} ${r.code}`));
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(100); } return false; };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Fetch.enable", { patterns: [{ urlPattern: SUPA + "/*" }, ...(LOCAL_LIB ? [{ urlPattern: "https://cdn.jsdelivr.net/*" }] : [])] });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
const boot = async () => { await send("Page.navigate", { url: "http://127.0.0.1:8767/index.html" }); await sleep(500); return waitFor(READY, 15000); };
// The app reloads itself when the signed-in account changes, so wait for the fresh page.
const reloaded = async fn => { await ev(`window.__old = 1; ${fn}`); return waitFor(`window.__old === undefined && ${READY}`, 15000); };
const clickLogMeal = (name, cal) => ev(`(()=>{ document.getElementById("m-name").value = ${JSON.stringify(name)}; document.getElementById("m-cal").value = ${cal}; document.querySelector('[data-act="log-meal"]').click(); return true; })()`);
const signOut = () => reloaded(`sbSignOut(false).then(() => UI.sbConfirmOut ? sbSignOut(true) : 0).then(()=>true)`);

console.log("--- 1. new account: set up a profile, log a meal, it must be POSTed to meal_logs");
ok("app boots", await boot(), JSON.stringify(errors));
ok("real supabase-js is loaded", await ev(`!!SB.client && typeof SB.client.auth.signInWithPassword === "function"`));
ok("sign in (page reloads)", await reloaded(`SB.client.auth.signInWithPassword({email:"new@x.com",password:"password1"}).then(()=>true)`));
ok("first sync finishes with no profile", await waitFor("SB.started && SB.state==='idle'", 10000), await ev(`SB.state+" "+SB.err+" active="+sbActive()`));
await ev(`(()=>{ UI.obDraft = newProfile("Test A"); UI.obDraft.age = 30; UI.obDraft.coachPrompted = true; UI.obDraft.tourSeen = "dismissed"; finishOnboarding("fresh"); return true; })()`);
ok("profile set up", await waitFor("UI.loading === false && S.profiles.length === 1", 6000));
await ev(`location.hash = "#/nutrition"; readRoute(); render(); true`);
ok("meal form is on screen", await waitFor(`!!document.getElementById("m-name")`, 3000));
await clickLogMeal("Jollof rice", 450);
ok("meal is queued", (await ev(`sbPending()`)) === 1, await ev(`JSON.stringify(SB.pend)+" active="+sbActive()+" lock="+!!CRY.lock`));
ok("POST /rest/v1/meal_logs within 5s of logging", await until(() => posts("meal_logs") >= 1, 5000), trail());
ok("the meal row reached the database, attached to the person", DB.meal_logs.length === 1 && DB.meal_logs[0].name === "Jollof rice" && DB.meal_logs[0].person_id === DB.people[0]?.id);
ok("nothing left pending", await waitFor(`sbPending() === 0`, 3000));
// 8.2.4: how the real client talks to the people table.
const peoplePosts = reqs.filter(r => r.method === "POST" && r.path === "/rest/v1/people" && r.code < 300);
ok("the profile is upserted on owner_id,app_id", peoplePosts.length >= 1 && peoplePosts.every(r => /on_conflict=owner_id%2Capp_id|on_conflict=owner_id,app_id/.test(r.q)), JSON.stringify(peoplePosts.map(r => r.q)));
ok("the profile row carries its basics and a versioned settings object", peoplePosts.some(r => { try { const b = JSON.parse(r.body)[0]; return b.display_name && b.settings?.v === 1 && "age" in b && "height_cm" in b && "weight_kg" in b && b.deleted_at === null; } catch { return false; } }), peoplePosts.map(r => r.body.slice(0, 200)).join(" | "));
ok("the account's people are read once per sync, deleted ones included", reqs.some(r => r.method === "GET" && r.path === "/rest/v1/people" && /deleted_at/.test(r.q) && !/deleted_at=is\.null/.test(r.q)), JSON.stringify(reqs.filter(r => r.path === "/rest/v1/people").map(r => r.method + r.q.slice(0, 160))));

console.log("--- 2. a meal the app never tracked is still found and uploaded");
// Simulates any path that changes a meal without going through markLog()/sbTrack().
await ev(`(()=>{ const L = logFor(S.activeId, monthOf(today())); L.meals.push({ id: uid(), date: today(), slot: "dinner", name: "Banku", cal: 420, dish: null, extras: [], at: Date.now() }); markRoot(); return true; })()`);
ok("POST /rest/v1/meal_logs for it within 5s (flush sweeps it up)", await until(() => DB.meal_logs.length === 2, 5000), trail());

console.log("--- 3. sign out uploads meals that are still pending");
await clickLogMeal("Waakye", 500); // signing out straight away: the 1.2s upload timer has not fired
const n = posts("meal_logs");
ok("sign out (page reloads)", await signOut());
ok("sign-out POSTed the pending meal before deleting local data", posts("meal_logs") > n && DB.meal_logs.length === 3, trail());

console.log("--- 4. no console errors");
ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
