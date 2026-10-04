-- (Copied from the project's migration history; applied 2026-10-02.)
-- People: one account can hold several profiles (e.g. you and your wife)
create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  display_name text not null,
  avatar_url text,
  -- onboarding answers; all optional, dashboard starts empty
  goal text,
  nutrition_preferences text[],
  allergies text[],
  age int check (age is null or age between 1 and 120),
  height_cm numeric,
  weight_kg numeric,
  workouts_per_week int check (workouts_per_week is null or workouts_per_week between 0 and 21),
  cultural_background text,
  calorie_target int,
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  person_id uuid not null references public.people(id) on delete cascade,
  logged_at timestamptz not null default now(),
  name text not null,
  extras text,
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  notes text
);

create table public.snack_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  person_id uuid not null references public.people(id) on delete cascade,
  logged_at timestamptz not null default now(),
  name text not null,
  calories int,
  notes text
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  person_id uuid not null references public.people(id) on delete cascade,
  performed_at timestamptz not null default now(),
  type text not null,
  duration_min int,
  calories_burned int,
  source text not null default 'manual' check (source in ('manual','apple_health','google_health')),
  notes text
);

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  person_id uuid not null references public.people(id) on delete cascade,
  measured_at timestamptz not null default now(),
  weight_kg numeric not null
);

-- Indexes (RLS policies and foreign keys filter on these)
create index on public.people (owner_id);
create index on public.meal_logs (owner_id, person_id, logged_at desc);
create index on public.snack_logs (owner_id, person_id, logged_at desc);
create index on public.workouts (owner_id, person_id, performed_at desc);
create index on public.weight_entries (owner_id, person_id, measured_at desc);

-- Row-level security: every row is visible only to the account that owns it
alter table public.people enable row level security;
alter table public.meal_logs enable row level security;
alter table public.snack_logs enable row level security;
alter table public.workouts enable row level security;
alter table public.weight_entries enable row level security;

create policy "owner full access" on public.people
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner full access" on public.meal_logs
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.people p where p.id = person_id and p.owner_id = (select auth.uid()))
  );

create policy "owner full access" on public.snack_logs
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.people p where p.id = person_id and p.owner_id = (select auth.uid()))
  );

create policy "owner full access" on public.workouts
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.people p where p.id = person_id and p.owner_id = (select auth.uid()))
  );

create policy "owner full access" on public.weight_entries
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.people p where p.id = person_id and p.owner_id = (select auth.uid()))
  );
