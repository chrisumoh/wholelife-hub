alter table public.meal_logs
  add column if not exists est boolean not null default false;
