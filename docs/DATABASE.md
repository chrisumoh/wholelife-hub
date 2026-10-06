# Database (Supabase)

Project **Whole Life Hub**, Postgres 17, region us-west-2, Supabase Auth with email confirmation. This is the one place the database is described. Other docs link here instead of repeating it. The security rules that sit on top of it (RLS, keys, redirect URLs) are in [SECURITY.md](SECURITY.md).

The app is a single `index.html` with no server. The browser talks to Supabase directly through supabase-js, so the database rules below are the only thing standing between one account's data and another's.

## Model

One **account** (a Supabase Auth user) owns one or more **people**: the household profiles the app already supports. Every log row carries both `owner_id` (the account) and `person_id` (the profile).

| Table | One row per | Key columns |
| --- | --- | --- |
| `people` | household profile | `display_name`, `avatar_url`, `goal`, `age`, `height_cm`, `weight_kg`, `calorie_target`, `onboarding_done`, `settings` (jsonb: every profile field without its own column), `app_id`, `is_primary` |
| `meal_logs` | meal | `log_date`, `slot` (breakfast / lunch / dinner / snack), `name`, `dish_id`, `portion`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `extras` (jsonb list), `est` (boolean, the app's "estimated" flag), `photo_path` |
| `snack_logs` | snack | `log_date`, `name`, `food_id`, `qty`, `calories` |
| `drink_logs` | drink | `log_date`, `kind`, `name`, `qty`, `volume_ml`, `calories`, `details` |
| `workouts` | workout | `log_date`, `type`, `duration_min`, `calories_burned`, `source` (Plan, Photo, manual, import name), `equipment`, `photo_path`, `details` |
| `weight_entries` | weigh-in | `log_date`, `weight_kg` |
| `daily_vitals` | person per day | `steps`, `active_kcal`, `resting_hr`, `sleep_min`, `water_ml`, `spo2`, `bp_sys`, `bp_dia`, `extra` (jsonb) |

### owner_id and person_id

- `owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade`: the account. It is on every table, including `people`. The app never sends it; the database fills it from the signed-in session. RLS compares it to `auth.uid()`.
- `person_id uuid not null references people(id) on delete cascade`: the household profile a log row belongs to. It is on every log table.
- A log row must carry both, and the `with check` on the policy makes sure `person_id` points at a profile the same account owns.

Shared columns on every log table:

- `log_date`: the calendar day the app files the entry under (the app logs by date).
- `app_id`: the sync key. The id the app generated on the device (the profile id for `people`, the meal id for `meal_logs`). Unique per account: a plain unique index on `(owner_id, app_id)`, so `upsert(..., { onConflict: "owner_id,app_id" })` works and syncing the same entry twice never duplicates it. The index must stay plain, not partial: Postgres can't use a partial index for `on conflict (owner_id, app_id)` (see migration `wlh_8_1_9_full_unique_sync_keys`).
- `updated_at`: set by the database on every update (trigger `touch_updated_at`), never by the app, and indexed. It is the column for incremental sync (fetch rows with `updated_at` after the last pull). The app doesn't use it yet: today it re-reads every live meal on each pull. Soft deletes bump it too, which is how a delete on one device reaches another.
- `deleted_at`: soft delete, so a delete on one device reaches the others.

### Cascade delete

All foreign keys are `on delete cascade`:

- Delete a row in `auth.users` and every `people` row and log row with that `owner_id` goes with it.
- Delete a `people` row and every log row with that `person_id` goes with it.

The app itself only soft-deletes (`deleted_at`). A hard delete happens only when an account is removed from Supabase Auth. Photos in the `photos` bucket are files, not rows, so the cascade does not remove them.

## Security

- **Row Level Security is on for every table**, each with one policy, "owner full access": a signed-in account can read and change only rows where `owner_id` is its own id, and can only attach logs to people it owns.
- Tested 2026-10-04 inside a rolled-back transaction: account A saw its 1 meal; account B saw 0 and was blocked from writing into A's profile.
- Every new table ships with RLS enabled and an owner-only policy in the **same migration**. A table without them is readable by anyone holding the publishable key.
- The project's `ensure_rls` event trigger turns RLS on automatically for any new table in `public`; its function `rls_auto_enable()` can't be called over the API.
- Supabase Security Advisor: no warnings after migration `wlh_8_1_1_lock_rls_auto_enable`.
- `tests/meal_rls_isolation.sql` re-checks this on the real database (account B can't read, change or write into account A's meals; it rolls back). Written in 8.1.11, not yet run.
- The app uses only the project URL and the publishable (anon) key. The `service_role` key never goes in the repo or the frontend.

## How the app uses it (8.1.11)

- **Email sign-in** (Supabase Auth, password, email confirmation on). The provider, the site URL and the redirect URLs are dashboard settings, not migrations; the redirect rules are in [SECURITY.md](SECURITY.md).
- **Only meals are saved here.** While signed in with no passcode, `meal_logs` is the store for meals, with a local copy in the browser (`wlh.meals.v1`) so the app works offline and queues changes. Snacks, drinks, workouts, weigh-ins, vitals and profiles still save in the browser; their tables are not used yet.
- Each household profile is upserted into `people` (matched on `app_id` = the profile's id) before its meals are written.
- Deleting a meal sets `deleted_at`; the app never hard-deletes rows.
- **With a passcode on, meals are not synced.** The passcode encrypts data in the browser, which the database can't read.
- Meals are plain rows protected by RLS, not end-to-end encrypted. Meal photos are not uploaded yet.
- Profiles are not synced, so another device shows an account's meals only if it has the same profile ids.

## Migrations

**Migrations only.** The repo is the source of truth for the schema.

- Every schema change is a new file in `supabase/migrations/`, written on the build branch and merged through a pull request.
- Never edit a table in the Supabase dashboard, and never apply SQL that isn't also committed as a migration.
- Never edit a migration that has already been applied. Add a new one.
- File name: `<timestamp>_wlh_<version with underscores>_<what>.sql`, for example `20261005035516_wlh_8_1_11_meal_est.sql`.
- Per CLAUDE.md section 5, Claude Code asks before it creates or changes anything under `supabase/`. Other tools connect to Supabase read-only.
- Auth settings (provider, site URL, redirect URLs) are dashboard settings, not migrations. The redirect rules are in [SECURITY.md](SECURITY.md).

| Version | Name | What it does |
| --- | --- | --- |
| `20261002081325` | `whole_life_hub_core_schema` | First tables. |
| `20261004134104` | `wlh_8_1_1_core_schema` | Extends the tables to the app's data model, adds `drink_logs`, `daily_vitals`, the `photos` bucket and RLS. |
| `20261004134122` | `wlh_8_1_1_lock_rls_auto_enable` | Locks `rls_auto_enable()` off the API. |
| `20261004134137` | `wlh_8_1_1_drop_duplicate_indexes` | Removes duplicate indexes. |
| `20261004142625` | `wlh_8_1_9_full_unique_sync_keys` | Replaces the partial `(owner_id, app_id)` unique indexes with plain ones, and adds `updated_at` indexes. The repo file was added in 8.1.11 as an exact copy of the remote record. |
| `20261005035516` | `wlh_8_1_11_meal_est` | Adds `meal_logs.est boolean not null default false`. |

## Photo storage

Bucket **`photos`**: private, 10 MB per file, JPEG / PNG / WebP / HEIC.

Path pattern: `{account id}/{person id}/{kind}/{file}`, for example `…/meals/2026-10-04-abc.jpg`. Storage policies let an account read, upload, replace and delete only files under its own account-id folder. Tables store the path (`photo_path`); the app asks Supabase for a short-lived signed URL to show a photo.

## Next steps

Done in 8.1.11: login screens and `meal_logs` (including the first-sign-in upload of a device's existing meals).

1. Sync profiles through `people`, so a second device shows its meals.
2. Meal photos to the `photos` bucket (`photo_path`).
3. Move the other data types over one at a time (snacks, drinks, workouts, weigh-ins, vitals), each with the same first-sign-in upload.
4. Decide how a passcode and cloud sync should work together (today a passcode keeps meals on the device).
