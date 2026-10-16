-- The agenda item timer (owner review 2026-10-15, batch 5): the database
-- records when an item's discussion starts and ends; the chair may set a
-- planned duration per item.
-- Impact map: docs/engineering/impact/MEETING_ITEM_TIMER_AR.md
begin;
create extension if not exists pgtap;
select plan(19);

insert into public.organizations(id,code,name_ar) values
('a3000000-0000-0000-0000-000000000001','s102','Broadcast'),
('a3000000-0000-0000-0000-000000000002','s102b','Other Tenant');
insert into auth.users(id,email) values
('a3000000-0000-0000-0000-000000000011','chair@s102.test'),
('a3000000-0000-0000-0000-000000000012','rapporteur@s102.test'),
('a3000000-0000-0000-0000-000000000013','member@s102.test'),
('a3000000-0000-0000-0000-000000000015','admin@s102.test'),
('a3000000-0000-0000-0000-000000000016','other@s102b.test');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('a3000000-0000-0000-0000-000000000011','a3000000-0000-0000-0000-000000000001','chair@s102.test','Council Chair',false),
('a3000000-0000-0000-0000-000000000012','a3000000-0000-0000-0000-000000000001','rapporteur@s102.test','Council Rapporteur',false),
('a3000000-0000-0000-0000-000000000013','a3000000-0000-0000-0000-000000000001','member@s102.test','Council Member',false),
('a3000000-0000-0000-0000-000000000015','a3000000-0000-0000-0000-000000000001','admin@s102.test','System Admin',true),
('a3000000-0000-0000-0000-000000000016','a3000000-0000-0000-0000-000000000002','other@s102b.test','Other Tenant User',false);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('a3000000-0000-0000-0000-000000000021','a3000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('a3000000-0000-0000-0000-000000000022','a3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000021','faculty','Faculty Council',50);
delete from public.roles where organization_id='a3000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('a3000000-0000-0000-0000-000000000031','a3000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('a3000000-0000-0000-0000-000000000032','a3000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('a3000000-0000-0000-0000-000000000033','a3000000-0000-0000-0000-000000000001','s102_member','Member','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
select 'a3000000-0000-0000-0000-000000000001',v.code,split_part(v.code,'.',1),split_part(v.code,'.',2),'governance_unit',v.code
from (values ('meetings.manage'),('agenda.manage'),('attendance.read'),('attendance.manage'),('attendance.verify'),('attendance.lock'),('quorum.read'),('quorum.manage')) v(code)
on conflict (organization_id,code) do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='a3000000-0000-0000-0000-000000000001'
 and code in ('meetings.manage','agenda.manage','attendance.read','attendance.manage','attendance.verify','attendance.lock','quorum.read','quorum.manage');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a3000000-0000-0000-0000-000000000001',r.role_id,p.id
from public.permissions p
cross join (values ('a3000000-0000-0000-0000-000000000032'::uuid),('a3000000-0000-0000-0000-000000000033'::uuid)) r(role_id)
where p.organization_id='a3000000-0000-0000-0000-000000000001' and p.code in ('attendance.read','quorum.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('a3000000-0000-0000-0000-000000000061','a3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000011','a3000000-0000-0000-0000-000000000022','a3000000-0000-0000-0000-000000000031'),
('a3000000-0000-0000-0000-000000000062','a3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000012','a3000000-0000-0000-0000-000000000022','a3000000-0000-0000-0000-000000000032'),
('a3000000-0000-0000-0000-000000000063','a3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000013','a3000000-0000-0000-0000-000000000022','a3000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('a3000000-0000-0000-0000-000000000071','a3000000-0000-0000-0000-000000000001','TOP-S102-1','Plan','a3000000-0000-0000-0000-000000000022','a3000000-0000-0000-0000-000000000012','approved'),
('a3000000-0000-0000-0000-000000000072','a3000000-0000-0000-0000-000000000001','TOP-S102-2','Budget','a3000000-0000-0000-0000-000000000022','a3000000-0000-0000-0000-000000000012','approved'),
('a3000000-0000-0000-0000-000000000073','a3000000-0000-0000-0000-000000000001','TOP-S102-3','Next meeting topic','a3000000-0000-0000-0000-000000000022','a3000000-0000-0000-0000-000000000012','approved');
-- M1 runs now; M2 has not started.
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('a3000000-0000-0000-0000-000000000081','a3000000-0000-0000-0000-000000000001','MTG-S102-1','a3000000-0000-0000-0000-000000000022','Live meeting',current_date,'a3000000-0000-0000-0000-000000000011','ready_to_start'),
('a3000000-0000-0000-0000-000000000082','a3000000-0000-0000-0000-000000000001','MTG-S102-2','a3000000-0000-0000-0000-000000000022','Next meeting',current_date+7,'a3000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('a3000000-0000-0000-0000-000000000091','a3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000081','a3000000-0000-0000-0000-000000000071',1),
('a3000000-0000-0000-0000-000000000092','a3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000081','a3000000-0000-0000-0000-000000000072',2),
('a3000000-0000-0000-0000-000000000093','a3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000082','a3000000-0000-0000-0000-000000000073',1);

create function pg_temp.s102_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;
create function pg_temp.s102_meeting_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.meetings where id='a3000000-0000-0000-0000-000000000081' $$;
create function pg_temp.s102_item_token(p_id uuid) returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.agenda_items where id=p_id $$;
create function pg_temp.s102_timer(p_item uuid) returns jsonb language sql as
$$ select t from jsonb_array_elements(api_v2.list_meeting_item_timers_v2('a3000000-0000-0000-0000-000000000081')->'timers') t
   where t->>'agenda_item_id'=p_item::text $$;
create function pg_temp.s102_audits() returns bigint language sql security definer as
$$ select count(*) from qarar_audit.audit_logs where action='meetings.agenda.planned_minutes' and entity_id='a3000000-0000-0000-0000-000000000092' $$;
create function pg_temp.s102_close_meeting() returns void language sql security definer as
$$ set local session_replication_role=replica;
   update qarar_meetings.meetings set status='closed' where id='a3000000-0000-0000-0000-000000000081';
   set local session_replication_role=origin $$;

set local role authenticated;
select pg_temp.s102_as('a3000000-0000-0000-0000-000000000011');

select is(jsonb_array_length(api_v2.list_meeting_item_timers_v2('a3000000-0000-0000-0000-000000000081')->'timers'),0,'no timer exists before any discussion');
select ok((api_v2.list_meeting_item_timers_v2('a3000000-0000-0000-0000-000000000081')->>'server_now') is not null,'the server tells screens its own time');

select api_v1.open_meeting_session('a3000000-0000-0000-0000-000000000081',pg_temp.s102_meeting_token());

-- Starting the discussion starts the timer; ending it stops the timer.
select api_v1.update_agenda_discussion('a3000000-0000-0000-0000-000000000091','under_discussion',null,pg_temp.s102_item_token('a3000000-0000-0000-0000-000000000091'));
select ok(pg_temp.s102_timer('a3000000-0000-0000-0000-000000000091')->>'discussion_started_at' is not null,'starting the discussion records when it started');
select is(pg_temp.s102_timer('a3000000-0000-0000-0000-000000000091')->>'discussion_ended_at',null,'a running discussion has no end');
select api_v1.update_agenda_discussion('a3000000-0000-0000-0000-000000000091','discussed','Summary of the discussion',pg_temp.s102_item_token('a3000000-0000-0000-0000-000000000091'));
select ok(pg_temp.s102_timer('a3000000-0000-0000-0000-000000000091')->>'discussion_ended_at' is not null,'ending the discussion records when it ended');
select ok((pg_temp.s102_timer('a3000000-0000-0000-0000-000000000091')->>'discussion_ended_at')::timestamptz >= (pg_temp.s102_timer('a3000000-0000-0000-0000-000000000091')->>'discussion_started_at')::timestamptz,
  'the end is not before the start');

-- Postponing a discussed item stops its timer too.
select api_v1.update_agenda_discussion('a3000000-0000-0000-0000-000000000092','under_discussion',null,pg_temp.s102_item_token('a3000000-0000-0000-0000-000000000092'));
select api_v1.update_agenda_discussion('a3000000-0000-0000-0000-000000000092','postponed','Needs further study',pg_temp.s102_item_token('a3000000-0000-0000-0000-000000000092'));
select ok(pg_temp.s102_timer('a3000000-0000-0000-0000-000000000092')->>'discussion_ended_at' is not null,'postponing stops the timer');

-- The chair plans a duration; it is audited and revision-guarded.
select is((api_v2.set_agenda_item_planned_minutes_v2('a3000000-0000-0000-0000-000000000092',15,0)->>'planned_minutes')::integer,15,'the chair plans a duration for an item');
select is((pg_temp.s102_timer('a3000000-0000-0000-0000-000000000092')->>'planned_minutes')::integer,15,'every screen reads the planned duration');
select is(pg_temp.s102_audits(),1::bigint,'planning a duration is audited');
select throws_ok($$ select api_v2.set_agenda_item_planned_minutes_v2('a3000000-0000-0000-0000-000000000092',20,0) $$,'40001',null,'a stale revision is refused');
select throws_ok($$ select api_v2.set_agenda_item_planned_minutes_v2('a3000000-0000-0000-0000-000000000092',0,1) $$,'22023',null,'a duration below one minute is refused');
select throws_ok($$ select api_v2.set_agenda_item_planned_minutes_v2('a3000000-0000-0000-0000-000000000092',241,1) $$,'22023',null,'a duration above four hours is refused');
select is(api_v2.set_agenda_item_planned_minutes_v2('a3000000-0000-0000-0000-000000000092',null,1)->>'planned_minutes',null,'the chair may clear the planned duration');

-- Only the chair plans; a member reads; another tenant sees nothing.
select pg_temp.s102_as('a3000000-0000-0000-0000-000000000012');
select throws_ok($$ select api_v2.set_agenda_item_planned_minutes_v2('a3000000-0000-0000-0000-000000000092',10,2) $$,'42501',null,'the rapporteur cannot plan a duration');
select pg_temp.s102_as('a3000000-0000-0000-0000-000000000015');
select throws_ok($$ select api_v2.set_agenda_item_planned_minutes_v2('a3000000-0000-0000-0000-000000000092',10,2) $$,'42501',null,'a system administrator cannot plan a duration');
select pg_temp.s102_as('a3000000-0000-0000-0000-000000000013');
select ok(pg_temp.s102_timer('a3000000-0000-0000-0000-000000000091') is not null,'a member reads the timers');
select pg_temp.s102_as('a3000000-0000-0000-0000-000000000016');
select throws_ok($$ select api_v2.list_meeting_item_timers_v2('a3000000-0000-0000-0000-000000000081') $$,'P0002',null,'another tenant cannot read the timers');

-- After the meeting is closed the plan is final.
select pg_temp.s102_as('a3000000-0000-0000-0000-000000000011');
select pg_temp.s102_close_meeting();
select throws_ok($$ select api_v2.set_agenda_item_planned_minutes_v2('a3000000-0000-0000-0000-000000000092',10,2) $$,'23514',null,'no duration is planned after the meeting is closed');

select * from finish();
rollback;
