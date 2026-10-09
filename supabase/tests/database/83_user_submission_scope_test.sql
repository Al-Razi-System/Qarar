begin;
create extension if not exists pgtap;
select plan(27);
insert into qarar_core.organizations(id,code,name_ar) values('83000000-0000-0000-0000-000000000001','user-scope-ci','اختبار النطاق');
insert into qarar_core.organizations(id,code,name_ar) values('83000000-0000-0000-0000-000000000060','scope-foreign','مؤسسة أخرى');
insert into auth.users(id,email) values('83000000-0000-0000-0000-000000000061','scope-foreign@test.local');
insert into qarar_iam.users(id,organization_id,email,full_name_ar) values('83000000-0000-0000-0000-000000000061','83000000-0000-0000-0000-000000000060','scope-foreign@test.local','مستخدم آخر');
insert into auth.users(id,email) values('83000000-0000-0000-0000-000000000002','scope-admin@test.local'),('83000000-0000-0000-0000-000000000003','scope-user@test.local');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)
select id,'83000000-0000-0000-0000-000000000001',email,'اختبار',id='83000000-0000-0000-0000-000000000002'::uuid from auth.users where id in ('83000000-0000-0000-0000-000000000002','83000000-0000-0000-0000-000000000003');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('83000000-0000-0000-0000-000000000004','83000000-0000-0000-0000-000000000001','unit','وحدة',false),('83000000-0000-0000-0000-000000000005','83000000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,parent_unit_id) values
('83000000-0000-0000-0000-000000000010','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000004','root','جهة رئيسية','active',null),
('83000000-0000-0000-0000-000000000011','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000004','child','جهة فرعية','active','83000000-0000-0000-0000-000000000010');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,scope_unit_id) values
('83000000-0000-0000-0000-000000000020','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000005','c1','المجلس الرئيسي','active','83000000-0000-0000-0000-000000000010'),
('83000000-0000-0000-0000-000000000021','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000005','c2','المجلس الفرعي','active','83000000-0000-0000-0000-000000000011'),
('83000000-0000-0000-0000-000000000022','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000005','c3','مجلس مستقل','active',null);
set local "request.jwt.claims"='{"sub":"83000000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select api_v2.save_user_submission_scope_v2('83000000-0000-0000-0000-000000000003',0,'83000000-0000-0000-0000-000000000010','[{"kind":"council","target_id":"83000000-0000-0000-0000-000000000020","include_descendants":true}]','83000000-0000-0000-0000-000000000030')$$,'admin saves a scope independent of membership');
select ok(qarar_iam.actor_can_submit_scoped_v2('83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000020'),'root allowed');
select ok(qarar_iam.actor_can_submit_scoped_v2('83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000021'),'descendant allowed');
select isnt(qarar_iam.actor_can_submit_scoped_v2('83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000022'),true,'unrelated denied');
select is((select count(*) from qarar_iam.memberships where user_id='83000000-0000-0000-0000-000000000003'),0::bigint,'no fabricated council membership');
select lives_ok($$select api_v2.save_user_submission_scope_v2('83000000-0000-0000-0000-000000000003',0,'83000000-0000-0000-0000-000000000010','[{"kind":"council","target_id":"83000000-0000-0000-0000-000000000020","include_descendants":true}]','83000000-0000-0000-0000-000000000030')$$,'immediate retry safely replays');
select throws_ok($$select api_v2.save_user_submission_scope_v2('83000000-0000-0000-0000-000000000003',0,null,'[]',gen_random_uuid())$$,'40001',null,'stale save denied');
set local "request.jwt.claims"='{"sub":"83000000-0000-0000-0000-000000000003","role":"authenticated"}';
select ok(qarar_iam.has_permission('topics.create','83000000-0000-0000-0000-000000000021'),'current user can submit');
select isnt(qarar_iam.has_permission('topics.vote','83000000-0000-0000-0000-000000000021'),true,'grant cannot widen another permission');
select isnt(qarar_iam.has_permission('topics.create',null),true,'null context never widens grant');
select throws_ok($$select api_v2.save_user_submission_scope_v2('83000000-0000-0000-0000-000000000003',1,null,'[]',gen_random_uuid())$$,'42501',null,'cannot self elevate');
update qarar_core.governance_units set status='inactive' where id='83000000-0000-0000-0000-000000000021';
select isnt(qarar_iam.has_permission('topics.create','83000000-0000-0000-0000-000000000021'),true,'inactive council denied');
update qarar_iam.users set status='inactive' where id='83000000-0000-0000-0000-000000000003';
select isnt(qarar_iam.actor_can_submit_scoped_v2('83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000020'),true,'inactive account denied');
update qarar_iam.users set status='active' where id='83000000-0000-0000-0000-000000000003';
update qarar_core.governance_units set status='active' where id='83000000-0000-0000-0000-000000000021';
select ok(qarar_iam.get_current_user_access_context()->'permissions' ? 'topics.create','scoped permission appears in navigation context');
select is(jsonb_array_length(qarar_topics.get_topic_form_options()->'governance_units'),2,'submission options include only matching councils');
set local "request.jwt.claims"='{"sub":"83000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select api_v2.save_user_submission_scope_v2('83000000-0000-0000-0000-000000000003',1,null,'[{"kind":"council","target_id":"83000000-0000-0000-0000-000000000099","include_descendants":false}]',gen_random_uuid())$$,'23514',null,'invalid selection rejected atomically');
select is((api_v2.get_user_submission_scope_v2('83000000-0000-0000-0000-000000000003')->>'revision')::integer,1,'failed save preserves revision');
select ok(qarar_iam.actor_can_submit_scoped_v2('83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000021'),'failed save preserves grants');
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level) values('83000000-0000-0000-0000-000000000040','83000000-0000-0000-0000-000000000001','faculty','مجلس كلية','faculty');
update qarar_core.governance_units set governance_class_id='83000000-0000-0000-0000-000000000040' where id='83000000-0000-0000-0000-000000000020';
select lives_ok($$select api_v2.save_user_submission_scope_v2('83000000-0000-0000-0000-000000000003',1,null,'[{"kind":"class","target_id":"83000000-0000-0000-0000-000000000040","include_descendants":true},{"kind":"council","target_id":"83000000-0000-0000-0000-000000000022","include_descendants":false}]',gen_random_uuid())$$,'multiple selections combine a level and independent council');
select ok(qarar_iam.actor_can_submit_scoped_v2('83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000021'),'class includes organizational descendants');
select ok(qarar_iam.actor_can_submit_scoped_v2('83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000022'),'specific extra council included');
select lives_ok($$select api_v2.save_user_submission_scope_v2('83000000-0000-0000-0000-000000000003',2,null,'[]',gen_random_uuid())$$,'remove new grants');
select isnt(qarar_iam.actor_can_submit_scoped_v2('83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000021'),true,'removing grant revokes scoped access');
insert into qarar_iam.permissions(id,organization_id,code,module,action,context_scope,name_ar) values('83000000-0000-0000-0000-000000000050','83000000-0000-0000-0000-000000000001','topics.create','topics','create','governance_unit','تقديم موضوع');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values('83000000-0000-0000-0000-000000000051','83000000-0000-0000-0000-000000000001','submitter','مقدم','governance_unit');
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id) values('83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000051','83000000-0000-0000-0000-000000000050');
insert into qarar_iam.memberships(organization_id,user_id,role_id,governance_unit_id) values('83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000051','83000000-0000-0000-0000-000000000022');
set local "request.jwt.claims"='{"sub":"83000000-0000-0000-0000-000000000003","role":"authenticated"}';
select ok(qarar_iam.has_permission('topics.create','83000000-0000-0000-0000-000000000022'),'old membership permission preserved after grant removal');
set local "request.jwt.claims"='{"sub":"83000000-0000-0000-0000-000000000002","role":"authenticated"}';
select isnt(qarar_iam.actor_can_submit_scoped_v2('83000000-0000-0000-0000-000000000061','83000000-0000-0000-0000-000000000021'),true,'foreign actor never inherits tenant grants');
set local "request.jwt.claims"='{"sub":"83000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select api_v2.get_user_submission_scope_v2('83000000-0000-0000-0000-000000000061')$$,'P0002',null,'admin cannot read foreign scope');
select throws_ok($$select api_v2.save_user_submission_scope_v2('83000000-0000-0000-0000-000000000061',0,null,'[]',gen_random_uuid())$$,'P0002',null,'admin cannot modify foreign scope');
select * from finish();
rollback;
