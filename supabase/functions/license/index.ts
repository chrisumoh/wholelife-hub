// Premium licence check. The app sends a pasted key; this activates or re-checks it with Lemon Squeezy, confirms the key
// belongs to our store and product, and (on activation) reads the order so the app can print a receipt from real data.
// Deploy with --no-verify-jwt: people can hold a key without being signed in. Secrets (never in the repo):
//   LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_PRODUCT_ID_MONTHLY, LEMONSQUEEZY_PRODUCT_ID_YEARLY,
//   and LEMONSQUEEZY_ALLOW_TEST=1 while testing.
import { handle } from "./handler.ts";

Deno.serve((req) => handle(req, (k) => Deno.env.get(k), fetch));
