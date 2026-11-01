-- Minimal Supabase-shaped objects for the disposable PostgreSQL CI database.
-- This is not a replacement for a full Supabase preview environment.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null
);
alter table storage.objects enable row level security;
create function storage.foldername(path text) returns text[] language sql immutable as $$
  select string_to_array(path, '/')
$$;

-- Present on hosted Supabase; the repository's locking migration revokes it.
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$
begin
end $$;

grant usage on schema auth, storage to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
