begin;

create extension if not exists pgtap;

select plan(4);

-- 1. Setup mock data
-- Org A
insert into public.organizations (id, code, name_ar, name_en) values ('11111111-1111-1111-1111-111111111111', 'org_a', 'Org A', 'Org A');
-- Org B
insert into public.organizations (id, code, name_ar, name_en) values ('22222222-2222-2222-2222-222222222222', 'org_b', 'Org B', 'Org B');

-- User A (belongs to Org A)
insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usera@orga.com');
insert into public.users (id, organization_id, full_name_ar, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'User A', 'usera@orga.com');

-- User B (belongs to Org B)
insert into auth.users (id, email) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'userb@orgb.com');
insert into public.users (id, organization_id, full_name_ar, email) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'User B', 'userb@orgb.com');

-- Topic Category for Org A
insert into public.topic_categories (id, organization_id, code, name_ar) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'cat_a', 'Category A');
insert into public.topics (id, organization_id, topic_no, title_ar, category_id, submitted_by_user_id)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111',
        'T-001', 'Topic A', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 2. Mock Authentication as User A
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- Test 1: clients cannot bypass the versioned RPC even for their own tenant.
select throws_ok(
  $$ insert into public.topics (id, organization_id, topic_no, title_ar, category_id, submitted_by_user_id) values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'T-001', 'Topic A', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '42501',
  'permission denied for view topics',
  'User A must create topics through api_v1'
);

-- Test 2: cross-tenant direct writes are also blocked at the privilege boundary.
select throws_ok(
  $$ insert into public.topics (organization_id, topic_no, title_ar, submitted_by_user_id) values ('22222222-2222-2222-2222-222222222222', 'T-002', 'Topic B', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '42501',
  'permission denied for view topics',
  'User A should NOT be able to create a topic in Org B (RLS Blocked)'
);

-- Test 3: Ensure User A can see their own topic
select results_eq(
  $$ select title_ar from public.topics where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  $$ values ('Topic A'::text) $$,
  'User A can see the topic they created in Org A'
);

-- 3. Mock Authentication as User B
set local "request.jwt.claims" to '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

-- Test 4: Ensure User B CANNOT see User A's topic (Tenant Isolation)
select is_empty(
  $$ select * from public.topics where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'User B should NOT be able to see topics from Org A (Tenant Isolation Success)'
);

-- Finish tests
select * from finish();

rollback;
