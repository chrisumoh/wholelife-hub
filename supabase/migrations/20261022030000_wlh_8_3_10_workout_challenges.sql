-- 8.3.10: friends workout challenges. Members see each other's totals only, never workout rows.
-- All access goes through the functions below; the tables have RLS on and no direct grants.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  metric text not null check (metric in ('minutes', 'workouts', 'calories')),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 30)
);
create index challenges_owner_idx on public.challenges (owner_id);
alter table public.challenges enable row level security;
create policy "owner full access" on public.challenges for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create table public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  primary key (challenge_id, member_id)
);
create index challenge_members_member_idx on public.challenge_members (member_id);
alter table public.challenge_members enable row level security;
create policy "member sees own row" on public.challenge_members for select to authenticated
  using (member_id = (select auth.uid()));

revoke all on public.challenges, public.challenge_members from anon, authenticated;

-- Start a challenge and invite accepted friends (not anyone who blocked you or you blocked).
create function public.create_challenge(p_title text, p_metric text, p_starts date, p_ends date, p_friends uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); cid uuid; f uuid;
begin
  if me is null then raise exception 'sign in first'; end if;
  if coalesce(array_length(p_friends, 1), 0) not between 1 and 9 then raise exception 'invite 1 to 9 friends'; end if;
  if (select count(*) from public.challenges c where c.owner_id = me and c.ends_on >= current_date) >= 3 then
    raise exception 'too many open challenges';
  end if;
  insert into public.challenges (owner_id, title, metric, starts_on, ends_on) values (me, trim(p_title), p_metric, p_starts, p_ends) returning id into cid;
  insert into public.challenge_members (challenge_id, member_id, status) values (cid, me, 'joined');
  foreach f in array p_friends loop
    if exists (select 1 from public.friendships fr where fr.status = 'accepted'
                and ((fr.requester_id = me and fr.addressee_id = f) or (fr.requester_id = f and fr.addressee_id = me)))
       and not exists (select 1 from public.member_blocks b where (b.owner_id = me and b.blocked_id = f) or (b.owner_id = f and b.blocked_id = me)) then
      insert into public.challenge_members (challenge_id, member_id) values (cid, f) on conflict do nothing;
    end if;
  end loop;
  return cid;
end $$;

-- Join or decline an invite.
create function public.respond_challenge(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if p_accept then
    update public.challenge_members set status = 'joined' where challenge_id = p_id and member_id = me and status = 'invited';
  else
    delete from public.challenge_members where challenge_id = p_id and member_id = me and status = 'invited';
  end if;
end $$;

-- Leave (anyone but the owner) or end (owner deletes it for everyone).
create function public.leave_challenge(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if exists (select 1 from public.challenges c where c.id = p_id and c.owner_id = me) then
    delete from public.challenges where id = p_id;
  else
    delete from public.challenge_members where challenge_id = p_id and member_id = me;
  end if;
end $$;

-- Challenges you own or were invited to.
create function public.my_challenges()
returns table (id uuid, title text, metric text, starts_on date, ends_on date, owner_name text, is_owner boolean, status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.metric, c.starts_on, c.ends_on, n.app_name, c.owner_id = (select auth.uid()), m.status
    from public.challenge_members m
    join public.challenges c on c.id = m.challenge_id
    left join public.member_names n on n.owner_id = c.owner_id
   where m.member_id = (select auth.uid())
     and c.ends_on >= current_date - 7
   order by c.ends_on desc, c.created_at desc;
$$;

-- Joined members' totals over the challenge dates. Only joined members may read it.
-- Counts each person's main profile only, so a household's other profiles never add up.
create function public.challenge_board(p_id uuid)
returns table (app_name text, total bigint, is_you boolean)
language sql stable security definer set search_path = '' as $$
  select coalesce(n.app_name, 'Member'),
         coalesce(sum(case c.metric when 'minutes' then w.duration_min when 'calories' then w.calories_burned else 1 end), 0)::bigint,
         m.member_id = (select auth.uid())
    from public.challenges c
    join public.challenge_members m on m.challenge_id = c.id and m.status = 'joined'
    left join public.member_names n on n.owner_id = m.member_id
    left join public.people p on p.owner_id = m.member_id and p.is_primary and p.deleted_at is null
    left join public.workouts w on w.person_id = p.id and w.deleted_at is null and w.log_date between c.starts_on and c.ends_on
   where c.id = p_id
     and exists (select 1 from public.challenge_members me where me.challenge_id = p_id and me.member_id = (select auth.uid()) and me.status = 'joined')
   group by m.member_id, n.app_name
   order by 2 desc, 1;
$$;

revoke all on function public.create_challenge(text, text, date, date, uuid[]), public.respond_challenge(uuid, boolean),
  public.leave_challenge(uuid), public.my_challenges(), public.challenge_board(uuid) from public, anon;
grant execute on function public.create_challenge(text, text, date, date, uuid[]), public.respond_challenge(uuid, boolean),
  public.leave_challenge(uuid), public.my_challenges(), public.challenge_board(uuid) to authenticated;
