# Security

Security rules for Whole Life Hub. They describe what this project actually is: one `index.html`, vanilla JS, supabase-js running in the browser, and no server of our own. Anything running in the browser can be read and changed by whoever is using it, so the rules below assume the client is **not trusted**. The database is described in [DATABASE.md](DATABASE.md).

Health data is the sensitive part: meals, weight, vitals, workouts, photos, age and height. Treat all of it as private.

## 1. RLS is the only authorization layer

There is no backend to check permissions. The publishable key is public, so anyone can open the site, copy the key and call the Supabase API directly. The only thing that stops them reading another account's rows is Row Level Security.

- Every table in `public` has RLS enabled **and** an owner-only policy, created in the same migration as the table. No table ships without both.
- The policy compares `owner_id` to `(select auth.uid())`. Log tables also check in `with check` that `person_id` belongs to the same owner.
- Never rely on the app hiding data, filtering by user id in JS, or checking a flag in the page. Those only affect what the page asks for, not what the API allows.
- Storage follows the same rule: the `photos` bucket is private and its policies only allow paths under the signed-in account's own folder.
- No policy for `anon`. Signed-out users have no database access.
- Check isolation with `tests/meal_rls_isolation.sql` after any schema change (it rolls back).
- Schema changes are migrations only. See [DATABASE.md](DATABASE.md).

## 2. Keys

- The client may contain only the project URL and the **publishable (anon) key**. Both are in `SB_URL` and `SB_KEY` in `index.html`.
- The `service_role` key, database passwords and any `.env` file never go in the repo, in `index.html`, in a doc, in a CHANGELOG entry or in a test fixture. `service_role` bypasses RLS, so if it leaks the whole database is open.
- Only supabase-js's anon-key calls are made from the browser. Admin work happens in the Supabase dashboard or through a reviewed migration.
- If a secret is ever committed, rotate it in Supabase first, then remove it from the repo. Deleting the commit is not enough.

## 3. Browser storage is scoped per user and cleared on sign-out

A browser can be shared. What one account leaves behind must not show up for the next.

- Anything cached from the account is tagged with the user id and ignored (and dropped) if it belongs to a different user. The meal cache `wlh.meals.v1` stores `uid` and is checked on sign-in.
- Sign-out removes the account's health data from memory and from browser storage, then calls `auth.signOut()`. If changes haven't uploaded yet, ask before discarding them.
- "Erase" clears every health-data key the app owns, not only the main one.
- Signed in, every user-data key ends in `@<user id>` (`wlh.v62@<id>`, `wlh.notif.<profile>@<id>`, `wlh.rem.<profile>.<reminder>@<id>`). Keys with no suffix are the guest store. Boot reads the session first and loads only that account's keys. When the account changes the page reloads, so nothing in memory carries over.
- Only an explicit sign-out (or Erase) deletes an account's local data. An expired session keeps it and shows the sign-in screen. A tab that sees another tab sign out (the `wlh.signedout` marker) drops its memory and reloads without writing anything.
- Guest data found after sign-in is never attached silently: the person is asked to import it or discard it. Add new data keys to `LS_USER_BASES` so sign-out and erase remove them.
- New code that stores health data in `localStorage`, `sessionStorage` or IndexedDB must either key it by user id or be listed in the sign-out and erase paths. Add the key to the same function that clears the others.
- Non-health preferences (theme, rail state, tour progress) may stay.
- The Supabase session lives in `localStorage` (`wlh.sb.auth`) with `persistSession` on. That means any script running on the page can read the token, which is the reason for the script and XSS rules below.
- With a passcode on, meals are not synced and stay encrypted on the device. Don't weaken that to make sync work.

## 4. User text is rendered as text

Anything a person types, imports or uploads (profile name, meal name, custom food, notes, workout names, imported file contents, file names) is untrusted.

- Put it in the page with `textContent`, `.value`, `setAttribute`, or `createTextNode`.
- Never put it into `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval`, `new Function` or an inline `on…=` attribute.
- The app builds a lot of markup from template strings and sets it with `innerHTML`. Where a template must include user text, it goes through `esc()` (defined near the top of the script) at the point it is interpolated, every time. Prefer `textContent` for any new code; `esc()` is the fallback for existing template strings, not the preferred method.
- Escape at the last moment. Don't build a string with user text, store it, and escape it somewhere else later. A value that has been put into a larger string (for example a coach sentence) can't be told apart from markup afterwards.
- This includes text that came from the database or from an imported file. Trust nothing that did not come from the code.
- Values that go into attributes (`data-…`, `href`, `src`, `aria-label`) are escaped the same way. Don't put user text in `href` or `src` unless it has been checked to start with `https:` or `data:image/`.

