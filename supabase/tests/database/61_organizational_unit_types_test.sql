begin;
create extension if not exists pgtap;
select plan(4);
select has_function('api_v2','admin_create_organizational_unit_type_v2',array['text'],'organizational type authoring exists');
insert into qarar_core.organizations(id,code,name_ar) values('61000000-0000-0000-0000-000000000001','out-ci','اختبار أنواع الوحدات');
insert into auth.users(id,email) values('61000000-0000-0000-0000-000000000010','out-admin@example.test'),('61000000-0000-0000-0000-000000000011','out-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('61000000-0000-0000-0000-000000000010','61000000-0000-0000-0000-000000000001','out-admin@example.test','مدير',true),
('61000000-0000-0000-0000-000000000011','61000000-0000-0000-0000-000000000001','out-denied@example.test','غير مخول',false);
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table out_created as select api_v2.admin_create_organizational_unit_type_v2('كلية') payload;
select matches((select payload->>'code' from out_created),'^out_[0-9]{4}_[0-9]{6}$','type code is automatically generated');
select is(api_v2.admin_create_organizational_unit_type_v2('كلية')->>'id',(select payload->>'id' from out_created),'type retries do not create duplicates');
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000011',true);
select throws_ok($$select api_v2.admin_create_organizational_unit_type_v2('قسم')$$,'42501',null,'type management requires its own permission');
select * from finish();
rollback;
