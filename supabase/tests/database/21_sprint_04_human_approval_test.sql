begin;
create extension if not exists pgtap;
select plan(5);

insert into qarar_core.organizations(id,code,name_ar) values('45000000-0000-0000-0000-000000000001','s04-approval','Sprint 4 Approval');
insert into auth.users(id,email) values
 ('45000000-0000-0000-0000-000000000011','admin@s04-approval.test'),
 ('45000000-0000-0000-0000-000000000012','chair@s04-approval.test'),
 ('45000000-0000-0000-0000-000000000013','rapporteur@s04-approval.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
 ('45000000-0000-0000-0000-000000000011','45000000-0000-0000-0000-000000000001','admin@s04-approval.test','Admin',true),
 ('45000000-0000-0000-0000-000000000012','45000000-0000-0000-0000-000000000001','chair@s04-approval.test','Chair',false),
 ('45000000-0000-0000-0000-000000000013','45000000-0000-0000-0000-000000000001','rapporteur@s04-approval.test','Rapporteur',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar) values('45000000-0000-0000-0000-000000000021','45000000-0000-0000-0000-000000000001','council','Council');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar) values('45000000-0000-0000-0000-000000000022','45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000021','approval-council','Approval Council');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values
 ('45000000-0000-0000-0000-000000000041','45000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
 ('45000000-0000-0000-0000-000000000042','45000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit');
insert into qarar_iam.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
 ('45000000-0000-0000-0000-000000000051','45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000012','45000000-0000-0000-0000-000000000022','45000000-0000-0000-0000-000000000041'),
 ('45000000-0000-0000-0000-000000000052','45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000013','45000000-0000-0000-0000-000000000022','45000000-0000-0000-0000-000000000042');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status)
values('45000000-0000-0000-0000-000000000031','45000000-0000-0000-0000-000000000001','MTG-S04-A','45000000-0000-0000-0000-000000000022','Approval meeting',current_date,'45000000-0000-0000-0000-000000000011','waiting_for_minutes');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"45000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.create_minute_draft('45000000-0000-0000-0000-000000000031','Approved final content');
select is(api_v1.submit_minute_for_approval(
 (api_v1.get_meeting_minutes('45000000-0000-0000-0000-000000000031')->'minute'->>'id')::uuid,
 (api_v1.get_meeting_minutes('45000000-0000-0000-0000-000000000031')->'minute'->>'updated_at')::timestamptz
)->>'meeting_status','waiting_for_approval','submission moves the meeting to human approval');
select is(jsonb_array_length(api_v1.get_meeting_minutes('45000000-0000-0000-0000-000000000031')->'minute'->'approvals'),2,
 'the configured chair-and-rapporteur rule creates two tasks');

reset role;
select set_config('test.chair_approval',(select id::text from qarar_minutes.minute_approvals where user_id='45000000-0000-0000-0000-000000000012'),true),
 set_config('test.chair_updated',(select updated_at::text from qarar_minutes.minute_approvals where user_id='45000000-0000-0000-0000-000000000012'),true),
 set_config('test.rapporteur_approval',(select id::text from qarar_minutes.minute_approvals where user_id='45000000-0000-0000-0000-000000000013'),true),
 set_config('test.rapporteur_updated',(select updated_at::text from qarar_minutes.minute_approvals where user_id='45000000-0000-0000-0000-000000000013'),true);
set local role authenticated;
set local "request.jwt.claims"='{"sub":"45000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is(api_v1.decide_minute_approval(current_setting('test.chair_approval')::uuid,'approved','reviewed',current_setting('test.chair_updated')::timestamptz)->>'minute_status',
 'ready_for_approval','one human approval cannot close the meeting');
reset role;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"45000000-0000-0000-0000-000000000013","role":"authenticated"}';
select is(api_v1.decide_minute_approval(current_setting('test.rapporteur_approval')::uuid,'approved','reviewed',current_setting('test.rapporteur_updated')::timestamptz)->>'meeting_status',
 'closed','the final assigned human approval closes the meeting');
reset role;
select is((select content_final from qarar_minutes.meeting_minutes where meeting_id='45000000-0000-0000-0000-000000000031'),
 'Approved final content','the approved minute publishes an immutable final snapshot');
select * from finish();
rollback;
