-- In-room document viewer and per-item download permission (product owner,
-- 2026-10-15): files open inside the room and follow the broadcast; the chair
-- decides per agenda item whether its files may be downloaded.
-- Impact map: docs/engineering/impact/MEETING_DOCUMENT_VIEWER_AR.md
begin;
create extension if not exists pgtap;
select plan(21);

insert into public.organizations(id,code,name_ar) values
('a2000000-0000-0000-0000-000000000001','s101','Broadcast'),
('a2000000-0000-0000-0000-000000000002','s101b','Other Tenant');
insert into auth.users(id,email) values
('a2000000-0000-0000-0000-000000000011','chair@s101.test'),
('a2000000-0000-0000-0000-000000000012','rapporteur@s101.test'),
('a2000000-0000-0000-0000-000000000013','member@s101.test'),
('a2000000-0000-0000-0000-000000000015','admin@s101.test'),
('a2000000-0000-0000-0000-000000000016','other@s101b.test');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('a2000000-0000-0000-0000-000000000011','a2000000-0000-0000-0000-000000000001','chair@s101.test','Council Chair',false),
('a2000000-0000-0000-0000-000000000012','a2000000-0000-0000-0000-000000000001','rapporteur@s101.test','Council Rapporteur',false),
('a2000000-0000-0000-0000-000000000013','a2000000-0000-0000-0000-000000000001','member@s101.test','Council Member',false),
('a2000000-0000-0000-0000-000000000015','a2000000-0000-0000-0000-000000000001','admin@s101.test','System Admin',true),
('a2000000-0000-0000-0000-000000000016','a2000000-0000-0000-0000-000000000002','other@s101b.test','Other Tenant User',false);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('a2000000-0000-0000-0000-000000000021','a2000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('a2000000-0000-0000-0000-000000000022','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000021','faculty','Faculty Council',50);
delete from public.roles where organization_id='a2000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('a2000000-0000-0000-0000-000000000031','a2000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('a2000000-0000-0000-0000-000000000032','a2000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('a2000000-0000-0000-0000-000000000033','a2000000-0000-0000-0000-000000000001','s101_member','Member','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
select 'a2000000-0000-0000-0000-000000000001',v.code,split_part(v.code,'.',1),split_part(v.code,'.',2),'governance_unit',v.code
from (values ('meetings.manage'),('attendance.read'),('attendance.manage'),('attendance.verify'),('attendance.lock'),('quorum.read'),('quorum.manage')) v(code)
on conflict (organization_id,code) do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='a2000000-0000-0000-0000-000000000001'
 and code in ('meetings.manage','attendance.read','attendance.manage','attendance.verify','attendance.lock','quorum.read','quorum.manage');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a2000000-0000-0000-0000-000000000001',r.role_id,p.id
from public.permissions p
cross join (values ('a2000000-0000-0000-0000-000000000032'::uuid),('a2000000-0000-0000-0000-000000000033'::uuid)) r(role_id)
where p.organization_id='a2000000-0000-0000-0000-000000000001' and p.code in ('attendance.read','quorum.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('a2000000-0000-0000-0000-000000000061','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000011','a2000000-0000-0000-0000-000000000022','a2000000-0000-0000-0000-000000000031'),
('a2000000-0000-0000-0000-000000000062','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000012','a2000000-0000-0000-0000-000000000022','a2000000-0000-0000-0000-000000000032'),
('a2000000-0000-0000-0000-000000000063','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000013','a2000000-0000-0000-0000-000000000022','a2000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('a2000000-0000-0000-0000-000000000071','a2000000-0000-0000-0000-000000000001','TOP-S101-1','Plan','a2000000-0000-0000-0000-000000000022','a2000000-0000-0000-0000-000000000012','approved'),
('a2000000-0000-0000-0000-000000000072','a2000000-0000-0000-0000-000000000001','TOP-S101-2','Budget','a2000000-0000-0000-0000-000000000022','a2000000-0000-0000-0000-000000000012','approved'),
('a2000000-0000-0000-0000-000000000073','a2000000-0000-0000-0000-000000000001','TOP-S101-3','Next meeting topic','a2000000-0000-0000-0000-000000000022','a2000000-0000-0000-0000-000000000012','approved');
-- M1 runs now; M2 has not started.
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-000000000001','MTG-S101-1','a2000000-0000-0000-0000-000000000022','Live meeting',current_date,'a2000000-0000-0000-0000-000000000011','ready_to_start'),
('a2000000-0000-0000-0000-000000000082','a2000000-0000-0000-0000-000000000001','MTG-S101-2','a2000000-0000-0000-0000-000000000022','Next meeting',current_date+7,'a2000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('a2000000-0000-0000-0000-000000000091','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-000000000071',1),
('a2000000-0000-0000-0000-000000000092','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-000000000072',2),
('a2000000-0000-0000-0000-000000000093','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000082','a2000000-0000-0000-0000-000000000073',1);

-- One file on item 1's topic, one on the next meeting's topic.
set local session_replication_role=replica;
insert into qarar_topics.topic_attachments(id,organization_id,topic_id,file_name,file_url,mime_type,file_size_bytes,uploaded_by_user_id) values
('a2000000-0000-0000-0000-0000000000a1','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000071','plan.pdf','https://qarar.test/api/admin/topics/upload?topicId=a2000000-0000-0000-0000-000000000071&path=topics/a2000000-0000-0000-0000-000000000071/plan.pdf','application/pdf',1000,'a2000000-0000-0000-0000-000000000012'),
('a2000000-0000-0000-0000-0000000000a3','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000073','next.pdf','https://qarar.test/api/admin/topics/upload?topicId=a2000000-0000-0000-0000-000000000073&path=topics/a2000000-0000-0000-0000-000000000073/next.pdf','application/pdf',1000,'a2000000-0000-0000-0000-000000000012');
set local session_replication_role=origin;

create function pg_temp.s101_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;
create function pg_temp.s101_meeting_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.meetings where id='a2000000-0000-0000-0000-000000000081' $$;
create function pg_temp.s101_file() returns jsonb language sql as
$$ select f from jsonb_array_elements(api_v1.list_meeting_topic_attachments('a2000000-0000-0000-0000-000000000081')) f
   where f->>'id'='a2000000-0000-0000-0000-0000000000a1' $$;
create function pg_temp.s101_state() returns jsonb language sql as
$$ select api_v2.get_meeting_broadcast_v2('a2000000-0000-0000-0000-000000000081') $$;
create function pg_temp.s101_revision() returns integer language sql as
$$ select (pg_temp.s101_state()->>'revision')::integer $$;
create function pg_temp.s101_download_audits() returns bigint language sql security definer as
$$ select count(*) from qarar_audit.audit_logs where action='meetings.agenda.downloads' and entity_id='a2000000-0000-0000-0000-000000000091' $$;

set local role authenticated;
select pg_temp.s101_as('a2000000-0000-0000-0000-000000000011');

-- Existing items keep their files downloadable; the list says so per file.
select is((pg_temp.s101_file()->>'download_allowed')::boolean,true,'files stay downloadable until the chair decides otherwise');
select is(pg_temp.s101_file()->>'agenda_item_id','a2000000-0000-0000-0000-000000000091','each file names the agenda item it belongs to');

-- The chair withholds downloads for item 1; it is audited and guarded by updated_at.
select is((pg_temp.s101_file()->>'download_revision')::integer,0,'an undecided item has download revision 0');
select is((api_v2.set_agenda_item_downloads_v2('a2000000-0000-0000-0000-000000000091',false,0)->>'attachments_downloadable')::boolean,
  false,'the chair withholds downloads for an item');
select is((pg_temp.s101_file()->>'download_allowed')::boolean,false,'the list reports the withheld download');
select is(pg_temp.s101_download_audits(),1::bigint,'the decision is audited');
select throws_ok($$ select api_v2.set_agenda_item_downloads_v2('a2000000-0000-0000-0000-000000000091',true,0) $$,
  '40001',null,'a stale revision is refused instead of overwriting the decision');

-- Only the chair decides.
select pg_temp.s101_as('a2000000-0000-0000-0000-000000000012');
select throws_ok($$ select api_v2.set_agenda_item_downloads_v2('a2000000-0000-0000-0000-000000000091',true,1) $$,
  '42501',null,'the rapporteur cannot change the download permission');
select pg_temp.s101_as('a2000000-0000-0000-0000-000000000015');
select throws_ok($$ select api_v2.set_agenda_item_downloads_v2('a2000000-0000-0000-0000-000000000091',true,1) $$,
  '42501',null,'a system administrator cannot change the download permission');
select pg_temp.s101_as('a2000000-0000-0000-0000-000000000016');
select throws_ok($$ select api_v2.set_agenda_item_downloads_v2('a2000000-0000-0000-0000-000000000091',true,1) $$,
  'P0002',null,'another tenant cannot reach the item');

-- Opening a document is part of the broadcast and needs a running session.
select pg_temp.s101_as('a2000000-0000-0000-0000-000000000011');
select throws_ok($$ select api_v2.set_meeting_broadcast_document_v2('a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-0000000000a1',1,0) $$,
  '23514',null,'no document is broadcast before the session starts');
select api_v1.open_meeting_session('a2000000-0000-0000-0000-000000000081',pg_temp.s101_meeting_token());

select is(api_v2.set_meeting_broadcast_document_v2('a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-0000000000a1',3,0)
  - array['updated_at','viewer_controls','can_hand_over','can_take_back','can_return','meeting_id','active','controller_role'],
  jsonb_build_object('agenda_item_id','a2000000-0000-0000-0000-000000000091','panel','attachments','revision',1,
    'attachment_id','a2000000-0000-0000-0000-0000000000a1','page',3),
  'the controller opens a document: its item and the files panel follow');
select throws_ok($$ select api_v2.set_meeting_broadcast_document_v2('a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-0000000000a3',1,1) $$,
  '22023',null,'a file outside the meeting''s agenda cannot be broadcast');
select throws_ok($$ select api_v2.set_meeting_broadcast_document_v2('a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-0000000000a1',0,1) $$,
  '22023',null,'a page below 1 is refused');
select throws_ok($$ select api_v2.set_meeting_broadcast_document_v2('a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-0000000000a1',4,0) $$,
  '40001',null,'a stale revision is refused');
select is((api_v2.set_meeting_broadcast_document_v2('a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-0000000000a1',4,1)->>'page')::integer,4,'the controller turns the page');

-- Members follow; they cannot open or close a document.
select pg_temp.s101_as('a2000000-0000-0000-0000-000000000013');
select is(pg_temp.s101_state()->>'attachment_id','a2000000-0000-0000-0000-0000000000a1','a member reads the open document');
select throws_ok($$ select api_v2.set_meeting_broadcast_document_v2('a2000000-0000-0000-0000-000000000081',null,null,2) $$,
  '42501',null,'a member cannot close the broadcast document');

-- Moving to another item closes the document; closing it keeps the item.
select pg_temp.s101_as('a2000000-0000-0000-0000-000000000011');
select is(api_v2.set_meeting_broadcast_v2('a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-000000000092','instructions',2)->>'attachment_id',
  null,'moving to another item closes the open document');
select api_v2.set_meeting_broadcast_document_v2('a2000000-0000-0000-0000-000000000081','a2000000-0000-0000-0000-0000000000a1',1,3);
select is(api_v2.set_meeting_broadcast_document_v2('a2000000-0000-0000-0000-000000000081',null,null,4)->>'agenda_item_id',
  'a2000000-0000-0000-0000-000000000091','closing the document keeps the item on screen');
select is(pg_temp.s101_state()->>'page',null,'a closed document has no page');

select * from finish();
rollback;
