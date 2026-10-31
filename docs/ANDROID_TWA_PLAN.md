# Android: packaging the PWA as a Trusted Web Activity (plan)

Status: plan only. Nothing here is built, signed or published. Owner decisions are marked **CJ**.

## Why this route
The app is one `index.html` with Supabase sync. A Trusted Web Activity (TWA) opens the live site in a full-screen Chrome shell, so Android users get the same code, accounts, RLS and design as the web. The Expo prototype (PR #72) stays a draft and is a later option only.

## What is already in place (8.3.27)
Manifest (`manifest.webmanifest`), service worker (`sw.js`, app shell works offline), HTTPS on Vercel, per-account sync. 8.3.28 also keeps the pinned supabase-js for offline cold starts.

## Steps
1. **Digital Asset Links** (blocks the full-screen mode): serve `/.well-known/assetlinks.json` with the package name and the signing certificate SHA-256. It cannot be written until **CJ** creates the signing key. Vercel needs a route/header so the file is served as `application/json`.
2. **Manifest polish:** a maskable 512 icon (design choice, **CJ**), phone screenshots, `categories`, and a check of `id`, `scope` and `start_url`.
3. **Wrapper project:** a new top-level folder `android-twa/` made with Bubblewrap or PWABuilder. It holds only wrapper config, no web code. Signing key stays with **CJ**, never in the repo.
4. **Sign-in inside the TWA:** test email sign-in, Google sign-in and the email confirmation link. The Auth redirect allow-list is a dashboard setting (**CJ** approves).
5. **Payments:** Play requires Play Billing for digital subscriptions sold inside a Play app. Launch with Premium free in beta and no purchase button. Decide the payment path with **CJ** first. Confirm the current Play policy; it was not checked here.
6. **Play Console:** account (**CJ**), privacy policy URL with no placeholders, data-safety form, health-app declaration, content rating (friends and messages, under-13 screen), account-deletion path, closed testing.
7. **Test on devices:** install, offline start, sign-in, sync across web and Android, back button, links opening in the shell.

## Blockers owned by CJ
Signing key and Play account; legal and contact details (see the report); account deletion design (needs a server function, so a `supabase/` change); payment path.

## File ownership (Claude and Codex)
| Area | Owner |
|---|---|
| `index.html`, `sw.js`, `manifest.webmanifest`, `vercel.json`, `observability.js`, `docs/`, `CHANGELOG.md`, `tests/` (existing), `supabase/` (only after CJ says yes) | Claude |
| `android-twa/` (wrapper project), any Android CI workflow in its own file, `mobile/` (Expo prototype) | Codex |
| Shared, ask first: `.github/workflows/tests.yml`, `README.md` | whoever opens a PR first names it in the description |

Neither agent merges. CJ merges.
