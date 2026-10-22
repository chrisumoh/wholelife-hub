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

## Account sync (8.2.16)

Everything a person logs syncs, signed in, through the tables above. No migration was needed (checked against the live schema, read-only).

| App data | Table | Key | Notes |
| --- | --- | --- | --- |
| profile | `people` | `app_id` = profile id | columns: `display_name`, `is_primary`, `onboarding_done`, `goal`, `age`, `height_cm`, `weight_kg`, `calorie_target`, `workouts_per_week`, `cultural_background`, `allergies` and `nutrition_preferences` (arrays), `avatar_url` (photo path). Everything else in `settings` jsonb (`v: 2`): see `SB_PROF_SET` and `SB_PREM_SYNC` in `index.html` |
| meals | `meal_logs` | `app_id` | `photo_path` |
| snacks | `snack_logs` | `app_id` | `qty`, `calories` |
| drinks | `drink_logs` | `app_id` | `kind`, `qty`, `calories`, `details.units` |
| workouts | `workouts` | `app_id` | `source` ("manual" when the app has none), `equipment`, `photo_path` |
| weigh-ins | `weight_entries` | `app_id` | `weight_kg` |
| vitals, incl. imported Apple Health | `daily_vitals` | unique `(person_id, log_date)` | `steps`, `active_kcal`, `resting_hr`, `sleep_min`, `water_ml`, `spo2`, `bp_sys`, `bp_dia`; any other field in `extra`. No `deleted_at`: a deleted day is an otherwise empty row with `extra._d` set |
| photos | bucket `photos` | `<user id>/<person id>/<type>/<app id>.jpg` | `<type>` is `meals`, `workouts`, `progress` or `avatar`. Progress photos have no table: their paths are in `people.settings.prem.shots` |

