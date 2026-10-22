// Run:  node --test tests/pwa-kit.cjs
// The install manifest, the service worker and the error-tracking starter (docs/APP_READINESS.md). None of them is wired into index.html
// yet, so these tests are what keep them correct until it is: the files the manifest and the worker name exist, the worker still installs
// when one file is missing, it never keeps an error page or touches other sites, and the error reporter sends JSON, paths only, once.
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

test("the worker ignores writes and other sites, and keeps only good pages", async () => {
  const { handlers } = loadWorker({});
  const run = req => { let handled = false, res; handlers.fetch({ request: req, respondWith: p => { handled = true; res = p; } }); return { handled, res }; };
  assert.equal(run({ method: "POST", url: "https://app.test/x", mode: "cors" }).handled, false, "writes pass straight through");
  assert.equal(run({ method: "GET", url: "https://zemxqbinpehkrkyvzlue.supabase.co/rest/v1/meal_logs", mode: "cors" }).handled, false, "other sites are never intercepted");
  const ctx = (ok) => { const h = {}, self = { location: { origin: "https://app.test" }, addEventListener: (t, f) => { h[t] = f; } }; const kept = [];
    vm.runInNewContext(read("sw.js"), { self, caches: { open: async () => ({ put: async k => { kept.push(k); } }), match: async () => "OFFLINE" }, URL, Promise, fetch: async () => ({ ok, clone() { return this; } }) });
    return { h, kept }; };
  for (const ok of [true, false]) {
    const { h, kept } = ctx(ok); let res; h.fetch({ request: { method: "GET", url: "https://app.test/", mode: "navigate" }, respondWith: p => { res = p; } });
    await res; await new Promise(r => setTimeout(r, 10));
    assert.equal(kept.length, ok ? 1 : 0, ok ? "a good page is kept for offline" : "an error page is not kept");
  }
});

function loadReporter(configured) {
  const handlers = {}, calls = [], beacons = [];
  let src = read("observability.js");
  if (configured) src = src.replace("ENDPOINT: ''", "ENDPOINT: 'https://x.supabase.co/rest/v1/error_reports'").replace("ANON_KEY: ''", "ANON_KEY: 'anon-key'");
  const win = { addEventListener: (t, f) => { handlers[t] = f; } };
  const ctx = { window: win, navigator: { onLine: true, userAgent: "UA", sendBeacon: (...a) => { beacons.push(a); return true; } }, location: { href: "https://app.test/#/coach?token=SECRET", origin: "https://app.test" },
    console: { warn: () => {} }, URL, Date, Map, String, JSON, fetch: (u, o) => { calls.push([u, o]); return Promise.resolve({ ok: true }); }, setTimeout };
  vm.runInNewContext(src, ctx); return { handlers, calls, beacons, win };
}

test("with no endpoint set, reports stay on the device", () => {
  const { handlers, calls, beacons } = loadReporter(false);
  handlers.error({ message: "boom", error: { stack: "Error: boom\n at a" } });
  assert.equal(calls.length + beacons.length, 0);
});

test("with an endpoint, a report is JSON with the key headers, carries the path only, and is sent once", () => {
  const { handlers, calls, beacons } = loadReporter(true);
  const ev = { message: "boom", error: { stack: "Error: boom\n at a (x.js:1:1)" }, filename: "https://app.test/index.html?q=1" };
  handlers.error(ev); handlers.error(ev);
  assert.equal(beacons.length, 0, "sendBeacon sends text/plain, which the REST API rejects");
  assert.equal(calls.length, 1, "the same error inside a minute counts once");
  const [url, opts] = calls[0], body = JSON.parse(opts.body)[0];
  assert.equal(url, "https://x.supabase.co/rest/v1/error_reports");
  assert.equal(opts.headers["Content-Type"], "application/json"); assert.equal(opts.headers.apikey, "anon-key"); assert.equal(opts.keepalive, true);
  assert.equal(body.page, "/", "the path, with the hash and query dropped"); assert.ok(!JSON.stringify(body).includes("SECRET"));
  assert.deepEqual(Object.keys(body).sort(), ["created_at", "kind", "label", "message", "page", "stack", "user_agent"], "nothing else about the person is attached");
});

test("a crash loop cannot flood the table: at most 20 reports a session", () => {
  const { handlers, calls } = loadReporter(true);
  for (let i = 0; i < 50; i++) handlers.error({ message: "e" + i, error: { stack: "Error\n at f" + i } });
  assert.equal(calls.length, 20);
});
