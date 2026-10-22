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

- Dark default: #000000 canvas, #1C1C1E cards; light: #F2F2F7 canvas, #FFFFFF cards. Cards are 20px radius, solid, flat: no shadow, border, glow, gradient or glass (see "Dashboard card" below). Hairline separators only
- One accent per view; category colors (green meals, orange activity, indigo sleep, cyan water, rose heart, gold achievements) only in charts, icons, labels — never large fills
- Type scale, 8px spacing grid, allowed radii {8, 10, 12, 16, 20, 999}px
- Fonts: 8-option picker, default system stack (Perplexity-style); metrics use tabular numerals
- Themes via data-theme tokens: Forest, Ocean, Sunset, Midnight, Halloween; light and dark variants; Auto option
- Sidebar icons: 30px gradient tiles (two-tone 135deg, white Lucide glyph) — same component everywhere a destination appears
- Workout icons: the designer's set (8.3.5), 44 SVGs on a 48px frosted disc, painted with each workout's gradient. Any new third-party icon must be added to the Credits page with its license.
- Motion: spring cubic-bezier(0.32, 0.72, 0, 1), 150-450ms, max 3 staggered items, all disabled under prefers-reduced-motion
- The centered hamburger/back-arrow morph is spec'd and tested in the master prompt (Task 6.1) — port that exact implementation

### Approved exception: BoardUI-style form controls (8.1.19)

Form controls (inputs, selects, textareas, date picker, buttons, button groups, segmented controls and the sign-in card) are rebuilt in plain CSS and vanilla JS to match BoardUI's look. BoardUI is not installed; there is no React or Tailwind and no copied code. These controls are exempt from two rules above:

- **Shadows:** a soft control shadow (`--bu-shadow`, 1px blur) is allowed on fields, buttons and the selected segment, and a floating shadow (`--bu-pop`) on listboxes, the calendar and the sign-in card. Cards, rows and everything else stay flat.
- **Radius:** controls use 10px, pills 999px, the listbox, calendar and sign-in card 12px and 20px. All are in the allowed set; nothing new is added.
- Primary and destructive buttons use a light top-to-bottom gradient of `--accent` and `--bad`. Colors still come from the tokens, so every scheme, accent and theme follows.
- Every control is at least 44px tall. The styles live in one block at the end of the stylesheet (`8.1.19 form controls`) and the script before `</body>`.

### Dashboard card: one flat pattern (8.2.6), supersedes the 8.1.20 liquid glass on content

At the owner's request, every dashboard card (the Summary pins, the same card on Nutrition and Health data, the Trends cards and the premium widgets) follows one Apple Health-style pattern in original code, with Lucide and the app's own icons and no Apple assets.

- **Surface:** solid, opaque, flat. Dark `#1C1C1E` on a `#000` page; light `#FFFFFF` on `#F2F2F7`; OLED a true-black page with `#101012` cards (a hair lighter, so cards show with no border). Radius 20px, padding 16px, 12px between cards. **No border, glow, gradient, glass, shadow or inner cards.** The page and card colours are the same in every theme (Forest, Ocean, Sunset, Midnight); a theme changes only the accent and text tokens.
- **Layout, the same for every card:** (1) header row: 18px category icon and the category name in the category colour (17px, weight 600) on the left; on the right, "Today" or the last-updated day in gray (15px) and a chevron; the whole card is one link to that metric's detail page. (2) At least 48px of empty space, then at the bottom left the main value: number 34px bold with tabular numerals, the unit 17px gray right after it, and one optional gray line under it (15px). (3) Bottom right, optional: a small chart, at most 120×64px, gray bars with the latest bar in the category colour. (4) Empty state: "No Data" in the value position; no buttons or chips inside a card (edit mode adds the widget tools and nothing else).
- **Category colours** are used for the icon, the name and the latest chart bar only, and every one must reach 4.5:1 against its card (dark indigo for Sleep is `#7D7AFF` for that reason).
- **Meals card:** the value is today's total planned calories, the sub-line is "N planned · N logged", the chart is one bar per meal. The Breakfast, Lunch and Dinner list, "Build a plan" and the "No food culture set" prompt live on the Meals detail page (Nutrition, `#meals-today`), never in a card.
- **Text:** "Edit widgets" and "Done" are plain accent text with no background; section titles ("Pinned", "Trends", "Highlights") are 22px bold; no underlines anywhere except real links in the legal text.
- **Glass is allowed only** on the floating top bar, the tab bar and menus (sidebar, popovers). Decorative backgrounds (aurora, home scenes, seasonal layers, caustics, sheen, beam) are removed from behind the cards and from the cards; the Scene and Season pickers were taken out of Settings, and the stored choices are kept but not drawn.
- The styles live in one block at the end of the stylesheet (`8.2.6`); the markup is `dcard()` in `index.html`. `tests/browser/cards.mjs` checks the pattern at 375, 820 and 1440px in light, dark and OLED in every theme.

