begin;
create extension if not exists pgtap;
select plan(17);

insert into qarar_core.organizations(id,code,name_ar) values
('55000000-0000-0000-0000-000000000001','au155','تدقيق'),
('55000000-0000-0000-0000-000000000002','au155b','أخرى');
insert into auth.users(id,email) values
('55000000-0000-0000-0000-000000000010','admin155@example.test'),
('55000000-0000-0000-0000-000000000011','member155@example.test'),
('55000000-0000-0000-0000-000000000012','other155@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('55000000-0000-0000-0000-000000000010','55000000-0000-0000-0000-000000000001','admin155@example.test','مدقق النظام',true),
('55000000-0000-0000-0000-000000000011','55000000-0000-0000-0000-000000000001','member155@example.test','عضو مرفوض',false),
('55000000-0000-0000-0000-000000000012','55000000-0000-0000-0000-000000000002','other155@example.test','مؤسسة أخرى',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('55000000-0000-0000-0000-000000000020','55000000-0000-0000-0000-000000000001','c155','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('55000000-0000-0000-0000-000000000021','55000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000020','u155','مجلس الكلية','active');

-- 1. A command made by a user through the dashboard carries the request context.
set local "request.jwt.claims"='{"sub":"55000000-0000-0000-0000-000000000010","role":"authenticated"}';
select set_config('request.headers','{"x-qarar-request-id":"req-155-a","x-qarar-client-ip":"203.0.113.9","x-qarar-user-agent":"Mozilla/5.0 Chrome/130","x-forwarded-for":"172.18.0.11"}',true);
create temporary table ids(name text primary key, id uuid);
insert into ids values('command', qarar_audit.append_audit_log('55000000-0000-0000-0000-000000000001','council.renamed','governance_units','55000000-0000-0000-0000-000000000021','{"reason":"تصحيح"}'));
select is((select request_id||'|'||host(client_ip)||'|'||user_agent||'|'||actor_kind from qarar_audit.audit_logs where id=(select id from ids where name='command')),
  'req-155-a|203.0.113.9|Mozilla/5.0 Chrome/130|user','a command records request id, reported client IP, device and that a user acted');

-- 2. Row-change events keep before/after in their own columns and name the changed fields.
insert into ids values('row', qarar_audit.append_audit_log('55000000-0000-0000-0000-000000000001','governance_units.update','governance_units','55000000-0000-0000-0000-000000000021',
  '{"table":"governance_units","operation":"UPDATE","old":{"name_ar":"مجلس","status":"draft","updated_at":"1"},"new":{"name_ar":"مجلس","status":"active","updated_at":"2"}}'));
select is((select previous_data->>'status'||'>'||(new_data->>'status') from qarar_audit.audit_logs where id=(select id from ids where name='row')),'draft>active','before and after are stored in their own columns');
select is((select metadata ? 'old' or metadata ? 'new' from qarar_audit.audit_logs where id=(select id from ids where name='row')),false,'and are no longer duplicated in metadata');
select is((select changed_fields from qarar_audit.audit_logs where id=(select id from ids where name='row')),array['status','updated_at'],'the changed fields are named');

-- 3. Append-only.
select throws_ok($$update qarar_audit.audit_logs set action='x' where id=(select id from ids where name='command')$$,'42501',null,'an audit row cannot be edited');
select throws_ok($$delete from qarar_audit.audit_logs where id=(select id from ids where name='command')$$,'42501',null,'an audit row cannot be deleted');
select throws_ok($$truncate qarar_audit.audit_logs$$,null,null,'the audit log cannot be truncated');
select lives_ok($$update qarar_audit.audit_logs set actor_user_id=null where id=(select id from ids where name='command')$$,'only detaching a deleted actor is allowed');

-- 4. Denied attempts are recorded by the service only.
set local role authenticated;
select throws_ok($$select api_v2.service_record_api_outcome_v2('55000000-0000-0000-0000-000000000011','v1','admin_list_sessions','denied','42501',403)$$,'42501',null,'a user cannot write audit outcomes');
reset role;
set local "request.jwt.claims"='{"role":"service_role"}';
set local role service_role;
select lives_ok($$select api_v2.service_record_api_outcome_v2('55000000-0000-0000-0000-000000000011','v1','admin_list_sessions','denied','42501',403)$$,'the dashboard service records a denied attempt');
select lives_ok($$select api_v2.service_record_api_outcome_v2('55000000-0000-0000-0000-000000000012','v1','cast_vote','failure','XX000',500)$$,'and a failure in another organisation');
select throws_ok($$select api_v2.service_record_api_outcome_v2('55000000-0000-0000-0000-000000000011','v1','drop table','denied','42501',403)$$,'22023',null,'a malformed contract name is rejected');
reset role;

-- 5. Reading: labels, results, actor search, isolation, facets.
set local "request.jwt.claims"='{"sub":"55000000-0000-0000-0000-000000000010","role":"authenticated"}';
set local role authenticated;
create temporary table r as select
  api_v1.admin_search_audit_logs(null,null,'governance_units',null,null,null,null,50,0) units,
  api_v1.admin_search_audit_logs(null,null,null,null,'denied',null,null,50,0) denied,
  api_v1.admin_search_audit_logs('عضو مرفوض',null,null,null,null,null,null,50,0) by_actor,
  api_v2.admin_get_audit_facets_v2() facets;
select is((select units->'items'->0->'entity_label'->>'title' from r),'مجلس الكلية','each event names the record it touched');
select is((select (denied->>'total')::int from r),1,'denied attempts are searchable, and only this organisation''s');
select is((select denied->'items'->0->>'actor_name_ar'||'|'||(denied->'items'->0->'metadata'->>'contract') from r),'عضو مرفوض|admin_list_sessions','with who tried and which operation');
select ok((select (by_actor->>'total')::int>=1 from r),'search matches the actor''s name');
select ok((select facets->'entity_types' @> '[{"value":"governance_units"}]' from r),'facets list the entity types that exist');

select * from finish();
rollback;
