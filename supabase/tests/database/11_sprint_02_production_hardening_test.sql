begin;
create extension if not exists pgtap;
select plan(28);

insert into public.organizations(id,code,name_ar) values
('43000000-0000-0000-0000-000000000001','s02-prod','Sprint 02 Production'),
('43000000-0000-0000-0000-000000000002','s02-foreign','Sprint 02 Foreign');
insert into auth.users(id,email) values
('43000000-0000-0000-0000-000000000011','manager@s02.test'),
('43000000-0000-0000-0000-000000000012','receiver@s02.test'),
('43000000-0000-0000-0000-000000000013','foreign@s02.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('43000000-0000-0000-0000-000000000011','43000000-0000-0000-0000-000000000001','manager@s02.test','Manager'),
('43000000-0000-0000-0000-000000000012','43000000-0000-0000-0000-000000000001','receiver@s02.test','Receiver'),
('43000000-0000-0000-0000-000000000013','43000000-0000-0000-0000-000000000002','foreign@s02.test','Foreign');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('43000000-0000-0000-0000-000000000021','43000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('43000000-0000-0000-0000-000000000022','43000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000021','source','Source'),
('43000000-0000-0000-0000-000000000023','43000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000021','target','Target');
insert into public.meeting_types(id,organization_id,code,name_ar) values
('43000000-0000-0000-0000-000000000024','43000000-0000-0000-0000-000000000001','ordinary','Ordinary');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('43000000-0000-0000-0000-000000000031','43000000-0000-0000-0000-000000000001','s02_manager','Manager','governance_unit'),
('43000000-0000-0000-0000-000000000032','43000000-0000-0000-0000-000000000001','s02_receiver','Receiver','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('43000000-0000-0000-0000-000000000041','43000000-0000-0000-0000-000000000001','topics.refer','topics','refer','governance_unit','Refer'),
('43000000-0000-0000-0000-000000000042','43000000-0000-0000-0000-000000000001','topics.referrals.read','topics','referrals.read','governance_unit','Route'),
('43000000-0000-0000-0000-000000000043','43000000-0000-0000-0000-000000000001','meetings.create','meetings','create','governance_unit','Create'),
('43000000-0000-0000-0000-000000000044','43000000-0000-0000-0000-000000000001','meetings.read','meetings','read','governance_unit','Read'),
('43000000-0000-0000-0000-000000000045','43000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage'),
('43000000-0000-0000-0000-000000000046','43000000-0000-0000-0000-000000000001','agenda.manage','agenda','manage','governance_unit','Agenda'),
('43000000-0000-0000-0000-000000000047','43000000-0000-0000-0000-000000000001','agenda.exception','agenda','exception','governance_unit','Exception');
insert into public.role_permissions(organization_id,role_id,permission_id)
select '43000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000031',id
from public.permissions where id between '43000000-0000-0000-0000-000000000041' and '43000000-0000-0000-0000-000000000047';
insert into public.role_permissions(organization_id,role_id,permission_id) values
('43000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000032','43000000-0000-0000-0000-000000000041'),
('43000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000032','43000000-0000-0000-0000-000000000042');
insert into public.memberships(organization_id,user_id,governance_unit_id,role_id) values
('43000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000011','43000000-0000-0000-0000-000000000022','43000000-0000-0000-0000-000000000031'),
('43000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000012','43000000-0000-0000-0000-000000000023','43000000-0000-0000-0000-000000000032');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('43000000-0000-0000-0000-000000000051','43000000-0000-0000-0000-000000000001','TOP-S02-1','Approved topic one','43000000-0000-0000-0000-000000000022','43000000-0000-0000-0000-000000000011','approved'),
('43000000-0000-0000-0000-000000000052','43000000-0000-0000-0000-000000000001','TOP-S02-2','Approved topic two','43000000-0000-0000-0000-000000000022','43000000-0000-0000-0000-000000000011','approved'),
('43000000-0000-0000-0000-000000000053','43000000-0000-0000-0000-000000000001','TOP-S02-3','Ineligible topic','43000000-0000-0000-0000-000000000022','43000000-0000-0000-0000-000000000011','new');

create temporary table s02_state(referral_id uuid,meeting_id uuid,item1 uuid,item2 uuid,updated_at timestamptz);
insert into s02_state default values;
grant select,insert,update,delete on s02_state to authenticated;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"43000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(jsonb_array_length(api_v1.get_sprint02_form_options()->'meeting_units'),1,'form options expose manageable meeting unit');
update s02_state set referral_id=(api_v1.refer_topic(
 '43000000-0000-0000-0000-000000000051','43000000-0000-0000-0000-000000000023',
 'Forward for target council review',(select updated_at from public.topics where id='43000000-0000-0000-0000-000000000051')
)->>'referral_id')::uuid;
select is((select status from public.topic_referrals where id=(select referral_id from s02_state)),'pending','referral starts pending');
select is((select current_unit_id from public.topics where id='43000000-0000-0000-0000-000000000051'),'43000000-0000-0000-0000-000000000022'::uuid,'pending referral does not move topic');
select throws_ok(
 $$select api_v1.refer_topic('43000000-0000-0000-0000-000000000051','43000000-0000-0000-0000-000000000023','Duplicate referral request',(select updated_at from public.topics where id='43000000-0000-0000-0000-000000000051'))$$,
 'P0001','topic already has a pending referral','duplicate pending referral is blocked');

set local "request.jwt.claims"='{"sub":"43000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is(api_v1.respond_topic_referral((select referral_id from s02_state),'accept','Accepted by target unit')->>'status','accepted','destination accepts referral');
reset role;
select is((select current_unit_id from public.topics where id='43000000-0000-0000-0000-000000000051'),'43000000-0000-0000-0000-000000000023'::uuid,'acceptance atomically moves topic');
select is((select responded_by_user_id from public.topic_referrals where id=(select referral_id from s02_state)),'43000000-0000-0000-0000-000000000012'::uuid,'referral stores responder');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"43000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is(jsonb_array_length(api_v1.get_topic_route_history('43000000-0000-0000-0000-000000000051')),1,'route history returns referral');

set local "request.jwt.claims"='{"sub":"43000000-0000-0000-0000-000000000011","role":"authenticated"}';
update s02_state set meeting_id=(api_v1.create_meeting(
 '43000000-0000-0000-0000-000000000022','43000000-0000-0000-0000-000000000024',
 'Production council meeting',current_date+7,'09:00','10:00','hybrid','Room and link',null,
 '43000000-0000-0000-0000-000000000099'
)->>'id')::uuid;
select matches((select meeting_no from public.meetings where id=(select meeting_id from s02_state)),'^MTG-','server generates meeting number');
select is(api_v1.create_meeting(
 '43000000-0000-0000-0000-000000000022','43000000-0000-0000-0000-000000000024',
 'Production council meeting',current_date+7,'09:00','10:00','hybrid','Room and link',null,
 '43000000-0000-0000-0000-000000000099'
)->>'id',(select meeting_id::text from s02_state),'idempotent create returns same meeting');
select is((api_v1.search_meetings('Production',null,null,null,null,25,0)->>'total')::int,1,'meeting search filters and counts');
select is(jsonb_array_length(api_v1.get_meeting_detail((select meeting_id from s02_state))->'status_history'),1,'meeting detail includes initial history');
update s02_state set updated_at=(select updated_at from public.meetings where id=meeting_id);
select is(api_v1.update_meeting((select meeting_id from s02_state),'Updated production meeting',current_date+8,'10:00','11:00','online','Secure link',null,
 '43000000-0000-0000-0000-000000000024',(select updated_at from s02_state))->>'title_ar','Updated production meeting','manager updates editable meeting');
select throws_ok(
  format('select api_v1.transition_meeting(%L,%L,%L,%L)',(select meeting_id from s02_state),'in_progress','Invalid jump',(select updated_at from public.meetings where id=(select meeting_id from s02_state))),
  'P0001','use open_meeting_session to start the meeting','meeting start is delegated to the Sprint 03 session contract');
select is(api_v1.transition_meeting((select meeting_id from s02_state),'scheduled','Ready for invitations',
 (select updated_at from public.meetings where id=(select meeting_id from s02_state)))->>'status','scheduled','valid lifecycle transition succeeds');
select is((select count(*) from public.meeting_status_history where meeting_id=(select meeting_id from s02_state))::int,2,'lifecycle appends status history');
select is((api_v1.search_eligible_agenda_topics((select meeting_id from s02_state),null,25,0)->>'total')::int,1,'eligible search returns approved topics in meeting unit only');
update s02_state set item1=(api_v1.add_agenda_item((select meeting_id from s02_state),'43000000-0000-0000-0000-000000000052',false,null)->>'id')::uuid;
select ok(
  (api_v1.get_meeting_detail((select meeting_id from s02_state))->'agenda_items'->0) ?& array['voting_status','voting_result'],
  'meeting detail agenda exposes voting state required by frontend'
);
select throws_ok(
 format('select api_v1.add_agenda_item(%L,%L,false,null)',(select meeting_id from s02_state),'43000000-0000-0000-0000-000000000053'),
 'P0001','topic is not eligible for agenda','ineligible topic requires exception');
update s02_state set item2=(api_v1.add_agenda_item((select meeting_id from s02_state),'43000000-0000-0000-0000-000000000053',true,'Urgent statutory deadline')->>'id')::uuid;
select ok((select is_exception from public.agenda_items where id=(select item2 from s02_state)),'authorized exception is recorded');
update s02_state set updated_at=(select updated_at from public.meetings where id=meeting_id);
select is((api_v1.reorder_agenda_items((select meeting_id from s02_state),array[(select item2 from s02_state),(select item1 from s02_state)],(select updated_at from s02_state))->0->>'id'),
 (select item2::text from s02_state),'agenda reorder persists requested order');
select throws_ok(
 format('select api_v1.reorder_agenda_items(%L,array[%L]::uuid[],%L)',(select meeting_id from s02_state),(select item1 from s02_state),(select updated_at from public.meetings where id=(select meeting_id from s02_state))),
 'P0001','ordered item ids must contain every agenda item exactly once','partial reorder is blocked');
select is(api_v1.remove_agenda_item((select item2 from s02_state),'No longer urgent')->>'removed','true','agenda item can be removed');
select is((select agenda_order from public.agenda_items where id=(select item1 from s02_state)),1,'removal normalizes remaining order');
select throws_ok(
 $$insert into public.meetings(organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id) values('43000000-0000-0000-0000-000000000001','BYPASS','43000000-0000-0000-0000-000000000022','Bypass',current_date,'43000000-0000-0000-0000-000000000011')$$,
 '42501','permission denied for view meetings','direct meeting insert is revoked');

reset role;
select cmp_ok((select count(*) from public.audit_logs
 where organization_id='43000000-0000-0000-0000-000000000001'
 and action in('topics.referral.request','topics.referral.accept','meetings.create','meetings.update',
 'meetings.transition','agenda.item.add','agenda.reorder','agenda.item.remove')),'=',9::bigint,
 'all state-changing contracts append audit records');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"43000000-0000-0000-0000-000000000013","role":"authenticated"}';
select is((api_v1.search_meetings(null,null,null,null,null,25,0)->>'total')::int,0,'foreign tenant cannot discover meetings');
select throws_ok(format('select api_v1.get_meeting_detail(%L)',(select meeting_id from s02_state)),'P0002','meeting not found','foreign tenant detail is hidden');

select * from finish();
rollback;
