-- WholeLife Hub 8.1.8 (Sys Architecture): core schema for syncing the app to Supabase.
-- (Applied under the name wlh_8_1_1_core_schema before the build was renumbered 8.1.8.)
-- Extends the 2026-10-02 tables (empty at the time) to the app's data model and adds drinks,
-- daily vitals, photo storage and sync helpers. Every table: owner-only access via RLS.

-- shared helper: keep updated_at current on every update
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- people: one row per household profile; settings holds every profile field without a column
alter table public.people
  add column if not exists app_id text,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists is_primary boolean not null default false,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;
create unique index if not exists people_owner_app_id_key on public.people(owner_id, app_id) where app_id is not null;
create index if not exists people_owner_idx on public.people(owner_id);

-- log tables: log_date (the day the app files the entry under), app_id (offline id, so re-sync
-- never duplicates), updated_at, deleted_at (soft delete, so deletes reach other devices)
do $$
declare t text;
begin
  foreach t in array array['meal_logs','snack_logs','workouts','weight_entries'] loop
    execute format('alter table public.%I add column if not exists app_id text', t);
    execute format('alter table public.%I add column if not exists log_date date', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
  end loop;
end $$;

update public.meal_logs set log_date = (logged_at at time zone 'utc')::date where log_date is null;
update public.snack_logs set log_date = (logged_at at time zone 'utc')::date where log_date is null;
update public.workouts set log_date = (performed_at at time zone 'utc')::date where log_date is null;
update public.weight_entries set log_date = (measured_at at time zone 'utc')::date where log_date is null;
alter table public.meal_logs alter column log_date set default current_date, alter column log_date set not null;
alter table public.snack_logs alter column log_date set default current_date, alter column log_date set not null;
alter table public.workouts alter column log_date set default current_date, alter column log_date set not null;
alter table public.weight_entries alter column log_date set default current_date, alter column log_date set not null;

-- meals: slot, dish, portion, photo; extras become a list (the app stores add-ons as objects)
alter table public.meal_logs
  add column if not exists slot text,
  add column if not exists dish_id text,
  add column if not exists portion numeric not null default 1,
  add column if not exists photo_path text;
alter table public.meal_logs drop constraint if exists meal_logs_slot_check;
alter table public.meal_logs add constraint meal_logs_slot_check check (slot is null or slot in ('breakfast','lunch','dinner','snack'));
alter table public.meal_logs alter column extras type jsonb using case when extras is null then '[]'::jsonb else to_jsonb(extras) end;
alter table public.meal_logs alter column extras set default '[]'::jsonb;

-- snacks: quantity and catalogue id
alter table public.snack_logs
  add column if not exists qty numeric not null default 1,
  add column if not exists food_id text;

-- workouts: the app records Plan, Photo, manual and import sources, plus equipment and a photo
alter table public.workouts drop constraint if exists workouts_source_check;
alter table public.workouts
  add column if not exists equipment text,
  add column if not exists photo_path text,
  add column if not exists details jsonb not null default '{}'::jsonb;

-- drinks
create table if not exists public.drink_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  app_id text,
  log_date date not null default current_date,
  logged_at timestamptz not null default now(),
  kind text,
  name text not null,
  qty numeric not null default 1,
  volume_ml numeric,
  calories integer,
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- daily vitals: one row per person per day
create table if not exists public.daily_vitals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  log_date date not null,
  steps integer check (steps is null or steps >= 0),
  active_kcal integer,
  resting_hr integer check (resting_hr is null or resting_hr between 20 and 250),
  sleep_min integer check (sleep_min is null or sleep_min between 0 and 1440),
  water_ml numeric,
  spo2 numeric check (spo2 is null or spo2 between 50 and 100),
  bp_sys integer, bp_dia integer,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (person_id, log_date)
);

-- ownership: cascade deletes when an account or profile is removed
do $$
declare t text;
begin
  foreach t in array array['meal_logs','snack_logs','workouts','weight_entries'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_person_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (person_id) references public.people(id) on delete cascade', t, t || '_person_id_fkey');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_owner_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (owner_id) references auth.users(id) on delete cascade', t, t || '_owner_id_fkey');
  end loop;
end $$;
alter table public.people drop constraint if exists people_owner_id_fkey;
alter table public.people add constraint people_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;

-- indexes, idempotent sync keys, updated_at triggers, RLS on
do $$
declare t text;
begin
  foreach t in array array['meal_logs','snack_logs','workouts','weight_entries','drink_logs','daily_vitals'] loop
    execute format('create index if not exists %I on public.%I(person_id, log_date)', t || '_person_date_idx', t);
    execute format('create index if not exists %I on public.%I(owner_id)', t || '_owner_idx', t);
    if t <> 'daily_vitals' then
      execute format('create unique index if not exists %I on public.%I(owner_id, app_id) where app_id is not null', t || '_owner_app_id_key', t);
    end if;
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
drop trigger if exists touch_updated_at on public.people;
create trigger touch_updated_at before update on public.people for each row execute function public.touch_updated_at();

-- the new tables get the same owner-only policy as the existing log tables
do $$
declare t text;
begin
  foreach t in array array['drink_logs','daily_vitals'] loop
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format($p$create policy "owner full access" on public.%I for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()) and exists (select 1 from public.people p where p.id = %I.person_id and p.owner_id = (select auth.uid())))$p$, t, t);
  end loop;
end $$;

-- photo storage: private bucket; each account reads/writes only its own folder
-- path: {auth.uid()}/{person_id}/{kind}/{file}  e.g. <uid>/<person>/meals/2026-10-04-abc.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos: owner read" on storage.objects;
drop policy if exists "photos: owner insert" on storage.objects;
drop policy if exists "photos: owner update" on storage.objects;
drop policy if exists "photos: owner delete" on storage.objects;
create policy "photos: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
