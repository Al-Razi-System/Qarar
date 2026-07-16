begin;

create extension if not exists pgtap;

select plan(5);

-- Grant privileges to authenticated role so tests can run
grant all privileges on all tables in schema public to authenticated;
grant usage on schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Set up test data
insert into public.organizations (id, code, name_ar) 
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TEST5', 'Test Org') on conflict do nothing;

insert into public.governance_unit_types (id, organization_id, code, name_ar)
values ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comm', 'Committee') on conflict do nothing;

insert into public.governance_units (id, organization_id, unit_type_id, code, name_ar)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'unit5', 'Test Unit') on conflict do nothing;

insert into auth.users (id, email) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'user@test.com') on conflict do nothing;
insert into public.users (id, organization_id, email, full_name_ar, is_system_admin)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user@test.com', 'Test User', true) on conflict do nothing;

insert into public.topics (id, organization_id, topic_no, title_ar, description, submitted_by_user_id)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TOP-001', 'Test Topic', 'Desc', 'cccccccc-cccc-cccc-cccc-cccccccccccc') on conflict do nothing;

-- Create a decision in draft status
insert into public.decisions (id, organization_id, decision_no, topic_id, governance_unit_id, decision_text, decision_status, issued_by_user_id)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DEC-001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test Decision', 'draft', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Authenticate
select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "user_metadata": {"organization_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}', true);
select set_config('role', 'authenticated', true);

-- Test 1: Cannot send draft decision to execution
select throws_like(
  $$ update public.decisions set decision_status = 'sent_to_execution' where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  '%Invalid decision transition%',
  'Should prevent draft -> sent_to_execution transition'
);

-- Test 2: Cannot create action item for draft decision
select throws_like(
  $$ insert into public.action_items (organization_id, action_no, decision_id, topic_id, title_ar) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ACT-001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Test Action') $$,
  '%Cannot create an action item for a decision in draft status%',
  'Should prevent creating action item for draft decision'
);

-- Test 3: Can update draft -> approved
select lives_ok(
  $$ update public.decisions set decision_status = 'approved' where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  'Should allow draft -> approved transition'
);

-- Test 4: Decision status history is recorded
select is(
  (select count(*) from public.decision_status_history where decision_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and to_status = 'approved'),
  1::bigint,
  'Decision status history should be recorded'
);

-- Test 5: Action item starting execution updates decision status to under_follow_up
-- First create the action item (now that decision is approved)
insert into public.action_items (id, organization_id, action_no, decision_id, topic_id, title_ar, assigned_user_id) 
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ACT-001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Test Action', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Then update its status to in_progress
update public.action_items set status = 'in_progress', progress_percent = 10 where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

-- Check decision status
select is(
  (select decision_status from public.decisions where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'under_follow_up',
  'Decision status should automatically change to under_follow_up when action item starts'
);

select * from finish();
rollback;
