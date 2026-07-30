begin;
create extension if not exists pgtap;
select plan(15);
select has_function('api_v1','admin_list_council_members',array['uuid','boolean','integer','integer'],'member list contract exists');
select has_function('api_v1','admin_add_council_member',array['uuid','uuid','uuid','text','date','date'],'member add contract exists');
select ok(exists(select 1 from pg_constraint where conrelid='qarar_iam.memberships'::regclass
 and conname='memberships_no_overlapping_periods'),'database prevents overlapping membership periods');

insert into qarar_core.organizations(id,code,name_ar)values
('57000000-0000-0000-0000-000000000001','members-a','Members A'),
('57000000-0000-0000-0000-000000000002','members-b','Members B');
insert into auth.users(id,email)values
('57000000-0000-0000-0000-000000000011','admin@test.local'),
('57000000-0000-0000-0000-000000000012','member@test.local'),
('57000000-0000-0000-0000-000000000013','other@test.local');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)values
('57000000-0000-0000-0000-000000000011','57000000-0000-0000-0000-000000000001','admin@test.local','Admin',true),
('57000000-0000-0000-0000-000000000012','57000000-0000-0000-0000-000000000001','member@test.local','Member',false),
('57000000-0000-0000-0000-000000000013','57000000-0000-0000-0000-000000000002','other@test.local','Other',false);
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope)values
('57000000-0000-0000-0000-000000000021','57000000-0000-0000-0000-000000000001','member','عضو','governance_unit');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)values
('57000000-0000-0000-0000-000000000031','57000000-0000-0000-0000-000000000001','council','Council',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status)values
('57000000-0000-0000-0000-000000000041','57000000-0000-0000-0000-000000000001',
 '57000000-0000-0000-0000-000000000031','council_a','Council A','inactive');
select set_config('request.jwt.claim.sub','57000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok($$select api_v1.admin_add_council_member(
 '57000000-0000-0000-0000-000000000041','57000000-0000-0000-0000-000000000012',
 '57000000-0000-0000-0000-000000000021','عضو',current_date+10,current_date+20)$$,
 'future membership can be scheduled');
select is((api_v1.admin_list_council_members('57000000-0000-0000-0000-000000000041',false,50,0)
 ->'items'->0->>'is_effective')::boolean,false,'future membership grants no current effectiveness');
select throws_ok($$select api_v1.admin_add_council_member(
 '57000000-0000-0000-0000-000000000041','57000000-0000-0000-0000-000000000012',
 '57000000-0000-0000-0000-000000000021','Overlap',current_date+15,current_date+25)$$,
 '23P01',null,'overlapping periods are rejected');
select throws_ok($$select api_v1.admin_add_council_member(
 '57000000-0000-0000-0000-000000000041','57000000-0000-0000-0000-000000000013',
 '57000000-0000-0000-0000-000000000021','Other',current_date,current_date+1)$$,
 '23503',null,'cross-tenant users are rejected');
select lives_ok($$select api_v1.admin_update_council_membership(
 (select id from qarar_iam.memberships where user_id='57000000-0000-0000-0000-000000000012'),
 'عضو محدث',current_date+11,current_date+21,
 (select updated_at from qarar_iam.memberships where user_id='57000000-0000-0000-0000-000000000012'))$$,
 'membership dates and title can be updated');
select is((select user_id from qarar_iam.memberships where organization_id='57000000-0000-0000-0000-000000000001'),
 '57000000-0000-0000-0000-000000000012'::uuid,'update preserves the member identity');
select is((select role_id from qarar_iam.memberships where organization_id='57000000-0000-0000-0000-000000000001'),
 '57000000-0000-0000-0000-000000000021'::uuid,'update preserves the role identity');
select throws_ok($$select api_v1.admin_update_council_membership(
 (select id from qarar_iam.memberships where user_id='57000000-0000-0000-0000-000000000012'),
 null,current_date,current_date+1,'2000-01-01')$$,'40001',null,'stale updates are rejected');
select lives_ok($$select api_v1.admin_end_council_membership(
 (select id from qarar_iam.memberships where user_id='57000000-0000-0000-0000-000000000012'),
 current_date+11,'إلغاء التكليف',
 (select updated_at from qarar_iam.memberships where user_id='57000000-0000-0000-0000-000000000012'))$$,
 'membership is ended without deletion');
select is((select membership_status from qarar_iam.memberships where user_id='57000000-0000-0000-0000-000000000012'),
 'ended','ended membership history is retained');
select is((api_v1.admin_list_council_members('57000000-0000-0000-0000-000000000041',true,50,0)->>'total')::integer,
 1,'historical list includes ended memberships');
select is((select count(*)::integer from qarar_audit.audit_logs where action in(
 'council.membership.added','council.membership.updated','council.membership.ended')
 and organization_id='57000000-0000-0000-0000-000000000001'),3,'all successful mutations are audited');

select * from finish();
rollback;
