# CLAUDE.md

Project rules for WholeLife Hub. Read this before changing anything.

## What this repo is

A health and fitness web app that lives in one file, `index.html` (markup, CSS and JS together). It has no build step. `CHANGELOG.md` records every build, and is the only changelog. `docs/VERSIONING.md` and `docs/DATABASE.md` hold the detailed rules. `supabase/migrations/` holds the SQL for the backend. Since build 8.1.11 the app uses Supabase for email sign-in and for syncing meals to your account (the `meal_logs` table); since 8.2.4 it also syncs the basics of each profile (the `people` table). Everything else (snacks, drinks, workouts, weigh-ins, vitals, profile plans and coach history, meal photos) still saves in the browser, and with a passcode on, meals and profiles stay on the device too.

## Read first

- docs/CONTEXT.md — stack, Supabase/Vercel setup, versioning, design system, coach personas, hard constraints. Read every session.
- docs/BUILD_PLAN.md — phase status and verification checklist. Read every session.
- docs/SECURITY.md — security rules (RLS, keys, storage, rendering user text, logs, SRI, auth redirects). Read before touching sign-in, storage, rendering or anything that handles health data.
- docs/DATABASE.md — tables, owner_id/person_id, sync keys, migrations. Read before touching anything that talks to Supabase.
- CHANGELOG.md (repo root) — read the top few entries to see what shipped last.
- docs/PROMPTS/master-prompt.md — large file. Read only the phase you are working on, plus the reference code that phase points to.

## 1. Versioning

- The update number goes up by **0.1 per week that has a build**: 8.1, then 8.2, then 8.3.
- Builds within that update add a third number: the first build is `8.1`, then `8.1.1`, `8.1.2` and so on.
- Numbers follow builds, not the calendar. A week with no build doesn't use a number. After a quiet week the next build is the next number in the sequence (8.2, not 8.3). The week dates in `docs/VERSIONING.md` only record when each update shipped.
- The channel in brackets (Dev Testing, then Beta, then Release) shows how close a build is to real users. It never goes in the version number.
- Set the version in `APP_VERSION` (`update`, `build`, `channel`, `date`, `week`) near the top of the developer-log script in `index.html`. Keep it in step with the "Current" line in `CHANGELOG.md` and the build named in `README.md`.
- Git tags follow the build, for example `v8.1.9`.

## 2. Change log

- Log **every** change in `CHANGELOG.md`, however small. No change ships without an entry.
- Add the entry to the in-app change log (`WLH.changelog` in `index.html`) first. That is the source of truth. Then mirror it into `CHANGELOG.md`.
- Newest entries go first. Each entry is headed `## <version> · <Area>: <title>`, with these fields:
  - **Problem**
  - **Change**
  - **Where** (functions, CSS blocks, files)
  - **How to test**
  - **Known limits**
- Name the area (Header, Menu, Sys Architecture and so on). The area never goes in the version number.
- Update the **Current** line at the top of `CHANGELOG.md` whenever the build changes.

## 3. Food catalog

- The catalog is **West African–heavy**. West African dishes, ingredients and drinks come first and make up most of the catalog. Examples: jollof rice, waakye, egusi soup, fufu, banku, kenkey, eba, amala, pounded yam, suya, moi moi, akara, plantain, zobo.
- Other cuisines are fine as supporting entries. They should not crowd out West African foods in defaults, suggestions, search ranking, meal plans or coach prompts.
- Keep spellings and alternate names consistent (garri/gari, moi moi/moin moin). Do not "correct" them to Western equivalents.
- Portions and nutrition for West African dishes need real care. Don't copy a generic Western dish as a placeholder.

## 4. Food options are text-only

- Food options, such as catalog entries, pickers, chips, suggestions and meal-plan items, show **text only**.
- No emoji, icons, thumbnails or photos on food options.
- This covers new food UI too. Don't add images to food lists, even as decoration.
- User-uploaded meal photos (the private `photos` bucket) are a separate feature. This rule does not change them.

