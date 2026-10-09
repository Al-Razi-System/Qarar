begin;
create extension if not exists pgtap;
select plan(8);
insert into qarar_core.organizations(id,code,name_ar) values ('64000000-0000-0000-0000-000000000001','routing-ci','اختبار التبعية');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
 ('64000000-0000-0000-0000-000000000002','64000000-0000-0000-0000-000000000001','unit','وحدة',false),
 ('64000000-0000-0000-0000-000000000003','64000000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level) values
 ('64000000-0000-0000-0000-000000000004','64000000-0000-0000-0000-000000000001','faculty','كلية','faculty'),
 ('64000000-0000-0000-0000-000000000005','64000000-0000-0000-0000-000000000001','university','جامعة','university');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,level_no) values
 ('64000000-0000-0000-0000-000000000010','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000002','faculty_a','كلية أ','active',1),
 ('64000000-0000-0000-0000-000000000011','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000002','faculty_b','كلية ب','active',1);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,level_no,parent_unit_id) values
 ('64000000-0000-0000-0000-000000000012','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000002','department','قسم','active',2,'64000000-0000-0000-0000-000000000010');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,level_no,scope_unit_id,governance_class_id) values
 ('64000000-0000-0000-0000-000000000020','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','origin','مجلس القسم','active',1,'64000000-0000-0000-0000-000000000012',null),
 ('64000000-0000-0000-0000-000000000021','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','council_a','مجلس كلية أ','active',1,'64000000-0000-0000-0000-000000000010','64000000-0000-0000-0000-000000000004'),
 ('64000000-0000-0000-0000-000000000022','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','council_b','مجلس كلية ب','active',1,'64000000-0000-0000-0000-000000000011','64000000-0000-0000-0000-000000000004'),
 ('64000000-0000-0000-0000-000000000023','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','university','مجلس الجامعة','active',1,null,'64000000-0000-0000-0000-000000000005');
create function pg_temp.resolve_class(p_class uuid,p_explicit uuid default null) returns uuid language sql as $$
 select qarar_governance.resolve_step_unit('64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000020',p_explicit,p_class) $$;
select is(pg_temp.resolve_class('64000000-0000-0000-0000-000000000004'),'64000000-0000-0000-0000-000000000021'::uuid,'department resolves its own faculty among several faculties');
select is(pg_temp.resolve_class('64000000-0000-0000-0000-000000000005'),'64000000-0000-0000-0000-000000000023'::uuid,'unique institution-wide council resolves without a council parent');
select is(pg_temp.resolve_class(null,'64000000-0000-0000-0000-000000000022'),'64000000-0000-0000-0000-000000000022'::uuid,'explicit reverse or peer referral remains supported');
select is(qarar_governance.resolve_step_unit('64000000-0000-0000-0000-000000000099','64000000-0000-0000-0000-000000000020','64000000-0000-0000-0000-000000000021',null),null::uuid,'foreign tenant does not resolve');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,level_no,scope_unit_id,governance_class_id)
 values ('64000000-0000-0000-0000-000000000024','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','duplicate','مجلس آخر للكلية','active',1,'64000000-0000-0000-0000-000000000010','64000000-0000-0000-0000-000000000004');
select is(pg_temp.resolve_class('64000000-0000-0000-0000-000000000004'),null::uuid,'ambiguity at nearest scope never chooses a random council');
update qarar_core.governance_units set status='inactive' where id in ('64000000-0000-0000-0000-000000000021','64000000-0000-0000-0000-000000000024');
select is(pg_temp.resolve_class('64000000-0000-0000-0000-000000000004'),null::uuid,'unrelated sole faculty is not a substitute for the scoped faculty');
select is(pg_temp.resolve_class(null,'64000000-0000-0000-0000-000000000021'),null::uuid,'inactive explicit council is not usable');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,level_no,parent_unit_id)
 values ('64000000-0000-0000-0000-000000000025','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','legacy','مجلس تاريخي','active',2,'64000000-0000-0000-0000-000000000022');
select is(qarar_governance.resolve_step_unit('64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000025',null,'64000000-0000-0000-0000-000000000004'),'64000000-0000-0000-0000-000000000022'::uuid,'legacy unscoped councils retain their previous route');
select * from finish();
rollback;
