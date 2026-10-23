-- Provider test sends are contextual, auditable and recorded before network I/O.
begin;
create extension if not exists pgtap;
select plan(12);

select has_function('api_v1','admin_begin_notification_test',array['text'],'test send begin contract exists');
select has_function('api_v1','admin_finish_notification_test',array['uuid','uuid','boolean','text','text','text','integer'],'test send completion contract exists');
select function_returns('api_v1','admin_begin_notification_test',array['text'],'jsonb','begin returns an opaque completion token');
select function_returns('api_v1','admin_finish_notification_test',array['uuid','uuid','boolean','text','text','text','integer'],'jsonb','completion returns the recorded result');
select ok(has_function_privilege('authenticated','api_v1.admin_begin_notification_test(text)','execute'),'authenticated reaches the contextual guard');
select ok(not has_function_privilege('anon','api_v1.admin_begin_notification_test(text)','execute'),'anonymous is denied');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_begin_notification_test(text)'::regprocedure),'is_system_admin','begin requires system admin context');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_begin_notification_test(text)'::regprocedure),'notification_deliveries','delivery is recorded before provider I/O');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_begin_notification_test(text)'::regprocedure),'processing','in-flight tests cannot be claimed by the channel worker');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer)'::regprocedure),'for update','completion is concurrency safe');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer)'::regprocedure),'notification_delivery_attempts','completion appends an attempt record');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer)'::regprocedure),'append_audit_log','test operations are audited');

select * from finish();
rollback;
