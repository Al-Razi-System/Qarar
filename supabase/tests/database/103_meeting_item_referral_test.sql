-- Referral of an agenda item from the live room (owner review 2026-10-15,
-- batch 5b): the council's chair refers an item, without a vote, through the
-- existing referral flow that waits for the receiving unit.
-- Impact map: docs/engineering/impact/MEETING_ITEM_REFERRAL_AR.md
begin;
create extension if not exists pgtap;
select plan(26);

insert into public.organizations(id,code,name_ar) values
('a4000000-0000-0000-0000-000000000001','s103','Referral'),
('a4000000-0000-0000-0000-000000000002','s103b','Other Tenant');
insert into auth.users(id,email) values
('a4000000-0000-0000-0000-000000000011','chair@s103.test'),
('a4000000-0000-0000-0000-000000000012','rapporteur@s103.test'),
('a4000000-0000-0000-0000-000000000013','member@s103.test'),
('a4000000-0000-0000-0000-000000000014','head@s103.test'),
('a4000000-0000-0000-0000-000000000015','admin@s103.test'),
('a4000000-0000-0000-0000-000000000016','other@s103b.test');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('a4000000-0000-0000-0000-000000000011','a4000000-0000-0000-0000-000000000001','chair@s103.test','Council Chair',false),
('a4000000-0000-0000-0000-000000000012','a4000000-0000-0000-0000-000000000001','rapporteur@s103.test','Council Rapporteur',false),
('a4000000-0000-0000-0000-000000000013','a4000000-0000-0000-0000-000000000001','member@s103.test','Council Member',false),
('a4000000-0000-0000-0000-000000000014','a4000000-0000-0000-0000-000000000001','head@s103.test','Committee Head',false),
('a4000000-0000-0000-0000-000000000015','a4000000-0000-0000-0000-000000000001','admin@s103.test','System Admin',true),
('a4000000-0000-0000-0000-000000000016','a4000000-0000-0000-0000-000000000002','other@s103b.test','Other Tenant User',false);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('a4000000-0000-0000-0000-000000000021','a4000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('a4000000-0000-0000-0000-000000000022','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000021','faculty','Faculty Council',50),
('a4000000-0000-0000-0000-000000000023','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000021','committee','Planning Committee',50);
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage,status) values
('a4000000-0000-0000-0000-000000000024','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000021','dormant','Dormant Committee',50,'inactive');
delete from public.roles where organization_id='a4000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('a4000000-0000-0000-0000-000000000031','a4000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('a4000000-0000-0000-0000-000000000032','a4000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('a4000000-0000-0000-0000-000000000033','a4000000-0000-0000-0000-000000000001','s103_member','Member','governance_unit'),
('a4000000-0000-0000-0000-000000000034','a4000000-0000-0000-0000-000000000001','s103_head','Committee head','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
select 'a4000000-0000-0000-0000-000000000001',v.code,split_part(v.code,'.',1),split_part(v.code,'.',2),'governance_unit',v.code
from (values ('meetings.manage'),('agenda.manage'),('attendance.read'),('attendance.manage'),('attendance.verify'),('attendance.lock'),('quorum.read'),('quorum.manage'),('topics.refer'),('topics.read')) v(code)
on conflict (organization_id,code) do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='a4000000-0000-0000-0000-000000000001'
 and code in ('meetings.manage','agenda.manage','attendance.read','attendance.manage','attendance.verify','attendance.lock','quorum.read','quorum.manage','topics.read');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a4000000-0000-0000-0000-000000000001',r.role_id,p.id
from public.permissions p
cross join (values ('a4000000-0000-0000-0000-000000000032'::uuid),('a4000000-0000-0000-0000-000000000033'::uuid)) r(role_id)
where p.organization_id='a4000000-0000-0000-0000-000000000001' and p.code in ('attendance.read','quorum.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('a4000000-0000-0000-0000-000000000061','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000011','a4000000-0000-0000-0000-000000000022','a4000000-0000-0000-0000-000000000031'),
('a4000000-0000-0000-0000-000000000062','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000012','a4000000-0000-0000-0000-000000000022','a4000000-0000-0000-0000-000000000032'),
('a4000000-0000-0000-0000-000000000063','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000013','a4000000-0000-0000-0000-000000000022','a4000000-0000-0000-0000-000000000033'),
('a4000000-0000-0000-0000-000000000064','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000014','a4000000-0000-0000-0000-000000000023','a4000000-0000-0000-0000-000000000034');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000034',id
from public.permissions where organization_id='a4000000-0000-0000-0000-000000000001' and code='topics.refer';
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('a4000000-0000-0000-0000-000000000071','a4000000-0000-0000-0000-000000000001','TOP-S102-1','Plan','a4000000-0000-0000-0000-000000000022','a4000000-0000-0000-0000-000000000012','approved'),
('a4000000-0000-0000-0000-000000000072','a4000000-0000-0000-0000-000000000001','TOP-S102-2','Budget','a4000000-0000-0000-0000-000000000022','a4000000-0000-0000-0000-000000000012','approved'),
('a4000000-0000-0000-0000-000000000073','a4000000-0000-0000-0000-000000000001','TOP-S102-3','Next meeting topic','a4000000-0000-0000-0000-000000000022','a4000000-0000-0000-0000-000000000012','approved');
-- M1 runs now; M2 has not started.
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('a4000000-0000-0000-0000-000000000081','a4000000-0000-0000-0000-000000000001','MTG-S102-1','a4000000-0000-0000-0000-000000000022','Live meeting',current_date,'a4000000-0000-0000-0000-000000000011','ready_to_start'),
('a4000000-0000-0000-0000-000000000082','a4000000-0000-0000-0000-000000000001','MTG-S102-2','a4000000-0000-0000-0000-000000000022','Next meeting',current_date+7,'a4000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000081','a4000000-0000-0000-0000-000000000071',1),
('a4000000-0000-0000-0000-000000000092','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000081','a4000000-0000-0000-0000-000000000072',2),
('a4000000-0000-0000-0000-000000000093','a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000081','a4000000-0000-0000-0000-000000000073',3);

create function pg_temp.s103_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;
create function pg_temp.s103_meeting_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.meetings where id='a4000000-0000-0000-0000-000000000081' $$;
create function pg_temp.s103_item_token(p_id uuid) returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.agenda_items where id=p_id $$;
create function pg_temp.s103_audits(p_action text) returns bigint language sql security definer as
$$ select count(*) from qarar_audit.audit_logs where action=p_action and organization_id='a4000000-0000-0000-0000-000000000001' $$;
create function pg_temp.s103_item(p_id uuid) returns text language sql security definer as
$$ select agenda_status from qarar_meetings.agenda_items where id=p_id $$;
create function pg_temp.s103_topic_unit() returns uuid language sql security definer as
$$ select current_unit_id from qarar_topics.topics where id='a4000000-0000-0000-0000-000000000071' $$;
create function pg_temp.s103_referral(p_item uuid) returns jsonb language sql as
$$ select r from jsonb_array_elements(api_v2.list_meeting_referrals_v2('a4000000-0000-0000-0000-000000000081')->'referrals') r
   where r->>'agenda_item_id'=p_item::text $$;
-- Opens a round the way open_voting_round does, so the voting triggers run.
create function pg_temp.s103_open_round(p_item uuid) returns void language sql security definer as
$$ insert into qarar_voting.voting_rounds(organization_id,meeting_id,agenda_item_id,round_number,eligible_voter_count,opened_by_user_id)
   values('a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000081',p_item,1,3,'a4000000-0000-0000-0000-000000000011') $$;
create function pg_temp.s103_close_rounds() returns void language sql security definer as
$$ set local session_replication_role=replica;
   update qarar_voting.voting_rounds set status='closed',result='rejected',closed_at=now() where meeting_id='a4000000-0000-0000-0000-000000000081';
   set local session_replication_role=origin $$;
-- Ends the session with only the vote-every-item rule active.
create function pg_temp.s103_end_session() returns void language plpgsql security definer as
$$ begin
   alter table qarar_meetings.meetings disable trigger user;
   alter table qarar_meetings.meetings enable trigger meetings_require_vote_for_agenda_items;
   update qarar_meetings.meetings set status='waiting_for_minutes' where id='a4000000-0000-0000-0000-000000000081';
   alter table qarar_meetings.meetings enable trigger user;
end $$;

set local role authenticated;
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000011');

-- Before the session opens nothing can be referred.
select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000023','Needs the committee study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091')) $$,'23514',null,'no item is referred before the session opens');

select api_v1.open_meeting_session('a4000000-0000-0000-0000-000000000081',pg_temp.s103_meeting_token());
-- Keep the preceding stage real: resolve and lock attendance before discussion.
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000015');
select api_v1.verify_attendance(a.id,'present','Verified test attendance',a.updated_at)
from public.attendance_records a where a.meeting_id='a4000000-0000-0000-0000-000000000081';
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000011');
select api_v1.lock_attendance_roster('a4000000-0000-0000-0000-000000000081',pg_temp.s103_meeting_token());

-- The chair reads the units an item may go to.
select ok((select bool_or(d->>'id'='a4000000-0000-0000-0000-000000000023') from jsonb_array_elements(api_v2.list_meeting_referrals_v2('a4000000-0000-0000-0000-000000000081')->'destinations') d),'the chair sees the active units an item may go to');
select ok((select not coalesce(bool_or(d->>'id' in ('a4000000-0000-0000-0000-000000000022','a4000000-0000-0000-0000-000000000024')),false) from jsonb_array_elements(api_v2.list_meeting_referrals_v2('a4000000-0000-0000-0000-000000000081')->'destinations') d),'the council itself and inactive units are not offered');

select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000023','Needs the committee study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091')) $$,'23514',null,'an item is referred only after its discussion starts');

select api_v1.update_agenda_discussion('a4000000-0000-0000-0000-000000000091','under_discussion',null,pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091'));
select api_v1.update_agenda_discussion('a4000000-0000-0000-0000-000000000093','under_discussion',null,pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000093'));

-- The session cannot end with an item neither voted, referred nor postponed.
select throws_ok($$ select pg_temp.s103_end_session() $$,'23514',null,'an undecided item still blocks ending the session');

-- Authority: only the active chair refers.
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000012');
select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000023','Needs the committee study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091')) $$,'42501',null,'the rapporteur cannot refer an item');
select is(api_v2.list_meeting_referrals_v2('a4000000-0000-0000-0000-000000000081')->'destinations','[]'::jsonb,'only the chair is offered destinations');
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000015');
select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000023','Needs the committee study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091')) $$,'42501',null,'a system administrator cannot refer an item');

select pg_temp.s103_as('a4000000-0000-0000-0000-000000000011');
select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000022','Needs the committee study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091')) $$,'22023',null,'an item is not referred to its own council');
select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000024','Needs the committee study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091')) $$,'22023',null,'an item is not referred to an inactive unit');
select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000023','Why',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091')) $$,'22023',null,'a referral needs a reason of five characters or more');
select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000023','Needs the committee study',now()-interval '1 day') $$,'40001',null,'a stale screen cannot refer');

-- The chair refers the item.
select is(api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000023','Needs the committee study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091'))->>'status','pending','the chair refers the item, pending the unit''s acceptance');
select is(pg_temp.s103_item('a4000000-0000-0000-0000-000000000091'),'discussed','the referred item''s discussion ends');
select is(pg_temp.s103_referral('a4000000-0000-0000-0000-000000000091')->>'to_unit_name_ar','Planning Committee','every screen reads where the item went');
select is(pg_temp.s103_referral('a4000000-0000-0000-0000-000000000091')->>'reason','Needs the committee study','every screen reads why');
select is(pg_temp.s103_audits('meetings.agenda.referred'),1::bigint,'the referral is audited on the item');
select is(pg_temp.s103_audits('topics.referral.request'),1::bigint,'the referral is audited on the topic');
select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000091','a4000000-0000-0000-0000-000000000023','Needs the committee study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000091')) $$,'23514',null,'an item is referred once');

-- No vote on a referred item; no referral of an item under vote.
select throws_ok($$ select pg_temp.s103_open_round('a4000000-0000-0000-0000-000000000091') $$,'23514','أحال رئيس المجلس هذا البند، فلا يُصوَّت عليه.','no vote opens on a referred item');
select pg_temp.s103_open_round('a4000000-0000-0000-0000-000000000093');
select throws_ok($$ select api_v2.refer_agenda_item_v2('a4000000-0000-0000-0000-000000000093','a4000000-0000-0000-0000-000000000023','Needs the committee study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000093')) $$,'23514',null,'an item under vote is not referred');

-- A member reads the referral; another tenant reads nothing.
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000013');
select is(pg_temp.s103_referral('a4000000-0000-0000-0000-000000000091')->>'status','pending','a member reads the referral');
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000016');
select throws_ok($$ select api_v2.list_meeting_referrals_v2('a4000000-0000-0000-0000-000000000081') $$,'P0002',null,'another tenant cannot read the referrals');

-- The session ends with the referred item, a postponed item and a voted item.
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000011');
select api_v1.update_agenda_discussion('a4000000-0000-0000-0000-000000000092','under_discussion',null,pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000092'));
select api_v1.update_agenda_discussion('a4000000-0000-0000-0000-000000000092','postponed','Needs further study',pg_temp.s103_item_token('a4000000-0000-0000-0000-000000000092'));
select pg_temp.s103_close_rounds();
select lives_ok($$ select pg_temp.s103_end_session() $$,'a referred item, like a postponed one, does not block ending the session');

-- The receiving unit accepts with the existing contract; the topic moves.
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000011');
create temp table s103_ref as select (pg_temp.s103_referral('a4000000-0000-0000-0000-000000000091')->>'referral_id')::uuid id;
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000014');
select api_v1.respond_topic_referral((select id from s103_ref),'accept',null);
select is(pg_temp.s103_topic_unit(),'a4000000-0000-0000-0000-000000000023'::uuid,'the receiving unit accepts and the topic moves to it');
select pg_temp.s103_as('a4000000-0000-0000-0000-000000000011');
select is(pg_temp.s103_referral('a4000000-0000-0000-0000-000000000091')->>'status','accepted','the room shows the acceptance');

select * from finish();
rollback;
