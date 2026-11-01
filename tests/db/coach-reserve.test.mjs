import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Run from the repo root against a DISPOSABLE PostgreSQL (never Supabase, never production):
//   PGHOST=/tmp/pgsock PGPORT=54329 PGUSER=postgres node --test tests/db/coach-reserve.test.mjs
// It creates its own throwaway database, applies the two coach migrations to it, and drops it at the end. Without PGHOST the file skips.
// Why it exists: tests/wl-coach-handler.test.mjs uses a JavaScript pretend for coach_reserve, which cannot prove the SQL's locking or privileges.
// Supabase's roles are rebuilt here (anon, authenticated, service_role with BYPASSRLS, default grants on new public objects) so that the
// migration's REVOKEs are what is being tested, not an empty default.
const HOST = process.env.PGHOST || "";
const local = !HOST || HOST.startsWith("/") || /^(localhost|127\.0\.0\.1|::1)$/.test(HOST);
const skip = !HOST ? "set PGHOST (and PGPORT/PGUSER) to a disposable local Postgres to run the database tests"
  : !local || /supabase|pooler|amazonaws|neon\.tech/i.test(HOST + (process.env.PGDATABASE || "")) ? "refusing: PGHOST must be a local disposable Postgres" : false;
const DB = "wlh_coach_test_" + process.pid;
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const mig = n => readFileSync(`${REPO}supabase/migrations/${n}`, "utf8");
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002", C = "cccccccc-0000-4000-8000-000000000003";

