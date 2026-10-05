-- Real-database check: account B cannot read, change or write into account A's meals.
-- Everything runs inside one transaction that is rolled back at the end, so nothing is kept.
-- Run it in the Supabase SQL editor (or ask Claude to run it). Every check raises an exception
-- if it fails; if the script reaches the final select, all checks passed.
begin;

-- two throwaway accounts, a profile and a meal for A (inserted as the table owner, so RLS is bypassed here)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'rls-test-a@example.invalid'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'rls-test-b@example.invalid');
insert into public.people (id, owner_id, display_name, app_id)
  values ('aaaaaaaa-1111-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'A person', 'a-person');
insert into public.meal_logs (owner_id, person_id, app_id, log_date, name, slot, calories)
  values ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-1111-0000-0000-00000000000a', 'a-meal-1', current_date, 'Jollof rice', 'lunch', 600);

-- act as account B through the same role the app uses
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- 1. B reads nothing of A's
  select count(*) into n from public.meal_logs;
  if n <> 0 then raise exception 'FAIL: B can read % meal(s)', n; end if;
  select count(*) into n from public.people;
  if n <> 0 then raise exception 'FAIL: B can read % profile(s)', n; end if;

  -- 2. B cannot change or soft-delete A's meal
  update public.meal_logs set deleted_at = now() where app_id = 'a-meal-1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B updated % of A''s meal(s)', n; end if;

  -- 3. B cannot write a meal into A's profile, even when claiming to be the owner
  begin
    insert into public.meal_logs (owner_id, person_id, app_id, log_date, name, slot)
      values ('bbbbbbbb-0000-0000-0000-00000000000b', 'aaaaaaaa-1111-0000-0000-00000000000a', 'b-sneaky', current_date, 'x', 'lunch');
    raise exception 'FAIL: B inserted a meal into A''s profile';
  exception when insufficient_privilege or check_violation then null; -- expected: row-level security refused it
  end;

  -- 4. B cannot write a meal that claims A as the owner
  begin
    insert into public.meal_logs (owner_id, person_id, app_id, log_date, name, slot)
      values ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-1111-0000-0000-00000000000a', 'b-as-a', current_date, 'x', 'lunch');
    raise exception 'FAIL: B inserted a meal as A';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;

-- and A still sees their own meal, untouched
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare n int; d timestamptz;
begin
  select count(*), max(deleted_at) into n, d from public.meal_logs;
  if n <> 1 or d is not null then raise exception 'FAIL: A should see exactly 1 live meal, saw % (deleted_at %)', n, d; end if;
end $$;

reset role;
select 'PASS: account B cannot read or write account A''s meals' as result;
rollback;
