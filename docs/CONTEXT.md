# Whole Life Hub — Project Context

Single source of truth for every tool that works on this repo (Perplexity Computer, Claude Code, Claude Cowork, ChatGPT). Read this before making changes. Keep it updated: after each merged phase, update the relevant section in the same PR.

## What this is

Deployed health, fitness, and nutrition web app: Personal Coach, meal and snack planning, workouts, calorie tracking, Summary dashboard, achievements, culture-based food settings, health integrations, premium subscription.

## Stack

- Frontend: deployed web app, Apple Health-inspired flat design system (see docs/PROMPTS/master-prompt.md for exact tokens). Actual setup: no framework and no build step. The whole app is one file, `index.html` (markup, CSS and vanilla JS together), with self-hosted fonts in `fonts/`. The only dependency is supabase-js 2.117.2, loaded from jsDelivr by a pinned script tag with SRI. Run it by serving the folder (`python3 -m http.server 8080`); Supabase sign-in does not work from file://. Tests are node scripts in `tests/browser/` plus SQL in `tests/`.
- Backend/database: Supabase (Postgres 17), email sign-in. Tables, ownership, sync keys, RLS, migrations and the migrations-only rule all live in [DATABASE.md](DATABASE.md). Security rules are in [SECURITY.md](SECURITY.md).
- Hosting/deploy: Vercel. Production = main at wholelife-hub.vercel.app. Every branch gets a preview at wholelife-hub-git-<branch>-wholifehub.vercel.app (dots in the branch name are dropped).
- Auth redirects: see "Auth redirect URLs" in [SECURITY.md](SECURITY.md).
- Repo: github.com/chrisumoh/wholelife-hub. Branch + PR workflow, user merges. main is the live app; never commit to it directly.

## Versioning

Version goes up 0.1 per week (8.1, 8.2, ...). Extra builds inside the same week are 8.1.1, 8.1.2, etc. Branches are named build-<version> (e.g. build-8.1.12). Migration files for a build are named <timestamp>_wlh_<version with underscores>_<what>.sql (e.g. 20261005035516_wlh_8_1_11_meal_est.sql).

## Design system summary

- Dark default: #000000 canvas, #1C1C1E cards, 16px radius, no shadows, hairline separators only
- One accent per view; category colors (green meals, orange activity, indigo sleep, cyan water, rose heart, gold achievements) only in charts, icons, labels — never large fills
- Type scale, 8px spacing grid, allowed radii {8, 10, 12, 16, 20, 24, 28, 999}px; nested surfaces are concentric (outer radius = inner radius + padding), so cards holding 12px tiles are 28px (24px on phones) (8.1.21)
- Fonts: 8-option picker, default system stack (Perplexity-style); metrics use tabular numerals
- Themes via data-theme tokens: Forest, Ocean, Sunset, Midnight, Halloween; light and dark variants; Auto option
- Sidebar icons: 30px gradient tiles (two-tone 135deg, white Lucide glyph) — same component everywhere a destination appears
- Motion: spring cubic-bezier(0.32, 0.72, 0, 1), 150-450ms, max 3 staggered items, all disabled under prefers-reduced-motion
- The centered hamburger/back-arrow morph is spec'd and tested in the master prompt (Task 6.1) — port that exact implementation

### Approved exception: BoardUI-style form controls (8.1.19)

Form controls (inputs, selects, textareas, date picker, buttons, button groups, segmented controls and the sign-in card) are rebuilt in plain CSS and vanilla JS to match BoardUI's look. BoardUI is not installed; there is no React or Tailwind and no copied code. These controls are exempt from two rules above:

- **Shadows:** a soft control shadow (`--bu-shadow`, 1px blur) is allowed on fields, buttons and the selected segment, and a floating shadow (`--bu-pop`) on listboxes, the calendar and the sign-in card. Cards, rows and everything else stay flat.
- **Radius:** controls use 10px, pills 999px, the listbox, calendar and sign-in card 12px and 20px. All are in the allowed set; nothing new is added.
- Primary and destructive buttons use a light top-to-bottom gradient of `--accent` and `--bad`. Colors still come from the tokens, so every scheme, accent and theme follows.
- Every control is at least 44px tall. The styles live in one block at the end of the stylesheet (`8.1.19 form controls`) and the script before `</body>`.

