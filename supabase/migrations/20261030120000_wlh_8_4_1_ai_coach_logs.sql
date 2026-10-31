-- 8.4.1: log of every WL Coach chat exchange (the wl-coach edge function). A row holds what the person asked, what the coach
-- answered, which route and model handled it, token counts and timing. Questions can mention health, so each person can
-- read only their own rows and nobody can change them from the app. Only the edge function (service role) inserts.
-- The function reserves a row (route 'pending') BEFORE calling the model, under a per-person lock, so the hourly limit holds
-- even for simultaneous requests; it then fills the row in. Rows are removed with the account (on delete cascade), so the delete-account function covers them.

create table public.ai_coach_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (length(message) <= 1000),
  reply text not null default '' check (length(reply) <= 8000),
  route text not null check (route in ('pending', 'redflag', 'small', 'big')),
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

-- Counts the person's rows from the last hour and, if under the limit, adds a pending row, all under one advisory lock per person.
-- Returns the new row's id, or null when the limit is reached. Only the edge function (service role) may call it.
create function public.coach_reserve(p_user uuid, p_message text, p_limit integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if (select count(*) from public.ai_coach_logs where user_id = p_user and created_at > now() - interval '1 hour') >= p_limit then
    return null;
  end if;
  insert into public.ai_coach_logs (user_id, message, route) values (p_user, p_message, 'pending') returning id into v_id;
  return v_id;
end $$;
revoke all on function public.coach_reserve(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.coach_reserve(uuid, text, integer) to service_role;
