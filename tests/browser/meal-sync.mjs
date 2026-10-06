import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run from the repo root:  node tests/browser/meal-sync.mjs   (needs Node 22+, Python 3 and Chrome)
// The supabase-js CDN script is blocked and replaced with fake-supabase.js, so no real account is touched.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FAKE = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
const srv = spawn("python", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], { cwd: REPO, stdio: "ignore" }); procs.push(srv);
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-"))}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" }); procs.push(chrome);
await sleep(2500);
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval failed: " + expr); return r.result.result.value; };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(150); } return false; };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };

await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*jsdelivr.net*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });
const READY = "typeof S !== 'undefined' && typeof SB !== 'undefined' && SB.booted === true && UI.loading === false";
const boot = async () => { await send("Page.navigate", { url: "http://127.0.0.1:8765/index.html" }); await sleep(500); return waitFor(READY, 15000); };
// 8.1.15: the app reloads itself when the signed-in account changes, so wait for the fresh page.
const reloaded = async fn => { await ev(`window.__old = 1; ${fn}`); return waitFor(`window.__old === undefined && ${READY}`, 15000); };
const signIn = email => reloaded(`SB.client.auth.signInWithPassword({email:${JSON.stringify(email)},password:"password1"}).then(()=>true)`);
const signOut = () => reloaded(`sbSignOut(false).then(()=>true)`);

// helpers inside the page
const blobMeals = (key = "wlh.v62") => ev(`(() => { const l = JSON.parse(localStorage.getItem(${JSON.stringify(key)})||"null")?.logs||{}; return Object.values(l).reduce((n,b)=>n+(b.meals?b.meals.length:0),0); })()`);
const memMeals = () => ev(`[...sbAllMeals()].length`);
const remote = (who) => ev(`__fake.DB.meal_logs.filter(r=>r.owner_id===${JSON.stringify(who)}&&!r.deleted_at).length`);
const cacheN = () => ev(`(() => { const c = JSON.parse(localStorage.getItem(SB_CACHE)||"null"); return c ? Object.keys(c.meals).length : -1; })()`);
const synced = () => waitFor("SB.started && SB.state==='idle' && !sbPending()", 10000);
const addMeal = (name) => ev(`(async()=>{ addEntry("meals",{id:uid(),date:today(),slot:"lunch",name:${JSON.stringify(name)},cal:500,dish:null,extras:[],est:false,photo:null}); render(); return true; })()`);

console.log("--- 1. signed-out baseline");
ok("app boots", await boot(), JSON.stringify(errors));
await ev(`(async()=>{ const p=newProfile("Ada"); p.onboarded=true; p.coachPrompted=true; p.tourSeen="dismissed"; S.profiles=[p]; S.activeId=p.id; saveProfile(); await flush(); return true; })()`);
await addMeal("Jollof rice"); await addMeal("Waakye"); await ev(`flush()`);
ok("signed out: meals saved in the local blob", (await blobMeals()) === 2, await blobMeals());
await ev(`location.hash="#/settings"; true`); await sleep(500);
ok("signed out: account card shows sign-in form", await ev(`(()=>{ render(); return !!document.getElementById("sb-email") && UI.route==="settings"; })()`), await ev(`UI.route+" "+document.title`));

console.log("--- 2. sign in A: first upload");
ok("sign in A (page reloads)", await signIn("a@x.com"));
ok("guest meals wait for a choice: nothing uploaded yet", (await remote("u_axcom")) === 0 && await ev(`!!UI.guestPrompt`));
await ev(`document.querySelector('[data-act="sb-guest-import"]').click(); true`);
ok("sync finishes", await synced());
ok("2 meals uploaded for A", (await remote("u_axcom")) === 2, await remote("u_axcom"));
ok("person row created once", (await ev(`__fake.DB.people.length`)) === 1);
await ev(`flush()`); await sleep(300);
ok("meals left the local blob", (await blobMeals("wlh.v62@u_axcom")) === 0, await blobMeals("wlh.v62@u_axcom"));
ok("local cache holds 2 meals", (await cacheN()) === 2, await cacheN());
ok("memory still shows 2 meals", (await memMeals()) === 2);
ok("account card shows signed-in email", await ev(`(()=>{ render(); return document.getElementById("sb-account").textContent.includes("a@x.com"); })()`));

console.log("--- 3. add and delete while signed in");
await addMeal("Egusi soup"); await sleep(2500); await synced();
ok("new meal reached the database", (await remote("u_axcom")) === 3, await remote("u_axcom"));
await ev(`(()=>{ const x=[...sbAllMeals()].find(x=>x.m.name==="Waakye"); removeEntry("meals", x.m.id); render(); return true; })()`); await sleep(2500); await synced();
ok("delete is a soft delete", (await remote("u_axcom")) === 2 && (await ev(`__fake.DB.meal_logs.filter(r=>r.deleted_at).length`)) === 1);
ok("cache follows (2 meals)", (await cacheN()) === 2, await cacheN());

