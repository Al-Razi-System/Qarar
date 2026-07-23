begin;

create extension if not exists pgtap;
select plan(17);

grant all privileges on all tables in schema public to authenticated;
grant usage on schema public to authenticated;
grant all privileges on all sequences in schema public to authenticated;

insert into public.organizations(id,code,name_ar) values('20202020-2020-2020-2020-202020202020','iam_ops','IAM Operations');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values('21212121-2121-2121-2121-212121212121','20202020-2020-2020-2020-202020202020','office','Office');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values('22222222-2222-2222-2222-222222222222','20202020-2020-2020-2020-202020202020','21212121-2121-2121-2121-212121212121','hq','HQ');
insert into auth.users(id,email) values
 ('e1000000-0000-0000-0000-000000000001','admin1@ops.test'),
 ('e1000000-0000-0000-0000-000000000002','admin2@ops.test'),
 ('e1000000-0000-0000-0000-000000000003','delegate@ops.test');
insert into public.users(id,organization_id,full_name_ar,email) values
 ('e1000000-0000-0000-0000-000000000001','20202020-2020-2020-2020-202020202020','Admin One','admin1@ops.test'),
 ('e1000000-0000-0000-0000-000000000002','20202020-2020-2020-2020-202020202020','Admin Two','admin2@ops.test'),
 ('e1000000-0000-0000-0000-000000000003','20202020-2020-2020-2020-202020202020','Delegate','delegate@ops.test');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
 ('23232323-2323-2323-2323-232323232323','20202020-2020-2020-2020-202020202020','governance_admin','Admin','organization'),
 ('24242424-2424-2424-2424-242424242424','20202020-2020-2020-2020-202020202020','reviewer','Reviewer','governance_unit');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
 ('25111111-1111-1111-1111-111111111111','20202020-2020-2020-2020-202020202020','e1000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','23232323-2323-2323-2323-232323232323'),
 ('25222222-2222-2222-2222-222222222222','20202020-2020-2020-2020-202020202020','e1000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','23232323-2323-2323-2323-232323232323'),
 ('25333333-3333-3333-3333-333333333333','20202020-2020-2020-2020-202020202020','e1000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','24242424-2424-2424-2424-242424242424');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar) values
 ('20202020-2020-2020-2020-202020202020','iam.users.manage','iam','users.manage','organization','Manage users'),
 ('20202020-2020-2020-2020-202020202020','iam.roles.read','iam','roles.read','organization','Read roles'),
 ('20202020-2020-2020-2020-202020202020','iam.roles.assign','iam','roles.assign','governance_unit','Assign roles'),
 ('20202020-2020-2020-2020-202020202020','iam.roles.revoke','iam','roles.revoke','governance_unit','Revoke roles'),
 ('20202020-2020-2020-2020-202020202020','iam.permissions.read','iam','permissions.read','organization','Read permissions'),
 ('20202020-2020-2020-2020-202020202020','iam.permissions.manage','iam','permissions.manage','organization','Manage permissions'),
 ('20202020-2020-2020-2020-202020202020','iam.sso.manage','iam','sso.manage','organization','Manage SSO'),
 ('20202020-2020-2020-2020-202020202020','topics.review','topics','review','governance_unit','Review topics');
insert into public.role_permissions(organization_id,role_id,permission_id)
select p.organization_id,'23232323-2323-2323-2323-232323232323',p.id from public.permissions p where p.organization_id='20202020-2020-2020-2020-202020202020' and p.code like 'iam.%';
insert into public.role_permissions(organization_id,role_id,permission_id)
select p.organization_id,'24242424-2424-2424-2424-242424242424',p.id from public.permissions p where p.organization_id='20202020-2020-2020-2020-202020202020' and p.code='topics.review';

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e1000000-0000-0000-0000-000000000001","email":"admin1@ops.test"}';

select is(public.consume_iam_rate_limit('iam.create_user',10,600),1,'sensitive operation rate limiter increments atomically');
select ok(public.register_user_session('device-a','Work laptop','windows','1.0') is not null,'user can register a device session');
select is(jsonb_array_length(public.list_my_sessions()),1,'user can list own sessions');
select ok((public.request_session_revocation((select id from public.user_sessions where device_id='device-a'))->>'revoke_all')::boolean,'own session revocation requests global Auth sign-out');

select ok(public.admin_create_delegation('25333333-3333-3333-3333-333333333333','e1000000-0000-0000-0000-000000000003',now()-interval '1 minute',now()+interval '1 day','Annual leave') is not null,'admin can create a bounded delegation');
set local "request.jwt.claims" to '{"sub":"e1000000-0000-0000-0000-000000000003","email":"delegate@ops.test"}';
select ok(public.has_permission('topics.review','22222222-2222-2222-2222-222222222222'),'delegate receives source membership permission');

set local "request.jwt.claims" to '{"sub":"e1000000-0000-0000-0000-000000000001","email":"admin1@ops.test","sso_provider_id":"26262626-2626-2626-2626-262626262626"}';
insert into public.sso_identity_providers(id,organization_id,provider_type,provider_name,supabase_sso_provider_id,provisioning_mode,status)
values('27272727-2727-2727-2727-272727272727','20202020-2020-2020-2020-202020202020','saml','Ops SSO','26262626-2626-2626-2626-262626262626','jit','active');
select ok(public.admin_upsert_sso_group_mapping('27272727-2727-2727-2727-272727272727','Reviewers','24242424-2424-2424-2424-242424242424','22222222-2222-2222-2222-222222222222') is not null,'admin maps an SSO group to role and unit');
select is(public.sync_current_sso_groups(array['Reviewers']),1,'SSO group sync creates the mapped membership');

create temporary table ops_state(request_id uuid,matrix jsonb) on commit drop;
insert into ops_state(request_id) select public.admin_request_role_permissions_change('24242424-2424-2424-2424-242424242424',array['topics.review','iam.roles.read'],'Need reviewer visibility');
select throws_ok(format('select public.admin_review_iam_change(%L,%L,%L)',(select request_id from ops_state),'approved','self review'), '42501','requester cannot approve their own change','four-eyes rule blocks self approval');

set local "request.jwt.claims" to '{"sub":"e1000000-0000-0000-0000-000000000002","email":"admin2@ops.test"}';
select lives_ok(format('select public.admin_review_iam_change(%L,%L,%L)',(select request_id from ops_state),'approved','approved'), 'a second admin can approve the change');
select is((select status from public.iam_change_requests where id=(select request_id from ops_state)),'applied','approved role permission change is applied');
select ok(exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id='24242424-2424-2424-2424-242424242424' and p.code='iam.roles.read' and rp.is_active),'approved permission is active on role');

update ops_state set matrix=public.admin_export_permission_matrix();
select is((select matrix->>'schema_version' from ops_state),'1','permission matrix export is versioned');
select ok(jsonb_array_length((select matrix->'roles' from ops_state))>=2,'permission matrix export includes roles');
select ok(public.admin_request_permission_matrix_import((select matrix from ops_state),'Restore reviewed matrix') is not null,'matrix import enters approval workflow');
select ok(not has_function_privilege('authenticated','public.admin_set_role_permissions(uuid,text[])','EXECUTE'),'direct permission replacement is blocked for authenticated clients');
select ok(exists(select 1 from public.audit_logs where action='iam.session.revoke'),'session revocation is audited');

select * from finish();
rollback;
