begin;
create extension if not exists pgtap;
select plan(16);

grant all privileges on all tables in schema public to authenticated;
grant usage on schema public to authenticated;
grant all privileges on all sequences in schema public to authenticated;

insert into public.organizations(id,code,name_ar) values('30303030-3030-3030-3030-303030303030','critical_iam','Critical IAM');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values('31313131-3131-3131-3131-313131313131','30303030-3030-3030-3030-303030303030','office','Office');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values('32323232-3232-3232-3232-323232323232','30303030-3030-3030-3030-303030303030','31313131-3131-3131-3131-313131313131','hq','HQ');
insert into auth.users(id,email) values
 ('f1000000-0000-0000-0000-000000000001','admin@critical.test'),
 ('f1000000-0000-0000-0000-000000000002','target@critical.test'),
 ('f1000000-0000-0000-0000-000000000003','sso@critical.test'),
 ('f1000000-0000-0000-0000-000000000004','atomic@critical.test');
insert into public.users(id,organization_id,full_name_ar,email,is_system_admin) values
 ('f1000000-0000-0000-0000-000000000001','30303030-3030-3030-3030-303030303030','Admin','admin@critical.test',true),
 ('f1000000-0000-0000-0000-000000000002','30303030-3030-3030-3030-303030303030','Target','target@critical.test',false),
 ('f1000000-0000-0000-0000-000000000003','30303030-3030-3030-3030-303030303030','SSO','sso@critical.test',false);
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
 ('33333333-3333-3333-3333-333333333333','30303030-3030-3030-3030-303030303030','reviewer','Reviewer','governance_unit');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
 ('34343434-3434-3434-3434-343434343434','30303030-3030-3030-3030-303030303030','f1000000-0000-0000-0000-000000000001','32323232-3232-3232-3232-323232323232','33333333-3333-3333-3333-333333333333');

insert into auth.sessions(id,user_id,created_at,updated_at)
values('35353535-3535-3535-3535-353535353535','f1000000-0000-0000-0000-000000000002',now(),now());
insert into public.user_sessions(organization_id,user_id,auth_session_id,device_id)
values('30303030-3030-3030-3030-303030303030','f1000000-0000-0000-0000-000000000002','35353535-3535-3535-3535-353535353535','target-device');

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';
select is((api_v1.service_apply_user_status('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002','suspended','security lock')->>'status'),'suspended','service status operation updates application status');
reset role;
select ok(not exists(select 1 from auth.sessions where id='35353535-3535-3535-3535-353535353535'),'suspending user deletes Auth sessions');
select ok((select revoked_at is not null from public.user_sessions where device_id='target-device'),'suspending user marks application sessions revoked');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f1000000-0000-0000-0000-000000000001","email":"admin@critical.test"}';
select ok(not has_function_privilege('authenticated','qarar_iam.admin_update_user_status(uuid,text,text)','EXECUTE'),'direct status RPC is blocked from clients');
select ok(
 not has_function_privilege('authenticated','api_v1.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)','execute'),
 'atomic provisioning is restricted to the Edge service contract');
select ok(not exists(select 1 from public.users where id='f1000000-0000-0000-0000-000000000004'),'failed atomic provisioning leaves no application profile');

reset role;
insert into public.sso_identity_providers(id,organization_id,provider_type,provider_name,supabase_sso_provider_id,provisioning_mode,status)
values('36363636-3636-3636-3636-363636363636','30303030-3030-3030-3030-303030303030','saml','Critical SSO','37373737-3737-3737-3737-373737373737','jit','active');
insert into public.sso_group_role_mappings(id,organization_id,provider_id,external_group,role_id,governance_unit_id)
values('38383838-3838-3838-3838-383838383838','30303030-3030-3030-3030-303030303030','36363636-3636-3636-3636-363636363636','Reviewers','33333333-3333-3333-3333-333333333333','32323232-3232-3232-3232-323232323232');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f1000000-0000-0000-0000-000000000003","email":"sso@critical.test","sso_provider_id":"37373737-3737-3737-3737-373737373737"}';
select is(api_v1.sync_current_sso_groups(array['Reviewers']),1,'SSO sync creates current group membership');
select ok(exists(select 1 from public.sso_group_membership_links where user_id='f1000000-0000-0000-0000-000000000003'),'SSO-created membership has provenance link');
select is(api_v1.sync_current_sso_groups(array[]::text[]),0,'SSO sync accepts removal of all groups');
select is((select membership_status from public.memberships where user_id='f1000000-0000-0000-0000-000000000003' and role_id='33333333-3333-3333-3333-333333333333'),'ended','removed IdP group ends SSO-owned membership');

reset role;
insert into public.access_delegations(organization_id,delegated_by_user_id,delegated_to_user_id,source_membership_id,starts_at,ends_at,reason)
values('30303030-3030-3030-3030-303030303030','f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002','34343434-3434-3434-3434-343434343434',now()-interval '2 hours',now()-interval '1 hour','expired coverage');
select is(qarar_iam.expire_access_delegations(),1,'delegation expiry job updates elapsed records');
select is((select status from public.access_delegations where reason='expired coverage'),'expired','elapsed delegation stores expired status');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f1000000-0000-0000-0000-000000000001","email":"admin@critical.test"}';
select ok((api_v1.admin_search_audit_logs(null,'iam.user.status_update',null,null,null,null,null,20,0)->>'total')::int>=1,'audit search filters and returns total');
select is(api_v1.admin_get_audit_log((select id from public.audit_logs where organization_id='30303030-3030-3030-3030-303030303030' order by occurred_at desc limit 1))->>'organization_id','30303030-3030-3030-3030-303030303030','audit detail is tenant scoped');
select is(api_v1.admin_export_audit_logs(null,null,null,null,null,null)->>'schema_version','1','audit export is versioned');
reset role;
select ok(exists(select 1 from cron.job where jobname='qarar-expire-access-delegations'),'delegation expiry cron job is installed');

select * from finish();
rollback;
