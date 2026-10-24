-- The notification review workspace is system-admin-only and never exposes secrets.
begin;
create extension if not exists pgtap;
select plan(10);

select has_function('api_v1','admin_get_notification_workspace',array['integer'],'notification workspace contract exists');
select function_returns('api_v1','admin_get_notification_workspace',array['integer'],'jsonb','workspace returns one bounded document');
select ok(has_function_privilege('authenticated','api_v1.admin_get_notification_workspace(integer)','execute'),'authenticated users may reach the contextual guard');
select ok(not has_function_privilege('anon','api_v1.admin_get_notification_workspace(integer)','execute'),'anonymous callers are denied');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace_delivery_reason_base(integer)'::regprocedure),'is_system_admin','implementation enforces system administrator context');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace_delivery_reason_base(integer)'::regprocedure),'''destination'',d.destination','system administrators receive the full destination for operational review');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace_delivery_reason_base(integer)'::regprocedure),'provider_message_id','provider message identifiers are returned for traceability');
-- The workspace delegates to the delivery-reason function since 20261021010000; it holds the guard and the fields.
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure),'admin_get_notification_workspace_delivery_reason_base','the workspace delegates to the guarded delivery-reason function');
select ok(position('lock_token' in (select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace_base(integer)'::regprocedure))=0,'delivery lock tokens are not returned');
select ok(position('''variables''' in (select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace_base(integer)'::regprocedure))=0,'template variables are not returned');

select * from finish();
rollback;
