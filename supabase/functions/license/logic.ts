// Pure helpers for the licence function, kept apart from Deno so tests/license-logic.test.mjs can run them in Node.

export type LsMeta = { store_id?: number | string; product_id?: number | string; order_id?: number | string };
export type LsKey = { status?: string; expires_at?: string | null; test_mode?: boolean };

// Only keys sold by this store, for one of our two products, count; a key from any other store or product must not unlock
// Premium. Monthly and yearly are separate products, so the product id also tells us the plan.
export function planOf(meta: LsMeta | undefined, storeId: string, monthlyId: string, yearlyId: string): "monthly" | "yearly" | null {
  if (!meta || String(meta.store_id) !== storeId) return null;
  const p = String(meta.product_id);
  return p === yearlyId ? "yearly" : p === monthlyId ? "monthly" : null;
}

// Lemon Squeezy reports a key as active, inactive (never activated), expired or disabled (refunded or cancelled).
export function keyState(key: LsKey | undefined, allowTest: boolean): "valid" | "expired" | "invalid" {
  if (!key) return "invalid";
  if (key.test_mode && !allowTest) return "invalid";
  if (key.status === "expired" || key.status === "disabled") return "expired";
  return key.status === "active" || key.status === "inactive" ? "valid" : "invalid";
}

export type Receipt = {
  orderNo?: string; date?: string; currency?: string;
  items?: { label: string; amount?: number }[]; taxes?: { label: string; amount?: number }[]; total?: number;
};

const cents = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n / 100 : undefined);

// Maps a Lemon Squeezy order (JSON:API) to the receipt shape the app prints. Only fields the order really carries are
// set, so a missing one shows up as "didn't send" on the receipt instead of being guessed.
export function receiptOf(order: { attributes?: Record<string, unknown> } | undefined): Receipt | undefined {
  const a = order?.attributes;
  if (!a) return undefined;
  const item = (a.first_order_item ?? {}) as Record<string, unknown>;
  const label = [item.product_name, item.variant_name].filter((x) => typeof x === "string" && x).join(" · ");
  const tax = cents(a.tax);
  const when = typeof a.created_at === "string" ? new Date(a.created_at) : null;
  const r: Receipt = {};
  if (a.order_number != null) r.orderNo = String(a.order_number);
  if (when && !isNaN(+when)) r.date = when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
  if (typeof a.currency === "string") r.currency = a.currency;
  const subtotal = cents(a.subtotal);
  if (label || subtotal !== undefined) r.items = [{ label: label || "Premium", amount: subtotal }];
  if (tax !== undefined) r.taxes = tax > 0 ? [{ label: typeof a.tax_name === "string" && a.tax_name ? a.tax_name : "Tax", amount: tax }] : [];
  const total = cents(a.total);
  if (total !== undefined) r.total = total;
  return r;
}
