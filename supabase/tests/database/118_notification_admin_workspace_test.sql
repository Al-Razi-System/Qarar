-- The notification review workspace is system-admin-only and never exposes secrets.
begin;
create extension if not exists pgtap;
select plan(9);

select has_function('api_v1','admin_get_notification_workspace',array['integer'],'notification workspace contract exists');
select function_returns('api_v1','admin_get_notification_workspace',array['integer'],'jsonb','workspace returns one bounded document');
select ok(has_function_privilege('authenticated','api_v1.admin_get_notification_workspace(integer)','execute'),'authenticated users may reach the contextual guard');
select ok(not has_function_privilege('anon','api_v1.admin_get_notification_workspace(integer)','execute'),'anonymous callers are denied');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure),'is_system_admin','implementation enforces system administrator context');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure),'destination_masked','only the masked destination is selected');
select ok(position('provider_message_id' in (select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure))=0,'provider message identifiers are not returned');
select ok(position('lock_token' in (select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure))=0,'delivery lock tokens are not returned');
select ok(position('''variables''' in (select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure))=0,'template variables are not returned');

select * from finish();
rollback;
