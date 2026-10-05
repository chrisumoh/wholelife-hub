-- WholeLife Hub 8.1.11 (Login / Meals sync): the app flags a meal as estimated (est); meal_logs had no column for it.
-- Additive only. No new table, so no new RLS policy: meal_logs keeps its owner-only "owner full access" policy.
alter table public.meal_logs
  add column if not exists est boolean not null default false;
