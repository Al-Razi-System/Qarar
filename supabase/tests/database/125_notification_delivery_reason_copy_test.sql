begin;
create extension if not exists pgtap;
select plan(4);

select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure),'DESTINATION_INVALID','missing or invalid destination has dedicated copy');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure),'لا يملك رقم جوال صالحًا','skipped delivery reason is Arabic and actionable');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure),'مرتبط بحساب واتساب','provider recipient rejection explains the corrective action');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure),$$item->>'error_message'$$,'fallback reason remains text before JSON construction');

select * from finish();
rollback;
