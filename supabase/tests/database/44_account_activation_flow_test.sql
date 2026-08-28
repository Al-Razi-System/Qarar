begin;
create extension if not exists pgtap;
select plan(12);

insert into qarar_core.organizations(id,code,name_ar) values('ac000000-0000-4000-8000-000000000001','activation-test','اختبار التفعيل');
insert into auth.users(id,email) values
('ac000000-0000-4000-8000-000000000011','admin@activation.test'),
('ac000000-0000-4000-8000-000000000012','user@activation.test'),
('ac000000-0000-4000-8000-000000000013','expired@activation.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin,status) values
('ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000001','admin@activation.test','مدير',true,'active'),
('ac000000-0000-4000-8000-000000000012','ac000000-0000-4000-8000-000000000001','user@activation.test','مستخدم',false,'active'),
('ac000000-0000-4000-8000-000000000013','ac000000-0000-4000-8000-000000000001','expired@activation.test','منتهي',false,'active');

set local role service_role;
set local "request.jwt.claim.role"='service_role';
set local "request.jwt.claims"='{"role":"service_role"}';
select lives_ok($$select api_v1.service_issue_activation_invitation(
 'ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000012',
 'user@activation.test','مستخدم',null,null,repeat('a',64),clock_timestamp()+interval '1 hour')$$,'service issues activation invitation');
select is((select status from qarar_iam.users where id='ac000000-0000-4000-8000-000000000012'),'inactive','invited account is inactive');
select is((api_v1.service_preview_activation(repeat('a',64))->>'email'),'user@activation.test','valid token hash previews the bound email');
select throws_ok($$select api_v1.service_preview_activation(repeat('b',64))$$,'P0002',null,'modified token hash is rejected');
select is((api_v1.service_claim_activation(repeat('a',64),repeat('c',64))->>'auth_user_id'),'ac000000-0000-4000-8000-000000000012','valid invitation can be claimed');
select is((api_v1.service_claim_activation(repeat('a',64),repeat('c',64))->>'invitation_id'),
 (select id::text from qarar_iam.user_invitations where auth_user_id='ac000000-0000-4000-8000-000000000012'),'same claim is idempotent');
select ok((api_v1.service_finish_activation((select id from qarar_iam.user_invitations where auth_user_id='ac000000-0000-4000-8000-000000000012'),'ac000000-0000-4000-8000-000000000012',repeat('c',64),true)->>'activated')::boolean,'claim completes activation');
select is((select status from qarar_iam.users where id='ac000000-0000-4000-8000-000000000012'),'active','completed account becomes active');
select is((select invitation_status from qarar_iam.user_invitations where auth_user_id='ac000000-0000-4000-8000-000000000012'),'accepted','invitation is consumed exactly once');
select throws_ok($$select api_v1.service_claim_activation(repeat('a',64),repeat('c',64))$$,'P0002',null,'used invitation cannot be reused');
select lives_ok($$select api_v1.service_issue_activation_invitation(
 'ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000013',
 'expired@activation.test','منتهي',null,null,repeat('d',64),clock_timestamp()+interval '1 hour')$$,'second invitation is issued');
reset role;
update qarar_iam.user_invitations set expires_at=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '2 hours'
 where auth_user_id='ac000000-0000-4000-8000-000000000013';
set local role service_role;
set local "request.jwt.claim.role"='service_role';
select throws_ok($$select api_v1.service_preview_activation(repeat('d',64))$$,'P0002',null,'expired invitation is rejected');
select * from finish();
rollback;
