-- A numbered decision for every closed agenda item, approved with the
-- minutes, and the session's assignments in the minutes (owner decisions
-- 2026-10-16).
-- Impact map: docs/engineering/impact/MEETING_DECISIONS_MINUTES_AR.md
begin;
create extension if not exists pgtap;
select plan(30);

insert into public.organizations(id,code,name_ar) values
('a6000000-0000-0000-0000-000000000001','s105','Minutes'),
('a6000000-0000-0000-0000-000000000002','s105b','Other Tenant');
insert into auth.users(id,email) values
('a6000000-0000-0000-0000-000000000011','chair@s105.test'),
('a6000000-0000-0000-0000-000000000012','rapporteur@s105.test'),
('a6000000-0000-0000-0000-000000000013','member@s105.test'),
('a6000000-0000-0000-0000-000000000015','admin@s105.test'),
('a6000000-0000-0000-0000-000000000016','other@s105b.test');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('a6000000-0000-0000-0000-000000000011','a6000000-0000-0000-0000-000000000001','chair@s105.test','Council Chair',false),
('a6000000-0000-0000-0000-000000000012','a6000000-0000-0000-0000-000000000001','rapporteur@s105.test','Council Rapporteur',false),
('a6000000-0000-0000-0000-000000000013','a6000000-0000-0000-0000-000000000001','member@s105.test','Council Member',false),
('a6000000-0000-0000-0000-000000000015','a6000000-0000-0000-0000-000000000001','admin@s105.test','System Admin',true),
('a6000000-0000-0000-0000-000000000016','a6000000-0000-0000-0000-000000000002','other@s105b.test','Other Tenant User',false);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('a6000000-0000-0000-0000-000000000021','a6000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000021','faculty','Faculty Council',50),
('a6000000-0000-0000-0000-000000000023','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000021','registry','Registry Office',50);
delete from public.roles where organization_id='a6000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('a6000000-0000-0000-0000-000000000031','a6000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('a6000000-0000-0000-0000-000000000032','a6000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('a6000000-0000-0000-0000-000000000033','a6000000-0000-0000-0000-000000000001','s105_member','Member','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
select 'a6000000-0000-0000-0000-000000000001',v.code,split_part(v.code,'.',1),split_part(v.code,'.',2),'governance_unit',v.code
from (values ('meetings.manage'),('agenda.manage'),('attendance.read'),('attendance.manage'),('attendance.verify'),('attendance.lock'),('quorum.read'),('quorum.manage'),('decisions.read')) v(code)
on conflict (organization_id,code) do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='a6000000-0000-0000-0000-000000000001'
 and code in ('meetings.manage','agenda.manage','attendance.read','attendance.manage','attendance.verify','attendance.lock','quorum.read','quorum.manage','decisions.read');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a6000000-0000-0000-0000-000000000001',r.role_id,p.id
from public.permissions p
cross join (values ('a6000000-0000-0000-0000-000000000032'::uuid),('a6000000-0000-0000-0000-000000000033'::uuid)) r(role_id)
where p.organization_id='a6000000-0000-0000-0000-000000000001' and p.code in ('attendance.read','quorum.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('a6000000-0000-0000-0000-000000000061','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000011','a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000031'),
('a6000000-0000-0000-0000-000000000062','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000012','a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000032'),
('a6000000-0000-0000-0000-000000000063','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000013','a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('a6000000-0000-0000-0000-000000000071','a6000000-0000-0000-0000-000000000001','TOP-S105-1','Plan','a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000012','approved'),
('a6000000-0000-0000-0000-000000000072','a6000000-0000-0000-0000-000000000001','TOP-S105-2','Rejected topic','a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000012','approved'),
('a6000000-0000-0000-0000-000000000073','a6000000-0000-0000-0000-000000000001','TOP-S105-3','Tied topic','a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000012','approved'),
('a6000000-0000-0000-0000-000000000074','a6000000-0000-0000-0000-000000000001','TOP-S105-4','Postponed topic','a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000012','approved'),
('a6000000-0000-0000-0000-000000000075','a6000000-0000-0000-0000-000000000001','TOP-S105-5','Referred topic','a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000012','approved');
-- M1 runs now; M2 has not started.
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000001','MTG-S105-1','a6000000-0000-0000-0000-000000000022','Live meeting',current_date,'a6000000-0000-0000-0000-000000000011','ready_to_start'),
('a6000000-0000-0000-0000-000000000082','a6000000-0000-0000-0000-000000000001','MTG-S105-2','a6000000-0000-0000-0000-000000000022','Next meeting',current_date+7,'a6000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('a6000000-0000-0000-0000-000000000091','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000071',1),
('a6000000-0000-0000-0000-000000000092','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000072',2),
('a6000000-0000-0000-0000-000000000093','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000073',3),
('a6000000-0000-0000-0000-000000000094','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000074',4),
('a6000000-0000-0000-0000-000000000095','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000075',5);

create function pg_temp.s105_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;
create function pg_temp.s105_meeting_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.meetings where id='a6000000-0000-0000-0000-000000000081' $$;
create function pg_temp.s105_item_token(p_id uuid) returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.agenda_items where id=p_id $$;
create function pg_temp.s105_seat_roster() returns void language sql security definer as
$$ insert into qarar_attendance.attendance_records(organization_id,meeting_id,user_id,membership_id,attendance_status) values
('a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000011','a6000000-0000-0000-0000-000000000061','present'),
('a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000012','a6000000-0000-0000-0000-000000000062','present'),
('a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000013','a6000000-0000-0000-0000-000000000063','present') $$;
create function pg_temp.s105_audits(p_action text) returns bigint language sql security definer as
$$ select count(*) from qarar_audit.audit_logs where action=p_action and organization_id='a6000000-0000-0000-0000-000000000001' $$;
create function pg_temp.s105_decision(p_item uuid) returns jsonb language sql security definer as
$$ select to_jsonb(d) from qarar_decisions.decisions d where agenda_item_id=p_item $$;
create function pg_temp.s105_task(p_assignment uuid) returns jsonb language sql security definer as
$$ select coalesce((select to_jsonb(t) from qarar_execution.action_items t where meeting_assignment_id=p_assignment),'{}'::jsonb) $$;
-- The session's outcomes, written directly: item 1 approved with its drafted
-- decision, 2 rejected, 3 tied, 4 postponed, 5 referred.
create function pg_temp.s105_outcomes() returns void language sql security definer as
$$ set local session_replication_role=replica;
   update qarar_meetings.agenda_items set agenda_status='discussed', discussion_notes='Final summary of the discussion' where meeting_id='a6000000-0000-0000-0000-000000000081';
   update qarar_meetings.agenda_items set agenda_status='postponed', discussion_notes='Awaiting the budget study' where id='a6000000-0000-0000-0000-000000000094';
   insert into qarar_voting.voting_rounds(organization_id,meeting_id,agenda_item_id,round_number,status,result,eligible_voter_count,opened_by_user_id,closed_at)
   select 'a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081',i,1,'closed',r,3,'a6000000-0000-0000-0000-000000000011',now()
   from (values ('a6000000-0000-0000-0000-000000000091'::uuid,'approved'),('a6000000-0000-0000-0000-000000000092'::uuid,'rejected'),('a6000000-0000-0000-0000-000000000093'::uuid,'tied')) v(i,r);
   insert into qarar_topics.topic_referrals(id,organization_id,topic_id,from_unit_id,to_unit_id,referred_by_user_id,referral_reason,status)
   values('a6000000-0000-0000-0000-0000000000f1','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000075','a6000000-0000-0000-0000-000000000022','a6000000-0000-0000-0000-000000000023','a6000000-0000-0000-0000-000000000011','Needs the committee study','pending');
   insert into qarar_meetings.agenda_item_referrals(agenda_item_id,organization_id,meeting_id,topic_referral_id,to_unit_id,reason,referred_by_user_id)
   values('a6000000-0000-0000-0000-000000000095','a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-0000000000f1','a6000000-0000-0000-0000-000000000023','Needs the committee study','a6000000-0000-0000-0000-000000000011');
   insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,meeting_id,agenda_item_id,governance_unit_id,decision_text,decision_status,requires_approval,issued_by_user_id)
   values('a6000000-0000-0000-0000-0000000000a1','a6000000-0000-0000-0000-000000000001','DEC-S105-1','a6000000-0000-0000-0000-000000000071','a6000000-0000-0000-0000-000000000081','a6000000-0000-0000-0000-000000000091','a6000000-0000-0000-0000-000000000022','Approve the plan as presented.','ready_for_approval',true,'a6000000-0000-0000-0000-000000000012');
   set local session_replication_role=origin $$;
-- Ends the session with the vote-every-item rule and the decision trigger active.
create function pg_temp.s105_end_session() returns void language plpgsql security definer as
$$ begin
   alter table qarar_meetings.meetings disable trigger user;
   alter table qarar_meetings.meetings enable trigger meetings_require_vote_for_agenda_items;
   alter table qarar_meetings.meetings enable trigger meetings_record_outcome_decisions;
   update qarar_meetings.meetings set status='waiting_for_minutes' where id='a6000000-0000-0000-0000-000000000081';
   alter table qarar_meetings.meetings enable trigger user;
end $$;
create function pg_temp.s105_minutes(p_status text) returns void language sql security definer as
$$ update qarar_minutes.meeting_minutes set status=p_status where meeting_id='a6000000-0000-0000-0000-000000000081' $$;
create function pg_temp.s105_statuses() returns text language sql security definer as
$$ select string_agg(distinct decision_status, ',') from qarar_decisions.decisions where meeting_id='a6000000-0000-0000-0000-000000000081' $$;

select pg_temp.s105_as('a6000000-0000-0000-0000-000000000011');
select pg_temp.s105_seat_roster();
set local role authenticated;
select api_v1.open_meeting_session('a6000000-0000-0000-0000-000000000081',pg_temp.s105_meeting_token());
select pg_temp.s105_outcomes();

-- The assignment names its follow-up person and whether evidence is required.
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a6000000-0000-0000-0000-000000000091','Update the study plan',null,'a6000000-0000-0000-0000-000000000013',null,current_date+30,null,false) $$,'22023',null,'an assignment needs a follow-up person');
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a6000000-0000-0000-0000-000000000091','Update the study plan',null,'a6000000-0000-0000-0000-000000000013',null,current_date+30,'a6000000-0000-0000-0000-000000000016',false) $$,'22023',null,'the follow-up person belongs to the tenant');
create temp table s105_ids(name text primary key, id uuid);
grant select, insert on s105_ids to authenticated;
insert into s105_ids select 'task', (api_v2.propose_meeting_assignment_v2('a6000000-0000-0000-0000-000000000091','Update the study plan',null,'a6000000-0000-0000-0000-000000000013',null,current_date+30,'a6000000-0000-0000-0000-000000000012',true)->>'id')::uuid;
select is(pg_temp.s105_task((select id from s105_ids))->>'follow_up_user_id','a6000000-0000-0000-0000-000000000012','the task carries its follow-up person');
select is(pg_temp.s105_task((select id from s105_ids))->>'requires_evidence','true','the task carries the evidence requirement');
select is((select a->>'follow_up_user_name_ar' from jsonb_array_elements(api_v2.list_meeting_assignments_v2('a6000000-0000-0000-0000-000000000081')->'assignments') a),'Council Rapporteur','the room reads the follow-up person');

-- Ending the session gives every closed item a numbered decision.
select lives_ok($$ select pg_temp.s105_end_session() $$,'the session ends');
select is((select count(*) from qarar_decisions.decisions where meeting_id='a6000000-0000-0000-0000-000000000081')::integer,5,'every item has one decision');
select is(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000091')->>'id','a6000000-0000-0000-0000-0000000000a1','the drafted approval decision is kept as it was');
select is(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000091')->>'outcome_kind','approval','it is an approval');
select is(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000092')->>'outcome_kind','rejection','a rejected vote becomes a rejection decision');
select is(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000093')->>'outcome_kind','undecided','a tie becomes an undecided decision');
select is(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000094')->>'outcome_kind','postponement','a postponed item becomes a postponement decision');
select is(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000095')->>'outcome_kind','referral','a referred item becomes a referral decision');
select ok(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000092')->>'decision_text' like '%Rejected topic%','the rejection names its topic');
select ok(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000094')->>'decision_text' like '%Awaiting the budget study%','the postponement states its reason');
select ok(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000095')->>'decision_text' like '%Registry Office%Needs the committee study%','the referral names the unit and the reason');
select ok(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000092')->>'decision_no' ~ '^DEC-[0-9]{4}-[0-9]{6}$','the database numbers the new decisions');
select is((select count(distinct decision_no) from qarar_decisions.decisions where meeting_id='a6000000-0000-0000-0000-000000000081')::integer,5,'every decision has its own number');
select is(pg_temp.s105_statuses(),'ready_for_approval','all decisions await the minutes');
select is(pg_temp.s105_audits('decisions.create_for_outcome'),4::bigint,'each new decision is audited');
select is((select count(*) from jsonb_array_elements(api_v1.list_meeting_decisions('a6000000-0000-0000-0000-000000000081')) d where d ? 'outcome_kind')::integer,5,'the room reads each decision''s kind');

-- The minutes draft lists every decision and the session's assignments.
create temp table s105_draft as select api_v1.generate_meeting_minutes_draft('a6000000-0000-0000-0000-000000000081')->>'content_draft' as content;
select ok((select content from s105_draft) like '%'||(pg_temp.s105_decision('a6000000-0000-0000-0000-000000000092')->>'decision_no')||'%','the minutes number each decision');
select ok((select content from s105_draft) like '%Update the study plan%Council Member%Council Rapporteur%','the minutes name the assignment, its assignee and its follow-up person');
select ok((select content from s105_draft) like '%30 يوماً%','the minutes state the assignment''s duration');
select ok((select content from s105_draft) like '%يتطلب أدلة إنجاز%','the minutes state that evidence is required');

-- Approving the minutes approves the decisions; returning them does not.
select pg_temp.s105_minutes('ready_for_approval');
select pg_temp.s105_minutes('draft');
select is(pg_temp.s105_statuses(),'ready_for_approval','returned minutes approve nothing');
select pg_temp.s105_minutes('ready_for_approval');
select pg_temp.s105_minutes('approved');
select is(pg_temp.s105_statuses(),'approved','approving the minutes approves every decision of the meeting');
select ok((pg_temp.s105_decision('a6000000-0000-0000-0000-000000000092')->>'issued_at') is not null,'the approval date is recorded');
select is(pg_temp.s105_audits('decisions.approve_with_minutes'),5::bigint,'each approval is audited');
select is(pg_temp.s105_task((select id from s105_ids))->>'status','new','the session''s task keeps running');

select * from finish();
rollback;
