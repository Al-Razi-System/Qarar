begin;

create extension if not exists pgtap;

select plan(5);

-- Grant privileges to authenticated role so tests can run
grant all privileges on all tables in schema public to authenticated;
grant usage on schema public to authenticated;
grant all privileges on all sequences in schema public to authenticated;

-- 1. Setup mock data
-- Org A
insert into public.organizations (id, code, name_ar) values ('11111111-1111-1111-1111-111111111111', 'org_a', 'Org A');

-- Unit Type
insert into public.governance_unit_types (id, organization_id, code, name_ar) values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'committee', 'Committee');

-- Unit A
insert into public.governance_units (id, organization_id, unit_type_id, code, name_ar) values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'unit_a', 'Unit A');

-- Normal User A
insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usera@orga.com');
insert into public.users (id, organization_id, full_name_ar, email, is_system_admin) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'User A', 'usera@orga.com', false);

-- Admin User B
insert into auth.users (id, email) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'adminb@orga.com');
insert into public.users (id, organization_id, full_name_ar, email, is_system_admin) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Admin B', 'adminb@orga.com', true);

-- Topic (Not Approved -> 'new')
insert into public.topics (id, organization_id, topic_no, title_ar, submitted_by_user_id, status) values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'T-001', 'Topic 1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'new');

-- Meeting (Draft)
insert into public.meetings (id, organization_id, meeting_no, governance_unit_id, title_ar, scheduled_date, created_by_user_id, status) values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'M-001', '44444444-4444-4444-4444-444444444444', 'Meeting 1', '2026-08-15', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'draft');


-- 2. Mock Authentication as Normal User A
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- Test 1: Normal user adding ineligible topic without exception -> Fails
select throws_like(
  $$ insert into public.agenda_items (organization_id, meeting_id, topic_id, agenda_order, is_exception) values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 1, false) $$,
  '%Topic is not eligible for agenda without an exception%',
  'Adding ineligible topic to agenda should be rejected'
);

-- Test 2: Normal user adding ineligible topic WITH exception -> Fails (No Permission)
select throws_like(
  $$ insert into public.agenda_items (organization_id, meeting_id, topic_id, agenda_order, is_exception, exception_reason) values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 1, true, 'Urgent') $$,
  '%User does not have permission to grant an exception%',
  'Normal user cannot grant agenda exception'
);

-- Switch to Admin User B to ensure RLS allows update, so we can test the trigger logic
set local "request.jwt.claims" to '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

-- Test 3: Normal user changing meeting status to 'closed' from 'draft' -> Fails
select throws_like(
  $$ update public.meetings set status = 'closed' where id = '66666666-6666-6666-6666-666666666666' $$,
  '%Invalid transition from draft to closed%',
  'Meeting status invalid transition should be blocked'
);

-- Test 4: Normal user changing meeting status to 'scheduled' from 'draft' -> Success
select lives_ok(
  $$ update public.meetings set status = 'scheduled' where id = '66666666-6666-6666-6666-666666666666' $$,
  'Valid meeting status transition (draft -> scheduled) should succeed'
);

-- Test 5: Admin User B adding ineligible topic WITH exception -> Success
select lives_ok(
  $$ insert into public.agenda_items (organization_id, meeting_id, topic_id, agenda_order, is_exception, exception_reason) values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 1, true, 'Urgent request by manager') $$,
  'Admin user CAN grant agenda exception'
);

select * from finish();
rollback;
