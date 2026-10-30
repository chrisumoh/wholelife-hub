-- 8.4.1: log of every WL Coach chat exchange (the wl-coach edge function). A row holds what the person asked, what the coach
-- answered, which route and model handled it, token counts and timing. Questions can mention health, so each person can
-- read only their own rows and nobody can change them from the app. Only the edge function (service role) inserts.
-- Rows are removed with the account (on delete cascade), so the delete-account function covers them.

create table public.ai_coach_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (length(message) <= 1000),
  reply text not null default '' check (length(reply) <= 8000),
  route text not null check (route in ('redflag', 'small', 'big')),
  model text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  error text check (length(error) <= 300),
  created_at timestamptz not null default now()
);
create index ai_coach_logs_user_created_idx on public.ai_coach_logs (user_id, created_at desc);
alter table public.ai_coach_logs enable row level security;

create policy "owner reads own coach logs" on public.ai_coach_logs for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.ai_coach_logs from anon, authenticated;
grant select on public.ai_coach_logs to authenticated;
