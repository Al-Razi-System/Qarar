begin;
create extension if not exists pgtap;
select plan(15);
insert into qarar_core.organizations(id,code,name_ar) values('45000000-0000-0000-0000-000000000001','offboard_test','Offboard test');
insert into auth.users(id,email,created_at,updated_at) values
('45000000-0000-0000-0000-000000000101','requester@offboard.test',now(),now()),
('45000000-0000-0000-0000-000000000102','reviewer@offboard.test',now(),now()),
('45000000-0000-0000-0000-000000000103','target@offboard.test',now(),now()),
('45000000-0000-0000-0000-000000000104','successor@offboard.test',now(),now());
insert into qarar_iam.users(id,organization_id,email,full_name_ar,status,is_system_admin) values
('45000000-0000-0000-0000-000000000101','45000000-0000-0000-0000-000000000001','requester@offboard.test','Requester','active',true),
('45000000-0000-0000-0000-000000000102','45000000-0000-0000-0000-000000000001','reviewer@offboard.test','Reviewer','active',true),
('45000000-0000-0000-0000-000000000103','45000000-0000-0000-0000-000000000001','target@offboard.test','Target','active',false),
('45000000-0000-0000-0000-000000000104','45000000-0000-0000-0000-000000000001','successor@offboard.test','Successor','active',false);
insert into qarar_iam.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('45000000-0000-0000-0000-000000000201','45000000-0000-0000-0000-000000000001','iam.users.manage','iam','users.manage','organization','Manage users'),
('45000000-0000-0000-0000-000000000202','45000000-0000-0000-0000-000000000001','iam.permissions.read','iam','permissions.read','organization','Read permissions');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values('45000000-0000-0000-0000-000000000301','45000000-0000-0000-0000-000000000001','offboard_admin','Offboard admin','organization');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar) values('45000000-0000-0000-0000-000000000311','45000000-0000-0000-0000-000000000001','office','Office');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar) values('45000000-0000-0000-0000-000000000312','45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000311','office','Office');
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id) values
('45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000301','45000000-0000-0000-0000-000000000201'),
('45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000301','45000000-0000-0000-0000-000000000202');
insert into qarar_iam.memberships(id,organization_id,user_id,governance_unit_id,role_id,membership_status) values
('45000000-0000-0000-0000-000000000401','45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000101','45000000-0000-0000-0000-000000000312','45000000-0000-0000-0000-000000000301','active'),
('45000000-0000-0000-0000-000000000402','45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000102','45000000-0000-0000-0000-000000000312','45000000-0000-0000-0000-000000000301','active'),
('45000000-0000-0000-0000-000000000403','45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000103','45000000-0000-0000-0000-000000000312','45000000-0000-0000-0000-000000000301','active');
insert into qarar_iam.access_delegations(id,organization_id,delegated_by_user_id,delegated_to_user_id,source_membership_id,starts_at,ends_at,reason)
values('45000000-0000-0000-0000-000000000501','45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000103','45000000-0000-0000-0000-000000000104','45000000-0000-0000-0000-000000000403',now()-interval '1 hour',now()+interval '1 day','test');
insert into qarar_iam.user_sessions(id,organization_id,user_id,device_id) values('45000000-0000-0000-0000-000000000601','45000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000103','target-device');
insert into auth.sessions(id,user_id,created_at,updated_at) values('45000000-0000-0000-0000-000000000701','45000000-0000-0000-0000-000000000103',now(),now());
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id) values('45000000-0000-0000-0000-000000000801','45000000-0000-0000-0000-000000000001','OFF-1','Offboarding task topic','45000000-0000-0000-0000-000000000312','45000000-0000-0000-0000-000000000101');
insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,governance_unit_id,decision_text,issued_by_user_id,decision_status) values('45000000-0000-0000-0000-000000000802','45000000-0000-0000-0000-000000000001','OFF-D1','45000000-0000-0000-0000-000000000801','45000000-0000-0000-0000-000000000312','Offboarding task decision','45000000-0000-0000-0000-000000000101','approved');
insert into qarar_execution.action_items(id,organization_id,action_no,decision_id,topic_id,assigned_user_id,follow_up_user_id,title_ar,status) values('45000000-0000-0000-0000-000000000803','45000000-0000-0000-0000-000000000001','OFF-A1','45000000-0000-0000-0000-000000000802','45000000-0000-0000-0000-000000000801','45000000-0000-0000-0000-000000000103','45000000-0000-0000-0000-000000000103','Open task','in_progress');

create temporary table offboard_state(request_id uuid); grant select,insert on offboard_state to authenticated;
set local role authenticated; set local "request.jwt.claims" to '{"sub":"45000000-0000-0000-0000-000000000101","email":"requester@offboard.test","aal":"aal2"}';
set local "request.jwt.claim.sub" to '45000000-0000-0000-0000-000000000101';
insert into offboard_state select api_v1.admin_request_user_offboarding('45000000-0000-0000-0000-000000000103','45000000-0000-0000-0000-000000000104','Employment ended');
select ok((select request_id is not null from offboard_state),'requester creates governed offboarding request');
select throws_ok(format('select api_v1.admin_review_user_offboarding(%L,%L,%L)',(select request_id from offboard_state),'approved','self'),'42501','requester cannot approve their own request','self approval is forbidden');
set local "request.jwt.claims" to '{"sub":"45000000-0000-0000-0000-000000000102","email":"reviewer@offboard.test","aal":"aal2"}';
set local "request.jwt.claim.sub" to '45000000-0000-0000-0000-000000000102';
select is((api_v1.admin_review_user_offboarding((select request_id from offboard_state),'approved','independent review')->>'status'),'applied','second administrator approves and applies');
reset role;
select is((select status from qarar_iam.user_offboarding_requests where id=(select request_id from offboard_state)),'applied','request is applied');
select is((select reviewed_by_user_id from qarar_iam.user_offboarding_requests where id=(select request_id from offboard_state)),'45000000-0000-0000-0000-000000000102'::uuid,'reviewer is distinct from requester');
select is((select status from qarar_iam.users where id='45000000-0000-0000-0000-000000000103'),'inactive','target account is inactive');
select is((select membership_status from qarar_iam.memberships where id='45000000-0000-0000-0000-000000000403'),'ended','active memberships are ended');
select is((select status from qarar_iam.access_delegations where id='45000000-0000-0000-0000-000000000501'),'revoked','delegations are revoked');
select ok((select revoked_at is not null from qarar_iam.user_sessions where id='45000000-0000-0000-0000-000000000601'),'application sessions are revoked');
select is((select assigned_user_id from qarar_execution.action_items where id='45000000-0000-0000-0000-000000000803'),'45000000-0000-0000-0000-000000000104'::uuid,'open task ownership transfers to successor');
select is((select follow_up_user_id from qarar_execution.action_items where id='45000000-0000-0000-0000-000000000803'),'45000000-0000-0000-0000-000000000104'::uuid,'open task follow-up transfers to successor');
select is((select count(*)::int from auth.sessions where user_id='45000000-0000-0000-0000-000000000103'),0,'Auth sessions and refresh tokens are removed');
select ok((select correlation_id is not null from qarar_iam.user_offboarding_requests where id=(select request_id from offboard_state)),'operation has correlation id');
select ok(exists(select 1 from qarar_audit.audit_logs where action='iam.offboarding.requested' and entity_id=(select request_id from offboard_state)),'request audit exists');
select ok(exists(select 1 from qarar_audit.audit_logs where action='iam.offboarding.applied' and entity_id=(select request_id from offboard_state) and metadata->>'correlation_id' is not null),'applied audit uses correlation id');
select * from finish(); rollback;
