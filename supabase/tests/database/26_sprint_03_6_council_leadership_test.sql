begin;
create extension if not exists pgtap;
select plan(8);
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
select lives_ok($$select api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000012',
 '58000000-0000-0000-0000-000000000013',current_date,'تعيين القيادة',
 (select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,
 'chair and rapporteur are assigned by one atomic call');
select is((select count(*)::integer from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id
 where m.governance_unit_id='58000000-0000-0000-0000-000000000041'
 and r.code in('council_chair','council_rapporteur')and m.membership_status='active'),2,
 'atomic call creates both leadership records');
select throws_ok($$select api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000012',
 '58000000-0000-0000-0000-000000000013',current_date,'إعادة',
 '2000-01-01')$$,'40001',null,'stale leadership concurrency token is rejected');
select throws_ok($$select api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000012',
 '58000000-0000-0000-0000-000000000012',current_date,'ازدواج',
 (select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,
 '23514',null,'dual leadership remains denied');
select is((select count(*)::integer from qarar_audit.audit_logs
 where action='council.leadership.changed' and entity_id='58000000-0000-0000-0000-000000000041'),2,
 'only the successful pair writes two leadership audit events');
select ok(has_function_privilege('authenticated',
 'api_v1.admin_assign_council_leadership(uuid,uuid,uuid,date,text,timestamp with time zone)','execute'),
 'authenticated clients execute the atomic pair contract');
select * from finish();
rollback;
