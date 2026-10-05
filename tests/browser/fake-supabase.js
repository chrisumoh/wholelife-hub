// Fake supabase-js for browser tests: in-memory tables persisted in localStorage, owner-only access.
(() => {
  const K = "__fakedb", KS = "__fakesess";
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || { people: [], meal_logs: [] }; } catch { return { people: [], meal_logs: [] }; } };
  const DB = load(); const save = () => localStorage.setItem(K, JSON.stringify(DB));
  let session = null; try { session = JSON.parse(localStorage.getItem(KS)); } catch {}
  const subs = []; let n = 0;
  const F = window.__fake = { DB, offline: false, calls: [], expireNow() { session = null; localStorage.removeItem(KS); subs.forEach(cb => cb("SIGNED_OUT", null)); } };
  const fire = (ev) => subs.forEach(cb => cb(ev, session));
  const table = name => DB[name];
  const from = name => {
    let op = "select", payload, conflict, filters = [], sel = false;
    const uid = () => session?.user?.id;
    const run = () => {
      F.calls.push([name, op]);
      if (F.offline) return Promise.reject(new TypeError("Failed to fetch"));
      if (!uid()) return Promise.resolve({ data: null, error: { message: "no session", code: "401" } });
      const rows = table(name), mine = rows.filter(r => r.owner_id === uid() && filters.every(f => f(r)));
      if (op === "select") return Promise.resolve({ data: JSON.parse(JSON.stringify(mine)), error: null });
      if (op === "update") { mine.forEach(r => Object.assign(r, payload)); save(); return Promise.resolve({ data: null, error: null }); }
      const out = [];
      for (const p of payload) {
        if (p.owner_id !== uid()) return Promise.resolve({ data: null, error: { message: "new row violates row-level security policy", code: "42501" } });
        if (name === "meal_logs" && !DB.people.some(x => x.id === p.person_id && x.owner_id === uid())) return Promise.resolve({ data: null, error: { message: "rls: person not owned", code: "42501" } });
        let r = rows.find(x => x.owner_id === p.owner_id && x.app_id === p.app_id);
        if (r) Object.assign(r, p); else { r = { id: "id" + (++n) + "_" + Math.random().toString(36).slice(2, 8), deleted_at: null, ...p }; rows.push(r); }
        out.push(r);
      }
      save(); return Promise.resolve({ data: sel ? JSON.parse(JSON.stringify(out)) : null, error: null });
    };
    const b = {
      upsert(r, o) { op = "upsert"; payload = Array.isArray(r) ? r : [r]; conflict = o?.onConflict; return b; },
      update(p) { op = "update"; payload = p; return b; },
      select() { if (op === "upsert") sel = true; else op = "select"; return b; },
      in(c, v) { filters.push(r => v.includes(r[c])); return b; },
      is(c, v) { filters.push(r => (r[c] ?? null) === v); return b; },
      eq(c, v) { filters.push(r => r[c] === v); return b; },
      order() { return b; }, range() { return b; },
      then(res, rej) { return run().then(res, rej); }
    };
    return b;
  };
  const mk = email => ({ id: "u_" + email.replace(/[^a-z0-9]/g, ""), email });
  const client = {
    from,
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange(cb) { subs.push(cb); setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        if (password !== "password1") return { data: null, error: { code: "invalid_credentials", message: "bad" } };
        session = { user: mk(email) }; localStorage.setItem(KS, JSON.stringify(session)); fire("SIGNED_IN"); return { data: { session }, error: null };
      },
      async signUp({ email }) { return { data: { user: mk(email), session: null }, error: null }; },
      async signOut() { session = null; localStorage.removeItem(KS); fire("SIGNED_OUT"); return { error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser() { return { data: {}, error: null }; }
    }
  };
  window.supabase = { createClient: () => client };
})();
