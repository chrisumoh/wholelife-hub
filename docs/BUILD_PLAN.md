# Whole Life Hub — Build Plan

Phase status legend: DONE (merged), IN PROGRESS (branch open), PROMPTED (spec ready in docs/PROMPTS/master-prompt.md, not yet executed), IDEA (not specced).

Update statuses in the same PR that changes them. Each phase ships on its own build-<version> branch; note the build number next to the status (e.g. "IN PROGRESS — build-8.2").

## Phases (spec: docs/PROMPTS/master-prompt.md)

| Phase | Contents | Status |
|---|---|---|
| 1 | Bug fixes: duplicate avatar, clipped text, menu-over-Settings layering glitch, Settings tabs | PROMPTED |
| 2 | Premium system: purchase-gated flag, badges, Telegram-style premium screen | PROMPTED |
| 3 | Coach: full data access + personalized advice card (9 rules) | PROMPTED |
| 4 | Font system: 8 options, Perplexity-style default | PROMPTED |
| 5 | UI cleanup: blue outlines, compact appearance controls, clean layout, gradient sidebar icons | PROMPTED |
| 6 | Space + arrow: centered arrow morph (tested code in prompt), 12-col grid, one-row headers, two-pane Settings, sidebar grouping | PROMPTED |
| 7 | Legal/compliance: privacy+terms updates, refunds/contact/credits, consent flows, age gate, delete/export, accessibility pass, dark-pattern sweep | PROMPTED |
| 8 | App Store readiness — RUN ONLY IF submitting to iOS App Store (Apple IAP, reviewer account, iPad, UGC safety) | IDEA (skip while web-only) |

## Builds outside the phases

| Build | Contents | Status |
|---|---|---|
| 8.1.19 | Form controls restyled to BoardUI's look (input, textarea auto-resize, select listbox, date picker, segmented control, button and button group, sign-in card), 44px touch targets. Date range picker not found, skipped | IN PROGRESS: build-8.1.19, pushed, not merged |
| 8.1.18 | Compact account row with sign-in popup, tighter spacing, Premium in Ctrl+K, Snap your plate copy. 8.1.16 and 8.1.17 were closed and never released; sidebar rework and legal pages are not in this build | IN PROGRESS: build-8.1.18 from main, not merged |
| 8.1.15 | Audit fixes from PR #5: coach text escaped, per-account local storage with sign-out clearing, guest import/discard, Erase removes notif/rem keys, short error logs, db account path removed, privacy text matches the code, "Whole Life Hub" name, browser tests | IN PROGRESS: build-8.1.15, pull request open, not merged |

## Standing backlog

- Payment provider integration (Stripe): premium CTA is currently "Coming soon" or hidden; prices and discount % are TODO placeholders
- Real photos/illustrations: any AI-generated imagery flagged for replacement
- App Store screenshots: retake after redesign settles
- Review legal pages with a lawyer before charging money
- Supabase: turn on leaked password protection (Auth settings)
- Supabase GitHub integration: connect with working directory ".", production branch main, production deploys off until one merge goes through cleanly

## Verification checklist (run for every phase, before merge)

- 375px, 820px, 1440px: no horizontal scroll, no clipped text, nothing under the tab bar
- Arrow/menu: morph centered (|glyph center - button center| <= 0.5px), scrim full-viewport in drawer mode, no scrim/freeze on desktop rail
- Space ratio: main content width / (viewport - sidebar) >= 0.9 up to 1440px
- Premium flag verified locked AND unlocked via dev override
- Coach advice non-generic in all three voices; culture constraint holds
- All five themes + light/dark + all fonts render; contrast passes
- Feature regression sweep: logging, plans, workouts, Summary, health integrations
- Auth on the preview: sign up, confirmation link lands on the preview URL, log in, refresh stays logged in
- Supabase (read-only): migrations in repo match migrations applied in the live DB; security advisor shows no new warnings; new data lands in the right table under the right owner

### Checklist run for 8.1.19

- Done: `node tests/browser/controls.mjs` (53): select keyboard and ARIA, native select and native date input under touch emulation, date picker, textarea 2 to 8 rows, password reveal, auth popup focus, 44px on seven routes, no horizontal scroll at 375/820/1440px. `security.mjs` (87), `meal-sync.mjs` (55), `meal-upload.mjs` (14) still pass.
- Done: screenshots at 375/820/1440px in light, dark, OLED and the Forest, Ocean, Sunset and Midnight themes, checked by eye on Meals and Settings.
- Not run: a real phone, Halloween/season themes, font sweep, feature regression sweep beyond the tests above, the Vercel preview with a real account.

### Checklist run for 8.1.18

- Done: `node tests/browser/security.mjs` (87), `meal-sync.mjs` (55) and `meal-upload.mjs` (14), all passing against a fake Supabase in headless Chrome.
- Done: at 1440px the signed-out account row is 68px, .card padding 16px, .wrap gap 12px on Summary, Meals and Settings.
- Not run: 375/820px sweep, theme and font sweep, feature regression sweep, sign-in on the Vercel preview with a real account.

### Checklist run for 8.1.15

- Done: `node tests/browser/meal-upload.mjs` (14 checks, real supabase-js with the network faked: a logged meal must POST to meal_logs; sign-out must upload what is pending).
- Done: `node tests/browser/security.mjs` (87 checks) and `node tests/browser/meal-sync.mjs` (52 checks), both against a fake Supabase in headless Chrome; no uncaught exceptions. Supabase files were not touched, so the migrations and the security advisor are unchanged.
- Not run: the 375/820/1440px layout sweep, theme and font sweep, premium flag, coach voices, and the feature regression sweep (the build changes storage, sign-in and text, not layout). The new Import / Discard screen has not been checked at 375px.
- Not run (needs the deployed preview and a real account): sign up with the confirmation link, log in, refresh stays logged in, and the Supabase read-only checks.

