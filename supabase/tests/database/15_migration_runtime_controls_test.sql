begin;
create extension if not exists pgtap;
select plan(7);

select ok(
 current_setting('server_version_num')::integer >= 150000,
 'runtime uses PostgreSQL 15 or newer');

select ok(
 (select rolsuper and rolcreaterole and rolbypassrls
  from pg_roles where rolname='supabase_admin'),
 'self-hosted migration role supports roles, BYPASSRLS, and event triggers');

select is(
 (select count(*)::integer
  from pg_roles
  where rolname like 'qarar\_%\_executor' escape '\'
   and rolname <> 'qarar_api_executor'
   and (rolcanlogin or not rolbypassrls)),
 0,
 'all executor roles are NOLOGIN and explicitly BYPASSRLS');

select is(
 (select count(*)::integer
  from qarar_internal.applied_migrations
  where checksum_sha256 is null
   or checksum_sha256 !~ '^[0-9a-f]{64}$'),
 0,
 'every applied migration and seed has a SHA-256 checksum');

select ok(
 exists(
  select 1 from pg_constraint
  where conrelid='qarar_internal.applied_migrations'::regclass
   and conname='applied_migrations_checksum_sha256_check'),
 'migration checksum format is constrained');

select ok(
 exists(
  select 1
  from pg_event_trigger
  where evtname='grant_iam_auth_session_access'
   and evtenabled='O'),
 'self-hosted runtime supports and enables the required event trigger');

select is(
 (select count(*)::integer
  from pg_locks
  where locktype='advisory'
   and classid=19017
   and objid=20260724),
 0,
 'migration advisory lock is released after the runner exits');

select * from finish();
rollback;
