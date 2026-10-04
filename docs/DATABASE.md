# Database (Supabase)

Project **Whole Life Hub**, Postgres 17, region us-west-2. Migrations are in `supabase/migrations/` in the order they were applied.

## Model

One **account** (a Supabase Auth user) owns one or more **people**: the household profiles the app already supports. Every log row carries both `owner_id` (the account) and `person_id` (the profile).

| Table | One row per | Key columns |
| --- | --- | --- |
| `people` | household profile | `display_name`, `avatar_url`, `goal`, `age`, `height_cm`, `weight_kg`, `calorie_target`, `onboarding_done`, `settings` (jsonb: every profile field without its own column), `app_id`, `is_primary` |
| `meal_logs` | meal | `log_date`, `slot` (breakfast / lunch / dinner / snack), `name`, `dish_id`, `portion`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `extras` (jsonb list), `photo_path` |
| `snack_logs` | snack | `log_date`, `name`, `food_id`, `qty`, `calories` |
| `drink_logs` | drink | `log_date`, `kind`, `name`, `qty`, `volume_ml`, `calories`, `details` |
| `workouts` | workout | `log_date`, `type`, `duration_min`, `calories_burned`, `source` (Plan, Photo, manual, import name), `equipment`, `photo_path`, `details` |
| `weight_entries` | weigh-in | `log_date`, `weight_kg` |
| `daily_vitals` | person per day | `steps`, `active_kcal`, `resting_hr`, `sleep_min`, `water_ml`, `spo2`, `bp_sys`, `bp_dia`, `extra` (jsonb) |

Shared columns on every log table:

- `log_date`: the calendar day the app files the entry under (the app logs by date).
- `app_id`: the id the app generated on the device. Unique per account, so syncing the same entry twice never duplicates it.
- `updated_at`: set automatically on every update (trigger `touch_updated_at`).
- `deleted_at`: soft delete, so a delete on one device reaches the others.

Deleting an account deletes its people and every log; deleting a person deletes that person's logs.

## Security

- **Row Level Security is on for every table**, each with one policy, "owner full access": a signed-in account can read and change only rows where `owner_id` is its own id, and can only attach logs to people it owns.
- Tested 2026-10-04 inside a rolled-back transaction: account A saw its 1 meal; account B saw 0 and was blocked from writing into A's profile.
- The project's `ensure_rls` event trigger turns RLS on automatically for any new table in `public`; its function `rls_auto_enable()` can't be called over the API.
- Supabase Security Advisor: no warnings after migration `wlh_8_1_1_lock_rls_auto_enable`.

## Photo storage

Bucket **`photos`**: private, 10 MB per file, JPEG / PNG / WebP / HEIC.

Path pattern: `{account id}/{person id}/{kind}/{file}`, for example `…/meals/2026-10-04-abc.jpg`. Storage policies let an account read, upload, replace and delete only files under its own account-id folder. Tables store the path (`photo_path`); the app asks Supabase for a short-lived signed URL to show a photo.

## Next steps

1. Turn on email sign-in (Authentication › Providers) and add the site URL and redirect URLs once the app is deployed.
2. Add login / sign-up screens to the app.
3. Replace the app's save layer with Supabase calls, one table at a time, starting with `meal_logs`.
4. One-time import: send each device's existing browser data up, using `app_id` so repeats are ignored.