## 5. Health data stays out of logs and third parties

- No health data in `console.*`. That means meal names, weights, vitals, calories, profile details and row contents. Log an event name or a code, not the record. Error objects can echo the failing row, so log `e.message` or a fixed string, not the whole error.
- The developer log (`WLH`) records errors, routes and timings. It must not record user data. `WLH.dump()` and `WLH.copy()` are meant to be pasted into bug reports.
- The only network destinations are Supabase (account data) and jsDelivr (supabase-js). No analytics, ads, tracking pixels, fonts from a CDN or social widgets. Fonts are self-hosted in `fonts/`.
- Don't send health data to any other service (including an AI or search API) unless the person has turned on a setting for it that says exactly what is sent and where. Consent is per feature, off by default, and can be withdrawn.
- Links that carry text to another site (for example the recipe search links) open only when the person clicks them, and carry a dish name from the catalog, never anything from their own log.
- Keep the in-app privacy text true. If a change adds a network request or a place data is stored, update the privacy text in the same build.

## 6. External scripts are pinned with SRI

- Prefer no external scripts. The only one is supabase-js.
- Every external `<script>` or `<link rel="stylesheet">` uses an exact version in the URL (never `@latest` or a bare major), an `integrity="sha384-…"` attribute, and `crossorigin="anonymous"`.
- When you bump a version, regenerate the hash from the file you actually fetched and test sign-in and meal sync before merging.
- Never inject a script at runtime from a URL (`createElement("script")` with a `src`). Inline JSON-LD is the one script the app creates, and it uses `textContent`.
- Don't add a library from a CDN that isn't already used for a single function. Write the function.

## 7. Auth redirect URL rules

Sign-up confirmation and password reset emails send the person to a URL the app supplies (`sbRedirect()`, which is the current origin plus path). Supabase only honours URLs on its allow-list, and the allow-list is a dashboard setting (Authentication → URL Configuration), not code.

- Allow only URLs we own: the production site (`https://wholelife-hub.vercel.app/**`), the Vercel preview pattern for this project's team (`https://*-wholifehub.vercel.app/**`), and `http://localhost:8080/**` for local work.
- Every entry ends in `/**` so the path and query can vary. No bare domains, no `*` on its own, no wildcards that match domains we don't own.
- Never add a URL you don't control, and never add `http://` for anything except localhost.
- The site URL is the production site. Don't leave it at a default.
- Remove preview patterns that are no longer used.
- The client never builds a redirect from user input, the URL hash or a query parameter.
- The app uses PKCE (`flowType: "pkce"`). The code arrives in `?code=`; don't change this to put tokens in the URL hash.
- Sign-in does not work from `file://`; serve the folder.

## 8. Response headers (`vercel.json`)

The site sends its own security headers on every response, set in `vercel.json`. They limit where the page can load code from and send data to, so a mistake elsewhere does less harm.

- `Content-Security-Policy`: scripts only from this site and `cdn.jsdelivr.net`; network requests only to this site and the Supabase project; images, media and fonts only from places the app uses; no plugins, no `<base>`, forms post only to this site, and the app cannot be framed.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that allows the camera and microphone for this site only.
- The policy still allows inline scripts and styles, because the app is one file built from inline blocks. It limits where code loads from and where data goes, but it does not stop an injected inline script. Section 4 is still the main defence.
- A change that adds a network destination, an external script, a font from another site, a worker, or an embedded frame must update `vercel.json` in the same build, and the privacy text (section 5). Don't loosen the policy to make something work; allow only the exact host.
- If the Supabase project URL changes, change `SB_URL` and the `connect-src` and `img-src` entries together.
- Check it with `node tests/browser/headers.mjs`. It serves the folder with exactly these headers, opens every screen and fails on any violation. After a deploy, confirm the headers on the preview in the browser's Network tab.

## Reporting a problem

Tell the project owner before writing about a vulnerability in an issue or pull request. Don't paste real keys, tokens or someone's health data into a pull request, issue or chat. If a leak is possible, rotate first.