### Widget sizes and edit mode (8.2.7)

Summary ("Pinned") and the Nutrition, Workouts, Coach, Health data and Awards pages ("Widgets") share one engine. The size is saved per profile and per page (`p.widgets` for Summary, `p.layouts[page]` elsewhere), applies live and survives a reload. The card style from 8.2.6 is unchanged.

| Size | Width | Content |
|---|---|---|
| **Small** | Half width: 2 per row under 700px, 4 per row from 700px. Square-ish. | Icon and name, then the one main value. Nothing else. |
| **Medium** | Full width | Main value and unit, one gray context line, a small 7-day chart (gray bars, the latest in the category colour). |
| **Large** | Full width, about twice the height of Medium | Everything in Medium plus: a labelled 7-day chart, today against the 7-day average, goal progress if a goal exists, and the top 3 items behind the value. Details below. |

Large content per widget. Only real data is used; an empty source shows "No Data".

| Widget | Large adds |
|---|---|
| Calories eaten | Remaining against the target (bar), today split by meal slot (Breakfast, Lunch, Dinner, Snacks, Drinks), top 3 foods today, 7-day chart, today against average. |
| Meals | Planned meals for today with calories, meals logged today, 7-day chart of logged meal calories, and a "Build a plan" link ("See full plan" once a plan exists). |
| Water | Amount against the 2,700 mL goal (bar), last drink time, 7-day chart, today against average, last 3 readings. Water is saved as a daily total, so the last drink time says No Data. |
| Weight | 30-day trend chart, change since the first weigh-in, goal weight and distance to goal, today against the 7-day average. |
| Steps | Hourly bars today, best day this week, 7-day chart, today against average. Steps are saved per day, so the hourly bars say No Data. |
| Workouts | Last workout (type, duration, calories), this week's minutes and workouts against the weekly workout goal (bar), streak, 7-day chart. There is no minutes goal in the app. |
| Coach | Today's advice line, streak, next action (today's planned workout, with a link), 7-day workout-minutes chart. |
| Snacks | Today's top 3 snacks with calories, 7-day chart, today against average. There is no Drinks widget. |
| Weight estimate | Where the weight could be in 1, 4 and 12 weeks, and what the estimate is based on (logged days, average intake, average daily balance); goal and latest weight if set. |
| Active energy, Resting heart rate, Blood pressure, Blood oxygen, Sleep | Not specified, so the generic Large: labelled 7-day chart, today against 7-day average, last 3 readings. |

Edit mode: tap "Edit widgets" (plain accent text, right of the section title). Each card's top row holds a red minus circle (hide), a compact S/M/L switch, and a drag handle (mouse) or up and down buttons (touch); all are 44px targets and the arrow keys move a card from its handle. Hidden widgets are listed at the bottom ("Hidden widgets") with a + to add each back. "Reset layout" is small red text that asks to confirm. Layouts saved before 8.2.7 are migrated once: the old Large and Wide (full width) read as Medium.

Cards on these pages that are not widgets use the same header look: sentence case, 15px semibold labels (no uppercase tracked labels), and the Photo estimate card uses the icon and name header. The styles are in the `8.2.7` block at the end of the stylesheet; `tests/browser/widgets.mjs` checks every widget at S, M and L at 375, 820 and 1440px.

### Previously approved, now narrowed: liquid glass (8.1.20)

The 8.1.20 glass, caustics and beam on cards were reversed for content cards by the Dashboard card rule above. What remains from 8.1.20: glass on the floating top bar, the tab bar and menus, and the Interface opacity slider (`--ui-op`), which tints that glass.

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
