begin;
create extension if not exists pgtap;
select plan(13);

insert into qarar_core.organizations(id,code,name_ar)
values('60000000-0000-0000-0000-000000000001','council-gap','اختبار إغلاق فجوات المجالس');

select is((select count(*)::integer from qarar_iam.permissions
 where organization_id='60000000-0000-0000-0000-000000000001'
  and code in('governance.units.read','governance.units.manage','governance.units.activate',
   'governance.units.archive','governance.unit_types.manage','governance.memberships.read',
   'governance.memberships.manage','governance.leadership.assign')and is_active),8,
 'new organizations receive all eight detailed council permissions');
select is((select count(*)::integer from qarar_iam.roles
 where organization_id='60000000-0000-0000-0000-000000000001'
  and code in('council_chair','council_rapporteur')and role_scope='governance_unit' and is_active),2,
 'new organizations receive both scoped council leadership roles');
select ok(not exists(select 1 from qarar_iam.permissions
 where organization_id='60000000-0000-0000-0000-000000000001'
  and code='governance.councils.manage' and is_active),
 'deprecated broad council permission is not active');

insert into auth.users(id,email)values
('60000000-0000-0000-0000-000000000011','admin@gap.test'),
('60000000-0000-0000-0000-000000000012','one@gap.test'),
('60000000-0000-0000-0000-000000000013','two@gap.test'),
('60000000-0000-0000-0000-000000000014','three@gap.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)values
('60000000-0000-0000-0000-000000000011','60000000-0000-0000-0000-000000000001','admin@gap.test','مدير',true),
('60000000-0000-0000-0000-000000000012','60000000-0000-0000-0000-000000000001','one@gap.test','الأول',false),
('60000000-0000-0000-0000-000000000013','60000000-0000-0000-0000-000000000001','two@gap.test','الثاني',false),
('60000000-0000-0000-0000-000000000014','60000000-0000-0000-0000-000000000001','three@gap.test','الثالث',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type,is_system)
values('60000000-0000-0000-0000-000000000021','60000000-0000-0000-0000-000000000001',
 'council','مجلس',true,true);
insert into qarar_governance.governance_unit_classes(
 id,organization_id,code,name_ar,governance_level,decision_scope,criticality_level)
values('60000000-0000-0000-0000-000000000022','60000000-0000-0000-0000-000000000001',
 'department','إداري','department','department','standard');
insert into qarar_core.governance_units(
 id,organization_id,unit_type_id,governance_class_id,code,name_ar,status,minimum_active_members)
values('60000000-0000-0000-0000-000000000031','60000000-0000-0000-0000-000000000001',
 '60000000-0000-0000-0000-000000000021','60000000-0000-0000-0000-000000000022',
 'valid_council','مجلس صالح','active',1);

select throws_ok($$insert into qarar_core.governance_units(
 organization_id,unit_type_id,code,name_ar)values(
 '60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000021',
 'Invalid-Code','رمز غير صالح')$$,'22023',null,
 'database rejects council codes outside the approved format');

insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope,is_active)
values
('60000000-0000-0000-0000-000000000041','60000000-0000-0000-0000-000000000001',
 'future_reader','قارئ مستقبلي','governance_unit',true),
('60000000-0000-0000-0000-000000000042','60000000-0000-0000-0000-000000000001',
 'wrong_scope','نطاق خاطئ','organization',true),
('60000000-0000-0000-0000-000000000043','60000000-0000-0000-0000-000000000001',
 'council_member','عضو مجلس','governance_unit',true);
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id)
select '60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000041',id
from qarar_iam.permissions where organization_id='60000000-0000-0000-0000-000000000001'
 and code='governance.units.read';
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date)
values('60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000012',
 '60000000-0000-0000-0000-000000000031','60000000-0000-0000-0000-000000000041',current_date+10);

set local role authenticated;
set local "request.jwt.claims"='{"sub":"60000000-0000-0000-0000-000000000012"}';
select ok(not api_v1.has_permission('governance.units.read','60000000-0000-0000-0000-000000000031'),
 'future membership grants no permission');
reset role;

set local "request.jwt.claims"='{"sub":"60000000-0000-0000-0000-000000000011"}';
select throws_ok($$select qarar_iam.admin_add_council_member(
 '60000000-0000-0000-0000-000000000031','60000000-0000-0000-0000-000000000013',
 '60000000-0000-0000-0000-000000000042','خاطئ',current_date,null)$$,
 '23503',null,'council membership rejects non-governance-unit roles');

insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date)
select '60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000012',
 '60000000-0000-0000-0000-000000000031',id,current_date from qarar_iam.roles
where organization_id='60000000-0000-0000-0000-000000000001' and code='council_chair';
select throws_ok($$insert into qarar_iam.memberships(
 organization_id,user_id,governance_unit_id,role_id,start_date)
 select '60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000013',
 '60000000-0000-0000-0000-000000000031',id,current_date from qarar_iam.roles
 where organization_id='60000000-0000-0000-0000-000000000001' and code='council_chair'$$,
 '23P01',null,'database prevents two effective chairs for the same period');

insert into qarar_core.governance_unit_status_history(
 id,organization_id,governance_unit_id,from_status,to_status,reason)
values('60000000-0000-0000-0000-000000000051','60000000-0000-0000-0000-000000000001',
 '60000000-0000-0000-0000-000000000031','inactive','active','اختبار الإضافة');
select throws_ok($$update qarar_core.governance_unit_status_history set reason='تعديل ممنوع'
 where id='60000000-0000-0000-0000-000000000051'$$,'55000',null,
 'status history rejects updates');
select throws_ok($$delete from qarar_core.governance_unit_status_history
 where id='60000000-0000-0000-0000-000000000051'$$,'55000',null,
 'status history rejects deletes');

alter table qarar_iam.memberships disable trigger memberships_enforce_single_council_leader;
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date)
select '60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000013',
 '60000000-0000-0000-0000-000000000031',id,current_date from qarar_iam.roles
where organization_id='60000000-0000-0000-0000-000000000001' and code='council_chair';
alter table qarar_iam.memberships enable trigger memberships_enforce_single_council_leader;
select ok(api_v1.admin_validate_council_administrative_readiness(
 '60000000-0000-0000-0000-000000000031')->'errors'@>
 '[{"code":"MULTIPLE_ACTIVE_COUNCIL_CHAIRS"}]'::jsonb,
 'readiness detects legacy duplicate active chairs');

select ok(api_v1.get_available_councils(null,null,null,null,10,0)?'total',
 'available council pagination includes total');
select is((api_v1.get_available_councils(null,null,null,null,10,0)->>'limit')::integer,10,
 'available council pagination returns the effective limit');
select is((api_v1.get_available_councils(null,null,null,null,10,0)->>'offset')::integer,0,
 'available council pagination returns the effective offset');

select * from finish();
rollback;
