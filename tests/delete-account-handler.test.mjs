import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../supabase/functions/delete-account/handler.ts";

// Run from the repo root:  node --test tests/delete-account-handler.test.mjs
// Build 8.3.32: drives the real delete-account handler with a pretend Supabase admin (made-up ids, no network).
const UID = "11111111-2222-3333-4444-555555555555", OTHER = "99999999-2222-3333-4444-555555555555";
const post = (body, token = "tok") => new Request("https://x.test/functions/v1/delete-account", { method: "POST", headers: { origin: "https://wholelife-hub.vercel.app", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
// A tree of files: { "<uid>": { "p1": { "meals": ["a.jpg"] } } }. Listing a path returns its folders and files, 100 at a time.
function fake(tree, over = {}) {
  const log = { removed: [], deleted: [], listed: [] };
  const at = prefix => prefix.split("/").reduce((n, k) => (n && typeof n === "object" ? n[k] : undefined), tree);
  const admin = {
    getUser: async t => (t === "tok" ? { id: UID } : t === "other" ? { id: OTHER } : null),
    list: async (prefix, offset) => { log.listed.push(prefix); const n = at(prefix); if (n === undefined) return []; const names = Array.isArray(n) ? n.map(x => ({ name: x, isFolder: false })) : Object.keys(n).map(k => ({ name: k, isFolder: true })); return names.slice(offset, offset + 100); },
    remove: async paths => { log.removed.push(...paths); return true; },
    deleteUser: async id => { log.deleted.push(id); return true; },
    ...over,
  };
  return { admin, log };
}
const TREE = { [UID]: { p1: { meals: ["a.jpg", "b.jpg"], avatar: ["c.jpg"] }, p2: { progress: ["d.jpg"] } }, [OTHER]: { p9: { meals: ["z.jpg"] } } };
const run = async (body, f, token) => { const r = await handle(post(body, token), f.admin); return { status: r.status, body: await r.json() }; };

test("deletes every file under the caller's folder, then the caller, and nothing of anyone else's", async () => {
  const f = fake(TREE); const r = await run({ confirm: "DELETE" }, f);
  assert.equal(r.body.state, "deleted");
  assert.deepEqual(f.log.removed.sort(), [`${UID}/p1/avatar/c.jpg`, `${UID}/p1/meals/a.jpg`, `${UID}/p1/meals/b.jpg`, `${UID}/p2/progress/d.jpg`].sort());
  assert.deepEqual(f.log.deleted, [UID]);
  assert.ok(f.log.listed.every(p => p.startsWith(UID)), "never lists another account's folder");
});

test("the account is the one the token names, whatever the body says", async () => {
  const f = fake(TREE); const r = await run({ confirm: "DELETE", id: OTHER, user_id: OTHER }, f, "other");
  assert.equal(r.body.state, "deleted"); assert.deepEqual(f.log.deleted, [OTHER]);
  assert.ok(f.log.removed.every(p => p.startsWith(OTHER + "/")));
});

test("no token, a bad token, a missing or wrong confirmation, or a GET deletes nothing", async () => {
  for (const [body, token, status] of [[{ confirm: "DELETE" }, null, 401], [{ confirm: "DELETE" }, "bad", 401], [{}, "tok", 400], [{ confirm: "delete" }, "tok", 400], [{ confirm: true }, "tok", 400]]) {
    const f = fake(TREE); const r = await run(body, f, token);
    assert.equal(r.status, status); assert.notEqual(r.body.state, "deleted"); assert.deepEqual(f.log.deleted, []); assert.deepEqual(f.log.removed, []);
  }
  const f = fake(TREE); assert.equal((await handle(new Request("https://x.test/f", { method: "GET" }), f.admin)).status, 405);
  const bad = await handle(new Request("https://x.test/f", { method: "POST", headers: { authorization: "Bearer tok" }, body: "not json" }), fake(TREE).admin);
  assert.equal(bad.status, 400);
});

test("a failed listing or file removal leaves the account whole so it can be retried", async () => {
  for (const over of [{ list: async () => null }, { remove: async () => false }, { list: async () => { throw new Error("down"); } }]) {
    const f = fake(TREE, over); const r = await run({ confirm: "DELETE" }, f);
    assert.equal(r.status, 500); assert.equal(r.body.state, "error"); assert.deepEqual(f.log.deleted, [], "the user is not deleted");
  }
});

test("if deleting the user fails after the files are gone, it reports an error and a retry works", async () => {
  const f = fake(TREE, { deleteUser: async () => false }); assert.equal((await run({ confirm: "DELETE" }, f)).status, 500);
  const g = fake({ [UID]: {} }); assert.equal((await run({ confirm: "DELETE" }, g)).body.state, "deleted", "an account with no files deletes cleanly");
});

test("a folder with more than 100 files is read page by page", async () => {
  const many = Array.from({ length: 250 }, (_, i) => `f${i}.jpg`);
  const f = fake({ [UID]: { p1: { meals: many } } }); await run({ confirm: "DELETE" }, f);
  assert.equal(f.log.removed.length, 250);
});

test("only the app's own sites get CORS headers", async () => {
  const ok = await handle(new Request("https://x.test/f", { method: "OPTIONS", headers: { origin: "https://wholelife-hub.vercel.app" } }), fake(TREE).admin);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://wholelife-hub.vercel.app");
  const no = await handle(new Request("https://x.test/f", { method: "OPTIONS", headers: { origin: "https://evil.example" } }), fake(TREE).admin);
  assert.equal(no.headers.get("access-control-allow-origin"), null);
});