const base = ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-F", "|"];
function psql(db, sql) {
  const r = spawnSync("psql", [...base, "-d", db, "-c", sql], { encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const psqlAsync = (db, sql) => new Promise(res => {
  const p = spawn("psql", [...base, "-d", db, "-c", sql], { stdio: ["ignore", "pipe", "pipe"] }); let out = "", err = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
  p.on("close", code => res({ ok: code === 0, out: out.trim(), err: err.trim() }));
});
const q = sql => psql(DB, sql);
const must = r => { assert.ok(r.ok, r.err); return r.out; };
// Runs SQL as a Supabase role; `sub` is the signed-in user (the JWT sub claim that auth.uid() reads).
const as = (role, sql, sub = "") => `set role ${role}; set request.jwt.claim.sub = '${sub}'; ${sql}`;
const reserve = (user, msg = "hi", limit = 30) => `select status || '|' || coalesce(log_id::text, '') from public.coach_reserve('${user}', '${msg}', ${limit})`;
const seed = (user, n, ago = "0 seconds") => must(q(`insert into public.ai_coach_logs (user_id, message, route, created_at) select '${user}', 'm', 'small', now() - interval '${ago}' from generate_series(1, ${n})`));
const consent = user => must(q(`insert into public.ai_coach_consent (user_id, version) values ('${user}', 't') on conflict (user_id) do update set withdrawn_at = null`));
const count = user => Number(must(q(`select count(*) from public.ai_coach_logs where user_id = '${user}'`)));
const reset = () => { must(q(`truncate public.ai_coach_logs, public.ai_coach_consent`)); for (const u of [A, B, C]) consent(u); };

test.before(() => {
  if (skip) return;
  const c = psql("postgres", `create database ${DB}`); assert.ok(c.ok, c.err);
  must(q(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    grant anon, authenticated, service_role to current_user;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    -- what Supabase does to everything created in public: hand it to the API roles, so the migration's REVOKEs are doing the work
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    insert into auth.users values ('${A}'), ('${B}'), ('${C}');
  `));
  must(q(mig("20261030120000_wlh_8_4_1_ai_coach_logs.sql")));
  must(q(mig("20261101120000_wlh_8_4_3_ai_coach_consent.sql")));
});
test.after(() => { if (!skip) psql("postgres", `drop database if exists ${DB} with (force)`); });

test("ten independent connections racing for the last slot: exactly one gets it", { skip }, async () => {
  reset(); seed(A, 29);
  // Each connection holds its transaction open briefly so all ten really contend for the per-person lock.
  const one = () => psqlAsync(DB, `begin; ${as("service_role", reserve(A))}; select pg_sleep(0.25); commit`);
  const rs = await Promise.all(Array.from({ length: 10 }, one));
  for (const r of rs) assert.ok(r.ok, r.err);
  const st = rs.map(r => r.out.split("\n").find(l => /^(ok|rate_limited|consent_required)\|/.test(l)).split("|")[0]);
  assert.equal(st.filter(s => s === "ok").length, 1, st.join());
  assert.equal(st.filter(s => s === "rate_limited").length, 9, st.join());
  assert.equal(count(A), 30);
  assert.equal(Number(must(q(`select count(*) from public.ai_coach_logs where user_id = '${A}' and route = 'pending'`))), 1);
});

test("separate people do not share a limit or block each other", { skip }, async () => {
  reset(); seed(A, 30); seed(B, 29);
  const one = u => psqlAsync(DB, `begin; ${as("service_role", reserve(u))}; select pg_sleep(0.2); commit`);
  const rs = await Promise.all([A, A, A, B, B, B, C, C].map(one));
  const st = (rs.map((r, i) => (assert.ok(r.ok, r.err), r.out.split("\n").find(l => /\|/.test(l)).split("|")[0])));
  assert.deepEqual(st.slice(0, 3), ["rate_limited", "rate_limited", "rate_limited"]);   // A is full
  assert.equal(st.slice(3, 6).filter(s => s === "ok").length, 1);                       // B had one slot
  assert.equal(st.slice(6).filter(s => s === "ok").length, 2);                          // C had plenty
  assert.deepEqual([count(A), count(B), count(C)], [30, 30, 2]);
});

test("the limit is a rolling hour: rows older than an hour stop counting, newer ones do not", { skip }, () => {
  reset(); seed(A, 30, "1 hour 1 second");
  assert.match(must(q(as("service_role", reserve(A)))), /^ok\|/, "30 rows just over an hour old leave the person free to ask");
  reset(); seed(A, 30, "59 minutes 55 seconds");
  assert.match(must(q(as("service_role", reserve(A)))), /^rate_limited\|/, "30 rows just under an hour old still fill the limit");
  reset(); seed(A, 15, "2 hours"); seed(A, 29, "30 minutes");
  assert.match(must(q(as("service_role", reserve(A)))), /^ok\|/, "29 recent plus old ones leaves exactly one slot");
  assert.match(must(q(as("service_role", reserve(A)))), /^rate_limited\|/);
});

test("a reservation that fails stores nothing and does not wedge the person's lock", { skip }, () => {
  reset(); seed(A, 5);
  const tooLong = q(as("service_role", reserve(A, "x".repeat(1001))));
  assert.equal(tooLong.ok, false); assert.match(tooLong.err, /ai_coach_logs_message_check|check constraint/);
  assert.equal(count(A), 5, "the failed insert left no row behind");
  assert.match(must(q(as("service_role", `select status || '|' from public.coach_reserve(null, 'hi', 30)`))), /^consent_required\|/, "a null person can never reserve");
  assert.equal(Number(must(q(`select count(*) from public.ai_coach_logs where user_id is null`))), 0);
  assert.match(must(q(as("service_role", reserve(A)))), /^ok\|/, "the lock was released with the failed transaction");
  assert.equal(count(A), 6);
});

test("a failed final update leaves the pending row in place and it still counts", { skip }, () => {
  reset(); seed(A, 29);
  const id = must(q(as("service_role", reserve(A)))).split("|")[1];
  const bad = q(as("service_role", `update public.ai_coach_logs set reply = '${"x".repeat(8001)}', route = 'small' where id = '${id}'`));
  assert.equal(bad.ok, false, "a reply over 8000 characters is refused by the table");
  assert.equal(must(q(`select route from public.ai_coach_logs where id = '${id}'`)), "pending");
  assert.match(must(q(as("service_role", reserve(A)))), /^rate_limited\|/, "the unfinished row still uses its slot");
});

test("no consent, or withdrawn consent, means no slot is taken", { skip }, () => {
  reset(); must(q(`delete from public.ai_coach_consent where user_id = '${A}'`));
  assert.match(must(q(as("service_role", reserve(A)))), /^consent_required\|/); assert.equal(count(A), 0);
  consent(A); assert.match(must(q(as("service_role", reserve(A)))), /^ok\|/);
  must(q(`update public.ai_coach_consent set withdrawn_at = now() where user_id = '${A}'`));
  assert.match(must(q(as("service_role", reserve(A)))), /^consent_required\|/); assert.equal(count(A), 1);
  // consent is per account: B's consent does not cover A
  assert.match(must(q(as("service_role", reserve(B)))), /^ok\|/);
});

test("the consent function acts only on the signed-in person, and withdrawing blocks the next reservation", { skip }, () => {
  reset(); must(q(`truncate public.ai_coach_consent`));
  must(q(as("authenticated", `select public.coach_consent_set(true, 'v1')`, A)));
  assert.equal(must(q(`select user_id::text || '|' || version || '|' || (withdrawn_at is null) from public.ai_coach_consent`)), `${A}|v1|true`);
  assert.match(must(q(as("service_role", reserve(A)))), /^ok\|/);
  assert.match(must(q(as("service_role", reserve(B)))), /^consent_required\|/, "A's consent is not B's");
  // B withdrawing (or granting) cannot touch A's row, and there is no argument to name another person
  must(q(as("authenticated", `select public.coach_consent_set(false, 'v1')`, B)));
  assert.equal(must(q(`select (withdrawn_at is null)::text from public.ai_coach_consent where user_id = '${A}'`)), "true");
  must(q(as("authenticated", `select public.coach_consent_set(false, 'v1')`, A)));
  assert.match(must(q(as("service_role", reserve(A)))), /^consent_required\|/, "withdrawal takes effect on the very next call, whatever tab sent it");
  must(q(as("authenticated", `select public.coach_consent_set(true, 'v2')`, A)));
  assert.match(must(q(as("service_role", reserve(A)))), /^ok\|/);
  assert.equal(must(q(`select version from public.ai_coach_consent where user_id = '${A}'`)), "v2");
  const anon = q(as("anon", `select public.coach_consent_set(true, 'v1')`)); assert.equal(anon.ok, false); assert.match(anon.err, /permission denied/);
  const none = q(as("authenticated", `select public.coach_consent_set(true, 'v1')`, "")); assert.equal(none.ok, false); assert.match(none.err, /not signed in/);
});

test("privileges: only the service role can reserve; the API roles cannot write the tables", { skip }, () => {
  reset();
  for (const role of ["anon", "authenticated"]) {
    const r = q(as(role, reserve(A), A)); assert.equal(r.ok, false, role); assert.match(r.err, /permission denied for function coach_reserve/, role);
    for (const sql of [
      `insert into public.ai_coach_logs (user_id, message, route) values ('${A}', 'x', 'small')`,
      `update public.ai_coach_logs set reply = 'x'`, `delete from public.ai_coach_logs`,
      `insert into public.ai_coach_consent (user_id, version) values ('${A}', 'x')`,
      `update public.ai_coach_consent set withdrawn_at = null`, `delete from public.ai_coach_consent`,
    ]) { const w = q(as(role, sql, A)); assert.equal(w.ok, false, `${role}: ${sql}`); assert.match(w.err, /permission denied/, `${role}: ${sql}`); }
  }
  assert.match(must(q(as("service_role", reserve(A)))), /^ok\|/);
  must(q(as("service_role", `update public.ai_coach_logs set reply = 'fine', route = 'small' where user_id = '${A}'`)));
});

test("people read only their own logs and consent rows; signed-out callers read nothing", { skip }, () => {
  reset(); seed(A, 3); seed(B, 2);
  assert.equal(must(q(as("authenticated", `select count(*) from public.ai_coach_logs`, A))), "3");
  assert.equal(must(q(as("authenticated", `select count(*) from public.ai_coach_logs`, B))), "2");
  assert.equal(must(q(as("authenticated", `select count(*) from public.ai_coach_logs where user_id = '${B}'`, A))), "0");
  assert.equal(must(q(as("authenticated", `select count(*) from public.ai_coach_consent`, A))), "1");
  assert.equal(must(q(as("authenticated", `select count(*) from public.ai_coach_logs`, ""))), "0", "no sub claim, no rows");
  for (const t of ["ai_coach_logs", "ai_coach_consent"]) { const r = q(as("anon", `select count(*) from public.${t}`)); assert.equal(r.ok, false, t); assert.match(r.err, /permission denied/, t); }
});

test("RLS is on for both tables, and the functions are security definer with an empty search_path", { skip }, () => {
  assert.equal(must(q(`select string_agg(relname || ':' || relrowsecurity, ',' order by relname) from pg_class where relname in ('ai_coach_logs','ai_coach_consent')`)), "ai_coach_consent:true,ai_coach_logs:true");
  assert.equal(must(q(`select string_agg(proname || ':' || prosecdef || ':' || coalesce(array_to_string(proconfig, ';'), ''), ',' order by proname) from pg_proc where proname in ('coach_reserve','coach_consent_set')`)),
    "coach_consent_set:true:search_path=\"\",coach_reserve:true:search_path=\"\"");
});

test("the second migration also works on a project that never ran an older coach_reserve shape (fresh order) and is the only coach_reserve left", { skip }, () => {
  assert.equal(must(q(`select count(*) from pg_proc where proname = 'coach_reserve'`)), "1");
});
