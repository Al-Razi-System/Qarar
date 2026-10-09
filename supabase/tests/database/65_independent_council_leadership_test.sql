begin;
create extension if not exists pgtap;
select plan(11);
select has_function('api_v1','admin_assign_council_leadership',
 array['uuid','uuid','uuid','date','text','timestamp with time zone'],
 'leadership pair assignment is versioned');
select ok(not has_function_privilege('authenticated',
 'qarar_iam.admin_assign_council_leadership_pair(uuid,uuid,uuid,date,text,timestamp with time zone)','execute'),
 'clients cannot bypass the atomic leadership contract');
insert into qarar_core.organizations(id,code,name_ar)values
('58000000-0000-0000-0000-000000000001','lead-a','Lead A');
insert into auth.users(id,email)values
('58000000-0000-0000-0000-000000000011','admin@lead.test'),
('58000000-0000-0000-0000-000000000012','chair@lead.test'),
('58000000-0000-0000-0000-000000000013','rapporteur@lead.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)values
('58000000-0000-0000-0000-000000000011','58000000-0000-0000-0000-000000000001','admin@lead.test','Admin',true),
('58000000-0000-0000-0000-000000000012','58000000-0000-0000-0000-000000000001','chair@lead.test','Chair',false),
('58000000-0000-0000-0000-000000000013','58000000-0000-0000-0000-000000000001','rapporteur@lead.test','Rapporteur',false);
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope)values
('58000000-0000-0000-0000-000000000021','58000000-0000-0000-0000-000000000001','member','عضو','governance_unit')
on conflict(organization_id,code)do update set id=excluded.id;
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)values
('58000000-0000-0000-0000-000000000031','58000000-0000-0000-0000-000000000001','council','Council',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status)values
('58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000001',
 '58000000-0000-0000-0000-000000000031','lead_council','Lead Council','inactive');
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date)values
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000012','58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000021',current_date),
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000013','58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000021',current_date);
select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$select api_v1.admin_assign_council_leadership('58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000012',null,current_date,'تعيين مستقل',(select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,'chair can be assigned independently');
select is((select count(*)::integer from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id where m.governance_unit_id='58000000-0000-0000-0000-000000000041' and r.code='council_rapporteur'),0,'empty rapporteur selection creates nothing');
select lives_ok($$select api_v1.admin_assign_council_leadership('58000000-0000-0000-0000-000000000041',null,'58000000-0000-0000-0000-000000000013',current_date,'تعيين مستقل',(select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,'rapporteur can be assigned independently');
select is((select user_id from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id where m.governance_unit_id='58000000-0000-0000-0000-000000000041' and r.code='council_chair' and m.membership_status='active'),'58000000-0000-0000-0000-000000000012'::uuid,'assigning rapporteur preserves chair');
select throws_ok($$select api_v1.admin_assign_council_leadership('58000000-0000-0000-0000-000000000041',null,null,current_date,'تعيين مستقل',(select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,'22023',null,'empty selection is rejected');
select throws_ok($$select api_v1.admin_assign_council_leadership('58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000012',null,current_date,'تعيين مستقل','2000-01-01')$$,'40001',null,'partial assignment preserves concurrency guard');
select throws_ok($$select api_v1.admin_assign_council_leadership('58000000-0000-0000-0000-000000000041',null,'58000000-0000-0000-0000-000000000012',current_date,'تعيين مستقل',(select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,'23514',null,'partial assignment preserves dual-role guard');
select is((api_v1.admin_validate_council_administrative_readiness('58000000-0000-0000-0000-000000000041')->>'administratively_ready')::boolean,false,'leadership alone never makes a council ready');
select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000012',true);
select throws_ok($$select api_v1.admin_assign_council_leadership('58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000012',null,current_date,'تعيين مستقل',(select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,'42501',null,'member without contextual leadership permission is denied');
select * from finish();
rollback;
