begin;

create extension if not exists pgtap;

select plan(5);

-- Grant privileges to authenticated role so tests can run
grant all privileges on all tables in schema public to authenticated;
grant usage on schema public to authenticated;
grant all privileges on all sequences in schema public to authenticated;

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
insert into public.roles (id, organization_id, code, name_ar, role_scope) values ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'council_chair', 'Council Chair', 'governance_unit');
insert into public.roles (id, organization_id, code, name_ar, role_scope) values ('77777777-7777-7777-7777-777777777778', '11111111-1111-1111-1111-111111111111', 'council_rapporteur', 'Council Rapporteur', 'governance_unit');

-- Memberships
insert into public.memberships (id, organization_id, user_id, governance_unit_id, role_id) values ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777');
insert into public.memberships (id, organization_id, user_id, governance_unit_id, role_id) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777778');

-- Meeting (Waiting for minutes)
insert into public.meetings (id, organization_id, meeting_no, governance_unit_id, title_ar, scheduled_date, created_by_user_id, status) values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'M-001', '44444444-4444-4444-4444-444444444444', 'Meeting 1', '2026-08-15', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'waiting_for_minutes');

-- Minute
insert into public.meeting_minutes (id, organization_id, meeting_id, content_draft, status, created_by_user_id) values ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'draft content', 'draft', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Mock Admin context
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

-- Test 1: Change minute status to ready_for_approval generates minute_approvals
update public.meeting_minutes set status = 'ready_for_approval' where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

select is(
  (select count(*)::int from public.minute_approvals where minute_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  2,
  'Should generate 2 minute_approvals (Chair and Rapporteur)'
);

-- Test 2: Meeting status changes to waiting_for_approval
select is(
  (select status from public.meetings where id = '66666666-6666-6666-6666-666666666666'),
  'waiting_for_approval',
  'Meeting status should automatically transition to waiting_for_approval'
);

-- Test 3: RLS prevents User B (Rapporteur) from updating User A's (Chair) approval
update public.minute_approvals set approval_status = 'approved' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select approval_status from public.minute_approvals where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'pending',
  'User B cannot update User A approval (RLS blocks silently)'
);

-- Test 4: User B updates their own approval
update public.minute_approvals set approval_status = 'approved' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select is(
  (select status from public.meeting_minutes where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  'ready_for_approval',
  'Minute status should remain ready_for_approval after 1 approval out of 2'
);

-- Mock User A context
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- Test 5: User A updates their approval -> closes meeting
update public.minute_approvals set approval_status = 'approved' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select status from public.meetings where id = '66666666-6666-6666-6666-666666666666'),
  'closed',
  'Meeting status should become closed after all approvals are met'
);

select * from finish();
rollback;
