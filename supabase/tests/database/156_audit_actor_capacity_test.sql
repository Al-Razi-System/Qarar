begin;
create extension if not exists pgtap;
select plan(9);

insert into qarar_core.organizations(id,code,name_ar) values('56000000-0000-0000-0000-000000000001','cap156','صفة');
insert into auth.users(id,email) values
('56000000-0000-0000-0000-000000000010','chair156@example.test'),
('56000000-0000-0000-0000-000000000011','admin156@example.test'),
('56000000-0000-0000-0000-000000000012','former156@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('56000000-0000-0000-0000-000000000010','56000000-0000-0000-0000-000000000001','chair156@example.test','رئيس المجلس',false),
('56000000-0000-0000-0000-000000000011','56000000-0000-0000-0000-000000000001','admin156@example.test','مسؤول النظام',true),
('56000000-0000-0000-0000-000000000012','56000000-0000-0000-0000-000000000001','former156@example.test','رئيس سابق',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('56000000-0000-0000-0000-000000000020','56000000-0000-0000-0000-000000000001','c156','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('56000000-0000-0000-0000-000000000021','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000020','u156','مجلس الكلية','active');
delete from qarar_iam.roles where organization_id='56000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values
('56000000-0000-0000-0000-000000000030','56000000-0000-0000-0000-000000000001','council_chair','رئيس','governance_unit'),
('56000000-0000-0000-0000-000000000031','56000000-0000-0000-0000-000000000001','council_rapporteur','مقرر','governance_unit');
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date,end_date) values
('56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000010','56000000-0000-0000-0000-000000000021','56000000-0000-0000-0000-000000000030',current_date-30,null),
('56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000012','56000000-0000-0000-0000-000000000021','56000000-0000-0000-0000-000000000030',current_date-400,current_date-40);
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('56000000-0000-0000-0000-000000000040','56000000-0000-0000-0000-000000000001','M-156','56000000-0000-0000-0000-000000000021','اجتماع',current_date+3,'56000000-0000-0000-0000-000000000011','scheduled');

create temporary table ev(name text primary key, id uuid);
grant all on ev to public;

-- The chair acts on a meeting of their council: capacity derived from the meeting's council.
set local "request.jwt.claims"='{"sub":"56000000-0000-0000-0000-000000000010","role":"authenticated"}';
insert into ev values('chair_meeting', qarar_audit.append_audit_log('56000000-0000-0000-0000-000000000001','meeting.rescheduled','meetings','56000000-0000-0000-0000-000000000040','{}'));
select is((select actor_capacity->>'source'||'|'||(actor_capacity->'roles')::text||'|'||(actor_capacity->>'governance_unit_id') from qarar_audit.audit_logs where id=(select id from ev where name='chair_meeting')),
  'derived|["council_chair"]|56000000-0000-0000-0000-000000000021','acting on a meeting records the roles held in its council');

-- A role that ended is not a capacity.
set local "request.jwt.claims"='{"sub":"56000000-0000-0000-0000-000000000012","role":"authenticated"}';
insert into ev values('former', qarar_audit.append_audit_log('56000000-0000-0000-0000-000000000001','meeting.viewed','meetings','56000000-0000-0000-0000-000000000040','{}'));
select is((select actor_capacity->'roles' from qarar_audit.audit_logs where id=(select id from ev where name='former')),'[]'::jsonb,'an ended membership grants no capacity');

-- A system administrator without membership is recorded as such.
set local "request.jwt.claims"='{"sub":"56000000-0000-0000-0000-000000000011","role":"authenticated"}';
insert into ev values('admin_unit', qarar_audit.append_audit_log('56000000-0000-0000-0000-000000000001','council.renamed','governance_units','56000000-0000-0000-0000-000000000021','{}'));
select is((select (actor_capacity->>'system_admin')||'|'||(actor_capacity->'roles')::text from qarar_audit.audit_logs where id=(select id from ev where name='admin_unit')),'true|[]','a system administrator acting without a council role is recorded as system administrator');

-- An existing command's recorded authority counts as declared.
insert into ev values('declared_meta', qarar_audit.append_audit_log('56000000-0000-0000-0000-000000000001','meeting.session.opened','meetings','56000000-0000-0000-0000-000000000040','{"confirmation_authority":"system_admin"}'));
select is((select actor_capacity->>'source'||'|'||(actor_capacity->>'declared') from qarar_audit.audit_logs where id=(select id from ev where name='declared_meta')),'declared|system_admin','an authority the command recorded is the declared capacity');

-- Declaring through the helper is verified against what the actor actually holds.
set local "request.jwt.claims"='{"sub":"56000000-0000-0000-0000-000000000010","role":"authenticated"}';
select lives_ok($$select qarar_audit.declare_actor_capacity('council_chair','56000000-0000-0000-0000-000000000021')$$,'the chair may declare acting as chair');
insert into ev values('declared_fn', qarar_audit.append_audit_log('56000000-0000-0000-0000-000000000001','vote.closed','meetings','56000000-0000-0000-0000-000000000040','{}'));
select is((select actor_capacity->>'source'||'|'||(actor_capacity->>'declared') from qarar_audit.audit_logs where id=(select id from ev where name='declared_fn')),'declared|council_chair','the declared capacity is stamped on the event');
select throws_ok($$select qarar_audit.declare_actor_capacity('council_rapporteur','56000000-0000-0000-0000-000000000021')$$,'42501',null,'a capacity the actor does not hold cannot be declared');

-- Nothing is invented for the system itself, and the read contract shows the council.
reset role;
set local "request.jwt.claims"='{"role":"service_role"}';
insert into ev values('system', qarar_audit.append_audit_log('56000000-0000-0000-0000-000000000001','job.ran','meetings','56000000-0000-0000-0000-000000000040','{}'));
select is((select actor_capacity from qarar_audit.audit_logs where id=(select id from ev where name='system')),null,'a system event has no capacity');
set local "request.jwt.claims"='{"sub":"56000000-0000-0000-0000-000000000011","role":"authenticated"}';
set local role authenticated;
select is((select api_v1.admin_get_audit_log((select id from ev where name='chair_meeting'))->'actor_capacity'->>'governance_unit_name'),'مجلس الكلية','reads name the council the capacity was held in');

select * from finish();
rollback;
