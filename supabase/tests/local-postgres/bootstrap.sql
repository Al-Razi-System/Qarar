-- Minimal stand-in for the Supabase platform objects the Qarar migrations rely on.
do $$ begin if not exists (select 1 from pg_roles where rolname='postgres') then create role postgres superuser login; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator noinherit login; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin noinherit createrole login; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='supabase_storage_admin') then create role supabase_storage_admin noinherit createrole login; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='dashboard_user') then create role dashboard_user createrole createdb; end if; end $$;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres with admin option;
create schema extensions; create schema auth; create schema storage;
grant usage on schema extensions, auth, storage to public;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgtap with schema extensions;
create table auth.users (
  instance_id uuid, id uuid primary key default gen_random_uuid(), aud varchar(255), role varchar(255), email varchar(255) unique,
  encrypted_password varchar(255), email_confirmed_at timestamptz, invited_at timestamptz, confirmation_token varchar(255), confirmation_sent_at timestamptz,
  recovery_token varchar(255), recovery_sent_at timestamptz, email_change_token_new varchar(255), email_change varchar(255), email_change_sent_at timestamptz,
  last_sign_in_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean, created_at timestamptz default now(), updated_at timestamptz default now(),
  phone text, phone_confirmed_at timestamptz, phone_change text default '', phone_change_token varchar(255) default '', phone_change_sent_at timestamptz,
  confirmed_at timestamptz, email_change_token_current varchar(255) default '', email_change_confirm_status smallint default 0, banned_until timestamptz,
  reauthentication_token varchar(255) default '', reauthentication_sent_at timestamptz, is_sso_user boolean not null default false, deleted_at timestamptz, is_anonymous boolean not null default false);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz default now(), updated_at timestamptz default now(),
  factor_id uuid, aal text, not_after timestamptz, refreshed_at timestamp, user_agent text, ip inet, tag text);
create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users(id) on delete cascade, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, email text);
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
create function auth.email() returns text language sql stable as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')::text $$;
create table storage.buckets (id text primary key, name text not null unique, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(), public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], owner_id text);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now(), metadata jsonb, path_tokens text[] generated always as (string_to_array(name, '/')) stored, version text, owner_id text, user_metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'),1)] $$;
grant all on all tables in schema auth, storage to postgres, service_role, supabase_auth_admin, supabase_storage_admin;
grant execute on all functions in schema auth, storage to public;
alter database :"db" set search_path = "$user", public, extensions;
-- Supabase's default privileges on the public schema.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