## 5. Supabase: ask first

- **Ask before touching anything in `supabase/`**, and before running any Supabase tool that changes the remote project. That includes creating or editing migrations, applying SQL, and deploying edge functions.
- Reading is fine. Don't write, rename, delete or apply anything until I've said yes.
- When approved:
  - Add a new migration. Never edit one that's already applied.
  - Every new table needs RLS and an owner-only policy.
  - Update `docs/DATABASE.md` and add a `CHANGELOG.md` entry.
- Never commit the `service_role` key or any `.env` file. The frontend may use only the project URL and the publishable (anon) key.

## 6. Workflow and deploys

- `main` is the live app. Pushing to `main` deploys to wholelife-hub.vercel.app immediately.
- Do work on a branch named after the build, such as `build-8.1.11`. Push it so Vercel creates a preview link for testers. (If a session names a specific branch, use that one.)
- **Never push or merge to `main` without asking me first.**
- You may open a pull request into `main` when a build branch is ready. Never merge it. I merge.
- Run the app locally by opening `index.html`, or serve it with `python3 -m http.server 8080`.

## 7. Single source

- This repo is the only copy of the app. Don't pull code from Claude artifacts, Codex folders or ChatGPT sites.
- If I paste code from elsewhere, compare it to `index.html` and ask before replacing anything.

## 8. Build plan and docs workflow

- Targeted edits only. Report a per-file changelog.
- Port the reference code's values into existing components; do not paste reference files over the app.
- Every build also updates `docs/BUILD_PLAN.md` status. Its changelog entry goes in the root `CHANGELOG.md`, as section 2 requires.
- Run the `docs/BUILD_PLAN.md` verification checklist before asking me to merge.
- Never invent data, prices, or health claims.
- Database changes follow section 5: new file in `supabase/migrations/` only, never edit an applied migration, and new tables get RLS and an owner-only policy in the same migration.
- Branch and merge rules follow section 6: never commit to `main`, work on a `build-<version>` branch, you may open a pull request when the branch is ready, and I do the merge.

## 9. Code style

Match what `index.html` already does. These are the patterns it follows now; don't introduce a new one beside them.

- Vanilla JS in one file. No framework, no build step, no modules. Browser features and supabase-js only.
- Two-space indent, double quotes, semicolons. `const` by default, `let` only when reassigned. Arrow functions for small helpers (`const esc = s => …`), `function` declarations for named features.
- Names: camelCase for functions and variables, UPPER_CASE for constants and data tables (`DISHES`, `SNACKS`, `LS_KEY`). Supabase code uses an `sb` prefix (`sbPush`, `sbPull`, `sbTrack`). Storage keys start with `wlh.`.
- Group code under a `// ---- section ----` comment. Comments say why, not what, and are short. Don't add banner comments for obvious code.
- Markup is built with template literals and set with `innerHTML`. Every piece of user text goes through `esc()` (see SECURITY.md section 4). Prefer `textContent` for new code that sets plain text.
- Clicks are handled by delegation: elements carry `data-act="…"` (and `data-id` or `data-v`), and one handler switches on the act. Add a new `case` there, don't attach a listener per element.
- State lives in the shared objects (`S` for data, `UI` for screen state). Change state, then call `render()`. Save through `markLog()`, `markRoot()` or `markAll()`, not by writing storage directly.
- Wrap `localStorage` access in `try/catch` and fall back quietly (`try { … } catch {}`), because storage can be blocked.
- Show messages with `toast()`. Use `console.warn` only for failures, with no health data (SECURITY.md section 5).
- Dates are `YYYY-MM-DD` strings from `today()` and `addDays()`. Ids come from `uid()`.
- Styling uses the CSS custom properties and the existing classes (`card`, `btn`, `small`, `muted`). Colors, radii and spacing come from the tokens in docs/CONTEXT.md, not new hard-coded values.
- Food data entries are text only (section 4) and keep the spellings already in the catalog (section 3).
