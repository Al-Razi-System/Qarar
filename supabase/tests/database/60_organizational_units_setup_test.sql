begin;
create extension if not exists pgtap;
select plan(17);
select has_function('api_v2','admin_create_organizational_unit_v2',array['text','uuid','uuid','uuid'],'organizational unit creation has a versioned contract');
insert into qarar_core.organizations(id,code,name_ar) values
('60000000-0000-0000-0000-000000000001','oru-ci','اختبار الوحدات'),
('60000000-0000-0000-0000-000000000002','oru-other','منظمة أخرى');
insert into auth.users(id,email) values
('60000000-0000-0000-0000-000000000010','oru-admin@example.test'),
('60000000-0000-0000-0000-000000000011','oru-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('60000000-0000-0000-0000-000000000010','60000000-0000-0000-0000-000000000001','oru-admin@example.test','مدير اختبار',true),
('60000000-0000-0000-0000-000000000011','60000000-0000-0000-0000-000000000001','oru-denied@example.test','غير مخول',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('60000000-0000-0000-0000-000000000020','60000000-0000-0000-0000-000000000001','college','كلية',false),
('60000000-0000-0000-0000-000000000021','60000000-0000-0000-0000-000000000001','council','مجلس',true),
('60000000-0000-0000-0000-000000000022','60000000-0000-0000-0000-000000000002','college','كلية أخرى',false);
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table oru_created as select api_v2.admin_create_organizational_unit_v2('كلية العلوم','60000000-0000-0000-0000-000000000020',null,'60000000-0000-0000-0000-000000000050') payload;
select matches((select payload->>'reference_number' from oru_created),'^ORU-[0-9]{4}-[0-9]{6}$','human reference is server generated');
select is((select payload->>'status' from oru_created),'active','organizational units are immediately usable as scopes');
select is((api_v2.admin_create_organizational_unit_v2('كلية العلوم','60000000-0000-0000-0000-000000000020',null,'60000000-0000-0000-0000-000000000050')->>'id'),(select payload->>'id' from oru_created),'retry is idempotent');
select throws_ok($$select api_v2.admin_create_organizational_unit_v2('مجلس','60000000-0000-0000-0000-000000000021',null,'60000000-0000-0000-0000-000000000051')$$,'22023',null,'council types are refused');
select throws_ok($$select api_v2.admin_create_organizational_unit_v2('كلية خارجية','60000000-0000-0000-0000-000000000022',null,'60000000-0000-0000-0000-000000000052')$$,'22023',null,'cross tenant types are refused');
select throws_ok($$select api_v2.admin_create_organizational_unit_v2('كلية العلوم','60000000-0000-0000-0000-000000000020',null,'60000000-0000-0000-0000-000000000053')$$,'23505',null,'a new request cannot duplicate the same unit');
select is((api_v2.admin_list_organizational_units_v2(null,1,0)->>'total')::integer,1,'listing uses an accurate total');
select is((api_v2.admin_list_organizational_units_v2((select payload->>'reference_number' from oru_created),20,0)->>'total')::integer,1,'search accepts the displayed human reference');
select is(jsonb_array_length(api_v1.get_council_form_options()->'scope_units'),1,'the new unit is available in the following council creation stage');
select ok(not has_function_privilege('authenticated','qarar_core.admin_create_organizational_unit_v2(text,uuid,uuid,uuid)','execute'),'private implementation cannot be called by clients');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('60000000-0000-0000-0000-000000000030','60000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000022','external-parent','جهة خارجية','active');
select throws_ok($$select api_v2.admin_create_organizational_unit_v2('وحدة خارجية','60000000-0000-0000-0000-000000000020','60000000-0000-0000-0000-000000000030','60000000-0000-0000-0000-000000000055')$$,'22023',null,'cross tenant parents are refused');
create temporary table oru_child as select api_v2.admin_create_organizational_unit_v2('قسم الحاسوب','60000000-0000-0000-0000-000000000020',(select (payload->>'id')::uuid from oru_created),'60000000-0000-0000-0000-000000000056') payload;
select is((select parent_unit_id from qarar_core.governance_units where id=(select (payload->>'id')::uuid from oru_child)),(select (payload->>'id')::uuid from oru_created),'child retains the organizational parent');
select is((api_v2.admin_list_organizational_units_v2(null,1,1)->>'total')::integer,2,'paginated totals include units beyond the first page');
select is(jsonb_array_length(api_v2.admin_list_organizational_units_v2(null,1,1)->'items'),1,'the second page returns its unit');
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000011',true);
select throws_ok($$select api_v2.admin_create_organizational_unit_v2('وحدة ممنوعة','60000000-0000-0000-0000-000000000020',null,'60000000-0000-0000-0000-000000000054')$$,'42501',null,'unauthorized actor is refused');
select throws_ok($$select api_v2.admin_list_organizational_units_v2(null,20,0)$$,'42501',null,'unauthorized reader is refused');
select * from finish();
rollback;
