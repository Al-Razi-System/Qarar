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

-- Unit A (Quorum 51%)
insert into public.governance_units (id, organization_id, unit_type_id, code, name_ar, quorum_percentage) values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'unit_a', 'Unit A', 51);

-- Users
insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usera@orga.com');
insert into public.users (id, organization_id, full_name_ar, email, is_system_admin) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'User A', 'usera@orga.com', false);

insert into auth.users (id, email) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'userb@orga.com');
insert into public.users (id, organization_id, full_name_ar, email, is_system_admin) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'User B', 'userb@orga.com', true);

-- Roles & Memberships (2 Members in Unit A)
insert into public.roles (id, organization_id, code, name_ar, role_scope) values ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'council_member', 'Council Member', 'governance_unit');

insert into public.memberships (id, organization_id, user_id, governance_unit_id, role_id) values ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777');
insert into public.memberships (id, organization_id, user_id, governance_unit_id, role_id) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777');

-- Topic & Meeting (In Progress)
insert into public.topics (id, organization_id, topic_no, title_ar, submitted_by_user_id, status) values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'T-001', 'Topic 1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'approved');

insert into public.meetings (id, organization_id, meeting_no, governance_unit_id, title_ar, scheduled_date, created_by_user_id, status) values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'M-001', '44444444-4444-4444-4444-444444444444', 'Meeting 1', '2026-08-15', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'in_progress');

insert into public.agenda_items (id, organization_id, meeting_id, topic_id, agenda_order, voting_status) values ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 1, 'open');

-- Attendance Records
insert into public.attendance_records (organization_id, meeting_id, user_id, membership_id, attendance_status) values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 'present');
insert into public.attendance_records (organization_id, meeting_id, user_id, membership_id, attendance_status) values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '99999999-9999-9999-9999-999999999999', 'absent');

-- Mock Admin context
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

-- Test 1: Calculate Quorum (1 out of 2 is 50%, quorum_percentage is 51 -> not_met)
select is(
  public.calculate_meeting_quorum('66666666-6666-6666-6666-666666666666'),
  'not_met',
  'Quorum should be not_met (50% < 51%)'
);

-- Test 2: Cannot proceed to minutes if quorum is not met
select throws_like(
  $$ update public.meetings set status = 'waiting_for_minutes' where id = '66666666-6666-6666-6666-666666666666' $$,
  '%Cannot proceed to minutes phase. Quorum is not met.%',
  'Transition to waiting_for_minutes blocked by quorum failure'
);

-- Mock User A Context
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- Test 3: Cast a valid vote
select lives_ok(
  $$ insert into public.votes (id, organization_id, meeting_id, topic_id, user_id, membership_id, vote_value) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 'approve') $$,
  'User A can cast a valid vote while meeting is in progress and voting is open'
);

-- Test 4: Cannot update vote (Immutable)
update public.votes set vote_value = 'reject' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

select is(
  (select vote_value from public.votes where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'approve',
  'Votes cannot be updated once cast (RLS blocks silently)'
);

-- Mock Admin context for closing vote
set local "request.jwt.claims" to '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

-- Test 5: Close voting freezes result
update public.agenda_items set voting_status = 'closed' where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

select is(
  (select voting_result from public.agenda_items where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  'approved',
  'Voting result should be frozen to approved based on 1 approve vote'
);

select * from finish();
rollback;