### Approved exception: liquid glass, caustics and the beam (8.1.20)

Cards are frosted glass again, at the owner's request. This replaces "no shadows" and the "Liquid Glass stays retired" notes for these surfaces only:

- **Glass:** cards, widgets, health tiles, recipe cards, tab bars and profile strips get `backdrop-filter: blur(14px) saturate(1.4)` (outermost surface only, never blur inside blur), a 1px inset rim (`--glass-line`) and a lit top edge (`--glass-hi`). The Interface opacity slider (`--ui-op`) still sets how much surface colour sits in the glass.
- **Streak and press:** a light streak crosses a card on hover (mouse only); tappable cards scale to 0.97 when pressed.
- **Caustics:** widgets and health tiles carry two blurred light pools drifting behind their content.
- **Beam:** Today at a glance and the coach advice card have a 2px accent light running round the border. It always uses `--accent`, so it follows the theme and accent picker.
- Reduced motion stops the caustics, beam and springs; Reduce transparency removes the blur. The styles live in one block at the end of the stylesheet (`8.1.20`).

### Polish rules (8.1.21, from make-interfaces-feel-better)

- Press: controls scale to exactly 0.96, whole cards and rows to 0.98. Nothing presses below 0.95.
- Hit areas: every control is at least 40px with a mouse and 44px on touch; small links grow with padding cancelled by a negative margin, so layout does not move.
- Icons: 1.5px stroke beside regular text, 2px beside semibold labels and on icon-only buttons. Buttons with an icon are 2px tighter on the icon side.
- Numbers that change use tabular-nums; body text uses text-wrap: pretty; headings are balanced; font smoothing sits on html.
- Images get a 1px inset outline: black at 10% in light, white at 10% in dark.
- No transition: all, and no will-change unless an animation stutters on its first frame.

## Coach personas

Three selectable-before-personalization, renamable personas: The Motivator (streaks, "Wins & next steps"), The Enforcer (adherence score, "Deviations"), The Strategist (intensity dial Recover/Standard/Push, "Adjustments"). Each has its own question set and voice. The daily advice card must satisfy all 9 personalization rules in the master prompt (Phase 3).

## Premium system

Single "premium: active/inactive" flag is the source of truth. Features stay in their original menus with gold badges, inert until purchase; all link to one Telegram-style premium screen. Never default the flag to active; never fake prices, discounts, or purchases.

## Hard constraints (apply to every change)

1. Targeted edits only — no rebuilds or redesigns beyond what a task specifies
2. Culture constraint: when a user selects a single food culture, recommendations exclude other cultures' foods by default, enforced at the data layer
3. Original assets only — inspired by Apple/Telegram/ChatGPT is fine; copying their assets, fonts, or artwork is not
4. Never invent user data, metrics, health claims, prices, or reviews
5. Accessibility non-negotiable: WCAG AA contrast, keyboard nav, focus-visible only, prefers-reduced-motion, 44px touch targets
6. Safe areas (Dynamic Island, home indicator) respected on all iOS widths
7. No tool changes the database directly. Schema changes are migration files only; see "Migrations" in [DATABASE.md](DATABASE.md).
8. New tables ship with RLS and an owner-only policy in the same migration; see [DATABASE.md](DATABASE.md) and [SECURITY.md](SECURITY.md).

## Where things live

- docs/PROMPTS/master-prompt.md — the canonical master prompt with tested reference code
- docs/BUILD_PLAN.md — phase status and the working loop
- docs/DATABASE.md — tables, ownership, sync keys, migrations
- docs/SECURITY.md — security rules for the browser app and the database
- CHANGELOG.md (repo root) — what shipped, build by build
- CLAUDE.md (repo root) — Claude Code entry point, points here

## Working loop

1. User reports a bug/idea (screenshots encouraged)
2. Perplexity Computer diagnoses, then writes/updates a spec file in docs/PROMPTS/ with exact values and a pass/fail checklist
3. Claude Code implements on a build-<version> branch, reports a per-file changelog, and updates BUILD_PLAN.md and the root CHANGELOG.md in the same PR
4. Verification: Perplexity Computer tests the Vercel preview in a real browser (375 / 820 / 1440px). Supabase is checked read-only (migrations in repo vs applied in the live DB, advisors, logs) by whichever tool has the connector
5. User merges; Vercel deploys main to production
