# Whole Life Hub — Build Plan

Phase status legend: DONE (merged), IN PROGRESS (branch open), PROMPTED (spec ready in docs/PROMPTS/master-prompt.md, not yet executed), IDEA (not specced).

Update statuses in the same PR that changes them. Each phase ships on its own build-<version> branch; note the build number next to the status (e.g. "IN PROGRESS — build-8.2").

## Phases (spec: docs/PROMPTS/master-prompt.md)

| Phase | Contents | Status |
|---|---|---|
| 1 | Bug fixes: duplicate avatar, clipped text, menu-over-Settings layering glitch, Settings tabs | DONE (already fixed in earlier builds; checked at 375px and 820px in 8.2.21) |
| 2 | Premium system: purchase-gated flag, badges, Telegram-style premium screen | DONE except payments (receipt dialog ready from 8.3.2; isPremium flag, dev override and premium screen exist; BETA_OPEN is on; prices and checkout are placeholders) |
| 3 | Coach: full data access + personalized advice card (9 rules) | PARTLY DONE: advice card built; 8.2.21 adds repeat marking and the evening review. No protein advice (calories only); Task 3.1 plan adjustments not audited |
| 4 | Font system: 8 options, Perplexity-style default | PROMPTED |
| 5 | UI cleanup: blue outlines, compact appearance controls, clean layout, gradient sidebar icons | PROMPTED |
| 6 | Space + arrow: centered arrow morph (tested code in prompt), 12-col grid, one-row headers, two-pane Settings, sidebar grouping | PROMPTED |
| 7 | Legal/compliance: privacy+terms updates, refunds/contact/credits, consent flows, age gate, delete/export, accessibility pass, dark-pattern sweep | PARTLY DONE: neutral age screen and sign-up agreement in 8.2.9; axe-core accessibility pass in 8.2.10 (screen-reader and zoom checks and a lawyer's review still to do) |
| 8 | App Store readiness — RUN ONLY IF submitting to iOS App Store (Apple IAP, reviewer account, iPad, UGC safety) | IDEA (skip while web-only) |

## Builds outside the phases

| Build | Contents | Status |
|---|---|---|
| 8.3.10 | Workouts: friends challenges (new `challenges`, `challenge_members` tables) | IN PROGRESS: claude/project-thread-oz3ex2 |
| 8.3.9 | Notifications: notification centre with All, Mentions and System tabs, unread count and Mark all read | IN PROGRESS: claude/project-thread-nzyu0w |
| 8.3.8 | Summary: activity rings card with a seven-day picker and staggered ring draw-in | IN PROGRESS: claude/project-thread-e4yqki |
| 8.3.7 | Household: friends card, search by app name, online and offline status (new `member_names`, `friendships`, `member_blocks` tables) | IN PROGRESS: claude/project-thread-e9j467 |
| 8.3.6 | Workouts and Recipes: compact pages with an open-the-full-menu control and a food row preview | IN PROGRESS: claude/project-thread-h02qn5 |
| 8.3.5 | Workouts: all 44 icons replaced with the designer set; Boxicons removed | IN PROGRESS: claude/project-thread-hay4cp |
| 8.3.4 | Premium: slide-to-pay control on the payment button (never shows a paid state; payments not live) | IN PROGRESS: claude/project-thread-7alpk4 |
| 8.3.3 | Premium: ?previewreceipt=1 shows the receipt with marked sample numbers (no purchase, nothing saved) | IN PROGRESS: claude/project-thread-7alpk4 |
| 8.3.2 | Premium: payment-successful dialog with a receipt that prints out (plan, price, taxes, total from the provider; nothing invented). Payment still not live, so it is wired but not reachable | IN PROGRESS: claude/project-thread-he3th0 |
| 8.3.1 | A waiting Google sign-in is cancelled when an email sign-in starts | MERGED: PR #42 |
| 8.3 | Sign-in popup: lamp scene with fireflies and Continue with Google (email unchanged) | MERGED: PR #41 |
| 8.2.26 | The three daily progress cards keep their colours with less visual detail | IN PROGRESS: claude/project-thread-88d00b |
| 8.2.25 | Terms and Privacy Policy fold long sections behind Read more popups; Not medical advice in red italics | IN PROGRESS: claude/project-thread-88d00b |
| 8.2.24 | Notification links limited to in-app routes (security audit finding) | IN PROGRESS: claude/project-thread-88d00b |
| 8.2.23 | Move long CSS explanations out of the app download; fast size-budget check and PR base comparison; all budgets retained | IN PROGRESS: build-8.2.23 |
| 8.2.22 | Collapsed sidebar: icons, logo and profile picture on one centre line, even row height and spacing | IN PROGRESS: claude/project-thread-dhtwj9 |
| 8.2.21 | Coach advice card: repeats of yesterday are marked in the coach's voice; evening card reviews today and sets up tomorrow by weekday | MERGED: PR #32 |
| 8.2.20 | Motion: sliding selection ring, animated external links, top-right toasts, bell pulse, widgets that turn over; tidier dish rows, coach card and weekly check-in | MERGED: PR #30 |
| 8.2.19 | Passcode restore keeps profile own-write times; a profile deleted on two devices settles; Greptile rule in CLAUDE.md | IN PROGRESS: build-8.2.19 |
| 8.2.18 | Sync recovery: durable queues, expiry, photo retries/conflicts and failed local writes | IN PROGRESS: build-8.2.18 |
| 8.2.17 | Ten workout types (soccer, basketball, American football, volleyball, cricket, baseball, tennis, badminton, strength, bodyweight) use Boxicons glyphs on the app's disc; Boxicons credited (CC BY 4.0) on the Credits page | IN PROGRESS: build-8.2.17, pull request open, not merged |
| 8.2.16 | Full account sync: every log type, all profile fields and photos; later change wins; offline queue; passcode keeps syncing (no database change) | IN PROGRESS: build-8.2.16, pull request not yet opened (stacked on 8.2.15) |
| 8.2.15 | Workouts and weigh-ins sync to the account (`workouts` and `weight_entries`, no database change) | IN PROGRESS: build-8.2.15, pull request not yet opened (stacked on 8.2.14) |
| 8.2.14 | Privacy summary and a consent and data history in Settings > Privacy & security (`privacyGlance()`, `wlh.history`) | IN PROGRESS: build-8.2.14, pull request not yet opened (stacked on 8.2.13) |
| 8.2.13 | Release gate: size and phone-speed budgets (`measure.mjs --gate`, `budget.json`) checked on every pull request by a new CI job | OPEN: PR #23, awaiting merge |
| 8.2.12 | Docs only: every build in this table shows its real status (merged, with its pull request number) instead of "in progress, not yet opened" | IN PROGRESS: build-8.2.12, pull request not yet opened |
| 8.2.11 | New workout icons, 44 activities in seven groups, nine more coach sports | MERGED: PR #21 |
| 8.2.10 | Accessibility pass with axe-core (charts, quick-jump combobox, landmarks, headings, skip link) and an automated check | MERGED: PR #20 (with 8.2.9) |
| 8.2.9 | Neutral age screen with a 24-hour retry block; Terms and Privacy Policy agreement at sign-up (version and time saved) | MERGED: PR #20 (with 8.2.10) |
| 8.2.8 | Dish tiles (Food culture, Recipes, Today's menu) use the flat card pattern | MERGED: PR #19 |
| 8.2.7 | Widget sizes work (Small, Medium, Large) on Summary and every page; widget edit mode rebuilt (minus, S/M/L, drag handle or arrows, Hidden widgets, Reset layout with confirm); leftover cards restyled | MERGED: PR #18 |
| 8.2.6 | One flat Apple Health-style dashboard card everywhere (Summary pins, Nutrition, Health data, Trends, premium widgets); Meals card; glass, caustics, beam and scenes removed from content | MERGED: PR #17 |
| 8.2.5 | Boot screen on the first bytes; coach portraits and home-screen icon moved to `img/` (first paint 3.7 s to 0.26 s on Fast 4G, download 541 to 450 KB) | MERGED: PR #16 (with 8.2.3 and 8.2.4) |
| 8.2.4 | Profile sync: a new device shows your profiles, their basics and meals; edits and deletes travel between devices (`people` table, no schema change) | MERGED: PR #16 (with 8.2.3 and 8.2.5) |
| 8.2.3 | Phone performance measured (`tests/perf/measure.mjs`, `docs/PERFORMANCE.md`); no app change | MERGED: PR #16 (with 8.2.4 and 8.2.5) |
| 8.2.2 | Segmented control thumb (units and the other rubber-thumb controls) repaints every frame, so switching slides in about 0.5s instead of freezing stretched across both options | MERGED: PR #14 (as build-8.1.23) |
| 8.2.1 | Tests run on every pull request (GitHub Actions); browser tests work on Linux; repo checks for scripts, version agreement, secrets and text-only food data | MERGED: PR #15 (with 8.2) |
| 8.2 | Security headers: content security policy, no framing, nosniff, referrer and permissions policies in `vercel.json`, with a test that serves the app under them | MERGED: PR #15 (with 8.2.1) |
| 8.1.22 | Dropdown list no longer closes itself right after opening (scrolls only the list) | MERGED: PR #13 |
| 8.1.21 | Polish pass from make-interfaces-feel-better | CLOSED: not shipped at the owner's request (PR #12); only its dropdown fix went on as 8.1.22 |
| 8.1.20 | Liquid glass cards with a hover streak and press, caustics on widgets, an accent beam on Today at a glance and the coach card (replacing the green glow), and a rubber-band Interface opacity slider | MERGED: PR #11 |
| 8.1.19 | Form controls restyled to BoardUI's look (input, textarea auto-resize, select listbox, date picker, segmented control, button and button group, sign-in card), 44px touch targets. Date range picker not found, skipped | MERGED: PR #10 |
| 8.1.18 | Compact account row with sign-in popup, tighter spacing, Premium in Ctrl+K, Snap your plate copy. 8.1.16 and 8.1.17 were closed and never released; sidebar rework and legal pages are not in this build | MERGED: PR #9 |
| 8.1.15 | Audit fixes from PR #5: coach text escaped, per-account local storage with sign-out clearing, guest import/discard, Erase removes notif/rem keys, short error logs, db account path removed, privacy text matches the code, "Whole Life Hub" name, browser tests | MERGED: PR #6 |

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
- The `Tests` workflow is green on the pull request (Repo checks and Browser tests). Locally: `node tests/check-repo.mjs` and `node tests/browser/run-all.mjs`
- Feature regression sweep: logging, plans, workouts, Summary, health integrations
- Auth on the preview: sign up, confirmation link lands on the preview URL, log in, refresh stays logged in
- Supabase (read-only): migrations in repo match migrations applied in the live DB; security advisor shows no new warnings; new data lands in the right table under the right owner

### Checklist run for 8.2.16

- Done: `node tests/browser/account-sync.mjs` (133 checks, two devices for one account and a third for another), `node tests/browser/run-all.mjs`, `node tests/check-repo.mjs`, and mutation checks (later-update rule, photo re-encoding, passcode gate, update cursor and the sign-out rule each make the new test fail when broken). The live schema was read (read-only) earlier to confirm every column used; no `supabase/` file was touched and nothing was applied.
- Not run: a real account on the preview with two real devices (the tests use a fake Supabase), the size and speed gate on GitHub, Safari and a real phone, a lawyer's review of the rewritten privacy policy.

### Checklist run for 8.2.15

- Done: `node tests/browser/workout-sync.mjs` (52 checks), `node tests/browser/security.mjs` (87), `node tests/browser/run-all.mjs`, `node tests/check-repo.mjs`. The live schema of `workouts` and `weight_entries` was read (read-only) to confirm every column the app sends exists; no `supabase/` file was touched and nothing was applied.
- Not run: a real account on the preview with two devices (the tests use a fake Supabase), Safari and a real phone, a lawyer's review of the changed privacy policy wording.

### Checklist run for 8.2.14

- Done: `node tests/browser/privacy.mjs` (28 checks), `node tests/browser/run-all.mjs`, `node tests/check-repo.mjs`.
- Not run: Safari and a real phone, a lawyer's review of the new wording. No Supabase files were touched.

### Checklist run for 8.2.13

- Done: `node tests/perf/measure.mjs --gate` (27 within budget, 0 over) and a run with a deliberately tight limit to confirm it exits 1, `node tests/check-repo.mjs`. The browser tests were not re-run: the only change to `index.html` is the build number and the change log text.
- Not run: the new CI job on GitHub itself until this pull request is opened; Safari and a real phone.

### Checklist run for 8.2.12

- Done: `node tests/check-repo.mjs`. Docs only, no app behaviour changed; every status was checked against the pull request list on GitHub (all of #1 to #21 are merged except #12, which was closed on purpose).
- Not run: the browser tests (the only change to `index.html` is the build number and the change log text).

### Checklist run for 8.2.11

- Done: `node tests/browser/workouts.mjs` (27 checks), `node tests/browser/run-all.mjs` and `node tests/check-repo.mjs`.
- Not run: a real phone and Safari, a trainer's review of the new sport sessions, a check of the MET values against the Compendium. No Supabase files were touched.

### Checklist run for 8.2.10

- Done: `node tests/browser/a11y.mjs` (19 checks, each popup and setup screen confirmed on screen before axe runs), `node tests/browser/run-all.mjs` and `node tests/check-repo.mjs`.
- Not run: a screen reader (VoiceOver, TalkBack, NVDA), 200% browser zoom and the largest text sizes, Lighthouse itself, real devices and Safari. No Supabase files were touched.

### Checklist run for 8.2.9

- Done: `node tests/browser/legal.mjs` (49 checks), `node tests/browser/run-all.mjs` and `node tests/check-repo.mjs`.
- Not run: a real phone and Safari, a real sign-up against the live Supabase project (the tests use a fake client, so the metadata arriving on the real account is unchecked), a lawyer's review of the legal pages. No Supabase files were touched.

### Checklist run for 8.2.8

- Done: `node tests/browser/widgets.mjs` (511 checks, including the new dish-tile section in light, dark and OLED at 1180 and 375px), `node tests/browser/run-all.mjs` and `node tests/check-repo.mjs`.
- Not run: a real iPad and Safari, the deployed-preview check. No Supabase files were touched.

### Checklist run for 8.2.7

- Done: `node tests/browser/widgets.mjs` (502 checks: every widget at S, M and L at 375, 820 and 1440px with the layout and content differing; No Data with an empty profile; sizes surviving a reload per page and per profile; the old-layout migration; edit controls, Hidden widgets, Reset with confirm, keyboard and mouse reordering, touch arrows; leftover cards), `node tests/browser/cards.mjs` (143), the rest of `node tests/browser/run-all.mjs`, and `node tests/check-repo.mjs`.
- Not run: a real phone and Safari (the drag handle versus arrows is chosen by the pointer type), the font and text-size sweep with Large cards, the deployed-preview checks. No Supabase files were touched.

### Checklist run for 8.2.6

- Done: `node tests/browser/cards.mjs` (143 checks: 375, 820 and 1440px, light, dark and OLED, Forest, Ocean, Sunset and Midnight, on Summary, Nutrition and Health data), the rewritten `glass.mjs`, and the rest of `node tests/browser/run-all.mjs`, plus `node tests/check-repo.mjs`. Screenshots of Summary (light and dark, 390px) and Health data (820px, Ocean light) checked by eye.
- Not run: a real phone and Safari (text-size settings change the 34px and 17px sizes), the other pages' cards (Settings, Recipes, Premium screens) beyond the shared flat surface, the font sweep, the deployed-preview checks. No Supabase files were touched.

### Checklist run for 8.2.5

- Done: `node tests/check-repo.mjs`, `node tests/browser/run-all.mjs`, `node tests/perf/measure.mjs` (before and after in `docs/PERFORMANCE.md`), and a check on a throttled connection that the boot screen shows from the first bytes, is removed once the app renders, and that the three coach portraits load from `img/`.
- Not run: real phones and Safari (the boot screen and the home-screen icon on iOS), the 375/820/1440px sweep, theme and font sweep, the deployed-preview checks. No Supabase files were touched.

### Checklist run for 8.2.4

- Done: `node tests/check-repo.mjs` and `node tests/browser/run-all.mjs` (headers 17, security 87, profile-sync 41, meal-sync 55, meal-upload 17, controls 56, glass 36) on Linux in headless Chrome, including the three people-table request checks against the real supabase-js. Live database checked read-only: the six repo migrations are the six applied ones, and `people` has every column used.
- Not run: sync between two real devices against the real Supabase project (the tests use a fake or a faked network), the 375/820/1440px sweep, theme and font sweep, real phones, the deployed-preview checks (sign up, confirmation link, sign in, refresh stays signed in). No Supabase files were touched.

### Checklist run for 8.2.3

- Done: `node tests/check-repo.mjs`, and `node tests/perf/measure.mjs` (5 cold loads at each of three profiles, plus screen-open times with a year of logs). No app behaviour changed.
- Not run: the browser tests (the app code did not change), real phones, Safari and Firefox, the deployed-preview checks. No Supabase files were touched.

### Checklist run for 8.2.2

- Done after merging main (which has 8.2 and 8.2.1): `node tests/check-repo.mjs` (20) and `node tests/browser/run-all.mjs` (headers 17, security 87, meal-sync 55, meal-upload 14, controls 56, glass 36) all pass on Linux in headless Chrome. The three new units-thumb checks in `controls.mjs` (375px touch) fail against 8.1.22 and pass here.
- Not run: real phones and Safari (the thumb motion is the thing to check), the 375/820/1440px sweep, and the deployed-preview checks. No Supabase files were touched.

### Checklist run for 8.2.1

- Done: `node tests/check-repo.mjs` (20) and `node tests/browser/run-all.mjs` (headers 17, security 87, meal-sync 55, meal-upload 14, controls 53, glass 36) all pass on Linux in headless Chrome. The repo checks go red when the version or vercel.json is deliberately broken.
- Not run: the workflow itself on GitHub (its first run is the pull request), 375/820/1440px sweep, theme and font sweep, real phones, deployed-preview checks. The app code did not change apart from APP_VERSION and the change log. No Supabase files were touched.

### Checklist run for 8.2

- Done: `node tests/browser/headers.mjs` (17 checks, headless Chrome, fake Supabase): the five headers are on the response, all 17 menu screens open under the policy with 0 violations and 0 errors, and a foreign script, request, image and iframe are blocked.
- Not run: `security.mjs`, `meal-sync.mjs`, `meal-upload.mjs`, `controls.mjs` and `glass.mjs` (they serve the app without these headers and the app code did not change), the 375/820/1440px sweep, theme and font sweep, real phones, the camera and voice features on a real device under the new Permissions-Policy, and the deployed-preview checks (headers in the Network tab, sign-in with a real account). No Supabase files were touched.

### Checklist run for 8.1.20

- Done: `node tests/browser/glass.mjs` (36 checks, headless Chrome) at 1440px and 375px, dark and light, beam colour in Forest, Ocean, Sunset and Midnight; no horizontal scroll at 375px; no page errors.
- Done: `security.mjs` (87) and `meal-sync.mjs` (55) still pass. `controls.mjs` and `meal-upload.mjs` were run on the Windows laptop (see the pull request).
- Not run: 820px, OLED, fonts, seasonal scenes, premium flag, coach voices, real phones (scroll smoothness with the blur is the main thing to check), Safari and Firefox, and the deployed-preview checks. No Supabase files were touched.

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



### Checklist run for 8.2.23

- Local: size-check unit tests, unchanged CSS token stream, unchanged executable scripts except version and change log, repository checks and compressed-size measurement.
- Pending CI: browser suite and phone performance gate. Chrome was unavailable locally and the browser download failed. No claim of measured timing improvement.
- Not run: preview layout/theme/font sweep, real sign-in, real-phone/Safari checks and live database checks. No auth, database, rendering or CSS declarations changed.

### Checklist run for 8.2.24

- Local: node tests/browser/security.mjs (93 passed), a scripted hostile-data run (markup and javascript: values in names, notes, photos and notification links; nothing executed after the fix), repository checks.
- Not run: other browser tests, preview, real sign-in, live database checks. No auth, database, CSS or catalog changes.

### Checklist run for 8.2.25

- Local: tests/browser/legal.mjs (57 passed), headers (17), privacy (28), security (93), repo checks (20), size check (within budgets, still near limit), screenshots at 400px wide.
- Not run: a11y.mjs (axe-core unavailable here), phone timing gate, preview, real-phone/Safari checks. No auth, database or catalog changes.

### Checklist run for 8.2.26

- Local: tests/browser/cards.mjs, glass, widgets, rail, repo checks, size check, screenshots at 400px wide.
- Not run: a11y.mjs (axe-core unavailable here), phone timing gate, real-phone/Safari checks. CSS only; no auth, database or catalog changes.

### Checklist run for 8.3

- Local: tests/browser/lamp.mjs (31 passed), legal, security, account-sync, motion, repo checks, size check, screenshots at 390px wide (light and dark).
- Not run: a real Google sign-in (the provider has to be switched on in Supabase first), a11y.mjs (axe-core unavailable here), real-phone/Safari checks. No database change.
