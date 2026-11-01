-- 8.3.28: crash reports from the browser app (observability.js). No health data, no account id:
-- an error message, the page path, the browser string and the time. The app already cuts URLs down to
-- their path and blanks token-looking values before it sends, and these length caps stop anything larger.
-- Insert-only: the app's public key can add a report and can never read one back.
-- Write limits (approved by CJ 2026-10-24): at most 120 reports a minute across everyone, a hard cap of 20,000
-- rows, and created_at always set by the database. The speed limit is global, so a flood could hide real reports
-- for that minute; the table is a bug inbox, not evidence of anything. The optional 30-day cleanup needs pg_cron
-- and is left commented out at the end.

create table public.error_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('error', 'rejection', 'manual', 'event')),
  label text not null default '' check (length(label) <= 300),
  message text not null check (length(message) between 1 and 2000),
  stack text not null default '' check (length(stack) <= 8000),
  page text not null default '' check (length(page) <= 300),
  user_agent text not null default '' check (length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
create index error_reports_created_idx on public.error_reports (created_at desc);
alter table public.error_reports enable row level security;

-- Signed-out and signed-in users may both report; there is deliberately no select, update or delete policy,
-- so no browser can read the reports back. Read them in the dashboard (Table editor) or with a service role.
create policy "anyone may report an error" on public.error_reports for insert to anon, authenticated
  with check (true);

revoke all on public.error_reports from anon, authenticated;
grant insert on public.error_reports to anon, authenticated;

-- Runs as the table owner so it can count rows even though the browser roles have no select.
create function public.error_reports_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if (select count(*) from public.error_reports where created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many reports, try again later' using errcode = '54000';
  end if;
  if (select count(*) from public.error_reports) >= 20000 then
    raise exception 'report store is full' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function public.error_reports_guard() from public, anon, authenticated;

create trigger error_reports_guard before insert on public.error_reports
  for each row execute function public.error_reports_guard();

-- OPTIONAL (needs the pg_cron extension switched on in the project; skip if you would rather clean up by hand):
-- select cron.schedule('error-reports-30-day-cleanup', '17 3 * * *',
--   $$delete from public.error_reports where created_at < now() - interval '30 days'$$);
