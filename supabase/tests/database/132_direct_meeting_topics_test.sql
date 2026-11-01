begin;
create extension if not exists pgtap;
select plan(25);

select has_column('qarar_meetings','meetings','governance_mode','meeting stores its governed or custom mode');
select has_column('qarar_topics','topics','meeting_scope_id','direct topic is scoped to one meeting');
select has_function('api_v2','create_direct_agenda_topic_v2',array['uuid','text','text','text','boolean','uuid'],'direct agenda contract exists');

insert into public.organizations(id,code,name_ar) values
('32000000-0000-0000-0000-000000000001','s132','Direct meeting topics');
insert into auth.users(id,email) values
('32000000-0000-0000-0000-000000000011','chair@s132.test'),
('32000000-0000-0000-0000-000000000012','member@s132.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('32000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000001','chair@s132.test','رئيس المجلس'),
('32000000-0000-0000-0000-000000000012','32000000-0000-0000-0000-000000000001','member@s132.test','عضو المجلس');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('32000000-0000-0000-0000-000000000021','32000000-0000-0000-0000-000000000001','council','مجلس');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('32000000-0000-0000-0000-000000000022','32000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000021','s132-council','مجلس الاختبار');
insert into public.meeting_types(id,organization_id,code,name_ar) values
('32000000-0000-0000-0000-000000000023','32000000-0000-0000-0000-000000000001','normal','اجتماع عادي');
delete from public.roles where organization_id='32000000-0000-0000-0000-000000000001' and code in ('council_chair','council_member');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('32000000-0000-0000-0000-000000000031','32000000-0000-0000-0000-000000000001','council_chair','رئيس المجلس','governance_unit'),
('32000000-0000-0000-0000-000000000032','32000000-0000-0000-0000-000000000001','council_member','عضو المجلس','governance_unit');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('32000000-0000-0000-0000-000000000041','32000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000022','32000000-0000-0000-0000-000000000031'),
('32000000-0000-0000-0000-000000000042','32000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000012','32000000-0000-0000-0000-000000000022','32000000-0000-0000-0000-000000000032');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
values
('32000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','إدارة الاجتماعات'),
('32000000-0000-0000-0000-000000000001','meetings.create','meetings','create','governance_unit','إنشاء الاجتماعات')
on conflict(organization_id,code) do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select '32000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='32000000-0000-0000-0000-000000000001' and code in('meetings.manage','meetings.create');

insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,meeting_type_id,title_ar,scheduled_date,created_by_user_id,governance_mode) values
('32000000-0000-0000-0000-000000000051','32000000-0000-0000-0000-000000000001','MTG-S132-1','32000000-0000-0000-0000-000000000022','32000000-0000-0000-0000-000000000023','اجتماع غير محكوم',current_date,'32000000-0000-0000-0000-000000000011','custom'),
('32000000-0000-0000-0000-000000000052','32000000-0000-0000-0000-000000000001','MTG-S132-2','32000000-0000-0000-0000-000000000022','32000000-0000-0000-0000-000000000023','اجتماع محكوم',current_date,'32000000-0000-0000-0000-000000000011','governed');

select set_config('request.jwt.claims','{"sub":"32000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select api_v2.save_meeting_with_quorum_v2('create',jsonb_build_object(
  'p_governance_unit_id','32000000-0000-0000-0000-000000000022','p_meeting_type_id','32000000-0000-0000-0000-000000000023',
  'p_title_ar','اجتماع مستقل من نموذج الإنشاء','p_scheduled_date',current_date,'p_location_type','onsite',
  'p_governance_mode','custom','p_client_request_id','32000000-0000-0000-0000-000000000064'),51)$$,
  'meeting creation contract accepts the custom mode');
