begin;
create extension if not exists pgtap;
select plan(9);

insert into qarar_core.organizations(id,code,name_ar) values
('54000000-0000-0000-0000-000000000001','ss154','جلسات'),
('54000000-0000-0000-0000-000000000002','ss154b','أخرى');
insert into auth.users(id,email) values
('54000000-0000-0000-0000-000000000010','admin154@example.test'),
('54000000-0000-0000-0000-000000000011','member154@example.test'),
('54000000-0000-0000-0000-000000000012','other154@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('54000000-0000-0000-0000-000000000010','54000000-0000-0000-0000-000000000001','admin154@example.test','مدير الجلسات',true),
('54000000-0000-0000-0000-000000000011','54000000-0000-0000-0000-000000000001','member154@example.test','عضو عادي',false),
('54000000-0000-0000-0000-000000000012','54000000-0000-0000-0000-000000000002','other154@example.test','مؤسسة أخرى',true);

-- Auth sessions: the admin's live one, the member's live one, the member's expired one, another organisation's.
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
('54000000-0000-0000-0000-0000000000a1','54000000-0000-0000-0000-000000000010',now()-interval '1 hour',now(),null),
('54000000-0000-0000-0000-0000000000a2','54000000-0000-0000-0000-000000000011',now()-interval '2 hour',now(),now()+interval '1 day'),
('54000000-0000-0000-0000-0000000000a3','54000000-0000-0000-0000-000000000011',now()-interval '3 day',now()-interval '2 day',now()-interval '1 day'),
('54000000-0000-0000-0000-0000000000a4','54000000-0000-0000-0000-000000000012',now()-interval '1 hour',now(),null);
insert into qarar_iam.user_sessions(id,organization_id,user_id,auth_session_id,device_id,revoked_at,revocation_reason) values
('54000000-0000-0000-0000-0000000000b1','54000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000010','54000000-0000-0000-0000-0000000000a1','web-admin',null,null),
('54000000-0000-0000-0000-0000000000b2','54000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000011','54000000-0000-0000-0000-0000000000a2','web-member',null,null),
('54000000-0000-0000-0000-0000000000b3','54000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000011','54000000-0000-0000-0000-0000000000a3','web-member-old',null,null),
('54000000-0000-0000-0000-0000000000b4','54000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000011',null,'web-member-revoked',now(),'lost device'),
('54000000-0000-0000-0000-0000000000b5','54000000-0000-0000-0000-000000000002','54000000-0000-0000-0000-000000000012','54000000-0000-0000-0000-0000000000a4','web-other',null,null);

-- A member without iam.sessions.manage / iam.users.manage cannot list the organisation.
set local "request.jwt.claims"='{"sub":"54000000-0000-0000-0000-000000000011","role":"authenticated","session_id":"54000000-0000-0000-0000-0000000000a2"}';
set local role authenticated;
select throws_ok($$select api_v1.admin_list_sessions('all',null,50,0)$$,'42501',null,'a member cannot monitor other users'' sessions');
create temporary table mine as select api_v1.list_my_sessions() p;
select is((select s->>'status' from mine, jsonb_array_elements(p) s where s->>'id'='54000000-0000-0000-0000-0000000000b3'),'ended','a session whose sign-in expired is ended, not active');
select is((select s->>'is_current' from mine, jsonb_array_elements(p) s where s->>'id'='54000000-0000-0000-0000-0000000000b2'),'true','the session behind this token is marked current');
reset role;

set local "request.jwt.claims"='{"sub":"54000000-0000-0000-0000-000000000010","role":"authenticated","session_id":"54000000-0000-0000-0000-0000000000a1"}';
set local role authenticated;
create temporary table org_active as select api_v1.admin_list_sessions('active',null,50,0) p;
create temporary table org_all as select api_v1.admin_list_sessions('all',null,50,0) p;
create temporary table org_named as select api_v1.admin_list_sessions('all','عضو',50,0) p;
select is((select (p->>'total')::int from org_active),2,'active lists the two live sessions of this organisation');
select is((select (p->>'total')::int from org_all),4,'all lists every session of this organisation and none of another');
select is((select s->>'status' from org_all, jsonb_array_elements(p->'items') s where s->>'id'='54000000-0000-0000-0000-0000000000b4'),'revoked','a revoked session stays revoked');
select is((select s->>'user_name_ar' from org_active, jsonb_array_elements(p->'items') s where s->>'id'='54000000-0000-0000-0000-0000000000b2'),'عضو عادي','each session names its user');
select is((select (p->>'total')::int from org_named),3,'search narrows by user name');
select throws_ok($$select api_v1.admin_list_sessions('open',null,50,0)$$,'22023',null,'an unknown status is rejected');

select * from finish();
rollback;
