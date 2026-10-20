-- Dispatch context must enrich terse historical outbox payloads from source records.
begin;
create extension if not exists pgtap;
select plan(6);

select function_returns('qarar_governance','get_notification_dispatch_context',array['uuid','uuid'],'jsonb','dispatch context remains jsonb');
select function_lang_is('qarar_governance','get_notification_dispatch_context',array['uuid','uuid'],'plpgsql','dispatch enrichment is transactional');
select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure),'meeting_no','meeting reference is included');
select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure),'governance_unit_name_ar','council name is included');
select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure),'decision_no','decision reference is included');
select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure),'description','task summary is included');

select * from finish();
rollback;
