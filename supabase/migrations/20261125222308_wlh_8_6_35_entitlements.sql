-- 8.6.35: an account-bound record of a paid Premium subscription, so Premium follows the signed-in account instead of a pasted key.
-- Why: Lemon Squeezy is closing on 2027-03-31 and its emailed license keys have no equivalent at the replacement provider. The provider
-- will tell a server function (billing-webhook, added in a later build) when someone pays, renews, cancels or is refunded; that function
-- writes this table with the service role. The app only ever reads the signed-in person's own rows.
-- One subscription covers the signed-in account only (every profile saved under it), never other accounts. `seats` and the household plan
-- names are reserved for a later multi-account plan (up to 5 people, each with their own account); this build uses seats = 1 only.

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (length(provider) between 1 and 40),
  provider_customer_id text check (provider_customer_id is null or length(provider_customer_id) <= 120),
  provider_subscription_id text not null check (length(provider_subscription_id) between 1 and 120),
  plan text not null check (plan in ('monthly', 'yearly', 'household_monthly', 'household_yearly')),
  seats integer not null default 1 check (seats between 1 and 5),
  status text not null check (status in ('active', 'past_due', 'canceled', 'refunded')),
  current_period_end timestamptz,
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
-- A foreign key gets its own index (8.4.5), and the app looks rows up by owner.
create index entitlements_owner_id_idx on public.entitlements (owner_id);

alter table public.entitlements enable row level security;
create policy "owner reads own entitlements" on public.entitlements for select to authenticated
  using (owner_id = (select auth.uid()));
-- No insert, update or delete policy and no grant: the browser can read its own rows and nothing else. The service role bypasses RLS.
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