select lives_ok($$select api_v2.create_direct_agenda_topic_v2('32000000-0000-0000-0000-000000000051','موضوع مباشر للاجتماع','وصف الموضوع المباشر','high',true,'32000000-0000-0000-0000-000000000061')$$,'chair adds a voting direct topic to a custom meeting');
select lives_ok($$select api_v2.create_direct_agenda_topic_v2('32000000-0000-0000-0000-000000000051','موضوع مباشر للاجتماع','وصف الموضوع المباشر','high',true,'32000000-0000-0000-0000-000000000061')$$,'same request replays safely');
select lives_ok($$select api_v2.create_direct_agenda_topic_v2('32000000-0000-0000-0000-000000000052','موضوع إحاطة مباشر','موضوع لا يحتاج إلى تصويت','medium',false,'32000000-0000-0000-0000-000000000062')$$,'chair also adds a discussion-only direct topic to a governed meeting');
reset role;
select is((select governance_mode from qarar_meetings.meetings where client_request_id='32000000-0000-0000-0000-000000000064'),'custom','created meeting persists its custom mode');

select is((select count(*)::integer from qarar_topics.topics where meeting_scope_id='32000000-0000-0000-0000-000000000051'),1,'idempotency prevents duplicate topics');
select is((select governance_source from qarar_topics.topics where meeting_scope_id='32000000-0000-0000-0000-000000000051'),'custom','direct topic is marked custom');
select is((select category_id from qarar_topics.topics where meeting_scope_id='32000000-0000-0000-0000-000000000051'),null,'direct topic needs no classification');
select is((select topic_type_version_id from qarar_topics.topics where meeting_scope_id='32000000-0000-0000-0000-000000000051'),null,'direct topic needs no topic type');
select is((select count(*)::integer from qarar_meetings.agenda_items where meeting_id='32000000-0000-0000-0000-000000000051'),1,'topic is atomically placed on the agenda');
select is((select requires_voting from qarar_meetings.agenda_items where meeting_id='32000000-0000-0000-0000-000000000051'),true,'voting choice is persisted');
select is((select requires_voting from qarar_meetings.agenda_items where meeting_id='32000000-0000-0000-0000-000000000052'),false,'discussion-only choice is persisted');

set local role authenticated;
select is((api_v1.get_meeting_detail('32000000-0000-0000-0000-000000000051')->>'governance_mode'),'custom','meeting details expose the mode');
select is((api_v1.get_meeting_detail('32000000-0000-0000-0000-000000000051')#>>'{capabilities,can_add_direct_topic}')::boolean,true,'chair sees the direct-topic action');
select is((api_v1.get_meeting_detail('32000000-0000-0000-0000-000000000051')#>>'{agenda_items,0,requires_voting}')::boolean,true,'direct item participates in voting');
select is((api_v1.get_meeting_detail('32000000-0000-0000-0000-000000000051')#>>'{agenda_items,0,voting_available_now}')::boolean,true,'direct item can be voted without a workflow');
select is((api_v1.search_eligible_agenda_topics('32000000-0000-0000-0000-000000000051',null,25,0)->>'total')::integer,0,'custom meeting has no governed proposals');
select is((api_v1.get_meeting_detail('32000000-0000-0000-0000-000000000052')#>>'{agenda_items,0,requires_voting}')::boolean,false,'discussion-only item is exposed without a vote requirement');
reset role;
select throws_ok($$insert into qarar_voting.voting_rounds(
  organization_id,meeting_id,agenda_item_id,round_number,eligible_voter_count,opened_by_user_id
) select organization_id,meeting_id,id,1,1,'32000000-0000-0000-0000-000000000011'
  from qarar_meetings.agenda_items where meeting_id='32000000-0000-0000-0000-000000000052'$$,
  '23514',null,'a discussion-only direct item cannot open a voting round');

select set_config('request.jwt.claims','{"sub":"32000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select api_v2.create_direct_agenda_topic_v2('32000000-0000-0000-0000-000000000051','محاولة عضو','لا يسمح للعضو',null,false,'32000000-0000-0000-0000-000000000063')$$,'42501',null,'member cannot add a direct topic');
reset role;

select ok(exists(select 1 from qarar_audit.audit_logs where organization_id='32000000-0000-0000-0000-000000000001' and action='meetings.direct_topic.add'),'direct topic creation is audited');
select is((select count(*)::integer from qarar_topics.topics where meeting_scope_id is not null and organization_id='32000000-0000-0000-0000-000000000001'),2,'denied attempts leave no partial rows');

select * from finish();
rollback;
