// WL Coach (phase 1). Secrets: ANTHROPIC_API_KEY (set it with `supabase secrets set`, never commit it). Supabase supplies
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY itself. Deploy with --no-verify-jwt (handler.ts checks the token).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { handle, MAX_TOKENS_OUT, buildContext, contextAllowed, replyText, type Deps } from "./handler.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

const deps: Deps = {
  // A rejected token (4xx) means signed out; anything else (network, 5xx) is the auth service failing, which must not look like an expired sign-in.
  getUser: async (token) => {
    const { data, error } = await sb.auth.getUser(token);
    if (error) { const st = (error as { status?: number }).status ?? 0; if (st >= 400 && st < 500) return null; throw error; }
    return data.user ? { id: data.user.id } : null;
  },
  ready: () => !!KEY,
  reserve: async (id, message, limit) => {
    const { data, error } = await sb.rpc("coach_reserve", { p_user: id, p_message: message, p_limit: limit });
    if (error) throw error;
    const r = Array.isArray(data) ? data[0] : data;
    if (r?.status === "ok" && typeof r.log_id === "string") return { status: "ok", id: r.log_id };
    if (r?.status === "rate_limited" || r?.status === "consent_required") return { status: r.status };
    throw new Error("unexpected reserve result");
  },
  ask: async (model, system, message, signal, opts) => {
    if (!KEY) throw new Error("not_configured");
    // Recipe questions get Anthropic's web search tool (at most 2 searches, billed per search), so links are real pages.
    const tools = opts?.search ? [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }] : undefined;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS_OUT, system, messages: [{ role: "user", content: message }], ...(tools ? { tools } : {}) }),
    });
    if (!r.ok) throw new Error(`provider_http_${r.status}`);
    const j = await r.json();
    return { text: replyText(j.content), inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 };
  },
  // Reads with the service key, so every query is pinned to this account (owner_id) and, for logs, to the one profile it owns.
  context: async (uid, person) => {
    const { data: c, error: ce } = await sb.from("ai_coach_consent").select("version, withdrawn_at").eq("user_id", uid).maybeSingle();
    if (ce) throw ce;
    if (!c || c.withdrawn_at || !contextAllowed(c.version)) return null;
    let q = sb.from("people").select("id, goal, age, height_cm, weight_kg, calorie_target, workouts_per_week, cultural_background, allergies, nutrition_preferences")
      .eq("owner_id", uid).is("deleted_at", null);
    q = person ? q.eq("app_id", person) : q.order("is_primary", { ascending: false }).order("created_at", { ascending: true });
    const { data: ppl, error: pe } = await q.limit(1);
    if (pe) throw pe;
    const p = ppl?.[0]; if (!p) return null;
    // log_date is the person's own calendar day; 8 days back from the server's date covers their last 7 in any time zone.
    const since = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
    const rows = (t: string, cols: string, n: number) => sb.from(t).select(cols).eq("owner_id", uid).eq("person_id", p.id).is("deleted_at", null)
      .gte("log_date", since).order("log_date", { ascending: false }).limit(n);
    const [m, s, w, kg] = await Promise.all([rows("meal_logs", "log_date, name, calories, est", 50), rows("snack_logs", "log_date, name, calories, qty", 30),
      rows("workouts", "log_date, type, duration_min", 20), rows("weight_entries", "log_date, weight_kg", 7)]);
    for (const x of [m, s, w, kg]) if (x.error) throw x.error;
    return buildContext({ person: p, meals: m.data || [], snacks: s.data || [], workouts: w.data || [], weights: kg.data || [] });
  },
  finish: async (id, row) => { const { error } = await sb.from("ai_coach_logs").update(row).eq("id", id); if (error) throw error; },
};

Deno.serve((req) => handle(req, deps));
