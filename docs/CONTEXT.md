# Whole Life Hub — Project Context

Single source of truth for every tool that works on this repo (Perplexity Computer, Claude Code, Claude Cowork, ChatGPT). Read this before making changes. Keep it updated: after each merged phase, update the relevant section in the same PR.

## What this is

Deployed health, fitness, and nutrition web app: Personal Coach, meal and snack planning, workouts, calorie tracking, Summary dashboard, achievements, culture-based food settings, health integrations, premium subscription.

## Stack

- Frontend: deployed web app, Apple Health-inspired flat design system (see docs/PROMPTS/master-prompt.md for exact tokens). Actual setup: no framework and no build step. The whole app is one file, `index.html` (markup, CSS and vanilla JS together), with self-hosted fonts in `fonts/`. The only dependency is supabase-js 2.117.2, loaded from jsDelivr by a pinned script tag with SRI. Run it by serving the folder (`python3 -m http.server 8080`); Supabase sign-in does not work from file://. Tests are node scripts in `tests/browser/` plus SQL in `tests/`.
- Backend/database: Supabase project "Whole Life Hub" (Postgres 17). Tables: people, meal_logs, snack_logs, workouts, weight_entries, drink_logs, daily_vitals. RLS on for all seven, each with one owner-only policy. Supabase Auth with email confirmation.
- Migrations: supabase/migrations/ in this repo. The repo is the source of truth for schema; see hard constraint 7.
- Hosting/deploy: Vercel. Production = main at wholelife-hub.vercel.app. Every branch gets a preview at wholelife-hub-git-<branch>-wholifehub.vercel.app (dots in the branch name are dropped).
- Auth redirects: every URL a sign-in email can land on must be in Supabase Auth → URL Configuration → Redirect URLs, with /** on the end (production URL, plus preview URLs or the *-wholifehub.vercel.app/** wildcard).
- Repo: github.com/chrisumoh/wholelife-hub. Branch + PR workflow, user merges. main is the live app; never commit to it directly.

## Versioning

Version goes up 0.1 per week (8.1, 8.2, ...). Extra builds inside the same week are 8.1.1, 8.1.2, etc. Branches are named build-<version> (e.g. build-8.1.12). Migration files for a build are named <timestamp>_wlh_<version with underscores>_<what>.sql (e.g. 20261005035516_wlh_8_1_11_meal_est.sql).

## Design system summary

- Dark default: #000000 canvas, #1C1C1E cards, 16px radius, no shadows, hairline separators only
- One accent per view; category colors (green meals, orange activity, indigo sleep, cyan water, rose heart, gold achievements) only in charts, icons, labels — never large fills
- Type scale, 8px spacing grid, allowed radii {8, 10, 12, 16, 20, 999}px
- Fonts: 8-option picker, default system stack (Perplexity-style); metrics use tabular numerals
- Themes via data-theme tokens: Forest, Ocean, Sunset, Midnight, Halloween; light and dark variants; Auto option
- Sidebar icons: 30px gradient tiles (two-tone 135deg, white Lucide glyph) — same component everywhere a destination appears
- Motion: spring cubic-bezier(0.32, 0.72, 0, 1), 150-450ms, max 3 staggered items, all disabled under prefers-reduced-motion
- The centered hamburger/back-arrow morph is spec'd and tested in the master prompt (Task 6.1) — port that exact implementation

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
7. No tool changes the database directly. Every schema change is a new migration file in supabase/migrations/, written by Claude Code on the build branch and merged through a PR. Never edit tables in the Supabase dashboard or apply SQL that isn't also committed as a migration. Never edit a migration that has already been applied; add a new one. Other tools connect to Supabase read-only.
8. New tables ship with RLS enabled and an owner-only policy in the same migration.

## Where things live

- docs/PROMPTS/master-prompt.md — the canonical master prompt with tested reference code
- docs/BUILD_PLAN.md — phase status and the working loop
- docs/CHANGELOG.md — what shipped, when, and status
- CLAUDE.md (repo root) — Claude Code entry point, points here

## Working loop

1. User reports a bug/idea (screenshots encouraged)
2. Perplexity Computer diagnoses, then writes/updates a spec file in docs/PROMPTS/ with exact values and a pass/fail checklist
3. Claude Code implements on a build-<version> branch, reports a per-file changelog, and updates BUILD_PLAN.md and CHANGELOG.md in the same PR
4. Verification: Perplexity Computer tests the Vercel preview in a real browser (375 / 820 / 1440px). Supabase is checked read-only (migrations in repo vs applied in the live DB, advisors, logs) by whichever tool has the connector
5. User merges; Vercel deploys main to production
