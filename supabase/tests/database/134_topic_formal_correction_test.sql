begin;
create extension if not exists pgtap;
select plan(17);

select has_table('qarar_governance','topic_correction_requests','numbered formal correction requests exist');
select has_table('qarar_governance','topic_correction_locations','before/after correction locations exist');
select has_table('qarar_governance','topic_correction_stations','ordered council correction stations exist');
select has_table('qarar_governance','corrected_document_versions','immutable corrected document versions exist');
select has_table('qarar_governance','corrected_document_signatures','corrected minutes signatures exist');
select has_function('api_v2','open_topic_correction_v2',array['uuid','text','jsonb','uuid','integer'],'chair can open an idempotent correction request');
select has_function('api_v2','get_topic_correction_v2',array['uuid'],'authorized viewers can read one correction journey');
select has_function('api_v2','decide_topic_correction_station_v2',array['uuid','text','text','integer','uuid'],'the contextual chair decides the active station');
select has_trigger('qarar_meetings','agenda_items','block_agenda_while_topic_correction','agenda insertion is guarded while correction is active');
select has_trigger('qarar_voting','voting_rounds','block_vote_while_topic_correction','voting is guarded while correction is active');
select has_function('api_v2','list_topic_corrections_v2',array['uuid'],'topic details can discover its correction journeys');
select has_function('api_v2','withdraw_topic_correction_v2',array['uuid','integer','uuid'],'the opener can withdraw an unfinished correction');
select has_function('api_v2','sign_corrected_minutes_v2',array['uuid','jsonb','integer'],'chair and rapporteur can sign corrected minutes');
select has_function('api_v2','revise_topic_correction_v2',array['uuid','text','jsonb','integer','uuid'],'the opener can revise and resubmit a rejected correction');
select has_function('qarar_topics','get_topic_detail_with_corrections',array['uuid'],'topic reads expose the newest completed corrected version');
select has_function('qarar_topics','get_topic_meeting_history_with_corrections',array['uuid'],'meeting history retains originals and exposes corrected decisions and minutes');
select has_trigger('qarar_governance','workflow_instance_steps','block_workflow_transition_while_topic_correction','the governed journey is paused while a correction is open');

select * from finish();
rollback;
