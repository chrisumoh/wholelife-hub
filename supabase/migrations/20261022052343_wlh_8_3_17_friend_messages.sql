-- 8.3.17: messages between accepted friends. Text only, no health data.

create table public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index friend_messages_recipient_idx on public.friend_messages (recipient_id, created_at desc);
create index friend_messages_sender_idx on public.friend_messages (sender_id, created_at desc);
alter table public.friend_messages enable row level security;
create policy "parties can read" on public.friend_messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "send as yourself" on public.friend_messages for insert to authenticated
  with check (sender_id = (select auth.uid()));
create policy "recipient marks read" on public.friend_messages for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy "sender unsends" on public.friend_messages for delete to authenticated
  using (sender_id = (select auth.uid()));

-- Signed-out users get nothing; signed-in users can only add a message, mark one read, or delete their own.
revoke all on public.friend_messages from anon, authenticated;
grant select, delete on public.friend_messages to authenticated;
grant insert (recipient_id, body), update (read_at) on public.friend_messages to authenticated;

-- Only accepted friends can message each other, and not once either side has blocked the other.
create function public.friend_message_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.friendships f
                  where f.status = 'accepted'
                    and ((f.requester_id = new.sender_id and f.addressee_id = new.recipient_id)
                      or (f.requester_id = new.recipient_id and f.addressee_id = new.sender_id))) then
    raise exception 'message not allowed';
  end if;
  if exists (select 1 from public.member_blocks b
              where (b.owner_id = new.recipient_id and b.blocked_id = new.sender_id)
                 or (b.owner_id = new.sender_id and b.blocked_id = new.recipient_id)) then
    raise exception 'message not allowed';
  end if;
  return new;
end $$;
create trigger friend_messages_check before insert on public.friend_messages
  for each row execute function public.friend_message_check();
revoke all on function public.friend_message_check() from public, anon, authenticated;
