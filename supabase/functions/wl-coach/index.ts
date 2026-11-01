// WL Coach (phase 1). Secrets: ANTHROPIC_API_KEY (set it with `supabase secrets set`, never commit it). Supabase supplies
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY itself. Deploy with --no-verify-jwt (handler.ts checks the token).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { handle, MAX_TOKENS_OUT, type Deps } from "./handler.ts";

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
  ask: async (model, system, message, signal) => {
    if (!KEY) throw new Error("not_configured");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS_OUT, system, messages: [{ role: "user", content: message }] }),
    });
    if (!r.ok) throw new Error(`provider_http_${r.status}`);
    const j = await r.json();
    const text = (j.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
    return { text, inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 };
  },
  finish: async (id, row) => { const { error } = await sb.from("ai_coach_logs").update(row).eq("id", id); if (error) throw error; },
};

Deno.serve((req) => handle(req, deps));
