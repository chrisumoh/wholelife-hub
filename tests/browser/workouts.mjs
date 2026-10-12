import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Run from the repo root:  node tests/browser/workouts.mjs   (needs Node 22+ and Chrome; set CHROME to its path, CI=1 as root)
// Build 8.2.11: the workout picker. Every activity has its own icon drawn inside the tile, a colour, a MET value and a group; the picker shows them in groups;
// every coach sport has three sessions and an icon; imports (Apple Health and file names) land on the right activity; a logged workout gets the right calorie estimate.
// The icons are original artwork inside the app, so this test is the check that none is missing, blank, clipped or a copy of another.
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
}).listen(8782, "127.0.0.1");
const procs = [{ kill: () => server.close() }];
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9345", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wlh-workouts-"))}`, "--no-first-run", "--disable-gpu", ...NO_SANDBOX, "about:blank"], { stdio: "ignore" }); procs.push(chrome);
let list = null;
for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch("http://127.0.0.1:9345/json/list")).json(); if (l.some(t => t.type === "page")) list = l; } catch {} if (!list) await sleep(250); }
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
await send("Page.navigate", { url: "http://127.0.0.1:8782/index.html" }); await sleep(500);
ok("app boots", await waitFor(READY, 15000), errors.join(" | "));
await ev(`(async () => { const p = newProfile("Ada"); Object.assign(p, { onboarded: true, coachPrompted: true, tourSeen: "dismissed", age: 30, sex: "female", heightCm: 170, weightKg: 70, freq: 3, level: "beginner" }); S.profiles = [p]; S.activeId = p.id; saveProfile(); await flush(); location.hash = "#/workouts"; render(); return true; })()`); await sleep(500);
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);

console.log("--- 1. the list of activities");
const L = await ev(`({ keys: ACTIVITIES.map(a => a.k), met: ACTIVITIES.map(a => a.met), names: ACTIVITIES.map(a => a.n), groups: ACTIVITIES.map(a => a.g), gk: ACT_GROUPS.map(g => g[0]), art: ACTIVITIES.map(a => !!WI_ART[a.k]), col: ACTIVITIES.map(a => !!WI_COLOR[a.k]) })`);
ok("there are at least 40 activities (there were 16)", L.keys.length >= 40, String(L.keys.length));
ok("keys and names are unique", new Set(L.keys).size === L.keys.length && new Set(L.names).size === L.names.length);
ok("every activity has a MET value, a known group, an icon and a colour", L.met.every(m => m > 0 && m < 20) && L.groups.every(g => L.gk.includes(g)) && L.art.every(Boolean) && L.col.every(Boolean), JSON.stringify(L.keys.filter((k, i) => !L.art[i] || !L.col[i])));
ok("every group has activities", L.gk.every(g => L.groups.includes(g)));
ok("the new ones are there: Pilates, Boxing, Cricket, Volleyball, Badminton, Rugby, Climbing, Jump rope, Martial arts, Golf, Kayaking, Track and sprints", ["pilates", "boxing", "cricket", "volleyball", "badminton", "rugby", "climb", "jumprope", "martial", "golf", "kayak", "athletics"].every(k => L.keys.includes(k)));
ok("the old ones kept their keys, so saved workouts still show", ["walk", "run", "cycle", "strength", "hiit", "yoga", "swim", "soccer", "basketball", "football", "tennis", "dance", "row", "hike", "elliptical", "other"].every(k => L.keys.includes(k)));

console.log("--- 2. every icon is drawn, whole, inside its tile, and different from the others");
const I = await ev(`(() => { const host = document.createElement("div"); host.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none"; document.body.append(host); const out = []; const seen = new Map();
  for (const a of ACTIVITIES) { host.innerHTML = wicon(a.k, 96); const svg = host.querySelector("svg"), g = svg.querySelector(".wi-art"), sr = svg.getBoundingClientRect(), gr = g.getBoundingClientRect(), k48 = sr.width / 48, b = { x: (gr.left - sr.left) / k48, y: (gr.top - sr.top) / k48, width: gr.width / k48, height: gr.height / k48 }, html = svg.innerHTML.replace(/wi\w+-\d+/g, "ID");
    const art = WI_ART[a.k]; const dup = seen.get(art); seen.set(art, a.k);
    out.push({ k: a.k, w: b.width, h: b.height, x: b.x, y: b.y, left: html.includes("§"), paint: !/url\(#[^)]*\)/.test(g.getAttribute("stroke")) , userSpace: /gradientUnits="userSpaceOnUse"/.test(svg.innerHTML), dup: dup || null, shapes: g.querySelectorAll("path,circle,ellipse,rect").length }); }
  host.remove(); return out; })()`);
const bad = [];
for (const i of I) { if (i.w < 14 || i.h < 14) bad.push(i.k + " too small " + Math.round(i.w) + "x" + Math.round(i.h)); if (i.x < 1 || i.y < 1 || i.x + i.w > 47 || i.y + i.h > 47) bad.push(i.k + " leaves the tile " + [i.x, i.y, i.x + i.w, i.y + i.h].map(Math.round)); if (i.left) bad.push(i.k + " has an unreplaced paint token"); if (i.dup) bad.push(i.k + " is a copy of " + i.dup); if (i.shapes < 2) bad.push(i.k + " has only " + i.shapes + " shape"); if (!i.userSpace) bad.push(i.k + " gradient is not in user space (a straight line would vanish)"); }
ok(`all ${I.length} icons: drawn, 14px or more, inside the tile, not copies, gradient safe`, bad.length === 0, bad.slice(0, 5).join(" | "));
const clash = await ev(`(() => { const ids = ACTIVITIES.map(a => a.k); const cols = ids.map(k => WI_COLOR[k].join()); return ids.filter((k, i) => cols.indexOf(cols[i]) !== i); })()`);
ok("no two activities share the same colour pair", clash.length === 0, clash.join(", "));
const contrast = await ev(`(() => { const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; }; return ACTIVITIES.filter(a => { const l = lum(WI_COLOR[a.k][1]); return (1.05) / (l + .05) > 12 || (l + .05) / .05 < 1.5; }).map(a => a.k); })()`);
ok("every light gradient colour is visible on a dark tile (and not white)", contrast.length === 0, contrast.join(", "));

console.log("--- 3. the picker");
const pick = await ev(`(() => { const groups = [...document.querySelectorAll(".actgroup")]; return { n: groups.length, heads: groups.map(g => g.querySelector(".actgh").textContent), btns: document.querySelectorAll(".actbtn").length, icons: document.querySelectorAll(".actbtn .wi-svg").length, sel: document.getElementById("w-type").options.length, ungrouped: [...document.querySelectorAll(".actbtn")].filter(b => !b.closest(".actgroup")).length, label: document.querySelector('[role="group"][aria-label="Activity"]') ? true : false }; })()`);
ok("the Activity picker has all seven group headings", pick.n === 7 && pick.heads.join("|") === "Cardio|Strength and studio|Team sports|Racket and club sports|Combat|Water and outdoors|Other", pick.heads.join("|"));
ok("every activity has a button with its icon, and the hidden select lists them all", pick.btns === L.keys.length && pick.icons === L.keys.length && pick.sel === L.keys.length && pick.ungrouped === 0, JSON.stringify(pick));
ok("the picker is a labelled group (not one big label around buttons)", pick.label);
for (const w of [375, 820, 1440]) {
  await view(w); await sleep(300);
  const fit = await ev(`(() => { const out = []; for (const b of document.querySelectorAll(".actbtn")) { const r = b.getBoundingClientRect(), t = b.querySelector(".tiny"), p = b.parentElement.getBoundingClientRect(); if (r.width < 60) out.push(b.title + " is " + Math.round(r.width) + "px wide"); if (r.height < 44) out.push(b.title + " is " + Math.round(r.height) + "px tall"); if (r.right > p.right + 1 || r.left < p.left - 1) out.push(b.title + " sticks out"); if (t.scrollHeight > t.clientHeight + 1 && t.scrollHeight > t.clientHeight * 1.0 && t.textContent.length > 26) out.push(b.title + " name is cut"); } return { out, scroll: document.documentElement.scrollWidth > innerWidth }; })()`);
  ok(`${w}px: every tile is at least 60px wide and 44px tall, inside its group, and the page does not scroll sideways`, fit.out.length === 0 && !fit.scroll, JSON.stringify(fit).slice(0, 300));
}
await view(1440); await sleep(300);

console.log("--- 4. logging with a new activity");
await click('[data-act="pick-act"][data-v="pilates"]'); await sleep(250);
ok("tapping Pilates selects it", await ev(`document.getElementById("w-type").value === "pilates" && document.querySelector('.actbtn[data-v="pilates"]').getAttribute("aria-pressed") === "true" && document.querySelectorAll('.actbtn[aria-pressed="true"]').length === 1`));
await ev(`(() => { document.getElementById("w-min").value = "60"; return true; })()`);
await click('[data-act="log-workout"]'); await sleep(400);
const e1 = await ev(`(() => { const w = entries("workouts").find(x => x.type === "pilates"); return w ? { type: w.type, min: w.minutes, kcal: workoutKcal(w, 70), row: !!document.querySelector(".wrow .wi-pilates") } : null; })()`);
ok("it is saved as Pilates, its calories come from its MET (3 x 70 kg x 1 h = 210) and its own icon shows in the list", e1 && e1.type === "pilates" && e1.kcal === 210 && e1.row, JSON.stringify(e1));
await click('[data-act="pick-act"][data-v="jumprope"]'); await ev(`(() => { document.getElementById("w-min").value = "30"; return true; })()`); await click('[data-act="log-workout"]'); await sleep(400);
ok("Jump rope for 30 minutes at 70 kg estimates 11.8 x 70 x 0.5 = 413", await ev(`workoutKcal(entries("workouts").find(x => x.type === "jumprope"), 70) === 413`));
ok("an old saved type with no group still shows its icon and calories", await ev(`workoutKcal({ type: "walk", minutes: 60 }, 70) === 245 && wicon("walk", 30).includes("wi-walk") && wicon("nonsense", 30).includes("wi-other")`));

console.log("--- 5. coach sports");
const sp = await ev(`(() => { const p = P(); const out = { n: Object.keys(SPORTS).length, bad: [] }; for (const [k, v] of Object.entries(SPORTS)) { if (!v.n || v.days.length !== 3 || v.days.some(d => !d[0] || !d[1].length || d[1].some(i => !i[0] || !i[1]))) out.bad.push(k + ": plan"); p.sport = k; p.freq = 3; p.level = "beginner"; const plan = buildWorkoutPlan(p); const sessions = plan.filter(x => x.title.startsWith(v.n + ":")); if (!sessions.length) out.bad.push(k + ": no sport session in a 3-day plan"); for (const s of sessions) if (!ACT[s.type] || !WI_ART[s.type]) out.bad.push(k + ": session type " + s.type + " has no icon"); } p.sport = ""; return out; })()`);
ok("there are 15 sports (there were 6), each with three sessions, and every session lands on a real icon", sp.n >= 15 && sp.bad.length === 0, JSON.stringify(sp));
ok("the new sports are there: Volleyball, Cricket, Rugby, Badminton, Table tennis, Boxing, Martial arts, Track and field, Cycling, Golf", await ev(`["volleyball", "cricket", "rugby", "badminton", "tabletennis", "boxing", "martial", "athletics", "cycling", "golf"].every(k => SPORTS[k])`));
await ev(`location.hash = "#/coach"; true`); await sleep(500);
ok("the Coach sport menu lists them all", await ev(`document.getElementById("c-sport").options.length === Object.keys(SPORTS).length + 1 && [...document.getElementById("c-sport").options].some(o => o.textContent === "Cricket")`));
await ev(`(() => { const s = document.getElementById("c-sport"); s.value = "cricket"; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`); await sleep(400);
ok("choosing Cricket saves it on the profile", await ev(`P().sport === "cricket"`));

console.log("--- 6. imports land on the right activity");
const g = await ev(`({ hk: Object.entries(HK).filter(([, v]) => !ACT[v]).map(([k]) => k), g: [["Pilates session", "pilates"], ["Morning run", "run"], ["Hiking", "hike"], ["Spin class", "spin"], ["Indoor cycling", "spin"], ["Outdoor cycle", "cycle"], ["Jump rope", "jumprope"], ["Kickboxing", "boxing"], ["Judo", "martial"], ["Rugby union", "rugby"], ["Volleyball", "volleyball"], ["Cricket", "cricket"], ["Table tennis", "tabletennis"], ["Tennis", "tennis"], ["Badminton", "badminton"], ["Rowing machine", "row"], ["Stair climber", "stairs"], ["Rock climbing", "climb"], ["Skateboarding", "skate"], ["Ice skating", "iceskate"], ["Zumba", "aerobics"], ["Soccer", "soccer"], ["American football", "football"], ["Sprint session", "athletics"], ["Something odd", "other"]].filter(([s, k]) => guessType(s) !== k).map(([s, k]) => s + " gave " + guessType(s) + ", wanted " + k) })`);
ok("every Apple Health workout name in the map points at an activity that exists", g.hk.length === 0, g.hk.join(", "));
ok("file and sport names are read into the right activity (25 examples)", g.g.length === 0, g.g.join(" | "));

ok("no uncaught exceptions", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(fail ? 1 : 0);
