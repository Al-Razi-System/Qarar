begin;
create extension if not exists pgtap;
select plan(8);

select has_table('qarar_meetings','meeting_assignment_batches','logical assignment batches exist');
select has_table('qarar_meetings','meeting_assignment_targets','resolved assignment targets exist');
select has_table('qarar_core','organizational_unit_responsibles','explicit unit responsibles exist');
select has_function('api_v2','preview_meeting_assignment_targets_v2',array['uuid','jsonb'],'target preview contract exists');
select has_function('api_v2','propose_meeting_assignment_batch_v2',array['uuid','text','text','jsonb','date','uuid','boolean','uuid'],'atomic batch proposal contract exists');
select has_function('api_v2','confirm_meeting_assignment_batch_v2',array['uuid','integer'],'chair batch confirmation contract exists');
select has_function('api_v2','withdraw_meeting_assignment_batch_v2',array['uuid','integer'],'batch withdrawal contract exists');
select col_type_is('qarar_meetings','meeting_assignments','assignment_batch_id','uuid','legacy assignments link to their logical batch');

select * from finish();
rollback;
