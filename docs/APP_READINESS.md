# App readiness kit — what's here and how to wire it

Three small, self-contained pieces that close the gaps a review of main
(22 Oct 2026) found: the web app wasn't installable as a PWA, and runtime
errors in testers' browsers were invisible. Nothing here changes any
existing behaviour; each piece only activates once wired in (step 2).

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

## Wiring (the only edits to existing files — all in `index.html`)

In `<head>`, before the app's main script so startup errors are caught. (The page
already has a `theme-color` meta tag; do not add a second one.)

```html
<link rel="manifest" href="/manifest.webmanifest">
<script src="/observability.js"></script>
```

Just before `</body>`:

```html
<script>
  // Register the service worker after load so it never competes with the
  // app's own startup work. Failures are silent: the app works fine as a
  // plain website wherever service workers are unavailable.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
</script>
```

## Turning error reports on (optional, Supabase)

The tracker runs console-only until an endpoint is configured. To collect
reports, create the table, then fill in `CONFIG.ENDPOINT` and
`CONFIG.ANON_KEY` at the top of `observability.js`:

```sql
create table public.error_reports (
  id bigint generated always as identity primary key,
  kind text not null,
  label text default '',
  message text not null,
  stack text default '',
  page text default '',
  user_agent text default '',
  created_at timestamptz not null default now()
);

alter table public.error_reports enable row level security;

-- Insert-only for the app's public key: reports can be written,
-- never read back, edited or deleted from the client.
create policy "error reports are insert-only"
  on public.error_reports
  for insert
  to anon, authenticated
  with check (true);
```

Read reports in the Supabase dashboard (Table editor → error_reports) or
with a service-role query — never from the app itself.

## Verify

1. Deploy a preview and open DevTools → Application: the manifest parses,
   the service worker shows as activated, and the app offers to install.
2. Go offline (DevTools → Network → Offline) and reload: the app opens.
3. With the endpoint configured, run `WLHLog.error('test', new Error('hello'))`
   in the console: one row appears in `error_reports`.

## Deliberately NOT in this PR

These need a decision or are already in flight elsewhere, so no code here
pretends to solve them:

- **Payments** — Premium is wired but checkout is placeholders and beta-open
  is on; choosing the web checkout (and, later, Apple IAP) is a product
  decision, and it needs account keys that don't belong in a repo.
- **Account sync for the remaining local-only data** — the stacked sync
  branches (8.2.14–8.2.16) already carry this; a parallel implementation
  would collide with them.
- **Landing the in-progress branch stack** — merging is a review action,
  not new code.
- **Coach protein advice / plan-adjustment audit** — health-advice logic
  belongs in the coach's audited rule set, not in a drive-by patch.
