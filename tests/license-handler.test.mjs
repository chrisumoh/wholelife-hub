import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../supabase/functions/license/handler.ts";

// Run from the repo root:  node --test tests/license-handler.test.mjs
// Build 8.3.23: drives the real licence handler with a pretend Lemon Squeezy (made-up ids and keys, no network).
const ENV = { LEMONSQUEEZY_API_KEY: "k", LEMONSQUEEZY_STORE_ID: "7", LEMONSQUEEZY_PRODUCT_ID_MONTHLY: "9", LEMONSQUEEZY_PRODUCT_ID_YEARLY: "10" };
const env = e => k => e[k];
const post = body => new Request("https://x.test/functions/v1/license", { method: "POST", headers: { origin: "https://wholelife-hub.vercel.app" }, body: JSON.stringify(body) });
const json = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const GOOD = { activated: true, valid: true, error: null, license_key: { status: "active", expires_at: null, test_mode: false }, instance: { id: "dev-1" }, meta: { store_id: 7, product_id: 10, order_id: 55 } };
const run = async (body, upstream, e = ENV) => { const r = await handle(post(body), env(e), async url => String(url).includes("/orders/") ? json(200, { data: { attributes: { order_number: 3, currency: "USD", subtotal: 5999, tax: 0, total: 5999 } } }) : upstream(url)); return { status: r.status, body: await r.json() }; };

test("a valid yearly key activates and brings the receipt", async () => {
  const r = await run({ key: "abc" }, () => json(200, GOOD));
  assert.equal(r.body.state, "valid"); assert.equal(r.body.plan, "yearly"); assert.equal(r.body.instance, "dev-1");
  assert.equal(r.body.receipt.total, 59.99);
});

for (const [name, up] of [
  ["429 rate limit", () => json(429, "slow down")],
  ["503 outage", () => json(503, "<html>down</html>")],
  ["a non-JSON 200", () => json(200, "not json")],
  ["a JSON 200 with no licence and no reason", () => json(200, {})],
  ["a transport failure", () => { throw new TypeError("offline"); }],
  ["a 401", () => json(401, { errors: [] })],
]) {
  test(`${name} is an error, never an invalid or expired key (activation and re-check)`, async () => {
    assert.equal((await run({ key: "abc" }, up)).body.state, "error");
    assert.equal((await run({ key: "abc", instance: "dev-1", check: true }, up)).body.state, "error");
  });
}

test("only an explicit rejection reads as invalid", async () => {
  assert.equal((await run({ key: "abc" }, () => json(404, { activated: false, error: "license_key not found." }))).body.state, "invalid");
});

test("an activation limit is reported as limit", async () => {
  assert.equal((await run({ key: "abc" }, () => json(400, { activated: false, error: "This license key has reached the activation limit.", license_key: GOOD.license_key, meta: GOOD.meta }))).body.state, "limit");
});

test("a refunded or cancelled key reads as expired on a re-check", async () => {
  const r = await run({ key: "abc", instance: "dev-1", check: true }, () => json(200, { ...GOOD, valid: false, license_key: { ...GOOD.license_key, status: "disabled" } }));
  assert.equal(r.body.state, "expired");
});

test("keys from another store or product are invalid", async () => {
  assert.equal((await run({ key: "abc" }, () => json(200, { ...GOOD, meta: { ...GOOD.meta, store_id: 8 } }))).body.state, "invalid");
  assert.equal((await run({ key: "abc" }, () => json(200, { ...GOOD, meta: { ...GOOD.meta, product_id: 99 } }))).body.state, "invalid");
});

test("test-mode keys need the test switch", async () => {
  const t = { ...GOOD, license_key: { ...GOOD.license_key, test_mode: true } };
  assert.equal((await run({ key: "abc" }, () => json(200, t))).body.state, "invalid");
  assert.equal((await run({ key: "abc" }, () => json(200, t), { ...ENV, LEMONSQUEEZY_ALLOW_TEST: "1" })).body.state, "valid");
});

test("missing secrets give an error, and a bad body is refused", async () => {
  assert.equal((await run({ key: "abc" }, () => json(200, GOOD), {})).body.state, "error");
  const r = await handle(new Request("https://x.test", { method: "POST", body: "{" }), env(ENV), async () => json(200, GOOD));
  assert.equal(r.status, 400);
});
