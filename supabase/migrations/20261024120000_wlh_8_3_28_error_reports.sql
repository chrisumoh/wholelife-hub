-- 8.3.28: crash reports from the browser app (observability.js). No health data, no account id:
-- an error message, the page path, the browser string and the time. The app already cuts URLs down to
-- their path and blanks token-looking values before it sends, and these length caps stop anything larger.
-- Insert-only: the app's public key can add a report and can never read one back.

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