console.log("--- 4. offline queue");
await ev(`__fake.offline = true`);
await addMeal("Banku"); await sleep(2500);
ok("offline: change is queued", (await ev(`sbPending()`)) === 1, await ev(`sbPending()`));
ok("offline: meal still visible and cached", (await memMeals()) === 3 && (await cacheN()) === 3);
ok("offline: database unchanged", (await remote("u_axcom")) === 2);
await ev(`__fake.offline = false; sbKick(); true`); await synced();
ok("back online: queued meal uploaded", (await remote("u_axcom")) === 3, await remote("u_axcom"));

console.log("--- 5. reload while signed in");
ok("reboot", await boot(), JSON.stringify(errors));
ok("signed in after reload", await ev(`!!SB.user && SB.user.id==="u_axcom"`));
ok("meals present after reload (from cache + sync)", await waitFor("[...sbAllMeals()].length===3", 6000), await memMeals());
await synced();
ok("blob stays meal-free after reload", (await (async()=>{ await ev(`flush()`); return blobMeals("wlh.v62@u_axcom"); })()) === 0);

console.log("--- 6. sign out clears meals from the device");
ok("sign out (page reloads)", await signOut());
ok("signed out", await ev(`!SB.user`));
ok("no meals in memory", (await memMeals()) === 0);
ok("cache removed", (await cacheN()) === -1);
ok("no meals in blob", (await blobMeals()) === 0);
ok("A's meals still in the database", (await remote("u_axcom")) === 3);

console.log("--- 7. account B cannot see A's meals");
ok("sign in B (page reloads)", await signIn("b@x.com"));
await sleep(800);
ok("B sees 0 meals", (await memMeals()) === 0, await memMeals());
ok("B has 0 rows in the database", (await remote("u_bxcom")) === 0);
ok("A's 3 rows untouched", (await remote("u_axcom")) === 3);
const attack = await ev(`(async()=>{ const r = await SB.client.from("meal_logs").select(); return r.data.filter(x=>x.owner_id!=="u_bxcom").length; })()`);
ok("direct select as B returns none of A's rows", attack === 0, attack);
const attack2 = await ev(`(async()=>{ const pid=__fake.DB.people.find(p=>p.owner_id==="u_axcom").id; const r = await SB.client.from("meal_logs").upsert([{owner_id:"u_bxcom",person_id:pid,app_id:"zz1",log_date:"2026-10-05",name:"x",slot:"lunch"}]); return !!r.error; })()`);
ok("B cannot write a meal into A's profile", attack2 === true);
ok("sign out B", await signOut());

console.log("--- 8. passcode: meals stay local");
ok("sign in A again (page reloads)", await signIn("a@x.com"));
ok("A sync finishes (profile restored from the account: meals come back)", await synced());
ok("A has 3 meals again", await waitFor("[...sbAllMeals()].length === 3", 6000), await memMeals());
await ev(`setPasscode("passcode-123").then(()=>true)`);
ok("passcode: sync inactive", await ev(`!sbActive()`));
ok("passcode: plain cache removed", (await cacheN()) === -1);
await addMeal("Kenkey"); await sleep(2500);
ok("passcode: new meal not uploaded", (await remote("u_axcom")) === 3, await remote("u_axcom"));
ok("passcode: meals are in the (encrypted) blob, not plain", await ev(`(()=>{ const l=JSON.parse(localStorage.getItem("wlh.v62@u_axcom")).logs; return Object.values(l).every(b=>b.enc && !b.meals); })()`));
await ev(`removePasscode().then(()=>true)`); await synced();
ok("passcode removed: sync resumes and uploads the offline-period meal", (await remote("u_axcom")) === 4, await remote("u_axcom"));

console.log("--- 9. expired session, then a different account");
await ev(`window.__old = 1; __fake.expireNow(); true`);
ok("expired: page reloads signed out", await waitFor(`window.__old === undefined && ${READY}`, 15000));
ok("expired: A's local data is removed from the device", await ev(`!SB.user && S.profiles.length === 0`) && (await blobMeals("wlh.v62@u_axcom")) === 0 && (await cacheN()) === -1);
ok("expired: A's meals are still in the account", (await remote("u_axcom")) === 4, await remote("u_axcom"));
ok("sign in B (page reloads)", await signIn("b@x.com"));
await sleep(800);
ok("A's meals were not uploaded into B", (await remote("u_bxcom")) === 0, await remote("u_bxcom"));
ok("A's meals are not in memory for B", (await memMeals()) === 0, await memMeals());

console.log("--- 10. no console errors");
ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));

console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
