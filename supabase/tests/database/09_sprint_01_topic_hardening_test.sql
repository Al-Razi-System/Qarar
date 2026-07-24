begin;

create extension if not exists pgtap;
select plan(20);

insert into public.organizations(id,code,name_ar) values
('41000000-0000-0000-0000-000000000001','s01-a','Sprint 01 A'),
('41000000-0000-0000-0000-000000000002','s01-b','Sprint 01 B');
insert into auth.users(id,email) values
('41000000-0000-0000-0000-000000000011','author@s01.test'),
('41000000-0000-0000-0000-000000000012','reviewer@s01.test'),
('41000000-0000-0000-0000-000000000013','outsider@s01.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('41000000-0000-0000-0000-000000000011','41000000-0000-0000-0000-000000000001','author@s01.test','Author'),
('41000000-0000-0000-0000-000000000012','41000000-0000-0000-0000-000000000001','reviewer@s01.test','Reviewer'),
('41000000-0000-0000-0000-000000000013','41000000-0000-0000-0000-000000000002','outsider@s01.test','Outsider');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('41000000-0000-0000-0000-000000000021','41000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('41000000-0000-0000-0000-000000000022','41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000021','main','Main Council');
insert into public.topic_categories(id,organization_id,code,name_ar) values
('41000000-0000-0000-0000-000000000023','41000000-0000-0000-0000-000000000001','policy','Policy');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('41000000-0000-0000-0000-000000000031','41000000-0000-0000-0000-000000000001','submitter','Submitter','governance_unit'),
('41000000-0000-0000-0000-000000000032','41000000-0000-0000-0000-000000000001','reviewer','Reviewer','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('41000000-0000-0000-0000-000000000041','41000000-0000-0000-0000-000000000001','topics.create','topics','create','governance_unit','Create'),
('41000000-0000-0000-0000-000000000042','41000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read'),
('41000000-0000-0000-0000-000000000043','41000000-0000-0000-0000-000000000001','topics.review','topics','review','governance_unit','Review');
insert into public.role_permissions(organization_id,role_id,permission_id) values
('41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000031','41000000-0000-0000-0000-000000000041'),
('41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000032','41000000-0000-0000-0000-000000000042'),
('41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000032','41000000-0000-0000-0000-000000000043');
insert into public.memberships(organization_id,user_id,governance_unit_id,role_id) values
('41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000011','41000000-0000-0000-0000-000000000022','41000000-0000-0000-0000-000000000031'),
('41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000012','41000000-0000-0000-0000-000000000022','41000000-0000-0000-0000-000000000032');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $$select api_v1.create_topic('Bad', 'short', '41000000-0000-0000-0000-000000000023', '41000000-0000-0000-0000-000000000022')$$,
  'title_ar must contain between 5 and 300 characters',
  'PB-002 rejects invalid required fields atomically'
);
select is((select count(*) from public.topics)::integer, 0, 'invalid request creates no partial topic');

create temporary table sprint01_state(topic_id uuid, updated_at timestamptz);
insert into sprint01_state(topic_id)
select (api_v1.create_topic(
    'Valid governance topic', 'A sufficiently detailed topic description',
    '41000000-0000-0000-0000-000000000023',
    '41000000-0000-0000-0000-000000000022',
    'high', 'new', 'Valid topic'
  )->>'id')::uuid;
update sprint01_state s
set updated_at = t.updated_at
from public.topics t
where t.id = s.topic_id;

select matches((select topic_no from public.topics limit 1), '^TOP-[0-9]{4}-000001$', 'PB-001 generates a server-side reference');
select is((select organization_id from public.topics limit 1), '41000000-0000-0000-0000-000000000001'::uuid, 'organization comes from authenticated context');
select is((select submitted_by_user_id from public.topics limit 1), '41000000-0000-0000-0000-000000000011'::uuid, 'submitter comes from authenticated context');
select is((select status from public.topics limit 1), 'new', 'topic starts in new status');
select is((select count(*) from public.topic_status_history)::integer, 1, 'creation writes status history');
reset role;
select is((select count(*) from public.audit_logs where action='topics.create')::integer, 1, 'creation writes audit trail');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-0000-0000-000000000011","role":"authenticated"}';
select ok(not has_table_privilege('authenticated','public.topics','INSERT'), 'direct topic insert is revoked');
select ok(not has_table_privilege('authenticated','public.topics','UPDATE'), 'direct topic update is revoked');

set local "request.jwt.claims" = '{"sub":"41000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is((api_v1.search_topic_review_queue(null,'new',null,null,null,25,0)->>'total')::integer, 1, 'PB-003 reviewer queue returns scoped topic');
select is(api_v1.search_topic_review_queue('TOP-',null,'high',null,null,25,0)->>'limit', '25', 'queue supports query filters and pagination');
select throws_ok(
  $$select api_v1.review_topic((select topic_id from sprint01_state),'return','no', (select updated_at from sprint01_state))$$,
  'a reason of at least 5 characters is required for this action',
  'PB-004 requires reason for return'
);
select throws_ok(
  $$select api_v1.review_topic((select topic_id from sprint01_state),'approve',null, now() - interval '1 day')$$,
  '40001',
  'topic was modified; refresh before reviewing',
  'PB-004 rejects stale review'
);
select is(
  api_v1.review_topic(
    (select topic_id from sprint01_state),'defer','Waiting for legal opinion',
    (select updated_at from sprint01_state)
  )->>'status',
  'deferred',
  'PB-004 performs an authorized defer transition'
);
select is((select count(*) from public.topic_status_history)::integer, 2, 'review appends status history');
select is((select change_reason from public.topic_status_history where to_status='deferred'), 'Waiting for legal opinion', 'history preserves review reason');
reset role;
select is((select count(*) from public.audit_logs where action='topics.review.defer')::integer, 1, 'review writes audit trail');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-0000-0000-000000000012","role":"authenticated"}';
select throws_ok(
  $$select api_v1.review_topic((select topic_id from sprint01_state),'approve',null,(select updated_at from public.topics where id=(select topic_id from sprint01_state)))$$,
  'action approve is not allowed from status deferred',
  'deferred topic accepts resume rather than a direct decision'
);

set local "request.jwt.claims" = '{"sub":"41000000-0000-0000-0000-000000000011","role":"authenticated"}';
select throws_ok(
  $$select api_v1.review_topic((select topic_id from sprint01_state),'approve',null,(select updated_at from public.topics where id=(select topic_id from sprint01_state)))$$,
  '42501',
  'permission denied: topics.review',
  'submitter without review permission cannot review'
);

select * from finish();
rollback;
