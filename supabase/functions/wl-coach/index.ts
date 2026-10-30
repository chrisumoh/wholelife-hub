// WL Coach (phase 1). Secrets: ANTHROPIC_API_KEY (set it with `supabase secrets set`, never commit it). Supabase supplies
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY itself. Deploy with --no-verify-jwt (handler.ts checks the token).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { handle, MAX_TOKENS_OUT, type Deps } from "./handler.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

const deps: Deps = {
  getUser: async (token) => { const { data, error } = await sb.auth.getUser(token); return error || !data.user ? null : { id: data.user.id }; },
  recentCount: async (id) => {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error } = await sb.from("ai_coach_logs").select("id", { count: "exact", head: true }).eq("user_id", id).gte("created_at", since);
    return error ? null : count ?? 0;
  },
  ask: async (model, system, message, signal) => {
    if (!KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS_OUT, system, messages: [{ role: "user", content: message }] }),
    });
    if (!r.ok) throw new Error(`model http ${r.status}`);
    const j = await r.json();
    const text = (j.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
    return { text, inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 };
  },
  log: async (row) => { const { error } = await sb.from("ai_coach_logs").insert(row); if (error) throw error; },
};

Deno.serve((req) => handle(req, deps));
