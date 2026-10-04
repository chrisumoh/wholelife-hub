-- people_owner_id_idx already existed; daily_vitals' unique (person_id, log_date) already indexes those columns.
drop index if exists public.people_owner_idx;
drop index if exists public.daily_vitals_person_date_idx;
