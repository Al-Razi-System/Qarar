begin;

create extension if not exists pgtap;

select plan(7);

-- 1. Setup mock data
insert into public.organizations (id, code, name_ar) values ('11111111-1111-1111-1111-111111111111', 'org_a', 'Org A');
insert into public.governance_unit_types (id, organization_id, code, name_ar) values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'committee', 'Committee');

-- Unit A (minute_approval_rule: chair_and_rapporteur)
insert into public.governance_units (id, organization_id, unit_type_id, code, name_ar, minute_approval_rule) 
values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'unit_a', 'Unit A', 'chair_and_rapporteur');

-- Users
insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'chair@orga.com');
insert into public.users (id, organization_id, full_name_ar, email, is_system_admin) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Chair', 'chair@orga.com', false);

insert into auth.users (id, email) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rapp@orga.com');
insert into public.users (id, organization_id, full_name_ar, email, is_system_admin) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Rapporteur', 'rapp@orga.com', false);

-- Roles
insert into public.roles (id, organization_id, code, name_ar, role_scope) values ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'council_chair', 'Council Chair', 'governance_unit') on conflict (organization_id,code) do nothing;
insert into public.roles (id, organization_id, code, name_ar, role_scope) values ('77777777-7777-7777-7777-777777777778', '11111111-1111-1111-1111-111111111111', 'council_rapporteur', 'Council Rapporteur', 'governance_unit') on conflict (organization_id,code) do nothing;

-- Memberships
insert into public.memberships (id, organization_id, user_id, governance_unit_id, role_id) values ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', (select id from qarar_iam.roles where organization_id='11111111-1111-1111-1111-111111111111' and code='council_chair'));
insert into public.memberships (id, organization_id, user_id, governance_unit_id, role_id) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', (select id from qarar_iam.roles where organization_id='11111111-1111-1111-1111-111111111111' and code='council_rapporteur'));

-- Meeting (Waiting for minutes)
insert into public.meetings (id, organization_id, meeting_no, governance_unit_id, title_ar, scheduled_date, created_by_user_id, status) values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'M-001', '44444444-4444-4444-4444-444444444444', 'Meeting 1', '2026-08-15', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'waiting_for_minutes');

-- Minute
insert into public.meeting_minutes (id, organization_id, meeting_id, content_draft, status, created_by_user_id) values ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'draft content', 'draft', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Give the rapporteur only the contextual capability needed by the current RPC.
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id)
select r.organization_id,r.id,p.id from qarar_iam.roles r join qarar_iam.permissions p on p.organization_id=r.organization_id
where r.organization_id='11111111-1111-1111-1111-111111111111' and r.code='council_rapporteur' and p.code='meetings.manage'
on conflict do nothing;
create temporary table approval_fixture(user_id uuid,id uuid,updated_at timestamptz);
grant select on approval_fixture to authenticated;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated","aal":"aal2"}';
select ok(not has_table_privilege('authenticated','qarar_minutes.meeting_minutes','UPDATE'),'client cannot bypass the minutes RPC');
reset role;
select lives_ok($$select api_v1.submit_meeting_minutes('66666666-6666-6666-6666-666666666666','النص النهائي الكامل لمحضر الاجتماع للاختبار',(select updated_at from qarar_minutes.meeting_minutes where id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'))$$,'rapporteur submits through the current guarded RPC');
insert into approval_fixture select user_id,id,updated_at from qarar_minutes.minute_approvals where minute_id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
select is((select count(*)::integer from approval_fixture),2,'submission creates chair and rapporteur approvals');
select is((select status from qarar_meetings.meetings where id='66666666-6666-6666-6666-666666666666'),'waiting_for_approval','submission advances the meeting');
set local role authenticated;
select throws_ok($$select api_v1.respond_meeting_minutes_approval((select id from approval_fixture where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'approve',null,(select updated_at from approval_fixture where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))$$,'42501',null,'rapporteur cannot approve for chair');
select api_v1.respond_meeting_minutes_approval((select id from approval_fixture where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),'approve',null,(select updated_at from approval_fixture where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
reset role;
select is((select status from qarar_minutes.meeting_minutes where id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),'ready_for_approval','one approval does not close minutes');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2"}';
select api_v1.respond_meeting_minutes_approval((select id from approval_fixture where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'approve',null,(select updated_at from approval_fixture where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
reset role;
select is((select status from qarar_meetings.meetings where id='66666666-6666-6666-6666-666666666666'),'closed','all required approvals close the meeting');
select * from finish();rollback;
