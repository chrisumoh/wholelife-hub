// The licence check itself, with the environment and fetch passed in so tests/license-handler.test.mjs can drive it in Node.
// Anything that is not a clear answer from Lemon Squeezy (a timeout, 429, 5xx, a non-JSON body) is state "error", which the
// app treats as "unknown, keep what you have". Only an explicit rejection is "invalid" or "expired".
import { keyState, planOf, receiptOf } from "./logic.ts";

const LS = "https://api.lemonsqueezy.com/v1";
const ORIGIN = /^(https:\/\/wholelife-hub[a-z0-9-]*\.vercel\.app|http:\/\/(localhost|127\.0\.0\.1):\d+)$/;

const cors = (req: Request) => {
  const o = req.headers.get("origin") || "";
  return ORIGIN.test(o)
    ? { "access-control-allow-origin": o, "access-control-allow-headers": "content-type, apikey", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" }
    : {};
};
const reply = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(req) } });

type Fetch = typeof fetch;
// Lemon Squeezy answers 200, or 400/404/422 with a JSON reason, when it has judged the key; anything else is not a verdict.
async function lsLicense(fetchFn: Fetch, path: "activate" | "validate", form: Record<string, string>) {
  try {
    const r = await fetchFn(`${LS}/licenses/${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
    });
    if (![200, 400, 404, 422].includes(r.status)) return null;
    const d = await r.json();
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}

export async function handle(req: Request, env: (k: string) => string | undefined, fetchFn: Fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, { state: "error" }, 405);

  const apiKey = env("LEMONSQUEEZY_API_KEY"), storeId = env("LEMONSQUEEZY_STORE_ID");
  const monthlyId = env("LEMONSQUEEZY_PRODUCT_ID_MONTHLY"), yearlyId = env("LEMONSQUEEZY_PRODUCT_ID_YEARLY");
  if (!apiKey || !storeId || !monthlyId || !yearlyId) return reply(req, { state: "error" }, 500);
  const allowTest = env("LEMONSQUEEZY_ALLOW_TEST") === "1";

  let body: { key?: unknown; instance?: unknown; check?: unknown } = {};
  try { body = await req.json(); } catch { return reply(req, { state: "error" }, 400); }
  const key = typeof body.key === "string" ? body.key.trim() : "", instance = typeof body.instance === "string" ? body.instance.trim() : "";
  if (!key || key.length > 64 || instance.length > 64) return reply(req, { state: "invalid" });

  // Known device or a re-check: validate. A new device: activate, which uses one of the key's seats.
  const activating = !instance && body.check !== true;
  const d = activating
    ? await lsLicense(fetchFn, "activate", { license_key: key, instance_name: "Whole Life Hub" })
    : await lsLicense(fetchFn, "validate", instance ? { license_key: key, instance_id: instance } : { license_key: key });
  if (!d) return reply(req, { state: "error" });

  if (activating && !d.activated && /limit/i.test(String(d.error || ""))) return reply(req, { state: "limit" });
  // No licence in the answer: a reason string is a real rejection, anything else is not a verdict.
  if (!d.license_key) return reply(req, { state: typeof d.error === "string" ? "invalid" : "error" });
  const plan = planOf(d.meta, storeId, monthlyId, yearlyId);
  if (!plan) return reply(req, { state: "invalid" });
  const state = keyState(d.license_key, allowTest);
  // A seat check needs Lemon Squeezy to confirm that exact device; without a device id the key's own status decides.
  const confirmed = activating ? d.activated : instance ? d.valid : true;
  if (state !== "valid" || !confirmed) return reply(req, { state: state === "valid" ? "invalid" : state });

  const out: Record<string, unknown> = {
    state: "valid",
    plan,
    expires: d.license_key.expires_at ? String(d.license_key.expires_at).slice(0, 10) : null,
    instance: d.instance?.id ?? instance ?? null,
  };
  if (activating && d.meta.order_id != null) {
    try {
      const r = await fetchFn(`${LS}/orders/${encodeURIComponent(String(d.meta.order_id))}`, {
        headers: { accept: "application/vnd.api+json", authorization: `Bearer ${apiKey}` },
      });
      if (r.ok) out.receipt = receiptOf((await r.json()).data);
    } catch { /* no receipt data: the app says so */ }
  }
  return reply(req, out);
}
