begin;
create extension if not exists pgtap;
select no_plan();

-- Council sessions are numbered within the academic year and named from that
-- number; the plan sets their quorum; closed sessions archive themselves.
insert into qarar_core.organizations(id,code,name_ar) values ('63800000-0000-0000-0000-000000000001','numbering-ci','اختبار الترقيم');
insert into auth.users(id,email) values ('63800000-0000-0000-0000-000000000010','numbering-admin@example.test'),('63800000-0000-0000-0000-000000000011','numbering-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('63800000-0000-0000-0000-000000000010','63800000-0000-0000-0000-000000000001','numbering-admin@example.test','مسؤول الترقيم',true),
('63800000-0000-0000-0000-000000000011','63800000-0000-0000-0000-000000000001','numbering-denied@example.test','غير مخول',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('63800000-0000-0000-0000-000000000020','63800000-0000-0000-0000-000000000001','college','كلية',false),
('63800000-0000-0000-0000-000000000021','63800000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values ('63800000-0000-0000-0000-000000000040','63800000-0000-0000-0000-000000000001','regular','دوري');
select set_config('request.jwt.claim.sub','63800000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(qarar_meetings.arabic_session_ordinal_v2(3),'الثالث','three is «الثالث»');
select is(qarar_meetings.arabic_session_ordinal_v2(11),'الحادي عشر','eleven is «الحادي عشر»');
select is(qarar_meetings.arabic_session_ordinal_v2(21),'الحادي والعشرون','twenty-one is «الحادي والعشرون»');
select is(qarar_meetings.arabic_session_ordinal_v2(30),'الثلاثون','thirty is «الثلاثون»');
select is(qarar_meetings.council_session_title_v2('اللجنة الدائمة',2,'2026-12-03'),'الاجتماع الثاني للجنة الدائمة — ديسمبر 2026','a name starting with «ال» joins as «لل»');

create temporary table scope_unit as select api_v2.admin_create_organizational_unit_v2('كلية الترقيم','63800000-0000-0000-0000-000000000020',null,'63800000-0000-0000-0000-000000000050') payload;

-- The screen's path: council and monthly-week plan with its quorum.
create temporary table monthly_council as select api_v2.admin_create_council_with_plan_v2(
  jsonb_build_object('name_ar','مجلس كلية العلوم','unit_type_id','63800000-0000-0000-0000-000000000021','scope_unit_id',(select payload->>'id' from scope_unit),'minimum_active_members',3,'allow_dual_leadership',false),
  jsonb_build_object('meeting_type_id','63800000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',2,'first_meeting_date','2026-11-01','ends_on','2027-01-31','quorum_percentage',60),
  '63800000-0000-0000-0000-000000000051') payload;
create temporary table monthly_meetings as select m.* from qarar_meetings.meetings m where m.governance_unit_id=(select (payload->>'id')::uuid from monthly_council);
select is((select count(*)::integer from monthly_meetings where quorum_percentage=60),3,'every plan meeting takes the plan quorum');
select is((select title_ar from monthly_meetings where planned_window_start='2026-11-08'),'الاجتماع الأول لمجلس كلية العلوم — نوفمبر 2026','the first session is named from its number, council and month');
select is((select title_ar from monthly_meetings where planned_window_start='2027-01-08'),'الاجتماع الثالث لمجلس كلية العلوم — يناير 2027','the third session in the same academic year');
select is((select academic_year_start from monthly_meetings where planned_window_start='2027-01-08'),'2026-09-01'::date,'January belongs to the year that began in September');

select is((api_v2.admin_get_council_detail_v2((select (payload->>'id')::uuid from monthly_council))#>>'{meeting_plan,quorum_percentage}')::integer,60,'the council details show the plan quorum');

-- The older one-call creation keeps the week of the month and the quorum.
create temporary table legacy_council as select api_v2.admin_create_council_v2('مجلس قديم',null,null,'63800000-0000-0000-0000-000000000021',(select (payload->>'id')::uuid from scope_unit),null,null,3,false,
  jsonb_build_object('meeting_type_id','63800000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',3,'first_meeting_date','2026-11-01','ends_on','2026-12-31','quorum_percentage',70),'63800000-0000-0000-0000-000000000052') payload;
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select (payload->>'id')::uuid from legacy_council) and planned_window_start in('2026-11-15','2026-12-15') and quorum_percentage=70),2,
  'creating a council with its plan in one call honours the week of the month and the quorum');
select throws_ok($$select api_v2.admin_create_council_with_plan_v2(
  jsonb_build_object('name_ar','مجلس بنصاب خاطئ','unit_type_id','63800000-0000-0000-0000-000000000021','scope_unit_id',(select payload->>'id' from scope_unit),'minimum_active_members',3,'allow_dual_leadership',false),
  jsonb_build_object('meeting_type_id','63800000-0000-0000-0000-000000000040','recurrence','monthly','first_meeting_date','2026-11-01','quorum_percentage',140),'63800000-0000-0000-0000-000000000053')$$,
  '22023','نسبة النصاب يجب أن تكون عددًا صحيحًا من 1 إلى 100.','a plan quorum outside 1–100 is refused in Arabic');

-- A weekly council: numbering across the academic year boundary.
create temporary table weekly_council as select api_v2.admin_create_council_v2('مجلس أسبوعي',null,null,'63800000-0000-0000-0000-000000000021',(select (payload->>'id')::uuid from scope_unit),null,null,3,false,null,'63800000-0000-0000-0000-000000000054') payload;
select api_v2.save_council_meeting_plan_v2((select (payload->>'id')::uuid from weekly_council),
  jsonb_build_object('meeting_type_id','63800000-0000-0000-0000-000000000040','recurrence','weekly','first_meeting_date','2027-08-16','ends_on','2027-09-13','quorum_percentage',55),'63800000-0000-0000-0000-000000000055');
create temporary view weekly as select id,scheduled_date,status,session_sequence_no,academic_year_start,title_ar,quorum_percentage,updated_at from qarar_meetings.meetings
  where governance_unit_id=(select (payload->>'id')::uuid from weekly_council) order by scheduled_date;
select results_eq($$select scheduled_date::text||'#'||session_sequence_no from weekly where status<>'cancelled'$$,
  $$values ('2027-08-16#1'), ('2027-08-23#2'), ('2027-08-30#3'), ('2027-09-06#1'), ('2027-09-13#2')$$,'numbering restarts with the academic year in September');

-- Cancelling a session ahead closes the gap; the cancelled one keeps its name.
create temporary table cancelled_one as select id,title_ar from weekly where scheduled_date='2027-08-23';
update qarar_meetings.meetings set status='cancelled' where id=(select id from cancelled_one);
select is((select session_sequence_no from weekly where scheduled_date='2027-08-30'),2,'the session after a cancelled one takes its number');
select is((select title_ar from weekly where scheduled_date='2027-08-30'),'الاجتماع الثاني لمجلس أسبوعي — أغسطس 2027','and its name follows');
select is((select title_ar from weekly where id=(select id from cancelled_one)),(select title_ar from cancelled_one),'the cancelled session keeps the name it had');

-- Changing only the plan quorum updates the sessions ahead without recreating them.
create temporary table before_quorum as select array_agg(id order by id) ids from weekly where status<>'cancelled';
select api_v2.save_council_meeting_plan_v2((select (payload->>'id')::uuid from weekly_council),
  jsonb_build_object('meeting_type_id','63800000-0000-0000-0000-000000000040','recurrence','weekly','first_meeting_date','2027-08-16','ends_on','2027-09-13','quorum_percentage',65),'63800000-0000-0000-0000-000000000056');
select is((select array_agg(id order by id) from weekly where status<>'cancelled'),(select ids from before_quorum),'a quorum-only change keeps the same sessions');
select is((select count(*)::integer from weekly where status<>'cancelled' and quorum_percentage=65),4,'and gives them the new quorum');

-- A session that starts is numbered by the order sessions are held, and keeps it.
alter table qarar_meetings.meetings disable trigger enforce_ready_meeting_integrity;
create temporary table started as select id from weekly where scheduled_date='2027-08-30';
select api_v2.reschedule_meeting_session_v2((select id from started),'2027-08-30','10:00','12:00','onsite',null,null,(select updated_at from weekly where id=(select id from started)));
update qarar_meetings.meetings set status='scheduled' where id=(select id from started);
update qarar_meetings.meetings set status='ready_to_start' where id=(select id from started);
update qarar_meetings.meetings set status='in_progress' where id=(select id from started);
alter table qarar_meetings.meetings enable trigger enforce_ready_meeting_integrity;
select is((select session_sequence_no from weekly where id=(select id from started)),1,'the first session held this year is the first, whatever its date');
select is((select title_ar from weekly where id=(select id from started)),'الاجتماع الأول لمجلس أسبوعي — أغسطس 2027','and is named so');
select is((select session_sequence_no from weekly where scheduled_date='2027-08-16'),2,'the earlier session not yet held comes after it');

-- Rescheduling after invitations went out tells the invitees.
insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
select '63800000-0000-0000-0000-000000000001','meeting',id,'meeting.invitation.requested',
  jsonb_build_object('meeting_id',id,'recipient_user_id','63800000-0000-0000-0000-000000000011'),'invite-test:'||id
from weekly where scheduled_date='2027-08-16';
select api_v2.reschedule_meeting_session_v2((select id from weekly where scheduled_date='2027-08-16'),'2027-08-17','09:00','11:00','online',null,'تعارض مع مناقشات التخرج',(select updated_at from weekly where scheduled_date='2027-08-16'));
select is((select count(*)::integer from qarar_governance.notification_outbox where event_type='meeting.postponed'
  and payload->>'recipient_user_id'='63800000-0000-0000-0000-000000000011'
  and aggregate_id=(select id from weekly where scheduled_date='2027-08-17')),1,'an invitee is told when the session moves');

select ok((select session_sequence_no is not null and academic_year_start is not null from jsonb_to_record(
  (api_v1.search_meetings(null::text,null::text,null::uuid,'2027-08-01'::date,'2027-08-31'::date,10,0)->'items')->0) as x(session_sequence_no integer,academic_year_start date)),
  'the meetings list carries the session number and its year');

-- Settings.
select is((api_v2.get_meeting_settings_v2()->>'archive_after_days')::integer,30,'sessions archive 30 days after their minutes by default');
select is((api_v2.get_meeting_settings_v2()->>'academic_year_start_month')::integer,9,'the academic year starts in September by default');
select throws_ok($$select api_v2.save_meeting_settings_v2(9,0,null)$$,'22023','مدة الأرشفة يجب أن تكون من 1 إلى 365 يومًا.','an archive delay of zero days is refused');
select lives_ok($$select api_v2.save_meeting_settings_v2(8,10,null)$$,'a manager saves the settings');
select throws_ok($$select api_v2.save_meeting_settings_v2(8,15,'2000-01-01')$$,'40001',null,'a stale settings version is refused');
-- With the year starting in August, 17 Aug–13 Sep 2027 is one year; the session
-- already held keeps the number and year it was held under.
select is((select session_sequence_no from weekly where scheduled_date='2027-09-06'),2,'moving the year start to August renumbers the sessions ahead');
select is((select session_sequence_no::text||' '||academic_year_start from weekly where id=(select id from started)),'1 2026-09-01','a held session keeps its number and year');
select set_config('request.jwt.claim.sub','63800000-0000-0000-0000-000000000011',true);
select throws_ok($$select api_v2.save_meeting_settings_v2(9,30,(select updated_at from qarar_meetings.meeting_settings where organization_id='63800000-0000-0000-0000-000000000001'))$$,
  '42501',null,'a user without meeting management cannot change the settings');
select set_config('request.jwt.claim.sub','63800000-0000-0000-0000-000000000010',true);

-- Archiving: a session closed longer ago than the delay is archived, a recent one is not.
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,meeting_type_id,title_ar,scheduled_date,status,created_by_user_id)
values('63800000-0000-0000-0000-000000000090','63800000-0000-0000-0000-000000000001','MTG-ARCH-1',(select (payload->>'id')::uuid from monthly_council),'63800000-0000-0000-0000-000000000040','اجتماع منتهٍ قديم','2026-09-10','closed','63800000-0000-0000-0000-000000000010'),
      ('63800000-0000-0000-0000-000000000091','63800000-0000-0000-0000-000000000001','MTG-ARCH-2',(select (payload->>'id')::uuid from monthly_council),'63800000-0000-0000-0000-000000000040','اجتماع منتهٍ حديث','2026-09-20','closed','63800000-0000-0000-0000-000000000010');
insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason,changed_at) values
('63800000-0000-0000-0000-000000000001','63800000-0000-0000-0000-000000000090','waiting_for_approval','closed','63800000-0000-0000-0000-000000000010','test',clock_timestamp()-interval '11 days'),
('63800000-0000-0000-0000-000000000001','63800000-0000-0000-0000-000000000091','waiting_for_approval','closed','63800000-0000-0000-0000-000000000010','test',clock_timestamp()-interval '3 days');
select is((select session_sequence_no::text||' '||academic_year_start from qarar_meetings.meetings where id='63800000-0000-0000-0000-000000000090'),'1 2026-08-01','a session recorded as already closed still takes its year and number');
select lives_ok($$select qarar_meetings.run_meeting_housekeeping_v2()$$,'the daily housekeeping runs');
select is((select status from qarar_meetings.meetings where id='63800000-0000-0000-0000-000000000090'),'archived','a session closed longer than the delay is archived');
select is((select status from qarar_meetings.meetings where id='63800000-0000-0000-0000-000000000091'),'closed','a recently closed session stays in place');
select ok(exists(select 1 from qarar_meetings.meeting_status_history where meeting_id='63800000-0000-0000-0000-000000000090' and to_status='archived' and change_reason like 'أرشفة تلقائية%'),'the archiving is recorded with its reason');
select ok(exists(select 1 from qarar_audit.audit_logs where entity_id='63800000-0000-0000-0000-000000000090' and action='meetings.archived.automatic'),'and audited');
select ok(pg_get_functiondef('qarar_governance.open_topic_correction'::regproc) ~ '''archived''' and pg_get_functiondef('qarar_governance.return_topic_to_previous_council'::regproc) ~ '''archived''',
  'a topic in an archived session counts as settled for correction and return');

select * from finish();
rollback;
