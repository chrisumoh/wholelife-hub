// Fake supabase-js for browser tests: in-memory tables, owner-only access, a small private storage bucket.
// It keeps updated_at the way the database does (every insert and update stamps a later time) and supports the filters,
// ordering and paging the app uses, so sync tests behave like the real thing.
// Two modes: by default the tables live in this page's localStorage; when the test harness has defined window.__rpcCall
// (account-sync.mjs does, with one Node-side database shared by several browser contexts), every operation locks, loads and
// saves that shared database instead.
(() => {
  const K = "__fakedb", KS = "__fakesess", REMOTE = typeof window.__rpcCall === "function";
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || { people: [], meal_logs: [] }; } catch { return { people: [], meal_logs: [] }; } };
  const LOCAL = REMOTE ? { people: [], meal_logs: [] } : load(); const saveLocal = () => localStorage.setItem(K, JSON.stringify(LOCAL));
  let session = null; try { session = JSON.parse(localStorage.getItem(KS)); } catch {}
  const subs = []; let n = 0, last = 0;
  const stamp = () => { last = Math.max(Date.now(), last + 1); return new Date(last).toISOString(); };
  const F = window.__fake = { DB: LOCAL, offline: false, calls: [], expireNow() { session = null; localStorage.removeItem(KS); subs.forEach(cb => cb("SIGNED_OUT", null)); }, stamp };
  const fire = (ev) => subs.forEach(cb => cb(ev, session));
  // run fn(DB, markChanged) against the database, whichever mode it is
  const exec = async fn => {
    if (!REMOTE) { let dirty = false; const out = fn(LOCAL, () => { dirty = true; }); if (dirty) saveLocal(); return out; }
    const db = JSON.parse(await window.__rpcCall({ op: "lock" })); let dirty = false;
    try { return fn(db, () => { dirty = true; }); } finally { await window.__rpcCall({ op: "unlock", db: dirty ? JSON.stringify(db) : null }); }
  };
  const table = (DB, name) => (DB[name] ||= []);
  const from = name => {
    let op = "select", payload, conflict, filters = [], orders = [], rng = null, sel = false, lim = null;
    const uid = () => session?.user?.id;
    const run = async () => {
      F.calls.push([name, op]);
      if (F.offline) throw new TypeError("Failed to fetch");
      if (!uid()) return { data: null, error: { message: "no session", code: "401" } };
      if (F.failWrites && op !== "select") return { data: null, error: { message: "simulated write failure", code: "500" } };
      if (F.failReads && op === "select") return { data: null, error: { message: "simulated read failure", code: "500" } };
      return exec((DB, mark) => {
        const rows = table(DB, name), mine = rows.filter(r => r.owner_id === uid() && filters.every(f => f(r)));
        if (op === "select") {
          let out = mine.slice();
          if (orders.length) out.sort((a, b) => { for (const c of orders) { const x = a[c] ?? "", y = b[c] ?? ""; if (x < y) return -1; if (x > y) return 1; } return 0; });
          if (rng) out = out.slice(rng[0], rng[1] + 1); else if (lim != null) out = out.slice(0, lim);
          return { data: JSON.parse(JSON.stringify(out)), error: null };
        }
        if (op === "update") { const t = stamp(); mine.forEach(r => Object.assign(r, payload, { updated_at: t })); mark(); return { data: null, error: null }; }
        if (op === "delete") { DB[name] = rows.filter(r => !mine.includes(r)); mark(); return { data: null, error: null }; }
        const out = [], keys = (conflict || "owner_id,app_id").split(",");
        for (const p of payload) {
          if (p.owner_id !== uid()) return { data: null, error: { message: "new row violates row-level security policy", code: "42501" } };
          if (name !== "people" && !DB.people.some(x => x.id === p.person_id && x.owner_id === uid())) return { data: null, error: { message: "rls: person not owned", code: "42501" } };
          let r = rows.find(x => keys.every(k => x[k] === p[k]));
          const t = stamp();
          if (r) Object.assign(r, p, { updated_at: t }); else { r = { id: "id" + (++n) + "_" + Math.random().toString(36).slice(2, 8), deleted_at: null, ...p, updated_at: t }; rows.push(r); }
          out.push(r);
        }
        mark(); return { data: sel ? JSON.parse(JSON.stringify(out)) : null, error: null };
      });
    };
    const b = {
      upsert(r, o) { op = "upsert"; payload = Array.isArray(r) ? r : [r]; conflict = o?.onConflict; return b; },
      update(p) { op = "update"; payload = p; return b; },
      delete() { op = "delete"; return b; },
      select() { if (op === "upsert") sel = true; else op = "select"; return b; },
      in(c, v) { filters.push(r => v.includes(r[c])); return b; },
      is(c, v) { filters.push(r => (r[c] ?? null) === v); return b; },
      eq(c, v) { filters.push(r => r[c] === v); return b; },
      gte(c, v) { (F.gtes ||= []).push([name, c]); filters.push(r => (r[c] ?? "") >= v); return b; },
      gt(c, v) { filters.push(r => (r[c] ?? "") > v); return b; },
      order(c) { orders.push(c); return b; }, range(a, z) { rng = [a, z]; return b; }, limit(x) { lim = x; return b; },
      then(res, rej) { return run().then(res, rej); }
    };
    return b;
  };
  // storage: one private bucket; a path may only start with the signed-in account's id (like the bucket's policies)
  const bucket = () => ({
    async upload(path, blob, opts) {
      if (F.offline) throw new TypeError("Failed to fetch");
      if (!session || !path.startsWith(session.user.id + "/")) return { data: null, error: { message: "new row violates row-level security policy", statusCode: "403" } };
      if (F.failWrites) return { data: null, error: { message: "simulated write failure", statusCode: "500" } };
      const buf = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (const x of buf) s += String.fromCharCode(x);
      return exec((DB, mark) => {
        const files = (DB.__files ||= {});
        if (files[path] && !opts?.upsert) return { data: null, error: { message: "The resource already exists", statusCode: "409" } };
        files[path] = { b64: btoa(s), type: blob.type, size: buf.length, at: stamp() }; mark(); (F.uploads ||= []).push({ path, size: buf.length, type: blob.type });
        return { data: { path }, error: null };
      });
    },
    async download(path) {
      if (F.offline) throw new TypeError("Failed to fetch");
      if (F.failDownload) return { data: null, error: { message: "simulated download failure", statusCode: "500" } };
      return exec(DB => {
        const f = (DB.__files ||= {})[path]; if (!session || !path.startsWith(session.user.id + "/") || !f) return { data: null, error: { message: "Object not found", statusCode: "404" } };
        const bin = atob(f.b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return { data: new Blob([a], { type: f.type }), error: null };
      });
    },
    async remove(paths) {
      if (F.offline) throw new TypeError("Failed to fetch");
      if (F.failRemove) return { data: null, error: { message: "simulated delete failure", statusCode: "500" } };
      return exec((DB, mark) => { const files = (DB.__files ||= {}); for (const p of paths) if (session && p.startsWith(session.user.id + "/")) delete files[p]; mark(); return { data: [], error: null }; });
    }
  });
  const mk = email => ({ id: "u_" + email.replace(/[^a-z0-9]/g, ""), email });
  const client = {
    from,
    storage: { from: () => bucket() },
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange(cb) { subs.push(cb); setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        if (password !== "password1") return { data: null, error: { code: "invalid_credentials", message: "bad" } };
        session = { user: mk(email) }; localStorage.setItem(KS, JSON.stringify(session)); fire("SIGNED_IN"); return { data: { session }, error: null };
      },
      async signUp({ email, options }) { (window.__signUps ||= []).push({ email, options }); return { data: { user: mk(email), session: null }, error: null }; },
      async signOut() { session = null; localStorage.removeItem(KS); fire("SIGNED_OUT"); return { error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser() { return { data: {}, error: null }; }
    }
  };
  window.supabase = { createClient: () => client };
})();
