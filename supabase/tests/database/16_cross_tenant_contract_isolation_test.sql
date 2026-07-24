begin;
create extension if not exists pgtap;
select plan(6);

insert into public.organizations(id,code,name_ar) values
('46000000-0000-0000-0000-000000000001','tenant-guard-a','Tenant Guard A'),
('46000000-0000-0000-0000-000000000002','tenant-guard-b','Tenant Guard B');

insert into auth.users(id,email) values
('46000000-0000-0000-0000-000000000011','admin-a@tenant-guard.test'),
('46000000-0000-0000-0000-000000000012','user-b@tenant-guard.test');

insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('46000000-0000-0000-0000-000000000011','46000000-0000-0000-0000-000000000001',
 'admin-a@tenant-guard.test','Tenant A Administrator',true),
('46000000-0000-0000-0000-000000000012','46000000-0000-0000-0000-000000000002',
 'user-b@tenant-guard.test','Tenant B User',false);

insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('46000000-0000-0000-0000-000000000021','46000000-0000-0000-0000-000000000002',
 'tenant-b-unit','Tenant B Unit Type');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('46000000-0000-0000-0000-000000000022','46000000-0000-0000-0000-000000000002',
 '46000000-0000-0000-0000-000000000021','tenant-b-unit','Tenant B Unit');

insert into public.topics(
 id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status
) values (
 '46000000-0000-0000-0000-000000000031','46000000-0000-0000-0000-000000000002',
 'TENANT-B-TOPIC','Tenant B Topic','46000000-0000-0000-0000-000000000022',
 '46000000-0000-0000-0000-000000000012','approved'
);

insert into public.meetings(
 id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,
 created_by_user_id,status
) values (
 '46000000-0000-0000-0000-000000000041','46000000-0000-0000-0000-000000000002',
 'TENANT-B-MEETING','46000000-0000-0000-0000-000000000022','Tenant B Meeting',
 current_date,'46000000-0000-0000-0000-000000000012','in_progress'
);

insert into public.agenda_items(
 id,organization_id,meeting_id,topic_id,agenda_order
) values (
 '46000000-0000-0000-0000-000000000051','46000000-0000-0000-0000-000000000002',
 '46000000-0000-0000-0000-000000000041','46000000-0000-0000-0000-000000000031',1
);

insert into public.voting_rounds(
 id,organization_id,meeting_id,agenda_item_id,round_number,eligible_voter_count,
 opened_by_user_id
) values (
 '46000000-0000-0000-0000-000000000061','46000000-0000-0000-0000-000000000002',
 '46000000-0000-0000-0000-000000000041','46000000-0000-0000-0000-000000000051',
 1,0,'46000000-0000-0000-0000-000000000012'
);

insert into public.audit_logs(
 id,organization_id,actor_user_id,action,entity_type,entity_id
) values (
 '46000000-0000-0000-0000-000000000071','46000000-0000-0000-0000-000000000002',
 '46000000-0000-0000-0000-000000000012','tenant.guard.fixture','topic',
 '46000000-0000-0000-0000-000000000031'
);

set local role authenticated;
set local "request.jwt.claims" =
'{"sub":"46000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
 $$select api_v1.admin_get_user_detail('46000000-0000-0000-0000-000000000012')$$,
 'P0001','user not found in current organization',
 'IAM hides a foreign-tenant user from a tenant system administrator');

select throws_ok(
 $$select api_v1.get_topic_detail('46000000-0000-0000-0000-000000000031')$$,
 'P0002','topic not found',
 'Topics hides a foreign-tenant topic');

select throws_ok(
 $$select api_v1.get_meeting_detail('46000000-0000-0000-0000-000000000041')$$,
 'P0002','meeting not found',
 'Meetings hides a foreign-tenant meeting');

select throws_ok(
 $$select api_v1.get_meeting_session_detail('46000000-0000-0000-0000-000000000041')$$,
 'P0002','meeting not found',
 'Attendance hides a foreign-tenant meeting session');

select throws_ok(
 $$select api_v1.get_voting_round_detail('46000000-0000-0000-0000-000000000061')$$,
 'P0002','voting round not found',
 'Voting hides a foreign-tenant voting round');

select throws_ok(
 $$select api_v1.admin_get_audit_log('46000000-0000-0000-0000-000000000071')$$,
 'P0001','audit log not found',
 'Audit hides a foreign-tenant audit event');

select * from finish();
rollback;