- **`photo_path` and `avatar_url` hold `path#version`.** The part before `#` is the file's path in the bucket; the version is a short hash of the photo when it was uploaded. A replacement keeps the same path, so the version is how another device knows to download it. Entries carry two small local markers for this (`pv`, `pt`). Files that could not be deleted are kept on a saved retry list.
- **Photos** are re-encoded in the browser (canvas, JPEG) before upload: metadata and location are dropped and the file is fitted under about 200 KB (60 KB for meal and workout photos and 100 KB for the profile picture, the app's own local limits). The switch Sync photos (Settings > Privacy & security, on by default, stored with the account's local data) stops both directions. Deleting an entry or profile removes its files. Form-check videos are never uploaded.
- **Conflicts: the later change wins.** A change waiting on a device carries the time it was made (never earlier than the latest `updated_at` the device has seen). Before it is sent, the app reads the row: if `updated_at` is later, the account's copy wins and the waiting change is dropped; otherwise it is uploaded. Deletes follow the same rule through `deleted_at`, in both directions (an older deletion does not erase a newer edit, and an older edit does not bring back a newer deletion). The few milliseconds between the read and the write are not closed: that would need a rule in the database.
- **New device:** the first sync after the page loads reads each table in full, in pages of 1000, deleted rows included, under a "Syncing your data…" screen when there is nothing local. Later syncs on the five log tables read only rows with `updated_at` at or after the last pull. Meals and `people` are still read in full each time.
- **The queue is explicit.** A change is written to storage before any upload starts; an item is removed only after the server confirms it and only if it has not changed since it was sent (each queued item carries the time of its last change, and the live queue is checked, not a copy); the shorter queue is written back immediately; one worker runs at a time (`sbSchedule`). The updated_at the account returns for the device's own write is remembered so that write is never treated as another device's later change.
- **Offline:** changes are queued (meals and profiles in the offline cache `wlh.meals.v1`, the rest in the root of the account's saved data), survive a reload, and are sent when back online.
- **Passcode:** it locks and encrypts the copy on the device only. Sync runs while unlocked (the waiting list lives in the encrypted data and is restored on unlock) and the rows and files in the account are not encrypted with it. Locked, nothing is sent or received.

## How the app uses it (8.2.4)

- **Email sign-in** (Supabase Auth, password, email confirmation on). The provider, the site URL and the redirect URLs are dashboard settings, not migrations; the redirect rules are in [SECURITY.md](SECURITY.md).
- **Meals and the basics of each profile are saved here.** While signed in with no passcode, `meal_logs` is the store for meals and `people` for profiles, with a local copy in the browser (`wlh.meals.v1`, which also holds the waiting changes) so the app works offline and queues changes. Workouts and weigh-ins are saved here too (8.2.15, below). Snacks, drinks and vitals still save in the browser; their tables are not used yet.
- **Workouts and weigh-ins (8.2.15).** `workouts` and `weight_entries` rows are matched on `app_id` = the entry's id, upserted with `onConflict: "owner_id,app_id"`, and soft-deleted with `deleted_at`. Unlike meals they also stay in the saved months on the device; the list of changes still waiting is kept in the root of the saved profile data (`kp`, so a passcode encrypts it) and is also tracked, not uploaded, while a passcode is on. Mapping: workouts use `log_date`, `performed_at`, `type`, `duration_min` (rounded), `calories_burned` (rounded), `source` ("manual" when the app has none), `notes`, `equipment`; weigh-ins use `log_date`, `measured_at`, `weight_kg`. `details` and `photo_path` are not used: workout photos stay on the device. The app pulls both tables on every sync, deleted rows included, and applies them entry by entry (`sbApplyKind()`): a waiting local change wins, a deleted row removes the local entry, a live row replaces a differing local entry, a local-only entry is queued. No migration was needed: the tables, columns, unique indexes and policies already existed.
- **Profiles (8.2.4).** Each household profile is a `people` row matched on `app_id` = the profile's id. Columns: `display_name`, `is_primary`, `onboarding_done`, `goal`, `age`, `height_cm`, `weight_kg`, `calorie_target`, `workouts_per_week`, `cultural_background`. `settings` (jsonb, `v: 1`) holds `style`, `diet`, `allergies`, `sex`, `units`, `level`, `sport`, `targetKg`, `workoutGoal`, `cultureMode`, `focus`, `coachPersona`, `coachName`, `rotation`, `menuSkip`, `limits`, `gear`, and the first-run flags `coachPrompted` and `tourSeen`. Never uploaded: plans, coach history, reminders, appearance, awards, `prem` (progress photos, clips). The list is `SB_PROF_COLS` and `SB_PROF_SET` in `index.html`; adding a field there is a privacy change (update the privacy text, [SECURITY.md](SECURITY.md) and this table in the same build).
- **Which copy wins** (`sbApplyPeople()`): a change waiting on this device always wins; a profile only the account has is created on the device; a profile deleted in the account (`deleted_at`, from another device) is removed here unless an edit is waiting; a profile this browser has never synced takes the account's copy if another device stored a full one (`settings.v`), otherwise this device's copy is sent; otherwise the account's copy replaces the device's when it differs. A delete here soft-deletes the row. Edits are sent about a second after they are made, and waiting edits survive a reload.
- Deleting a meal sets `deleted_at`; the app never hard-deletes rows.
- **A passcode no longer stops sync (8.2.16).** It locks and encrypts the device copy only; see Account sync above.
- Rows are plain records protected by RLS, not end-to-end encrypted; photos are private files under the account's own folder.

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
| `20261022020000` | `wlh_8_3_7_friends_presence` | Friends: `member_names`, `friendships`, `member_blocks`, functions `search_members`, `friend_list`, `member_ping`. **Not applied until the owner runs it.** |
| `20261022030000` | `wlh_8_3_10_workout_challenges` | Challenges: `challenges`, `challenge_members` (RLS on, no direct grants), functions `create_challenge`, `respond_challenge`, `leave_challenge`, `my_challenges`, `challenge_board`. **Not applied until the owner runs it.** |
| `20261022060000` | `wlh_8_3_17_friend_messages` | Friend messages: `friend_messages` with RLS and an accepted-friends trigger. Applied to the live project. |

## Friends and online status (8.3.7)

Opt-in social layer, no health data. All three tables have RLS on and no `anon` access.

- `member_names` (one row per account): `app_name` (3 to 20 of `A-Za-z0-9_.-`, unique ignoring case), `discoverable` (default false), `show_presence` (default true), `last_seen_at`. Owner-only policy. The app can write only the first three columns; `last_seen_at` is set by `member_ping()`.
- `friendships`: `requester_id`, `addressee_id`, `status` (`pending` or `accepted`), one row per pair. Either party reads or deletes it; only the requester inserts (pending) and only the addressee accepts.
- `member_blocks`: owner and blocked account. A blocked account cannot send a request, and blocking removes an existing friendship. The Friends card blocks and unblocks through it (8.3.21); the app reads only the blocked ids, so names shown in the Blocked people list are kept on the device.
- `search_members(q)`: security definer, 3+ characters, name prefix, discoverable accounts only, never yourself or anyone who blocked you, 10 results. Returns name and id only.
- `friend_list()`: your friendships with the other person's name and, for accepted friends who allow it, `online` (seen within 2 minutes).
- Search and presence are the only way to see another account's row; there is no select policy on another person's `member_names`.

## Friend messages (8.3.17)

- `friend_messages`: `sender_id`, `recipient_id`, `body` (1 to 500 characters), `created_at`, `read_at`. RLS on, no `anon` access. Either party reads; a sender inserts as themselves and deletes their own; only the recipient updates, and only `read_at` (column grant).
- A before-insert trigger (`friend_message_check`, security definer) allows a message only between accepted friends and refuses it when either has blocked the other.
- Applied to the live project on 2026-10-22 at the owner's request.

## Photo storage

Bucket **`photos`**: private, 10 MB per file, JPEG / PNG / WebP / HEIC.

Path pattern: `{account id}/{person id}/{kind}/{file}`, for example `…/meals/2026-10-04-abc.jpg`. Storage policies let an account read, upload, replace and delete only files under its own account-id folder. Tables store the path (`photo_path`); the app asks Supabase for a short-lived signed URL to show a photo.

## Next steps

Done in 8.1.11: login screens and `meal_logs` (including the first-sign-in upload of a device's existing meals). Done in 8.2.4: profile basics through `people`, so a second device shows its profiles and meals. Done in 8.2.15: workouts and weigh-ins.

Done in 8.2.16: every log type, all profile fields and photos (above). Left:

1. Incremental pulls for `meal_logs` and `people` (today they are read in full each sync).
2. Form-check videos (never uploaded today).
3. End-to-end encryption of the account's copy, if a passcode should protect it too.

## Challenges (8.3.10)

- `challenges` (owner, title, metric `minutes`/`workouts`/`calories`, `starts_on`, `ends_on` up to 30 days) and `challenge_members` (`invited` or `joined`). Both have RLS and no direct grants for signed-in users; the app uses the functions only.
- `create_challenge` invites accepted friends only (not anyone either side blocked), 1 to 9 friends, 3 open challenges per owner.
- `challenge_board(id)` returns each joined member's total and app name, for joined members only. It sums each person's main profile (`people.is_primary`) over `workouts.log_date` in the dates. No workout rows are ever returned.

## Edge function: license (8.3.21)
No table. `supabase/functions/license` checks a Premium licence key with Lemon Squeezy and reads the order for the receipt; nothing is stored in the database. Deploy with `--no-verify-jwt` (a buyer may not be signed in). Secrets, set in Supabase and never committed: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_PRODUCT_ID_MONTHLY`, `LEMONSQUEEZY_PRODUCT_ID_YEARLY`, and `LEMONSQUEEZY_ALLOW_TEST=1` only while testing with test-mode keys. It answers `{ state: valid | invalid | expired | limit | error, plan, expires, instance, receipt }` and refuses keys from any other store or product (Monthly and Yearly are separate products; the product id gives the plan). The app keeps the key and device id on the device only (`wlh.lic`).
