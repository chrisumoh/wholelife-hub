// Run:  node --test tests/pwa-kit.cjs
// The install manifest, the service worker and the error tracker (docs/APP_READINESS.md), all switched on in index.html since 8.3.27 and
// reporting for real since 8.3.28: the files the manifest and the worker name exist, the worker still installs when one file is missing,
// it never keeps an error page or touches other sites, the reporter sends JSON, paths only, once, and it posts to this app's own project.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const pngSize = f => { const b = fs.readFileSync(path.join(root, f)); assert.equal(b.toString("latin1", 1, 4), "PNG", f + " is a PNG"); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("the manifest parses, its icons exist at the size they claim, and its colour matches the page", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  assert.equal(m.display, "standalone"); assert.equal(m.start_url, "/"); assert.equal(m.scope, "/");
  assert.ok(m.icons.some(i => i.sizes === "192x192") && m.icons.some(i => i.sizes === "512x512"), "192 and 512 icons are what browsers need to offer install");
  for (const i of m.icons) { const [w, h] = i.sizes.split("x").map(Number); assert.deepEqual(pngSize(i.src.replace(/^\//, "")), [w, h], i.src); }
  assert.equal(m.theme_color, (/<meta name="theme-color" content="([^"]+)"/.exec(read("index.html")) || [])[1], "same theme colour as the page");
});

test("every file the service worker pre-caches exists", () => {
  const list = /PRECACHE_URLS = \[([^\]]*)\]/.exec(read("sw.js"))[1].match(/'([^']+)'/g).map(x => x.slice(1, -1));
  assert.ok(list.length >= 3);
  for (const u of list) assert.ok(fs.existsSync(path.join(root, u === "/" ? "index.html" : u.replace(/^\//, ""))), u + " exists");
});

function loadWorker(cache) {
  const handlers = {};
  const self = { location: { origin: "https://app.test" }, addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => { self.skipped = true; }, clients: { claim: async () => {} } };
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => "CACHED" };
  vm.runInNewContext(read("sw.js"), { self, caches, URL, Promise, fetch: () => { throw new Error("no network in this test"); } });
  return { handlers, self };
}

test("the worker installs even when one pre-cached file is missing", async () => {
  const added = [], cache = { add: async u => { added.push(u); if (u.includes("manifest")) throw new Error("404"); } };
  const { handlers, self } = loadWorker(cache);
  let p; handlers.install({ waitUntil: x => { p = x; } }); await p;
  assert.ok(added.length >= 3 && self.skipped, "all were tried, and the worker still took over");
});

test("the worker ignores writes and other sites", () => {
  const { handlers } = loadWorker({});
  const run = req => { let handled = false; handlers.fetch({ request: req, respondWith: () => { handled = true; } }); return handled; };
  assert.equal(run({ method: "POST", url: "https://app.test/x", mode: "cors" }), false, "writes pass straight through");
  assert.equal(run({ method: "GET", url: "https://zemxqbinpehkrkyvzlue.supabase.co/rest/v1/meal_logs", mode: "cors" }), false, "other sites are never intercepted");
});

// One navigation through the worker; reports what it answered and what it stored as the offline home page.
async function navigate(path, response) {
  const h = {}, self = { location: { origin: "https://app.test" }, addEventListener: (t, f) => { h[t] = f; } }, kept = [], waits = [];
  const net = response ? async () => ({ ...response, headers: { get: k => (response.headers || {})[k.toLowerCase()] || null }, clone() { return this; } }) : async () => { throw new Error("offline"); };
  vm.runInNewContext(read("sw.js"), { self, caches: { open: async () => ({ put: async (k, v) => { kept.push(v); } }), match: async () => "OFFLINE HOME" }, URL, Promise, Response: { error: () => "NO PAGE" }, fetch: net });
  let res; h.fetch({ request: { method: "GET", url: "https://app.test" + path, mode: "navigate" }, respondWith: p => { res = p; }, waitUntil: p => waits.push(p) });
  const out = await res; await Promise.all(waits);
  return { out, kept };
}
const html = { ok: true, status: 200, headers: { "content-type": "text/html; charset=utf-8" } };

test("only a good app page becomes the offline copy", async () => {
  assert.equal((await navigate("/", html)).kept.length, 1, "a good app page is kept");
  assert.equal((await navigate("/", { ...html, ok: false, status: 503 })).kept.length, 0, "an error page is not kept");
  assert.equal((await navigate("/img/icon-512.png", { ok: true, status: 200, headers: { "content-type": "image/png" } })).kept.length, 0, "a file opened directly is not kept as the home page");
  assert.equal((await navigate("/other.html", html)).kept.length, 0, "nor is any other page");
});

test("offline, the app page comes from the copy and other addresses do not get it", async () => {
  assert.equal((await navigate("/")).out, "OFFLINE HOME");
  assert.equal((await navigate("/#/coach")).out, "OFFLINE HOME");
  assert.equal((await navigate("/img/icon-512.png")).out, "NO PAGE", "an image address is not answered with the app page");
});

function loadReporter(configured, status = 200, href = "https://app.test/#/coach?token=SECRET") {
  const handlers = {}, calls = [], beacons = [], timers = [];
  // Overwrite whatever the shipped file says, so these tests keep working once the real endpoint is filled in.
  const src = read("observability.js")
    .replace(/ENDPOINT:\s*'[^']*'/, configured ? "ENDPOINT: 'https://x.supabase.co/rest/v1/error_reports'" : "ENDPOINT: ''")
    .replace(/ANON_KEY:\s*'[^']*'/, configured ? "ANON_KEY: 'anon-key'" : "ANON_KEY: ''");
  const win = { addEventListener: (t, f) => { handlers[t] = f; } };
  const ctx = { window: win, navigator: { onLine: true, userAgent: "UA", sendBeacon: (...a) => { beacons.push(a); return true; } }, location: { href, origin: new URL(href).origin },
    console: { warn: () => {} }, URL, Date, Map, String, JSON, fetch: (u, o) => { calls.push([u, o]); return Promise.resolve({ ok: status < 400, status }); }, setTimeout: (f, ms) => { timers.push(ms); } };
  vm.runInNewContext(src, ctx); return { handlers, calls, beacons, win, timers };
}

test("the shipped endpoint is this app's own project, reached with the publishable key only", () => {
  const src = read("observability.js");
  const endpoint = (/ENDPOINT:\s*'([^']*)'/.exec(src) || [])[1] || "";
  const key = (/ANON_KEY:\s*'([^']*)'/.exec(src) || [])[1] || "";
  const app = /const SB_URL = "([^"]+)", SB_KEY = "([^"]+)"/.exec(read("index.html")) || [];
  assert.ok(endpoint.endsWith("/rest/v1/error_reports"), "reports go to the error_reports table: " + endpoint);
  assert.equal(endpoint, app[1] + "/rest/v1/error_reports", "the same Supabase project as SB_URL in index.html");
  assert.ok(/^sb_publishable_/.test(key), "the publishable key, never a secret key");
  assert.equal(key, app[2], "byte for byte the SB_KEY in index.html: rotating one without the other would deafen the reporter, with only a console warning to show for it");
});

test("with no endpoint set, reports stay on the device", () => {
  const { handlers, calls, beacons } = loadReporter(false);
  handlers.error({ message: "boom", error: { stack: "Error: boom\n at a" } });
  assert.equal(calls.length + beacons.length, 0);
});

test("with an endpoint, a report is JSON with the key headers, carries the path only, and is sent once", () => {
  const { handlers, calls, beacons } = loadReporter(true, 201);
  const ev = { message: "boom", error: { stack: "Error: boom\n at a (x.js:1:1)" }, filename: "https://app.test/index.html?q=1" };
  handlers.error(ev); handlers.error(ev);
  assert.equal(beacons.length, 0, "sendBeacon sends text/plain, which the REST API rejects");
  assert.equal(calls.length, 1, "the same error inside a minute counts once");
  const [url, opts] = calls[0], body = JSON.parse(opts.body)[0];
  assert.equal(url, "https://x.supabase.co/rest/v1/error_reports");
  assert.equal(opts.headers["Content-Type"], "application/json"); assert.equal(opts.headers.apikey, "anon-key"); assert.equal(opts.keepalive, true);
  assert.equal(body.page, "/", "a fragment with a query in it is dropped whole"); assert.ok(!JSON.stringify(body).includes("SECRET"));
  assert.deepEqual(Object.keys(body).sort(), ["kind", "label", "message", "page", "stack", "user_agent"], "nothing else about the person is attached, and no client clock");
});

test("the report names the screen: a route is kept, a sign-in fragment is not", () => {
  const route = loadReporter(true, 201, "https://app.test/#/premium/pantry");
  route.handlers.error({ message: "boom", error: { stack: "Error: boom\n at a" } });
  assert.equal(JSON.parse(route.calls[0][1].body)[0].page, "/#/premium/pantry", "the hash route is the only way to tell which screen failed in a single-page app");

  const tokens = loadReporter(true, 201, "https://app.test/#access_token=SYNTH_ROUTE&refresh_token=SYNTH_ROUTE");
  tokens.handlers.error({ message: "boom", error: { stack: "Error: boom\n at a" } });
  const body = JSON.parse(tokens.calls[0][1].body)[0];
  assert.equal(body.page, "/", "a fragment that carries values is dropped whole");
  assert.ok(!JSON.stringify(body).includes("SYNTH_ROUTE"), "no token reaches the table: " + JSON.stringify(body));
});

test("an empty message still lands, and the table sets the time", () => {
  const { handlers, calls } = loadReporter(true, 201);
  handlers.error({ message: "", error: undefined });
  const body = JSON.parse(calls[0][1].body)[0];
  assert.equal(body.message, "(no message)", "the table refuses a zero-length message, and a 400 is not retried");
  assert.ok(!("created_at" in body), "a phone with a wrong clock must not file the bug");
});

test("tokens in URLs and error text never reach the report", () => {
  const { handlers, calls } = loadReporter(true);
  const tok = "SYNTH_TOKEN_123";
  handlers.error({
    message: "Failed to load https://app.test/auth/callback?access_token=" + tok + "&x=1#refresh_token=" + tok + " after code=" + tok,
    error: { stack: "Error: bad\n    at go (https://app.test/index.html?token=" + tok + ":10:5)\n    at https://app.test/app.js#access_token=" + tok + ":2:1" },
    filename: "https://app.test/auth/callback?access_token=" + tok + "#id_token=" + tok
  });
  const body = JSON.parse(calls[0][1].body)[0];
  assert.ok(!JSON.stringify(body).includes(tok), "no token survives in label, message or stack: " + JSON.stringify(body));
  assert.ok(body.stack.includes("https://app.test/index.html") && body.label === "https://app.test/auth/callback", "the useful part (the path) is kept");
});

const settle = () => new Promise(r => setImmediate(r));

test("a busy or unavailable server is retried a few times, with growing waits, then dropped", async () => {
  for (const status of [503, 429]) {
    const { handlers, calls, timers } = loadReporter(true, status);
    handlers.error({ message: "boom", error: { stack: "Error: boom\n at a" } });
    for (let i = 0; i < 6; i++) { await settle(); handlers.online(); }
    await settle();
    assert.equal(calls.length, 3, status + ": three tries in all, then it stops asking");
    assert.deepEqual(timers, [2000, 4000], "each wait is twice the last");
  }
});

test("a refusal that a retry cannot fix is dropped, and a good answer is not repeated", async () => {
  for (const [status, why] of [[401, "wrong key"], [404, "missing table"], [201, "accepted"]]) {
    const { handlers, calls, timers } = loadReporter(true, status);
    handlers.error({ message: "boom", error: { stack: "Error: boom\n at a" } });
    await settle(); handlers.online(); await settle();
    assert.equal(calls.length, 1, why + ": sent once");
    assert.equal(timers.length, 0, why + ": no retry scheduled");
  }
});

test("a crash loop cannot flood the table: at most 20 reports a session", () => {
  const { handlers, calls } = loadReporter(true);
  for (let i = 0; i < 50; i++) handlers.error({ message: "e" + i, error: { stack: "Error\n at f" + i } });
  assert.equal(calls.length, 20);
});
