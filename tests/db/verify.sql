-- Checks that the schema exists and basic access controls survived every migration.
do $$
declare missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array['people','meal_logs','snack_logs','drink_logs',
    'workouts','weight_entries','daily_vitals','member_names',
    'friendships','member_blocks','challenges','challenge_members',
    'friend_messages','error_reports']) as t
  where to_regclass('public.' || t) is null;
  if missing is not null then raise exception 'Missing tables: %', missing; end if;

  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing is not null then raise exception 'Tables without RLS: %', missing; end if;

  if not exists (select 1 from storage.buckets where id = 'photos' and public = false) then
    raise exception 'Private photos bucket missing';
  end if;
  if has_table_privilege('anon', 'public.error_reports', 'SELECT') then
    raise exception 'Anonymous role can read error reports';
  end if;
end $$;
