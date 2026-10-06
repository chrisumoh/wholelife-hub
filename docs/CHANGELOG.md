# Whole Life Hub — Changelog

Newest first. Claude Code adds one entry per merged PR, in that PR. Status labels: DONE (merged to main), VERIFIED IN REFERENCE CODE (measured in Perplexity's test build, not yet in this repo), APPLIED (seen in screenshots), PROMPTED (spec ready, not executed).

Note: entries dated before 2026-10-02 describe the earlier claude.ai artifact version of the app. "APPLIED" there means it was visible in that version; it has not been re-checked in this repo.

## 2026-10-05 — Build 8.1.11: Login / Meals sync (PR #2)

- Meal sync to Supabase, with an estimated-meal flag. Migration 20261005035516_wlh_8_1_11_meal_est adds meal_logs.est (boolean, default false). Status: DONE once PR #2 is merged
- Auth redirect fix: preview URL for build-8.1.11 added to Supabase Redirect URLs. Sign-up confirmation email, confirmation link and login verified on the preview
- Repo sync fix: migrations 8.1.9 and 8.1.11 had been applied to the live DB but were missing from supabase/migrations/. Added to the repo; repo and live DB now both list the same 6 migrations
- Supabase check (2026-10-05): project healthy, 0 errors in 24h, RLS + owner policy on all 7 tables. Open item: leaked password protection off

## 2026-10-04 — Builds 8.1.1 and 8.1.9: core schema and sync keys

- 20261004134104_wlh_8_1_1_core_schema, 20261004134122_wlh_8_1_1_lock_rls_auto_enable, 20261004134137_wlh_8_1_1_drop_duplicate_indexes. Status: DONE (applied in live DB)
- 20261004142625_wlh_8_1_9_full_unique_sync_keys: plain unique indexes on (owner_id, app_id) for six tables so upserts work, plus owner/updated_at indexes for incremental pulls. Status: DONE (applied in live DB)

## 2026-10-02 — Moved to GitHub + Vercel + Supabase

- App moved off the claude.ai artifact into github.com/chrisumoh/wholelife-hub, deployed on Vercel, with Supabase as the backend
- 20261002081325_whole_life_hub_core_schema. Status: DONE (applied in live DB)

## 2026-09-29/30 — Reference design system verified

- Centered hamburger/back-arrow morph: rebuilt spec (scaleX method, not stroke-dasharray), verified 0px off-center in both states at 375/820/1440px. Status: VERIFIED IN REFERENCE CODE (docs/PROMPTS/master-prompt.md Task 6.1 + bundled code)
- 12-column grid, one-row header, drawer scrim, sidebar grouping, gradient icon tiles, compact appearance controls, charts with draw-in: same. Status: VERIFIED IN REFERENCE CODE
- Bugs caught during verification: phone cards squeezed by grid overspan; card head text overlap; desktop menu scrim shown despite permanent rail; no visible close button when drawer covers header arrow. All fixed in reference code; port the fixes.

## 2026-09-28/29 — Master prompt v1 (8 phases consolidated)

- One master prompt covering: bug fixes, purchase-gated premium system, coach personalization (9 advice rules), font system (8 options), UI cleanup (blue outlines, compact themes, gradient sidebar icons), space + layout rework, legal/compliance checklist, App Store readiness. Status: PROMPTED, awaiting Claude Code execution

## 2026-09-28 — Apple Health-style restyle + charts + large-title collapse

- Restyle prompt: flat #000/#1C1C1E system, category accent colors, Pinned/Trends/Highlights Summary, three chart types with animated draw-ins, distinct visualization per loggable metric, floating capsule tab bar, large-title collapse on every surface. Status: APPLIED (per user screenshots of the live app, 2026-09-29); verify per master prompt final check

## 2026-09-24/27 — Coach personas, menu fixes, earlier cleanups

- Three coach personas (Motivator/Enforcer/Strategist), coach selection before personalization, coach naming, persona question sets, signature mechanics (streaks / adherence score / intensity dial). Status: APPLIED (visible in app screenshots)
- Menu slide (320ms spring), hamburger->arrow morph v1, trophy + confetti, achievement animations. Status: APPLIED; arrow recentered by the 2026-09-29 reference-code fix
- Privacy Policy + Terms pages, favicon, footer links, copy cleanup (em dashes, fake social proof removal). Status: APPLIED
- Known issues logged later from screenshots: menu-over-Settings layering glitch, duplicate avatar, clipped text, off-center arrow — all specced in master prompt Phase 1 / 6.1. Status: PROMPTED
