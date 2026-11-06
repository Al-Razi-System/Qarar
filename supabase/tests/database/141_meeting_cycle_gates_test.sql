begin;
create extension if not exists pgtap;
select no_plan();

-- The agreed periodic-meeting mechanism: a future cycle is for viewing only, an
-- inactive council does not open a session, and reactivation respects the cycles.
insert into qarar_core.organizations(id,code,name_ar) values ('64100000-0000-0000-0000-000000000001','cycle-gates-ci','اختبار بوابات الدورة');
insert into auth.users(id,email) values ('64100000-0000-0000-0000-000000000010','gates-admin@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('64100000-0000-0000-0000-000000000010','64100000-0000-0000-0000-000000000001','gates-admin@example.test','مسؤول البوابات',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('64100000-0000-0000-0000-000000000020','64100000-0000-0000-0000-000000000001','college','كلية',false),
('64100000-0000-0000-0000-000000000021','64100000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values ('64100000-0000-0000-0000-000000000040','64100000-0000-0000-0000-000000000001','regular','دوري');
select set_config('request.jwt.claim.sub','64100000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table scope_unit as select (api_v2.admin_create_organizational_unit_v2('كلية البوابات','64100000-0000-0000-0000-000000000020',null,'64100000-0000-0000-0000-000000000050')->>'id')::uuid id;

-- A monthly first-week council whose plan starts last month: last month is past,
-- this month is open (its week contains today or has passed), next month is ahead.
create temporary table council as select (api_v2.admin_create_council_with_plan_v2(
  jsonb_build_object('name_ar','مجلس البوابات','unit_type_id','64100000-0000-0000-0000-000000000021','scope_unit_id',(select id from scope_unit),'minimum_active_members',1,'allow_dual_leadership',false),
  jsonb_build_object('meeting_type_id','64100000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',1,
    'first_meeting_date',to_char(date_trunc('month',current_date)-interval '1 month','YYYY-MM-DD'),
    'ends_on',to_char(date_trunc('month',current_date)+interval '3 months','YYYY-MM-DD')),
  '64100000-0000-0000-0000-000000000051')->>'id')::uuid id;
create temporary table future as select id from qarar_meetings.meetings
  where governance_unit_id=(select id from council) and planned_window_start=(date_trunc('month',current_date)+interval '1 month')::date;
create temporary table opened as select id from qarar_meetings.meetings
  where governance_unit_id=(select id from council) and planned_window_start=date_trunc('month',current_date)::date;
select is((select count(*)::integer from future),1,'the next cycle has its meeting');

-- 1. A future cycle is for viewing only.
select throws_ok(format($$select api_v2.reschedule_meeting_session_v2(%L,%L,'10:00','12:00','onsite',null,null,(select updated_at from qarar_meetings.meetings where id=%L))$$,
  (select id from future),(date_trunc('month',current_date)+interval '1 month 2 days')::date,(select id from future)),
  '55000',qarar_meetings.cycle_not_open_message_v2((date_trunc('month',current_date)+interval '1 month')::date),
  'its date, time and place cannot be set before the cycle opens');
select throws_ok(format($$update qarar_meetings.meetings set status='scheduled' where id=%L$$,(select id from future)),
  null,null,'it cannot be scheduled before the cycle opens');
select is(qarar_meetings.cycle_not_open_message_v2('2026-12-01'),'لم تبدأ فترة إعداد هذا الاجتماع بعد؛ تبدأ دورته في 1 ديسمبر 2026.','the refusal says when preparation starts, in Arabic');
select is(qarar_meetings.get_meeting_detail((select id from future))->>'cycle_unavailable_reason',
  qarar_meetings.cycle_not_open_message_v2((date_trunc('month',current_date)+interval '1 month')::date),'the meeting details show the same sentence');
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status)
values('64100000-0000-0000-0000-000000000060','64100000-0000-0000-0000-000000000001','TOP-GATE-1','موضوع البوابات',(select id from council),'64100000-0000-0000-0000-000000000010','approved')
on conflict do nothing;
select throws_ok(format($$insert into qarar_meetings.agenda_items(organization_id,meeting_id,topic_id,agenda_order) values('64100000-0000-0000-0000-000000000001',%L,'64100000-0000-0000-0000-000000000060',1)$$,(select id from future)),
  '55000',null,'no agenda item is added before the cycle opens');
select throws_ok(format($$insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
  values('64100000-0000-0000-0000-000000000001','meeting',%L,'meeting.invitation.requested','{}','gate-test')$$,(select id from future)),
  '55000',null,'no invitation is queued before the cycle opens');

-- 2. The open cycle can be prepared, but an inactive council does not open its session.
select is((select status from qarar_core.governance_units where id=(select id from council)),'inactive','a new council starts inactive');
select lives_ok(format($$select api_v2.reschedule_meeting_session_v2(%L,%L,'10:00','12:00','onsite',null,'موعد الاختبار داخل الدورة',(select updated_at from qarar_meetings.meetings where id=%L))$$,
  (select id from opened),current_date,(select id from opened)),'the open cycle takes its date, time and place');
alter table qarar_meetings.meetings disable trigger enforce_ready_meeting_integrity;
select lives_ok(format($$update qarar_meetings.meetings set status='scheduled' where id=%1$L; update qarar_meetings.meetings set status='ready_to_start' where id=%1$L$$,(select id from opened)),
  'the open cycle is prepared for its session');
select throws_ok(format($$update qarar_meetings.meetings set status='in_progress' where id=%L$$,(select id from opened)),
  '55000','المجلس غير مفعّل؛ فعّله أولًا ثم افتح الجلسة. يمكن تجهيز جدول الأعمال قبل التفعيل.','an inactive council does not open its session');
alter table qarar_meetings.meetings enable trigger enforce_ready_meeting_integrity;

-- 3. Reactivation needs a reason and respects later cycles.
create temporary table past as select id from qarar_meetings.meetings
  where governance_unit_id=(select id from council) and planned_window_start=(date_trunc('month',current_date)-interval '1 month')::date;
update qarar_meetings.meetings set status='cancelled' where id=(select id from past);
select throws_ok(format($$select api_v2.reactivate_cancelled_meeting_v2(%L,(select updated_at from qarar_meetings.meetings where id=%L))$$,(select id from past),(select id from past)),
  '22023',null,'reactivation without a reason is refused');
select throws_ok(format($$select api_v2.reactivate_cancelled_meeting_with_reason_v2(%L,'قرر الرئيس عقده',(select updated_at from qarar_meetings.meetings where id=%L))$$,(select id from past),(select id from past)),
  '55000',null,'a cancelled meeting of a past cycle is not reactivated once the next cycle began');
update qarar_meetings.meetings set status='cancelled' where id=(select id from future);
insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
values('64100000-0000-0000-0000-000000000001',(select id from future),'draft','cancelled','64100000-0000-0000-0000-000000000010','إلغاء للاختبار');
select throws_ok(format($$select api_v2.reactivate_cancelled_meeting_with_reason_v2(%L,'قصير',(select updated_at from qarar_meetings.meetings where id=%L))$$,(select id from future),(select id from future)),
  '22023',null,'a reason shorter than five characters is refused');
select lives_ok(format($$select api_v2.reactivate_cancelled_meeting_with_reason_v2(%L,'قرر الرئيس عقده في موعده',(select updated_at from qarar_meetings.meetings where id=%L))$$,(select id from future),(select id from future)),
  'a cancelled meeting whose cycle is still ahead is reactivated with a reason');
select is((select change_reason from qarar_meetings.meeting_status_history where meeting_id=(select id from future) and from_status='cancelled' order by changed_at desc limit 1),
  'قرر الرئيس عقده في موعده','the stated reason is kept in the meeting history');
select is((select status from qarar_meetings.meetings where id=(select id from future)),'draft','a future cycle comes back as a draft');

-- 4. The list filters and counts by stage on the server.
select is((api_v2.search_meetings_v2(null,'future',(select id from council),null,null,50,0)->>'total')::integer,
  (select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select id from council) and planned_window_start>current_date and status in('draft','scheduled','ready_to_start')),
  'the future tab holds every meeting ahead of its cycle');
select ok((api_v2.search_meetings_v2(null,null,(select id from council),null,null,50,0)->'counts') ? 'future','the counts include the meetings ahead');
select ok(not ((api_v2.search_meetings_v2(null,null,(select id from council),null,null,50,0)->'items') @> jsonb_build_array(jsonb_build_object('id',(select id from future)))),
  'the working list does not mix in the meetings ahead');
select throws_ok($$select api_v2.search_meetings_v2(null,'unknown',null,null,null,50,0)$$,'22023',null,'an unknown stage is refused');

select * from finish();
rollback;
