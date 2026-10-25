// Delete the signed-in person's account and everything synced under it. The caller is found from the access token, never from the
// request body, so a person can only ever delete themselves. Files go first: every table row is removed by the database when the
// auth user is deleted (all foreign keys to auth.users are on delete cascade), but files in the photos bucket are not rows.
// If anything fails before the user is deleted the account is left whole and the person can try again.
// Deploy with --no-verify-jwt: the token is checked here with admin.getUser(), which also covers the publishable-key setup.

const ORIGIN = /^(https:\/\/wholelife-hub[a-z0-9-]*\.vercel\.app|http:\/\/(localhost|127\.0\.0\.1):\d+)$/;
const MAX_FILES = 5000, MAX_DEPTH = 5, PAGE = 100;

const cors = (req: Request) => {
  const o = req.headers.get("origin") || "";
  return ORIGIN.test(o)
    ? { "access-control-allow-origin": o, "access-control-allow-headers": "authorization, content-type, apikey", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" }
    : {};
};
const reply = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(req) } });

// What the real Supabase admin client is wrapped into by index.ts, so tests can pass a pretend one.
export type Admin = {
  getUser: (token: string) => Promise<{ id: string } | null>;
  list: (prefix: string, offset: number) => Promise<{ name: string; isFolder: boolean }[] | null>;
  remove: (paths: string[]) => Promise<boolean>;
  deleteUser: (id: string) => Promise<boolean>;
};

// Every file under "<uid>/", however deep (layout is <uid>/<person>/<type>/<app id>.jpg). null means a listing failed.
async function filesUnder(admin: Admin, root: string): Promise<string[] | null> {
  const files: string[] = [];
  const walk = async (prefix: string, depth: number): Promise<boolean> => {
    if (depth > MAX_DEPTH) return false;
    for (let offset = 0; ; offset += PAGE) {
      const page = await admin.list(prefix, offset);
      if (!page) return false;
      for (const e of page) {
        if (e.isFolder) { if (!(await walk(`${prefix}/${e.name}`, depth + 1))) return false; }
        else files.push(`${prefix}/${e.name}`);
        if (files.length > MAX_FILES) return false;
      }
      if (page.length < PAGE) return true;
    }
  };
  return (await walk(root, 0)) ? files : null;
}

export async function handle(req: Request, admin: Admin): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, { state: "error" }, 405);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(req, { state: "unauthorized" }, 401);
  let body: { confirm?: unknown } = {};
  try { body = await req.json(); } catch { return reply(req, { state: "error" }, 400); }
  if (body.confirm !== "DELETE") return reply(req, { state: "error" }, 400);

  let user: { id: string } | null = null;
  try { user = await admin.getUser(token); } catch { user = null; }
  if (!user || !/^[0-9a-f-]{36}$/i.test(user.id)) return reply(req, { state: "unauthorized" }, 401);

  try {
    const files = await filesUnder(admin, user.id);
    if (!files) return reply(req, { state: "error" }, 500);
    for (let i = 0; i < files.length; i += 100) if (!(await admin.remove(files.slice(i, i + 100)))) return reply(req, { state: "error" }, 500);
    if (!(await admin.deleteUser(user.id))) return reply(req, { state: "error" }, 500);
  } catch {
    return reply(req, { state: "error" }, 500);
  }
  return reply(req, { state: "deleted" });
}
