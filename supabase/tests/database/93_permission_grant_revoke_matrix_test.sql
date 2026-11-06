-- Complete authorization-engine matrix, not proof of every protected business operation.
-- Everything, including approvals and provisioned fixtures, rolls back.
begin;
create extension if not exists pgtap;
select no_plan();
insert into qarar_core.organizations(id,code,name_ar) values
('93000000-0000-0000-0000-000000000001','permission-matrix-test','اختبار المنح والسحب');
insert into auth.users(id,email) values
('93000000-0000-0000-0000-000000000010','permission-requester@example.test'),
('93000000-0000-0000-0000-000000000011','permission-approver@example.test'),
('93000000-0000-0000-0000-000000000012','permission-member@example.test'),
('93000000-0000-0000-0000-000000000013','permission-unassigned@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,status,is_system_admin)
select id,'93000000-0000-0000-0000-000000000001',email,'مستخدم اختبار','active',
id in ('93000000-0000-0000-0000-000000000010','93000000-0000-0000-0000-000000000011')
from auth.users where id in (
'93000000-0000-0000-0000-000000000010','93000000-0000-0000-0000-000000000011',
'93000000-0000-0000-0000-000000000012','93000000-0000-0000-0000-000000000013');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('93000000-0000-0000-0000-000000000020','93000000-0000-0000-0000-000000000001','fixture_scope','جهة اختبار',false);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('93000000-0000-0000-0000-000000000021','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000020','unit_a','الجهة الأولى','active'),
('93000000-0000-0000-0000-000000000022','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000020','unit_b','الجهة الثانية','active');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope)
values('93000000-0000-0000-0000-000000000030','93000000-0000-0000-0000-000000000001','fixture_matrix','دور الاختبار','organization');
insert into qarar_iam.memberships(id,organization_id,user_id,role_id,governance_unit_id,membership_status,start_date)
values('93000000-0000-0000-0000-000000000031','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000012','93000000-0000-0000-0000-000000000030','93000000-0000-0000-0000-000000000021','active',current_date);

create function pg_temp.matrix_claims(actor uuid) returns void language sql as $$
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2')::text,true);
$$;
create function pg_temp.test_permission_matrix() returns setof text language plpgsql as $$
declare
 p record;
 request_id uuid;
 unit_a uuid := '93000000-0000-0000-0000-000000000021';
 unit_b uuid := '93000000-0000-0000-0000-000000000022';
 member_id uuid := '93000000-0000-0000-0000-000000000012';
 requester uuid := '93000000-0000-0000-0000-000000000010';
 approver uuid := '93000000-0000-0000-0000-000000000011';
 role_id uuid := '93000000-0000-0000-0000-000000000030';
begin
 for p in select * from qarar_iam.system_permission_catalog() order by code loop
  perform pg_temp.matrix_claims(member_id);
  return next ok(not qarar_iam.has_permission(p.code,unit_a),p.code||': denied before grant');
  perform pg_temp.matrix_claims(requester);
  request_id := qarar_iam.admin_request_role_permissions_change(role_id,array[p.code],'اختبار منح الصلاحية');
  return next throws_ok(format('select qarar_iam.admin_review_iam_change(%L::uuid,%L)',request_id,'approved'),'42501','requester cannot approve their own change',p.code||': self approval denied');
  perform pg_temp.matrix_claims(member_id);
  return next ok(not qarar_iam.has_permission(p.code,unit_a),p.code||': pending grant has no effect');
  perform pg_temp.matrix_claims(approver);
  perform qarar_iam.admin_review_iam_change(request_id,'approved');
  perform pg_temp.matrix_claims(member_id);
  return next ok(qarar_iam.has_permission(p.code,unit_a),p.code||': independently approved grant works');
  return next ok(qarar_iam.actor_has_permission(member_id,p.code,unit_a),p.code||': actor predicate agrees');
  return next lives_ok(format('select qarar_iam.assert_permission(%L,%L::uuid)',p.code,unit_a),p.code||': assertion allows granted permission');
  return next is(qarar_iam.has_permission(p.code,unit_b),p.context_scope in ('system','organization','self'),p.code||': expected other-unit boundary');
  return next is(qarar_iam.has_permission(p.code,null),p.context_scope in ('system','organization','self'),p.code||': expected null-context boundary');
  perform pg_temp.matrix_claims('93000000-0000-0000-0000-000000000013');
  return next ok(not qarar_iam.has_permission(p.code,unit_a),p.code||': unassigned actor denied');
  perform pg_temp.matrix_claims(approver);
  update qarar_iam.roles set is_active=false where id=role_id;
  perform pg_temp.matrix_claims(member_id);
  return next ok(not qarar_iam.has_permission(p.code,unit_a),p.code||': disabled role denies');
  perform pg_temp.matrix_claims(approver);
  update qarar_iam.roles set is_active=true where id=role_id;
  update qarar_iam.memberships set start_date=current_date-2,end_date=current_date-1 where id='93000000-0000-0000-0000-000000000031';
  perform pg_temp.matrix_claims(member_id);
  return next ok(not qarar_iam.has_permission(p.code,unit_a),p.code||': expired membership denies');
  perform pg_temp.matrix_claims(approver);
  update qarar_iam.memberships set start_date=current_date,end_date=null where id='93000000-0000-0000-0000-000000000031';
  perform pg_temp.matrix_claims(requester);
  request_id := qarar_iam.admin_request_role_permissions_change(role_id,array[]::text[],'اختبار سحب الصلاحية');
  perform pg_temp.matrix_claims(member_id);
  return next ok(qarar_iam.has_permission(p.code,unit_a),p.code||': pending revocation retains current grant');
  perform pg_temp.matrix_claims(approver);
  perform qarar_iam.admin_review_iam_change(request_id,'approved');
  perform pg_temp.matrix_claims(member_id);
  return next ok(not qarar_iam.has_permission(p.code,unit_a),p.code||': approved revocation denies immediately');
  return next ok(not qarar_iam.actor_has_permission(member_id,p.code,unit_a),p.code||': actor predicate denies after revocation');
  return next throws_ok(format('select qarar_iam.assert_permission(%L,%L::uuid)',p.code,unit_a),'42501','permission denied: '||p.code,p.code||': assertion denies revoked permission');
 end loop;
end;
$$;
select * from pg_temp.test_permission_matrix();
select * from finish();
rollback;
