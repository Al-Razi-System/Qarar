begin;
create extension if not exists pgtap;
select plan(21);

select has_column('qarar_core','governance_units','reference_number',
  'councils have a server-generated human reference');
select has_column('qarar_core','governance_units','scope_unit_id',
  'council organizational scope is distinct from its parent council');
select has_table('qarar_meetings','council_meeting_plans_v2',
  'council meeting plans are persisted without eager meeting creation');
select has_function('api_v2','admin_create_council_v2',array[
  'text','text','text','uuid','uuid','uuid','uuid','integer','boolean','jsonb','uuid'
], 'the versioned atomic creation contract exists');

insert into qarar_core.organizations(id,code,name_ar) values
('59000000-0000-0000-0000-000000000001','council-v2-ci','منظمة اختبار مجلس 2'),
('59000000-0000-0000-0000-000000000002','council-v2-other','منظمة أخرى');
insert into auth.users(id,email) values
('59000000-0000-0000-0000-000000000010','council-v2-admin@example.test'),
('59000000-0000-0000-0000-000000000011','council-v2-reader@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('59000000-0000-0000-0000-000000000010','59000000-0000-0000-0000-000000000001',
 'council-v2-admin@example.test','مسؤول اختبار المجلس',true),
('59000000-0000-0000-0000-000000000011','59000000-0000-0000-0000-000000000001',
 'council-v2-reader@example.test','غير مخول',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('59000000-0000-0000-0000-000000000020','59000000-0000-0000-0000-000000000001','council','مجلس',true),
('59000000-0000-0000-0000-000000000021','59000000-0000-0000-0000-000000000001','department','قسم',false),
('59000000-0000-0000-0000-000000000022','59000000-0000-0000-0000-000000000002','department','قسم',false);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,level_no) values
('59000000-0000-0000-0000-000000000030','59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000021','ai','قسم الذكاء الاصطناعي','active',1),
('59000000-0000-0000-0000-000000000031','59000000-0000-0000-0000-000000000002','59000000-0000-0000-0000-000000000022','other','قسم خارجي','active',1);
insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar,is_active) values
('59000000-0000-0000-0000-000000000040','59000000-0000-0000-0000-000000000001','regular','اجتماع دوري',true);

select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"59000000-0000-0000-0000-000000000010","role":"authenticated"}',true);

create temporary table created as
select api_v2.admin_create_council_v2(
  'مجلس قسم الذكاء الاصطناعي',null,null,
  '59000000-0000-0000-0000-000000000020',
  '59000000-0000-0000-0000-000000000030',null,null,3,false,
  jsonb_build_object(
    'meeting_type_id','59000000-0000-0000-0000-000000000040',
    'recurrence','monthly','first_meeting_date','2026-11-01',
    'start_time',null,'end_time',null
  ),
  '59000000-0000-0000-0000-000000000050'
) payload;

select matches((select payload->>'reference_number' from created),'^CNL-[0-9]{4}-[0-9]{6}$',
  'the server generates a classified council reference');
select is((select status from qarar_core.governance_units where id=(select (payload->>'id')::uuid from created)),
  'inactive','a new council starts inactive');
select is((select scope_unit_id from qarar_core.governance_units where id=(select (payload->>'id')::uuid from created)),
  '59000000-0000-0000-0000-000000000030'::uuid,'the organizational scope is stored independently');
select matches((select reference_number from qarar_meetings.council_meeting_plans_v2 where governance_unit_id=(select (payload->>'id')::uuid from created)),
  '^MTP-[0-9]{4}-[0-9]{6}$','the optional plan has its own classified reference');
select is((select missed_after_days from qarar_meetings.council_meeting_plans_v2 where governance_unit_id=(select (payload->>'id')::uuid from created)),
  7,'the missed-meeting grace period defaults to seven days');

select is((api_v2.admin_create_council_v2(
  'اسم متجاهل',null,null,'59000000-0000-0000-0000-000000000020',null,null,null,3,false,null,
  '59000000-0000-0000-0000-000000000050')->>'idempotent_replay')::boolean,
  true,'replaying the same request returns the original result');
select is((select count(*)::integer from qarar_core.governance_units where created_by_user_id='59000000-0000-0000-0000-000000000010' and client_request_id='59000000-0000-0000-0000-000000000050'),
  1,'idempotent replay creates no duplicate council');
select is((select count(*)::integer from qarar_meetings.council_meeting_plans_v2 where organization_id='59000000-0000-0000-0000-000000000001'),
  1,'idempotent replay creates no duplicate meeting plan');

select throws_ok($$select api_v2.admin_create_council_v2(
  'مجلس بنطاق خارجي',null,null,'59000000-0000-0000-0000-000000000020',
  '59000000-0000-0000-0000-000000000031',null,null,3,false,null,
  '59000000-0000-0000-0000-000000000051')$$,'23503',null,
  'cross-tenant organizational scopes are rejected');
select throws_ok($$select api_v2.admin_create_council_v2(
  'مجلس بخطة غير صحيحة',null,null,'59000000-0000-0000-0000-000000000020',null,null,null,3,false,
  jsonb_build_object('meeting_type_id','59000000-0000-0000-0000-000000000040','recurrence','monthly',
    'first_meeting_date','2026-11-01','start_time','11:00','end_time','09:00'),
  '59000000-0000-0000-0000-000000000052')$$,'22023',null,
  'an invalid plan rejects the whole atomic operation');
select is((select count(*)::integer from qarar_core.governance_units where client_request_id='59000000-0000-0000-0000-000000000052'),
  0,'invalid plan validation leaves no partial council');
select ok(not has_function_privilege('authenticated',
  'qarar_core.admin_create_council_v2(text,text,text,uuid,uuid,uuid,uuid,integer,boolean,jsonb,uuid)','execute'),
  'clients cannot bypass the versioned API facade');

select is((select created_by_user_id from qarar_meetings.council_meeting_plans_v2 where governance_unit_id=(select (payload->>'id')::uuid from created)),
 '59000000-0000-0000-0000-000000000010'::uuid,'JSON JWT claims preserve plan actor');
select throws_ok($$select api_v2.admin_create_council_v2(
 'مجلس بأب يدوي',null,null,'59000000-0000-0000-0000-000000000020',null,
 (select (payload->>'id')::uuid from created),null,3,false,null,
 '59000000-0000-0000-0000-000000000053')$$,'22023',null,'new councils reject manual parent hierarchy');
select is(api_v1.admin_get_council_detail((select (payload->>'id')::uuid from created))->'scope_unit'->>'name_ar',
 'قسم الذكاء الاصطناعي','detail displays linked organizational scope');
select is((select parent_unit_id from qarar_core.governance_units where id=(select (payload->>'id')::uuid from created)),
 null::uuid,'new council does not duplicate organizational hierarchy');
select set_config('request.jwt.claims','{"sub":"59000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
select throws_ok($$select api_v2.admin_create_council_v2(
 'غير مخول',null,null,'59000000-0000-0000-0000-000000000020',null,null,null,3,false,null,
 '59000000-0000-0000-0000-000000000054')$$,'42501',null,'unauthorized actor cannot create council or plan');
select * from finish();
rollback;

