-- 8.3.6: friend search by app name, friend requests and online status.
-- Opt-in: nobody is searchable until they turn it on. No health data lives in these tables.

create table public.member_names (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  app_name text not null check (app_name ~ '^[A-Za-z0-9_.-]{3,20}$'),
  discoverable boolean not null default false,
  show_presence boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index member_names_app_name_key on public.member_names (lower(app_name));
alter table public.member_names enable row level security;
create policy "owner full access" on public.member_names for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index friendships_pair_key on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);
alter table public.friendships enable row level security;
create policy "parties can read" on public.friendships for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
create policy "request as yourself" on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
create policy "addressee accepts" on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid())) with check (addressee_id = (select auth.uid()) and status = 'accepted');
create policy "either party removes" on public.friendships for delete to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

create table public.member_blocks (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  primary key (owner_id, blocked_id),
  check (owner_id <> blocked_id)
);
alter table public.member_blocks enable row level security;
create policy "owner full access" on public.member_blocks for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Signed-out users get nothing; signed-in users change only the columns below.
revoke all on public.member_names, public.friendships, public.member_blocks from anon, authenticated;
grant select, delete on public.member_names to authenticated;
grant insert (app_name, discoverable, show_presence), update (app_name, discoverable, show_presence) on public.member_names to authenticated;
grant select, delete on public.friendships to authenticated;
grant insert (addressee_id), update (status) on public.friendships to authenticated;
grant select, insert, delete on public.member_blocks to authenticated;

-- A blocked person cannot send a request to the one who blocked them.
create function public.friendship_block_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.member_blocks b where b.owner_id = new.addressee_id and b.blocked_id = new.requester_id) then
    raise exception 'request not allowed';
  end if;
  return new;
end $$;
create trigger friendships_block_check before insert on public.friendships
  for each row execute function public.friendship_block_check();

-- Blocking someone also removes any friendship with them.
create function public.member_block_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships
   where (requester_id = new.owner_id and addressee_id = new.blocked_id)
      or (requester_id = new.blocked_id and addressee_id = new.owner_id);
  return new;
end $$;
create trigger member_blocks_cleanup after insert on public.member_blocks
  for each row execute function public.member_block_cleanup();

-- Search by name prefix: discoverable people only, at least 3 characters, never yourself or anyone who blocked you.
create function public.search_members(q text) returns table (member_id uuid, app_name text)
language sql stable security definer set search_path = '' as $$
  select m.owner_id, m.app_name
    from public.member_names m
   where length(trim(q)) >= 3
     and m.discoverable
     and m.owner_id <> (select auth.uid())
     and lower(m.app_name) like lower(replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_')) || '%'
     and not exists (select 1 from public.member_blocks b where b.owner_id = m.owner_id and b.blocked_id = (select auth.uid()))
     and not exists (select 1 from public.member_blocks b where b.owner_id = (select auth.uid()) and b.blocked_id = m.owner_id)
   order by lower(m.app_name)
   limit 10;
$$;

-- Your friends and open requests. Online status is shown only for accepted friends who allow it.
create function public.friend_list() returns table (friendship_id uuid, member_id uuid, app_name text, status text, incoming boolean, online boolean)
language sql stable security definer set search_path = '' as $$
  select f.id,
         m.owner_id,
         m.app_name,
         f.status,
         f.addressee_id = (select auth.uid()),
         f.status = 'accepted' and m.show_presence and m.last_seen_at > now() - interval '2 minutes'
    from public.friendships f
    join public.member_names m
      on m.owner_id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
   where f.requester_id = (select auth.uid()) or f.addressee_id = (select auth.uid())
   order by f.status, lower(m.app_name);
$$;

-- The app calls this about once a minute while it is open and visible.
create function public.member_ping() returns void
language sql security definer set search_path = '' as $$
  update public.member_names set last_seen_at = now() where owner_id = (select auth.uid());
$$;

revoke all on function public.search_members(text), public.friend_list(), public.member_ping() from public, anon;
grant execute on function public.search_members(text), public.friend_list(), public.member_ping() to authenticated;
revoke all on function public.friendship_block_check(), public.member_block_cleanup() from public, anon, authenticated;
