# Database (Supabase)

Project **Whole Life Hub**, Postgres 17, region us-west-2. Migrations are in `supabase/migrations/` in the order they were applied.

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

Shared columns on every log table:

- `log_date`: the calendar day the app files the entry under (the app logs by date).
- `app_id`: the id the app generated on the device. Unique per account (a plain unique index on `(owner_id, app_id)`, so upserts with `on_conflict=owner_id,app_id` work), so syncing the same entry twice never duplicates it.
- `updated_at`: set automatically on every update (trigger `touch_updated_at`).
- `deleted_at`: soft delete, so a delete on one device reaches the others.

Deleting an account deletes its people and every log; deleting a person deletes that person's logs.

## Security

- **Row Level Security is on for every table**, each with one policy, "owner full access": a signed-in account can read and change only rows where `owner_id` is its own id, and can only attach logs to people it owns.
- Tested 2026-10-04 inside a rolled-back transaction: account A saw its 1 meal; account B saw 0 and was blocked from writing into A's profile.
- The project's `ensure_rls` event trigger turns RLS on automatically for any new table in `public`; its function `rls_auto_enable()` can't be called over the API.
- Supabase Security Advisor: no warnings after migration `wlh_8_1_1_lock_rls_auto_enable`.
- `tests/meal_rls_isolation.sql` re-checks this on the real database (account B can't read, change or write into account A's meals; it rolls back). Written in 8.1.11, not yet run.
- The app uses only the project URL and the publishable (anon) key. The `service_role` key never goes in the repo or the frontend.

## How the app uses it (8.1.11)

- **Email sign-in** (Supabase Auth, password, email confirmation on). The provider, the site URL and the redirect URLs are dashboard settings, not migrations. Redirect URLs must include the live site, the Vercel preview URLs and `http://localhost:8080/`.
- **Only meals are saved here.** While signed in with no passcode, `meal_logs` is the store for meals, with a local copy in the browser (`wlh.meals.v1`) so the app works offline and queues changes. Snacks, drinks, workouts, weigh-ins, vitals and profiles still save in the browser; their tables are not used yet.
- Each household profile is upserted into `people` (matched on `app_id` = the profile's id) before its meals are written.
- Deleting a meal sets `deleted_at`; the app never hard-deletes rows.
- **With a passcode on, meals are not synced.** The passcode encrypts data in the browser, which the database can't read.
- Meals are plain rows protected by RLS, not end-to-end encrypted. Meal photos are not uploaded yet.
- Profiles are not synced, so another device shows an account's meals only if it has the same profile ids.

## Migrations

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
