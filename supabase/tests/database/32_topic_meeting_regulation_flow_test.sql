begin;
create extension if not exists pgtap;
select plan(23);

select has_table('qarar_governance','topic_regulation_references','topic regulation references exist');
select has_table('qarar_topics','topic_requirement_fulfillments','topic requirement fulfillment exists');
select has_column('qarar_topics','topic_attachments','requirement_code','attachments link to a requirement');
select has_function('api_v1','create_topic_with_regulation_bundle',array['text','text','uuid','uuid','uuid','uuid','uuid','uuid','jsonb','text','text','text','uuid'],'atomic topic and regulation bundle API exists');
select has_function('api_v1','list_topic_regulation_references',array['uuid'],'topic regulation reference API exists');
select has_function('api_v1','get_topic_requirements_status',array['uuid'],'requirement status API exists');
select has_function('api_v1','fulfill_topic_requirement',array['uuid','text','text'],'requirement fulfillment API exists');
select has_function('api_v1','get_topic_meeting_history',array['uuid'],'topic meeting outcome history API exists');

select ok(has_function_privilege('authenticated','api_v1.create_topic_with_regulation_bundle(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid)','EXECUTE'),'authenticated can create governed topic atomically');
select ok(not has_function_privilege('anon','api_v1.create_topic_with_regulation_bundle(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid)','EXECUTE'),'anonymous cannot create governed topic');
select ok(not has_function_privilege('anon','api_v1.get_topic_requirements_status(uuid)','EXECUTE'),'anonymous cannot read requirements');
select ok(not has_function_privilege('anon','api_v1.get_topic_meeting_history(uuid)','EXECUTE'),'anonymous cannot read meeting outcomes');
select ok(has_table_privilege('qarar_topics_executor','qarar_governance.topic_regulation_references','SELECT,INSERT,UPDATE,DELETE'),'topics executor can maintain regulation references');
select ok(has_table_privilege('qarar_topics_executor','qarar_topics.topic_requirement_fulfillments','SELECT,INSERT,UPDATE,DELETE'),'topics executor can maintain requirement status');

select ok((select pg_get_functiondef('qarar_topics.review_topic(uuid,text,text,timestamptz)'::regprocedure) like '%assert_topic_requirements_ready%'),'review enforces mandatory requirements');
select ok((select pg_get_functiondef('qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)'::regprocedure) like '%review_topic%'),'governance review keeps topic status synchronized');
select ok((select pg_get_functiondef('qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)'::regprocedure) like '%تُنفذ من الاجتماع%'),'meeting-owned workflow steps cannot be bypassed from topic review');
select ok(has_function_privilege('qarar_governance_executor','qarar_topics.assert_topic_requirements_ready(uuid,text)','EXECUTE'),'governance executor can enforce topic requirements');
select ok((select pg_get_functiondef('qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer)'::regprocedure) like '%routing_ready%'),'agenda search checks routing readiness');
select ok((select pg_get_functiondef('qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer)'::regprocedure) like '%responsibility%'),'agenda search checks workflow responsibility');
select ok(exists(select 1 from pg_trigger where tgname='agenda_items_governance_guard' and not tgisinternal),'authoritative agenda governance guard exists');
select ok(exists(select 1 from pg_trigger where tgname='voting_rounds_governance_guard' and not tgisinternal),'authoritative voting workflow guard exists');
select ok(exists(select 1 from pg_trigger where tgname='voting_round_topic_requirements_guard' and not tgisinternal),'mandatory requirements guard exists before voting');

select * from finish();
rollback;
