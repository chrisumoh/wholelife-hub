// Account deletion. Supabase gives edge functions SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY itself: nothing to set, and the key
// never reaches the app or the repo. Deploy with --no-verify-jwt (the handler checks the token). See handler.ts.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { handle, type Admin } from "./handler.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

const admin: Admin = {
  getUser: async (token) => { const { data, error } = await sb.auth.getUser(token); return error || !data.user ? null : { id: data.user.id }; },
  list: async (prefix, offset) => {
    const { data, error } = await sb.storage.from("photos").list(prefix, { limit: 100, offset });
    return error || !data ? null : data.map((e) => ({ name: e.name, isFolder: e.id === null }));
  },
  remove: async (paths) => !(await sb.storage.from("photos").remove(paths)).error,
  deleteUser: async (id) => !(await sb.auth.admin.deleteUser(id)).error,
};

Deno.serve((req) => handle(req, admin));
