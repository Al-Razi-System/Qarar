begin;
create extension if not exists pgtap;
select plan(14);
select has_function('api_v1','admin_assign_council_leadership',
 array['uuid','text','uuid','date','text','timestamp with time zone'],
 'leadership assignment is versioned');
select ok(not has_function_privilege('authenticated',
 'qarar_iam.admin_assign_council_leadership(uuid,text,uuid,date,text,timestamp with time zone)','execute'),
 'clients cannot bypass the versioned leadership contract');

insert into qarar_core.organizations(id,code,name_ar)values
('58000000-0000-0000-0000-000000000001','lead-a','Lead A');
insert into auth.users(id,email)values
('58000000-0000-0000-0000-000000000011','admin@lead.test'),
('58000000-0000-0000-0000-000000000012','one@lead.test'),
('58000000-0000-0000-0000-000000000013','two@lead.test'),
('58000000-0000-0000-0000-000000000014','none@lead.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)values
('58000000-0000-0000-0000-000000000011','58000000-0000-0000-0000-000000000001','admin@lead.test','Admin',true),
('58000000-0000-0000-0000-000000000012','58000000-0000-0000-0000-000000000001','one@lead.test','One',false),
('58000000-0000-0000-0000-000000000013','58000000-0000-0000-0000-000000000001','two@lead.test','Two',false),
('58000000-0000-0000-0000-000000000014','58000000-0000-0000-0000-000000000001','none@lead.test','None',false);
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope)values
('58000000-0000-0000-0000-000000000021','58000000-0000-0000-0000-000000000001','member','عضو','governance_unit'),
('58000000-0000-0000-0000-000000000022','58000000-0000-0000-0000-000000000001','council_chair','رئيس المجلس','governance_unit'),
('58000000-0000-0000-0000-000000000023','58000000-0000-0000-0000-000000000001','council_rapporteur','مقرر المجلس','governance_unit');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)values
('58000000-0000-0000-0000-000000000031','58000000-0000-0000-0000-000000000001','council','Council',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status)values
('58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000001',
 '58000000-0000-0000-0000-000000000031','lead_council','Lead Council','inactive');
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date)values
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000012',
 '58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000021',current_date),
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000013',
 '58000000-0000-0000-0000-000000000041','58000000-0000-0000-0000-000000000021',current_date);
select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok($$select api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','council_chair',
 '58000000-0000-0000-0000-000000000012',current_date,'تعيين أول',
 (select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,
 'an effective member can become chair');
select is((select u.full_name_ar from qarar_iam.memberships m join qarar_iam.users u on u.id=m.user_id
 where m.role_id='58000000-0000-0000-0000-000000000022' and m.membership_status='active'),
 'One','chair membership identifies the leader');
select is((api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','council_chair',
 '58000000-0000-0000-0000-000000000012',current_date,'إعادة',
 (select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))
 ->>'idempotent_replay')::boolean,true,'same leadership assignment is idempotent');
select throws_ok($$select api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','council_rapporteur',
 '58000000-0000-0000-0000-000000000012',current_date,'ازدواج',
 (select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,
 '23514',null,'dual leadership is denied by default');
select throws_ok($$select api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','council_rapporteur',
 '58000000-0000-0000-0000-000000000014',current_date,'غير عضو',
 (select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,
 '23503',null,'leadership requires an effective base membership');
update qarar_core.governance_units set allow_dual_leadership=true
where id='58000000-0000-0000-0000-000000000041';
select lives_ok($$select api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','council_rapporteur',
 '58000000-0000-0000-0000-000000000012',current_date,'استثناء معتمد',
 (select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,
 'dual leadership works only when explicitly enabled');
select lives_ok($$select api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','council_chair',
 '58000000-0000-0000-0000-000000000013',current_date+1,'تغيير الرئيس',
 (select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,
 'chair changes atomically on a later effective date');
select is((select membership_status from qarar_iam.memberships where role_id=
 '58000000-0000-0000-0000-000000000022' and user_id='58000000-0000-0000-0000-000000000012'),
 'ended','previous chair history is retained');
select is((select end_date from qarar_iam.memberships where role_id=
 '58000000-0000-0000-0000-000000000022' and user_id='58000000-0000-0000-0000-000000000012'),
 current_date,'previous chair ends before the new chair begins');
select throws_ok($$select api_v1.admin_assign_council_leadership(
 '58000000-0000-0000-0000-000000000041','invalid_role',
 '58000000-0000-0000-0000-000000000013',current_date+2,'Invalid',
 (select updated_at from qarar_core.governance_units where id='58000000-0000-0000-0000-000000000041'))$$,
 '22023',null,'only the two leadership roles are accepted');
select is((select count(*)::integer from qarar_audit.audit_logs where action='council.leadership.changed'
 and organization_id='58000000-0000-0000-0000-000000000001'),3,
 'each effective leadership change is audited once');
select ok((select metadata ? 'from_user_id' and metadata ? 'to_user_id' and metadata ? 'reason'
 from qarar_audit.audit_logs where action='council.leadership.changed'
 order by occurred_at desc limit 1),'leadership audit contains previous, new, and reason');

select * from finish();
rollback;
