# App readiness kit — what's here and how it is wired

Three small, self-contained pieces that close the gaps a review of main
(22 Oct 2026) found: the web app wasn't installable as a PWA, and runtime
errors in testers' browsers were invisible. All three are switched on in
`index.html` since 8.3.27, and since 8.3.28 the error tracker reports to the
app's own Supabase project.

## The files

- `manifest.webmanifest` — the install description: app name, the app's own
  green theme colour (`#1FA36B`, the same as the page's `theme-color`), and
  three icons in `img/`: 192px and 512px (rendered from the app's own logo) and
  the 180px touch icon that was already there.
- `sw.js` — the service worker. Network-first for the app document (a fresh
  build always wins when online; the cached copy is only an offline
  fallback), stale-while-revalidate for images and fonts, and a hard rule:
  Supabase traffic and writes are never intercepted or cached.
- `observability.js` — error capture with no third-party service. Uncaught
  errors and unhandled promise rejections are de-duplicated, capped per
  session, stripped to page *paths* only (no query strings, no user data),
  and posted (with `fetch` and `keepalive`, so JSON and the key headers go
  through) to an insert-only table in your own Supabase project. It fits
  the current Content-Security-Policy in `vercel.json` unchanged; a hosted
  tracker would need its domain added to `connect-src` first.

## How it is wired (8.3.27, all in `index.html`)

In `<head>`, before the app's main script so startup errors are caught:

```html
<link rel="manifest" href="/manifest.webmanifest">
<script src="/observability.js"></script>
```

Just before `</body>`, a service-worker registration after load, so it never
competes with the app's own startup work. Failures are silent: the app works
fine as a plain website wherever service workers are unavailable.

## Where error reports go (8.3.28)

The tracker is on: `CONFIG.ENDPOINT` points at the project's `error_reports`
table and `CONFIG.ANON_KEY` holds the publishable key (the same one the app
uses). The table is created by
`supabase/migrations/20261024120000_wlh_8_3_28_error_reports.sql` — RLS on, an
insert-only policy for `anon` and `authenticated`, no read path for the
browser, and length caps on every text column. The SQL lives in the migration
only; this doc does not keep a second copy.

**Apply that migration to the live project before the build is deployed.** It
is a repository file, not an applied change: until it runs, each report is
rejected with a 404 (one console warning, nothing else) and the app behaves
exactly as before. To go back to console-only, blank `CONFIG.ENDPOINT`.

Read reports in the Supabase dashboard (Table editor → `error_reports`) or
with a service-role query — never from the app itself.

## Verify

1. Deploy a preview and open DevTools → Application: the manifest parses,
   the service worker shows as activated, and the app offers to install.
2. Go offline (DevTools → Network → Offline) and reload: the app opens.
3. With the migration applied, run `WLHLog.error('test', new Error('hello'))`
   in the console: one row appears in `error_reports`, with the page path and
   no token or health data in it.

## Deliberately NOT in this PR

These need a decision or are already in flight elsewhere, so no code here
pretends to solve them:

- **Payments** — Lemon Squeezy checkout and the licence check are built
  (8.3.23–8.3.25) and the licence function is deployed, but it runs in test
  mode: the legal business details and the refund policy in `index.html` are
  still placeholders, so nothing can be charged for real yet.
- **Account sync for the remaining local-only data** — the stacked sync
  branches (8.2.14–8.2.16) already carry this; a parallel implementation
  would collide with them.
- **Landing the in-progress branch stack** — merging is a review action,
  not new code.
- **Coach protein advice / plan-adjustment audit** — health-advice logic
  belongs in the coach's audited rule set, not in a drive-by patch.
