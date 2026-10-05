-- PostgREST upserts (on_conflict=owner_id,app_id) need a plain unique index: it can't pass the
-- WHERE clause a partial index requires. NULL app_ids stay allowed many times (NULLs are distinct).
drop index if exists public.people_owner_app_id_key;
drop index if exists public.meal_logs_owner_app_id_key;
drop index if exists public.snack_logs_owner_app_id_key;
drop index if exists public.workouts_owner_app_id_key;
drop index if exists public.weight_entries_owner_app_id_key;
drop index if exists public.drink_logs_owner_app_id_key;
create unique index people_owner_app_id_key on public.people(owner_id, app_id);
create unique index meal_logs_owner_app_id_key on public.meal_logs(owner_id, app_id);
create unique index snack_logs_owner_app_id_key on public.snack_logs(owner_id, app_id);
create unique index workouts_owner_app_id_key on public.workouts(owner_id, app_id);
create unique index weight_entries_owner_app_id_key on public.weight_entries(owner_id, app_id);
create unique index drink_logs_owner_app_id_key on public.drink_logs(owner_id, app_id);
-- incremental pulls read "rows changed since X" per account
create index if not exists meal_logs_owner_updated_idx on public.meal_logs(owner_id, updated_at);
create index if not exists people_owner_updated_idx on public.people(owner_id, updated_at);
