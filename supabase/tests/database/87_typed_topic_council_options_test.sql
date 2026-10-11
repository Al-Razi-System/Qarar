begin;
create extension if not exists pgtap;
select plan(9);
insert into qarar_core.organizations(id,code,name_ar) values('87000000-0000-0000-0000-000000000001','typed-councils-ci','اختبار النطاق');
insert into qarar_core.organizations(id,code,name_ar) values('87000000-0000-0000-0000-000000000060','typed-foreign','مؤسسة أخرى');
insert into auth.users(id,email) values('87000000-0000-0000-0000-000000000061','typed-foreign@test.local');
insert into qarar_iam.users(id,organization_id,email,full_name_ar) values('87000000-0000-0000-0000-000000000061','87000000-0000-0000-0000-000000000060','typed-foreign@test.local','مستخدم آخر');
insert into auth.users(id,email) values('87000000-0000-0000-0000-000000000002','typed-admin@test.local'),('87000000-0000-0000-0000-000000000003','typed-user@test.local');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)
select id,'87000000-0000-0000-0000-000000000001',email,'اختبار',id='87000000-0000-0000-0000-000000000002'::uuid from auth.users where id in ('87000000-0000-0000-0000-000000000002','87000000-0000-0000-0000-000000000003');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('87000000-0000-0000-0000-000000000004','87000000-0000-0000-0000-000000000001','unit','وحدة',false),('87000000-0000-0000-0000-000000000005','87000000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,parent_unit_id) values
('87000000-0000-0000-0000-000000000010','87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000004','root','جهة رئيسية','active',null),
('87000000-0000-0000-0000-000000000011','87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000004','child','جهة فرعية','active','87000000-0000-0000-0000-000000000010');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,scope_unit_id) values
('87000000-0000-0000-0000-000000000020','87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000005','c1','المجلس الرئيسي','active','87000000-0000-0000-0000-000000000010'),
('87000000-0000-0000-0000-000000000021','87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000005','c2','المجلس الفرعي','active','87000000-0000-0000-0000-000000000011'),
('87000000-0000-0000-0000-000000000022','87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000005','c3','مجلس مستقل','active',null);
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(jsonb_array_length(api_v2.get_typed_topic_form_options_v2()->'governance_units'),3,'admin sees councils only, not active organizational units');
select is(api_v2.get_typed_topic_form_options_v2() ? 'categories',false,'no manual category selection exposed');
update qarar_core.governance_units set status='inactive' where id='87000000-0000-0000-0000-000000000022';
select is(jsonb_array_length(api_v2.get_typed_topic_form_options_v2()->'governance_units'),2,'inactive council excluded');
select api_v2.save_user_submission_scope_v2('87000000-0000-0000-0000-000000000003',0,null,'[{"kind":"council","target_id":"87000000-0000-0000-0000-000000000020","include_descendants":false}]',gen_random_uuid());
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(jsonb_array_length(api_v2.get_typed_topic_form_options_v2()->'governance_units'),1,'ordinary submitter sees only allowed council');
select is(api_v2.get_typed_topic_form_options_v2()#>>'{governance_units,0,id}','87000000-0000-0000-0000-000000000020','allowed identity preserved');
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000061","role":"authenticated"}';
select is(jsonb_array_length(api_v2.get_typed_topic_form_options_v2()->'governance_units'),0,'foreign actor cannot enumerate councils');
select ok(not has_function_privilege('anon','api_v2.get_typed_topic_form_options_v2()','execute'),'anonymous denied');
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000002","role":"authenticated"}';
update qarar_core.governance_unit_types set is_active=false where id='87000000-0000-0000-0000-000000000005';
select is(jsonb_array_length(api_v2.get_typed_topic_form_options_v2()->'governance_units'),0,'inactive type excluded');
update qarar_iam.users set status='inactive' where id='87000000-0000-0000-0000-000000000003';
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$select api_v2.get_typed_topic_form_options_v2()$$,'42501',null,'inactive actor denied');
select * from finish();
rollback;
