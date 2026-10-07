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
| 8.1.15 | Audit fixes from PR #5: coach text escaped, per-account local storage with sign-out clearing, guest import/discard, Erase removes notif/rem keys, short error logs, db account path removed, privacy text matches the code, "Whole Life Hub" name, browser tests | IN PROGRESS: build-8.1.15, pull request open, not merged |
| 8.1.16 | Sidebar restyle: floating 260px card, profile switcher, search with Ctrl+K, grouped nav with count badges, Support / Settings / account card; drawer, scrim and arrow morph kept | IN PROGRESS: build-8.1.16, pull request open, not merged |

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

### Checklist run for 8.1.15

- Done: `node tests/browser/meal-upload.mjs` (14 checks, real supabase-js with the network faked: a logged meal must POST to meal_logs; sign-out must upload what is pending).
- Done: `node tests/browser/security.mjs` (87 checks) and `node tests/browser/meal-sync.mjs` (52 checks), both against a fake Supabase in headless Chrome; no uncaught exceptions. Supabase files were not touched, so the migrations and the security advisor are unchanged.
- Not run: the 375/820/1440px layout sweep, theme and font sweep, premium flag, coach voices, and the feature regression sweep (the build changes storage, sign-in and text, not layout). The new Import / Discard screen has not been checked at 375px.
- Not run (needs the deployed preview and a real account): sign up with the confirmation link, log in, refresh stays logged in, and the Supabase read-only checks.

### Checklist run for 8.1.16

- Done: `node tests/browser/sidebar.mjs` (96 checks, headless Chrome). 375px, 820px and 1440px: no horizontal scroll, nothing sticking out of the card, 44px controls. Drawer mode (375 and 820): scrim covers the viewport, the arrow glyph is centred on its button (within 0.5px), Escape and scrim tap close it, no scrim on the desktop card. Themes: Forest, Ocean, Sunset and Midnight, each in light, dark and OLED at 1440px (nav label contrast at least 4.5:1); the drawer was checked at 375 and 820 in Forest light and in Ocean, Sunset and Midnight light and dark.
- Done: `security.mjs` (87), `meal-sync.mjs` (52), `meal-upload.mjs` (14) still pass. The cross-tab checks in security.mjs are timing-flaky and fail the same way on the previous commit.
- Not run: the full theme x font sweep (fonts were not varied), the premium locked/unlocked check, coach voices, the feature regression sweep, seasonal scenes, real phones, Safari and Firefox, and the deployed-preview checks that need a real account. No Supabase files were touched.
