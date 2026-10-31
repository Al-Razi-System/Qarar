begin;
create extension if not exists pgtap;
select plan(5);

select has_function('qarar_governance','claim_whatsapp_notification_outbox',array['uuid','uuid','integer','integer'],'dedicated WhatsApp claim exists');
select has_function('api_v1','service_claim_whatsapp_notification_outbox',array['uuid','uuid','integer','integer'],'service facade exists');
select matches((select prosrc from pg_proc where oid='qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer)'::regprocedure),'meeting\.invitation\.requested','meeting invitations are eligible');
select matches((select prosrc from pg_proc where oid='qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer)'::regprocedure),'execution\.task\.completed','task completion is eligible');
select ok(position('governance.workflow.started' in (select prosrc from pg_proc where oid='qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer)'::regprocedure))=0,'generic governance events are not consumed');

select * from finish();
rollback;
