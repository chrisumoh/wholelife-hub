-- 8.4.5: cover the two foreign keys the Supabase performance advisor flagged.
-- friendships.requester_id: the read/delete policies and friend_list() filter on
--   (requester_id = me or addressee_id = me); with an index on each side Postgres can use a BitmapOr
--   instead of scanning the table. It also serves the on-delete-cascade lookup when an account is deleted.
-- member_blocks.blocked_id: serves the on-delete-cascade lookup when the blocked account is deleted
--   (the primary key leads with owner_id, so it cannot).
-- Plain CREATE INDEX (not CONCURRENTLY, which cannot run in a migration). Both tables are tiny, so the
-- brief write lock is harmless. Nothing is dropped or changed; safe to re-run.
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists member_blocks_blocked_idx on public.member_blocks (blocked_id);
