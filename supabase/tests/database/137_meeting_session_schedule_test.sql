begin;
create extension if not exists pgtap;
select no_plan();

-- A session's time and place are rescheduled on their own, never touching the
-- council's quorum, type or name; a day outside the planned week needs a stated
-- reason; and moving a planned meeting never makes the plan create it again.
select has_function('api_v2','reschedule_meeting_session_v2',
  array['uuid','date','time without time zone','time without time zone','text','text','text','timestamp with time zone'],
  'a session has one contract for its time and place');
select has_column('qarar_meetings','meetings','planned_date','a planned meeting keeps the day its plan intended');
select has_column('qarar_meetings','meetings','schedule_exception_reason','a day outside the plan keeps its stated reason');

insert into qarar_core.organizations(id,code,name_ar) values ('63700000-0000-0000-0000-000000000001','schedule-ci','اختبار المواعيد');
insert into auth.users(id,email) values ('63700000-0000-0000-0000-000000000010','schedule-admin@example.test'),('63700000-0000-0000-0000-000000000011','schedule-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('63700000-0000-0000-0000-000000000010','63700000-0000-0000-0000-000000000001','schedule-admin@example.test','مسؤول المواعيد',true),
('63700000-0000-0000-0000-000000000011','63700000-0000-0000-0000-000000000001','schedule-denied@example.test','غير مخول',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('63700000-0000-0000-0000-000000000020','63700000-0000-0000-0000-000000000001','college','كلية',false),
('63700000-0000-0000-0000-000000000021','63700000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values ('63700000-0000-0000-0000-000000000040','63700000-0000-0000-0000-000000000001','regular','دوري');
select set_config('request.jwt.claim.sub','63700000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);

create temporary table scope_unit as select api_v2.admin_create_organizational_unit_v2('كلية المواعيد','63700000-0000-0000-0000-000000000020',null,'63700000-0000-0000-0000-000000000050') payload;
create temporary table weekly_council as select api_v2.admin_create_council_v2('مجلس أسبوعي',null,null,'63700000-0000-0000-0000-000000000021',(select (payload->>'id')::uuid from scope_unit),null,null,3,false,
  jsonb_build_object('meeting_type_id','63700000-0000-0000-0000-000000000040','recurrence','weekly','first_meeting_date','2026-11-02','ends_on','2026-11-30'),'63700000-0000-0000-0000-000000000051') payload;
create temporary table monthly_council as select api_v2.admin_create_council_v2('مجلس شهري',null,null,'63700000-0000-0000-0000-000000000021',(select (payload->>'id')::uuid from scope_unit),null,null,3,false,null,'63700000-0000-0000-0000-000000000052') payload;
select api_v2.save_council_meeting_plan_v2((select (payload->>'id')::uuid from monthly_council),
  jsonb_build_object('meeting_type_id','63700000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',2,'first_meeting_date','2026-11-01','ends_on','2027-01-31'),'63700000-0000-0000-0000-000000000053');

create temporary table weekly_plan as select id from qarar_meetings.council_meeting_plans_v2 where governance_unit_id=(select (payload->>'id')::uuid from weekly_council);
create temporary table monthly_plan as select id from qarar_meetings.council_meeting_plans_v2 where governance_unit_id=(select (payload->>'id')::uuid from monthly_council);
select is((select count(*)::integer from qarar_meetings.meetings where source_plan_id=(select id from weekly_plan)),5,'the weekly plan holds its five November meetings');
select is((select count(*)::integer from qarar_meetings.meetings where source_plan_id=(select id from weekly_plan) and planned_date is null),0,'every planned meeting records its planned day');

create temporary table weekly_meeting as select id from qarar_meetings.meetings where source_plan_id=(select id from weekly_plan) and scheduled_date='2026-11-09';
update qarar_meetings.meetings set quorum_percentage=60 where id=(select id from weekly_meeting);
select throws_ok($$select api_v2.reschedule_meeting_session_v2((select id from weekly_meeting),'2026-11-11','10:00','10:00','onsite',null,null,(select updated_at from qarar_meetings.meetings where id=(select id from weekly_meeting)))$$,
  '22023','يجب أن يكون وقت النهاية بعد وقت البداية.','an end that is not after the start is refused in Arabic');
select throws_ok($$select api_v2.reschedule_meeting_session_v2((select id from weekly_meeting),'2026-11-11','10:00','12:00','onsite',null,null,(select updated_at from qarar_meetings.meetings where id=(select id from weekly_meeting)))$$,
  '22023',null,'moving a planned meeting off its day needs a reason');
select throws_ok($$select api_v2.reschedule_meeting_session_v2((select id from weekly_meeting),'2026-11-11','10:00','12:00','onsite',null,'بسبب',(select updated_at from qarar_meetings.meetings where id=(select id from weekly_meeting)))$$,
  '22023',null,'a reason shorter than five characters is refused');
select throws_ok($$select api_v2.reschedule_meeting_session_v2((select id from weekly_meeting),'2026-11-11','10:00','12:00','onsite',null,'تعارض مع اختبارات الفصل','2000-01-01')$$,
  '40001',null,'a stale version is refused');
select lives_ok($$select api_v2.reschedule_meeting_session_v2((select id from weekly_meeting),'2026-11-11','10:00','12:00','onsite','القاعة الكبرى','تعارض مع اختبارات الفصل',(select updated_at from qarar_meetings.meetings where id=(select id from weekly_meeting)))$$,
  'a stated reason lets the meeting move off its planned day');
select is((select schedule_exception_reason from qarar_meetings.meetings where id=(select id from weekly_meeting)),'تعارض مع اختبارات الفصل','the reason is kept on the meeting');
select ok((select quorum_percentage=60 and meeting_type_id='63700000-0000-0000-0000-000000000040' and title_ar is not null from qarar_meetings.meetings where id=(select id from weekly_meeting)),'rescheduling leaves the quorum, type and name as they were');
select is((select planned_date from qarar_meetings.meetings where id=(select id from weekly_meeting)),'2026-11-09'::date,'the planned day stays what the plan intended');
select ok(exists(select 1 from qarar_audit.audit_logs where entity_id=(select id from weekly_meeting) and action='meetings.session.rescheduled'),'the move and its reason are audited');
select lives_ok($$select qarar_meetings.materialize_council_meeting_plan_v2((select id from weekly_plan))$$,'the plan materializes again after a meeting moved');
select is((select count(*)::integer from qarar_meetings.meetings where source_plan_id=(select id from weekly_plan)),5,'a moved meeting is not created a second time');

create temporary table monthly_meeting as select id,planned_window_start,planned_window_end from qarar_meetings.meetings where source_plan_id=(select id from monthly_plan) order by planned_window_start limit 1;
select lives_ok($$select api_v2.reschedule_meeting_session_v2((select id from monthly_meeting),(select planned_window_start+2 from monthly_meeting),'09:00','11:00','online',null,null,(select updated_at from qarar_meetings.meetings where id=(select id from monthly_meeting)))$$,
  'a day inside the planned week needs no reason');
select ok((select schedule_date_confirmed and schedule_exception_reason is null from qarar_meetings.meetings where id=(select id from monthly_meeting)),'choosing a day inside the week confirms it');
select lives_ok($$select qarar_meetings.materialize_council_meeting_plan_v2((select id from monthly_plan))$$,'the plan materializes again after a meeting moved inside its week');
select is((select count(*)::integer from qarar_meetings.meetings where source_plan_id=(select id from monthly_plan)),3,'the monthly plan keeps exactly its three meetings');
select throws_ok($$select api_v2.reschedule_meeting_session_v2((select id from monthly_meeting),(select planned_window_end+5 from monthly_meeting),'09:00','11:00','online',null,null,(select updated_at from qarar_meetings.meetings where id=(select id from monthly_meeting)))$$,
  '22023',null,'a day outside the planned week needs a reason');
select lives_ok($$select api_v2.reschedule_meeting_session_v2((select id from monthly_meeting),(select planned_window_end+5 from monthly_meeting),'09:00','11:00','online',null,'سفر رئيس المجلس في أسبوع الدورة',(select updated_at from qarar_meetings.meetings where id=(select id from monthly_meeting)))$$,
  'a stated reason lets the meeting leave its planned week');
select ok((select schedule_date_confirmed and scheduled_date=planned_window_end+5 from qarar_meetings.meetings where id=(select id from monthly_meeting)),'the day outside the week is confirmed');

select set_config('request.jwt.claim.sub','63700000-0000-0000-0000-000000000011',true);
select throws_ok($$select api_v2.reschedule_meeting_session_v2((select id from weekly_meeting),'2026-11-12','10:00','12:00','onsite',null,'محاولة من غير مخول',(select updated_at from qarar_meetings.meetings where id=(select id from weekly_meeting)))$$,
  '42501',null,'a member without meeting management cannot reschedule');
select set_config('request.jwt.claim.sub','63700000-0000-0000-0000-000000000010',true);

-- Test data only: put the meeting in session without walking its whole journey.
set local session_replication_role=replica;
update qarar_meetings.meetings set status='in_progress' where id=(select id from weekly_meeting);
set local session_replication_role=origin;
select throws_ok($$select api_v2.reschedule_meeting_session_v2((select id from weekly_meeting),'2026-11-12','10:00','12:00','onsite',null,'بعد بدء الجلسة',(select updated_at from qarar_meetings.meetings where id=(select id from weekly_meeting)))$$,
  '23514',null,'a session that has started cannot be rescheduled');

select * from finish();
rollback;
