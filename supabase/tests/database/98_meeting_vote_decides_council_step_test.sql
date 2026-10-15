-- Every agenda item is decided by the members' vote, and the result moves the
-- topic along its route. Decision of the product owner, 2026-10-15.
-- Impact map: docs/engineering/impact/MEETING_VOTE_EVERY_ITEM_AR.md
begin;
create extension if not exists pgtap;
select plan(26);

insert into public.organizations(id,code,name_ar) values
('98000000-0000-0000-0000-000000000001','s98','Council Vote Route');
insert into auth.users(id,email) values
('98000000-0000-0000-0000-000000000011','chair@s98.test'),
('98000000-0000-0000-0000-000000000012','rapporteur@s98.test'),
('98000000-0000-0000-0000-000000000013','member@s98.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('98000000-0000-0000-0000-000000000011','98000000-0000-0000-0000-000000000001','chair@s98.test','Council Chair'),
('98000000-0000-0000-0000-000000000012','98000000-0000-0000-0000-000000000001','rapporteur@s98.test','Council Rapporteur'),
('98000000-0000-0000-0000-000000000013','98000000-0000-0000-0000-000000000001','member@s98.test','Council Member');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('98000000-0000-0000-0000-000000000021','98000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('98000000-0000-0000-0000-000000000022','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000021','faculty','Faculty Council',60),
('98000000-0000-0000-0000-000000000023','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000021','university','University Council',60);
delete from public.roles where organization_id='98000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('98000000-0000-0000-0000-000000000031','98000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('98000000-0000-0000-0000-000000000032','98000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('98000000-0000-0000-0000-000000000033','98000000-0000-0000-0000-000000000001','s98_member','Member','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
select '98000000-0000-0000-0000-000000000001',v.code,split_part(v.code,'.',1),split_part(v.code,'.',2),'governance_unit',v.code
from (values ('meetings.manage'),('attendance.read'),('attendance.manage'),('quorum.read'),('quorum.manage'),
 ('voting.read'),('voting.manage'),('voting.cast'),('attendance.check_in'),('attendance.verify'),
 ('attendance.override'),('attendance.lock'),('topics.read'),('agenda.manage'),('decisions.read')) v(code)
on conflict (organization_id,code) do nothing;
-- The chair runs the meeting. Deliberately without topics.review: the
-- council's vote, not staff review authority, moves the route.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='98000000-0000-0000-0000-000000000001'
 and code in ('meetings.manage','attendance.read','attendance.manage','quorum.read','quorum.manage','voting.read',
  'voting.manage','voting.cast','attendance.check_in','attendance.verify','attendance.override','attendance.lock',
  'topics.read','agenda.manage','decisions.read');
insert into public.role_permissions(organization_id,role_id,permission_id)
select '98000000-0000-0000-0000-000000000001',r.role_id,p.id
from public.permissions p
cross join (values ('98000000-0000-0000-0000-000000000032'::uuid),('98000000-0000-0000-0000-000000000033'::uuid)) r(role_id)
where p.organization_id='98000000-0000-0000-0000-000000000001'
 and p.code in ('attendance.read','quorum.read','voting.read','voting.cast','attendance.check_in','topics.read','decisions.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('98000000-0000-0000-0000-000000000061','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000011','98000000-0000-0000-0000-000000000022','98000000-0000-0000-0000-000000000031'),
('98000000-0000-0000-0000-000000000062','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000012','98000000-0000-0000-0000-000000000022','98000000-0000-0000-0000-000000000032'),
('98000000-0000-0000-0000-000000000063','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000013','98000000-0000-0000-0000-000000000022','98000000-0000-0000-0000-000000000033');

-- Five topics. T1-T4 follow a council route the way the route designer writes
-- it (one step per council, approved/rejected outcomes); T5 is a legacy topic.
--  T1: discussion at the faculty (approved -> university, rejected -> end), then approval at the university.
--  T2: a single approval step (approved -> complete, rejected -> reject).
--  T3: a single discussion step; its vote will tie.
--  T4: an old two-step chain whose discussion step only knows "completed" (no approved/rejected).
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('98000000-0000-0000-0000-000000000071','98000000-0000-0000-0000-000000000001','TOP-S98-1','Programme plan','98000000-0000-0000-0000-000000000022','98000000-0000-0000-0000-000000000012','approved'),
('98000000-0000-0000-0000-000000000072','98000000-0000-0000-0000-000000000001','TOP-S98-2','Budget','98000000-0000-0000-0000-000000000022','98000000-0000-0000-0000-000000000012','approved'),
('98000000-0000-0000-0000-000000000073','98000000-0000-0000-0000-000000000001','TOP-S98-3','Committee','98000000-0000-0000-0000-000000000022','98000000-0000-0000-0000-000000000012','approved'),
('98000000-0000-0000-0000-000000000074','98000000-0000-0000-0000-000000000001','TOP-S98-4','Old chain','98000000-0000-0000-0000-000000000022','98000000-0000-0000-0000-000000000012','approved'),
('98000000-0000-0000-0000-000000000075','98000000-0000-0000-0000-000000000001','TOP-S98-5','Legacy item','98000000-0000-0000-0000-000000000022','98000000-0000-0000-0000-000000000012','approved');

set local session_replication_role=replica;
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
select ('98000000-0000-0000-0000-0000000001a'||n)::uuid,'98000000-0000-0000-0000-000000000001','s98_route_'||n,'Route '||n,'98000000-0000-0000-0000-000000000011'
from generate_series(1,4) n;
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,created_by_user_id,activated_by_user_id,activated_at)
select ('98000000-0000-0000-0000-0000000001b'||n)::uuid,'98000000-0000-0000-0000-000000000001',('98000000-0000-0000-0000-0000000001a'||n)::uuid,1,'active','valid','98000000-0000-0000-0000-000000000011','98000000-0000-0000-0000-000000000011',now()
from generate_series(1,4) n;
-- Template steps: c<topic><step>.
insert into qarar_governance.workflow_template_steps(id,organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes) values
('98000000-0000-0000-0000-0000000001c1','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b1','faculty','مناقشة مجلس الكلية',1,'discussion','discuss','98000000-0000-0000-0000-000000000022',true,false,array['approved','rejected']),
('98000000-0000-0000-0000-0000000001c2','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b1','university','اعتماد مجلس الجامعة',2,'approval','final_approve','98000000-0000-0000-0000-000000000023',false,true,array['approved','rejected']),
('98000000-0000-0000-0000-0000000001c3','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b2','approve','اعتماد مجلس الكلية',1,'approval','final_approve','98000000-0000-0000-0000-000000000022',true,true,array['approved','rejected']),
('98000000-0000-0000-0000-0000000001c4','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b3','discuss','مناقشة مجلس الكلية',1,'discussion','discuss','98000000-0000-0000-0000-000000000022',true,true,array['approved','rejected']),
('98000000-0000-0000-0000-0000000001c5','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b4','discuss','عرض ومناقشة',1,'discussion','discuss','98000000-0000-0000-0000-000000000022',true,false,array['completed']),
('98000000-0000-0000-0000-0000000001c6','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b4','vote','تصويت المجلس',2,'voting','final_approve','98000000-0000-0000-0000-000000000022',false,true,array['approved','rejected','tie','no_vote']);
insert into qarar_governance.workflow_template_transitions(organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code,transition_type) values
('98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b1','98000000-0000-0000-0000-0000000001c1','98000000-0000-0000-0000-0000000001c2','approved','forward'),
('98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b1','98000000-0000-0000-0000-0000000001c1',null,'rejected','reject'),
('98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b1','98000000-0000-0000-0000-0000000001c2',null,'approved','complete'),
('98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b1','98000000-0000-0000-0000-0000000001c2',null,'rejected','reject'),
('98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b2','98000000-0000-0000-0000-0000000001c3',null,'approved','complete'),
('98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b2','98000000-0000-0000-0000-0000000001c3',null,'rejected','reject'),
('98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b3','98000000-0000-0000-0000-0000000001c4',null,'approved','complete'),
('98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b3','98000000-0000-0000-0000-0000000001c4',null,'rejected','reject'),
('98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001b4','98000000-0000-0000-0000-0000000001c5','98000000-0000-0000-0000-0000000001c6','completed','forward');
-- Each route hangs on its topic's governance mapping (an existing routing decision).
insert into qarar_governance.topic_governance_mappings(id,organization_id,topic_id,governance_source,routing_status,routing_decision_id,workflow_template_version_id,snapshot,mapped_by_user_id)
select ('98000000-0000-0000-0000-0000000001d'||n)::uuid,'98000000-0000-0000-0000-000000000001',('98000000-0000-0000-0000-00000000007'||n)::uuid,
 'regulated','routing_ready',gen_random_uuid(),('98000000-0000-0000-0000-0000000001b'||n)::uuid,'{}','98000000-0000-0000-0000-000000000011'
from generate_series(1,4) n;
insert into qarar_governance.workflow_instances(id,organization_id,topic_id,topic_governance_mapping_id,workflow_template_version_id,status,started_by_user_id,snapshot)
select ('98000000-0000-0000-0000-0000000001e'||n)::uuid,'98000000-0000-0000-0000-000000000001',('98000000-0000-0000-0000-00000000007'||n)::uuid,
 ('98000000-0000-0000-0000-0000000001d'||n)::uuid,('98000000-0000-0000-0000-0000000001b'||n)::uuid,'active','98000000-0000-0000-0000-000000000011','{}'
from generate_series(1,4) n;
-- Instance steps: f<template step>; the first step of each route is active.
insert into qarar_governance.workflow_instance_steps(id,organization_id,workflow_instance_id,template_step_id,sequence_no,status,assigned_unit_id,opened_at,snapshot) values
('98000000-0000-0000-0000-0000000001f1','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001e1','98000000-0000-0000-0000-0000000001c1',1,'active','98000000-0000-0000-0000-000000000022',now(),'{"responsibility":"discuss"}'),
('98000000-0000-0000-0000-0000000001f2','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001e1','98000000-0000-0000-0000-0000000001c2',2,'pending','98000000-0000-0000-0000-000000000023',null,'{"responsibility":"final_approve"}'),
('98000000-0000-0000-0000-0000000001f3','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001e2','98000000-0000-0000-0000-0000000001c3',1,'active','98000000-0000-0000-0000-000000000022',now(),'{"responsibility":"final_approve"}'),
('98000000-0000-0000-0000-0000000001f4','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001e3','98000000-0000-0000-0000-0000000001c4',1,'active','98000000-0000-0000-0000-000000000022',now(),'{"responsibility":"discuss"}'),
('98000000-0000-0000-0000-0000000001f5','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001e4','98000000-0000-0000-0000-0000000001c5',1,'active','98000000-0000-0000-0000-000000000022',now(),'{"responsibility":"discuss"}'),
('98000000-0000-0000-0000-0000000001f6','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-0000000001e4','98000000-0000-0000-0000-0000000001c6',2,'pending','98000000-0000-0000-0000-000000000022',null,'{"responsibility":"final_approve"}');
update qarar_governance.workflow_instances i set current_step_id=s.id
from qarar_governance.workflow_instance_steps s
where s.workflow_instance_id=i.id and s.status='active' and i.organization_id='98000000-0000-0000-0000-000000000001';
update qarar_topics.topics t set governance_source='regulated',routing_status='routing_ready',
 workflow_instance_id=i.id,current_workflow_step_id=i.current_step_id,workflow_template_version_id=i.workflow_template_version_id
from qarar_governance.workflow_instances i
where i.topic_id=t.id and t.organization_id='98000000-0000-0000-0000-000000000001';
set local session_replication_role=origin;

insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('98000000-0000-0000-0000-000000000081','98000000-0000-0000-0000-000000000001','MTG-S98-1','98000000-0000-0000-0000-000000000022','Faculty Council Meeting',current_date,'98000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order)
select ('98000000-0000-0000-0000-00000000009'||n)::uuid,'98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000081',
 ('98000000-0000-0000-0000-00000000007'||n)::uuid,n
from generate_series(1,5) n;

create temporary table s98_state(round_id uuid);
insert into s98_state default values;
grant select,insert,update,delete on s98_state to authenticated;

create function pg_temp.s98_item(p_order integer) returns jsonb language sql as
$$ select i from jsonb_array_elements(api_v1.get_meeting_detail('98000000-0000-0000-0000-000000000081')->'agenda_items') i
   where (i->>'agenda_order')::integer=p_order $$;
create function pg_temp.s98_meeting_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.meetings where id='98000000-0000-0000-0000-000000000081' $$;
create function pg_temp.s98_item_token(p_order integer) returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.agenda_items where id=('98000000-0000-0000-0000-00000000009'||p_order)::uuid $$;
create function pg_temp.s98_step(p_id uuid) returns qarar_governance.workflow_instance_steps language sql security definer as
$$ select * from qarar_governance.workflow_instance_steps where id=p_id $$;
create function pg_temp.s98_topic(p_id uuid) returns qarar_topics.topics language sql security definer as
$$ select * from qarar_topics.topics where id=p_id $$;
-- The whole test is one transaction, so updated_at (now()) predates closed_at
-- (clock_timestamp()); align the rounds so the final-summary guard compares like with like.
create function pg_temp.s98_align_round_clock() returns void language sql security definer as
$$ update qarar_voting.voting_rounds set closed_at=now() where meeting_id='98000000-0000-0000-0000-000000000081' and status='closed' $$;
create function pg_temp.s98_round() returns qarar_voting.voting_rounds language sql security definer as
$$ select * from qarar_voting.voting_rounds where id=(select round_id from s98_state) $$;
-- Discuss an item, then open its vote; returns nothing, keeps the round id.
create function pg_temp.s98_discuss_and_open(p_order integer) returns void language plpgsql as $$
begin
  perform api_v1.update_agenda_discussion(('98000000-0000-0000-0000-00000000009'||p_order)::uuid,'under_discussion',null,pg_temp.s98_item_token(p_order));
  perform api_v1.update_agenda_discussion(('98000000-0000-0000-0000-00000000009'||p_order)::uuid,'discussed',null,pg_temp.s98_item_token(p_order));
  update s98_state set round_id=(api_v1.open_voting_round(('98000000-0000-0000-0000-00000000009'||p_order)::uuid,pg_temp.s98_meeting_token())->>'voting_round_id')::uuid;
end $$;
create function pg_temp.s98_vote(p_user text, p_value text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true);
  perform api_v1.cast_vote((select round_id from s98_state),p_value,null);
end $$;
create function pg_temp.s98_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;

set local role authenticated;
select pg_temp.s98_as('98000000-0000-0000-0000-000000000011');
select api_v1.open_meeting_session('98000000-0000-0000-0000-000000000081',pg_temp.s98_meeting_token());
select api_v1.verify_attendance(ar.id,'present','Verified in the room',ar.updated_at)
from public.attendance_records ar where ar.meeting_id='98000000-0000-0000-0000-000000000081';
select api_v1.recalculate_meeting_quorum('98000000-0000-0000-0000-000000000081',true);
select api_v1.lock_attendance_roster('98000000-0000-0000-0000-000000000081',pg_temp.s98_meeting_token());

-- The agenda says, for every item, that it is decided by a vote and whether it can be voted now.
select is((pg_temp.s98_item(1)->>'requires_voting')::boolean,true,'a council discussion step requires the members'' vote');
select is((pg_temp.s98_item(1)->>'voting_available_now')::boolean,true,'a council discussion step can be voted on in its meeting');
select is((pg_temp.s98_item(2)->>'voting_available_now')::boolean,true,'a council approval step can be voted on in its meeting');
select is((pg_temp.s98_item(4)->>'voting_available_now')::boolean,false,'a step without approved and rejected outcomes cannot be voted on');
select ok(pg_temp.s98_item(4)->>'voting_unavailable_reason' like '%عرض ومناقشة%','the agenda names the step that blocks the vote');
select is((pg_temp.s98_item(5)->>'voting_available_now')::boolean,true,'a legacy topic without a route can be voted on');
select is(pg_temp.s98_item(1)->>'voting_unavailable_reason',null,'no reason is given when the vote is available');

-- T1: discussed, voted and approved. The faculty step closes and the university step opens.
select lives_ok($$select pg_temp.s98_discuss_and_open(1)$$,'the chair opens the vote on a council discussion step');
select is((pg_temp.s98_round()).workflow_instance_step_id,'98000000-0000-0000-0000-0000000001f1'::uuid,'the round is bound to the council step it decides');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000011','approve');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000012','approve');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000013','reject');
select pg_temp.s98_as('98000000-0000-0000-0000-000000000013');
select throws_ok($$select api_v1.close_voting_round((select round_id from s98_state),null)$$,'42501',null,'a member cannot close the round');
select pg_temp.s98_as('98000000-0000-0000-0000-000000000011');
select lives_ok($$select api_v1.close_voting_round((select round_id from s98_state),null)$$,'the chair closes the round without staff review authority');
select is((pg_temp.s98_step('98000000-0000-0000-0000-0000000001f1')).outcome_code,'approved','the council step closes with the approved outcome');
select is((pg_temp.s98_step('98000000-0000-0000-0000-0000000001f2')).status,'active','the next council step opens');
select is((pg_temp.s98_topic('98000000-0000-0000-0000-000000000071')).current_workflow_step_id,'98000000-0000-0000-0000-0000000001f2'::uuid,'the topic now waits at the next council');
-- The approved item's decision is drafted, as before this change.
select api_v1.create_decision_from_voting_round((select round_id from s98_state),'The council recommends the programme plan to the university.',true);

-- T2: rejected at its only (final) step. The route ends rejected.
select lives_ok($$select pg_temp.s98_discuss_and_open(2)$$,'the chair opens the vote on a council approval step');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000011','reject');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000012','reject');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000013','approve');
select pg_temp.s98_as('98000000-0000-0000-0000-000000000011');
select lives_ok($$select api_v1.close_voting_round((select round_id from s98_state),null)$$,'the rejected round closes');
select is((pg_temp.s98_step('98000000-0000-0000-0000-0000000001f3')).status,'rejected','the final step closes rejected');
select is((pg_temp.s98_topic('98000000-0000-0000-0000-000000000072')).current_workflow_step_id,null,'the rejected route has no current step');

-- T3: a tie the chair does not break. The round closes; the topic stays where it was.
select lives_ok($$select pg_temp.s98_discuss_and_open(3)$$,'the chair opens the third vote');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000011','abstain');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000012','approve');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000013','reject');
select pg_temp.s98_as('98000000-0000-0000-0000-000000000011');
select lives_ok($$select api_v1.close_voting_round((select round_id from s98_state),null)$$,'a tied round closes');
select is((pg_temp.s98_round()).result,'tied','the round records the tie');
select is((pg_temp.s98_step('98000000-0000-0000-0000-0000000001f4')).status,'active','after a tie the topic stays at its council step');

-- A forged "vote transition" setting without a closed round cannot move a meeting step.
select throws_ok($$select set_config('qarar.voting_transition','on',true), set_config('qarar.voting_round_id',gen_random_uuid()::text,true),
  api_v1.act_topic_workflow_step('98000000-0000-0000-0000-000000000073','approved','forged',gen_random_uuid(),
   (pg_temp.s98_step('98000000-0000-0000-0000-0000000001f4')).action_version)$$,
 '55000',null,'a forged vote transition cannot move a meeting step');

-- T4: the old chain is refused with the reason, at the moment the chair tries.
select throws_ok($$select pg_temp.s98_discuss_and_open(4)$$,'55000',null,'opening a vote on a step without approved and rejected outcomes is refused');

-- T4 and the legacy T5 are discussed but not voted: the session cannot end.
select api_v1.update_agenda_discussion('98000000-0000-0000-0000-000000000094','under_discussion',null,pg_temp.s98_item_token(4));
select api_v1.update_agenda_discussion('98000000-0000-0000-0000-000000000094','discussed',null,pg_temp.s98_item_token(4));
select api_v1.update_agenda_discussion('98000000-0000-0000-0000-000000000095','under_discussion',null,pg_temp.s98_item_token(5));
select api_v1.update_agenda_discussion('98000000-0000-0000-0000-000000000095','discussed',null,pg_temp.s98_item_token(5));
select api_v1.update_agenda_discussion(('98000000-0000-0000-0000-00000000009'||n)::uuid,'discussed','Final summary of the item after the vote.',pg_temp.s98_item_token(n))
from generate_series(1,3) n;
select pg_temp.s98_align_round_clock();
select throws_like($$select api_v1.complete_meeting_session('98000000-0000-0000-0000-000000000081',pg_temp.s98_meeting_token())$$,
 '%البند 4%','the session cannot end while an item that was not postponed has no closed vote');

-- After T4 is postponed and T5 is voted, the session ends.
select api_v1.update_agenda_discussion('98000000-0000-0000-0000-000000000094','postponed','The route of this topic needs review.',pg_temp.s98_item_token(4));
update s98_state set round_id=(api_v1.open_voting_round('98000000-0000-0000-0000-000000000095',pg_temp.s98_meeting_token())->>'voting_round_id')::uuid;
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000011','reject');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000012','reject');
select pg_temp.s98_vote('98000000-0000-0000-0000-000000000013','reject');
select pg_temp.s98_as('98000000-0000-0000-0000-000000000011');
select api_v1.close_voting_round((select round_id from s98_state),null);
select api_v1.update_agenda_discussion('98000000-0000-0000-0000-000000000095','discussed','Final summary of the legacy item.',pg_temp.s98_item_token(5));
select pg_temp.s98_align_round_clock();
select lives_ok($$select api_v1.complete_meeting_session('98000000-0000-0000-0000-000000000081',pg_temp.s98_meeting_token())$$,
 'the session ends once every item is voted on or postponed');

select * from finish();
rollback;
