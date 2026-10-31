import test from "node:test";
import assert from "node:assert/strict";
import { handle, SAFE_REPLY, SMALL_MODEL, BIG_MODEL, SYSTEM_PROMPT } from "../supabase/functions/wl-coach/handler.ts";

// Run from the repo root:  node --test tests/wl-coach-handler.test.mjs
// Build 8.4.1: drives the real wl-coach handler with a pretend Supabase and a pretend model (no network, no key).
const UID = "11111111-2222-3333-4444-555555555555";
const withConsent = body => (body && typeof body === "object" && !("consent" in body) ? { consent: true, ...body } : body);
const post = (body, token = "tok") => new Request("https://x.test/functions/v1/wl-coach", { method: "POST", headers: { origin: "https://wholelife-hub.vercel.app", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(withConsent(body)) });
function fake(over = {}) {
  const calls = { ask: [], log: [], reserved: [] };
  let used = over.used ?? 0; delete over.used;
  const deps = {
    getUser: async t => (t === "tok" ? { id: UID } : null),
    // Like the database function: the check and the count change happen in one step, with no gap between them.
    reserve: async (user, message, limit) => { if (used >= limit) return null; used++; calls.reserved.push({ user, message }); return "row-" + used; },
    ask: async (model, system, message) => { calls.ask.push({ model, system, message }); return { text: "Try eggs and plantain.", inputTokens: 50, outputTokens: 20 }; },
    finish: async (id, row) => { calls.log.push({ id, ...row }); },
    ...over,
  };
  return { deps, calls };
}
const run = async (body, f, token) => { const r = await handle(post(body, token), f.deps); return { status: r.status, body: await r.json() }; };

test("a normal question goes to the small model with the system prompt and is logged", async () => {
  const f = fake(); const r = await run({ message: "What is a good high-protein breakfast?" }, f);
  assert.equal(r.status, 200); assert.equal(r.body.reply, "Try eggs and plantain."); assert.equal(r.body.flagged, false);
  assert.equal(f.calls.ask[0].model, SMALL_MODEL); assert.equal(f.calls.ask[0].system, SYSTEM_PROMPT);
  assert.equal(f.calls.log.length, 1);
  assert.deepEqual([f.calls.reserved[0].user, f.calls.log[0].route, f.calls.log[0].model, f.calls.log[0].input_tokens, f.calls.log[0].output_tokens], [UID, "small", SMALL_MODEL, 50, 20]);
  assert.equal(f.calls.log[0].id, "row-1"); assert.equal(f.calls.reserved[0].message, "What is a good high-protein breakfast?");
});

test("planning questions use the big model", async () => {
  const f = fake(); await run({ message: "Give me a 7-day push/pull/legs plan." }, f);
  assert.equal(f.calls.ask[0].model, BIG_MODEL); assert.equal(f.calls.log[0].route, "big");
});

test("red-flag medical messages get the fixed reply and never reach the model", async () => {
  for (const m of ["My chest hurts when I bench, what's wrong?", "I feel like I'm going to pass out after cardio", "I can't breathe properly when I run", "I want to kill myself", "how do I make myself throw up after eating", "there is blood in my urine"]) {
    const f = fake(); const r = await run({ message: m }, f);
    assert.equal(r.body.reply, SAFE_REPLY, m); assert.equal(r.body.flagged, true); assert.equal(f.calls.ask.length, 0, m);
    assert.equal(f.calls.log[0].route, "redflag"); assert.equal(f.calls.log[0].model, null);
  }
});

test("everyday fitness words are not mistaken for red flags", async () => {
  for (const m of ["What's a good post-workout meal?", "How do I build chest strength?", "Is plantain good before a run?"]) {
    const f = fake(); await run({ message: m }, f); assert.equal(f.calls.ask.length, 1, m);
  }
});

test("no token, a bad token, or a bad body is refused before anything else runs", async () => {
  for (const [body, token, status] of [[{ message: "hi" }, null, 401], [{ message: "hi" }, "bad", 401], [{}, "tok", 400], [{ message: "   " }, "tok", 400], [{ message: 5 }, "tok", 400], [{ message: "x".repeat(1001) }, "tok", 400]]) {
    const f = fake(); const r = await run(body, f, token);
    assert.equal(r.status, status); assert.equal(f.calls.ask.length, 0); assert.equal(f.calls.log.length, 0);
  }
  const g = await handle(new Request("https://x.test/", { method: "GET" }), fake().deps); assert.equal(g.status, 405);
});

test("the person is the one the token names, whatever the body says", async () => {
  const f = fake(); await run({ message: "hi", user_id: "99999999-2222-3333-4444-555555555555" }, f);
  assert.equal(f.calls.reserved[0].user, UID);
});

test("the hourly limit stops the model call, and a failed reservation does too", async () => {
  let f = fake({ used: 30 }); let r = await run({ message: "hi" }, f);
  assert.equal(r.status, 429); assert.equal(r.body.state, "rate_limited"); assert.equal(f.calls.ask.length, 0);
  f = fake({ reserve: async () => { throw new Error("db down"); } }); r = await run({ message: "hi" }, f);
  assert.equal(r.status, 500); assert.equal(f.calls.ask.length, 0);
});

test("ten simultaneous requests with one slot left make exactly one model call", async () => {
  const f = fake({ used: 29, ask: async () => { await new Promise(r => setTimeout(r, 20)); return { text: "ok", inputTokens: 1, outputTokens: 1 }; } });
  const rs = await Promise.all(Array.from({ length: 10 }, () => run({ message: "hi" }, f)));
  assert.equal(rs.filter(r => r.status === 200).length, 1); assert.equal(rs.filter(r => r.status === 429).length, 9);
});

test("without the consent flag nothing is reserved or sent", async () => {
  for (const consent of [undefined, false, "true", 1]) {
    const f = fake(); const r = await run({ message: "hi", consent }, f);
    assert.equal(r.status, 403); assert.equal(r.body.state, "consent_required"); assert.equal(f.calls.reserved.length, 0); assert.equal(f.calls.ask.length, 0);
  }
});

test("a model failure returns a plain error, logs it, and leaks no detail", async () => {
  const f = fake({ ask: async () => { throw new Error("model http 529 secret-detail"); } }); const r = await run({ message: "hi" }, f);
  assert.equal(r.status, 502); assert.deepEqual(r.body, { state: "error" });
  assert.match(f.calls.log[0].error, /529/); assert.equal(f.calls.log[0].reply, "");
});

test("a log update failure keeps the answer, and the reserved slot still counts", async () => {
  const f = fake({ used: 28, finish: async () => { throw new Error("db down"); } });
  let r = await run({ message: "hi" }, f); assert.equal(r.status, 200); assert.equal(r.body.reply, "Try eggs and plantain.");
  r = await run({ message: "hi" }, f); assert.equal(r.status, 200);
  r = await run({ message: "hi" }, f); assert.equal(r.status, 429); assert.equal(f.calls.ask.length, 2);
});

test("the system prompt covers the starter evals: scope, no invented numbers, extreme diets, West African food", () => {
  for (const s of [/only talk about training/i, /can't see/i, /Never invent a number/i, /1,200 kcal/, /fufu/, /doctor/i]) assert.match(SYSTEM_PROMPT, s);
});

test("CORS is only allowed for the app's own origins", async () => {
  const f = fake(); const ok = await handle(post({ message: "hi" }), f.deps); assert.equal(ok.headers.get("access-control-allow-origin"), "https://wholelife-hub.vercel.app");
  const bad = await handle(new Request("https://x.test/", { method: "POST", headers: { origin: "https://evil.example", authorization: "Bearer tok" }, body: JSON.stringify({ message: "hi", consent: true }) }), f.deps);
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
});
