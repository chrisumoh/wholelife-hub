-- 8.4.3: an account-bound record of the person's coach-chat opt-in, checked by the database before every reservation.
-- Why: the request flag "consent: true" is typed by the browser, so a direct call could skip the opt-in screen, and a stale tab could keep sending
-- after the person withdrew. The row below is written only by coach_consent_set() for the signed-in person (never from a client-supplied id,
-- never with a client-supplied time), and coach_reserve() refuses to take a slot without it.
-- This file does not edit 20261030120000 (it may already be applied): it adds the table and replaces coach_reserve, so it works on a
-- project that has run the first file and on a fresh one that runs both in order.

create table public.ai_coach_consent (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version text not null check (length(version) between 1 and 40),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
alter table public.ai_coach_consent enable row level security;
create policy "owner reads own coach consent" on public.ai_coach_consent for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.ai_coach_consent from anon, authenticated;
grant select on public.ai_coach_consent to authenticated;

-- Grants (p_on true) or withdraws (false) the signed-in person's consent. The person is auth.uid(); there is no user argument to forge.
create function public.coach_consent_set(p_on boolean, p_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_on then
    insert into public.ai_coach_consent (user_id, version) values (v_user, left(coalesce(nullif(trim(p_version), ''), 'unknown'), 40))
    on conflict (user_id) do update set version = excluded.version, granted_at = now(), withdrawn_at = null;
  else
    update public.ai_coach_consent set withdrawn_at = now() where user_id = v_user and withdrawn_at is null;
  end if;
end $$;
revoke all on function public.coach_consent_set(boolean, text) from public, anon, authenticated;
grant execute on function public.coach_consent_set(boolean, text) to authenticated;

-- Replaces the 8.4.1 version, which returned a bare uuid. Now: status 'ok' (log_id is the new pending row), 'rate_limited', or 'consent_required'.
-- Same per-person advisory lock, so the consent check, the count and the insert cannot interleave for one person.
drop function if exists public.coach_reserve(uuid, text, integer);
create function public.coach_reserve(p_user uuid, p_message text, p_limit integer) returns table (status text, log_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if not exists (select 1 from public.ai_coach_consent c where c.user_id = p_user and c.withdrawn_at is null) then
    return query select 'consent_required'::text, null::uuid; return;
  end if;
  if (select count(*) from public.ai_coach_logs l where l.user_id = p_user and l.created_at > now() - interval '1 hour') >= p_limit then
    return query select 'rate_limited'::text, null::uuid; return;
  end if;
  insert into public.ai_coach_logs (user_id, message, route) values (p_user, p_message, 'pending') returning id into v_id;
  return query select 'ok'::text, v_id;
end $$;
revoke all on function public.coach_reserve(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.coach_reserve(uuid, text, integer) to service_role;
