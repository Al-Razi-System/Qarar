begin;
create extension if not exists pgtap;
select no_plan();

-- Every plan meeting has a cycle window; after it a meeting is still held, with a
-- reason, until the next cycle begins; no date inside the next cycle is accepted.
insert into qarar_core.organizations(id,code,name_ar) values ('64200000-0000-0000-0000-000000000001','late-rule-ci','اختبار التأخر');
insert into auth.users(id,email) values ('64200000-0000-0000-0000-000000000010','late-admin@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('64200000-0000-0000-0000-000000000010','64200000-0000-0000-0000-000000000001','late-admin@example.test','مسؤول التأخر',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('64200000-0000-0000-0000-000000000020','64200000-0000-0000-0000-000000000001','college','كلية',false),
('64200000-0000-0000-0000-000000000021','64200000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values ('64200000-0000-0000-0000-000000000040','64200000-0000-0000-0000-000000000001','regular','دوري');
select set_config('request.jwt.claim.sub','64200000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table scope_unit as select (api_v2.admin_create_organizational_unit_v2('كلية التأخر','64200000-0000-0000-0000-000000000020',null,'64200000-0000-0000-0000-000000000050')->>'id')::uuid id;
create function pg_temp.council(p_name text,p_plan jsonb,p_request uuid) returns uuid language sql as $$
  select (api_v2.admin_create_council_with_plan_v2(
    jsonb_build_object('name_ar',p_name,'unit_type_id','64200000-0000-0000-0000-000000000021','scope_unit_id',(select id from scope_unit),'minimum_active_members',1,'allow_dual_leadership',false),
    p_plan,p_request)->>'id')::uuid $$;

-- 1. A weekly plan's meetings carry the week of their planned day.
create temporary table weekly as select pg_temp.council('مجلس أسبوعي',jsonb_build_object('meeting_type_id','64200000-0000-0000-0000-000000000040','recurrence','weekly',
  'first_meeting_date',to_char(current_date-14,'YYYY-MM-DD'),'ends_on',to_char(current_date+35,'YYYY-MM-DD')),'64200000-0000-0000-0000-000000000051') id;
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select id from weekly)
  and planned_window_start=planned_date-extract(dow from planned_date)::integer and planned_window_end=planned_window_start+6 and schedule_date_confirmed),
  (select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select id from weekly)),
  'every weekly meeting keeps its day and has its week as the cycle window');
select ok(qarar_meetings.get_meeting_detail((select id from qarar_meetings.meetings where governance_unit_id=(select id from weekly) order by planned_date limit 1)) ? 'next_cycle_start',
  'the meeting details say when the next cycle begins');

-- 2. Last week's meeting, whose next cycle already began, cannot be held any more...
create temporary table last_week as select id from qarar_meetings.meetings where governance_unit_id=(select id from weekly)
  and planned_date between current_date-13 and current_date-7;
alter table qarar_meetings.meetings disable trigger enforce_ready_meeting_integrity;
select throws_ok(format($$update qarar_meetings.meetings set status='scheduled' where id=%1$L; update qarar_meetings.meetings set status='ready_to_start' where id=%1$L$$,(select id from last_week)),
  '55000',null,'a meeting whose next cycle began is not prepared for its session');
-- ...and the nightly housekeeping now classifies it, as it does a month's week.
select set_config('request.jwt.claim.sub','',true);
select lives_ok($$select qarar_meetings.finalize_unheld_plan_meetings_v2(current_date)$$,'the housekeeping runs');
select set_config('request.jwt.claim.sub','64200000-0000-0000-0000-000000000010',true);
select is((select status from qarar_meetings.meetings where id=(select id from last_week)),'not_held','a weekly meeting not held before the next week becomes «لم يُنفذ»');

-- 3. A monthly meeting whose week ended while its next cycle has not begun.
create temporary table monthly as select pg_temp.council('مجلس شهري',jsonb_build_object('meeting_type_id','64200000-0000-0000-0000-000000000040','recurrence','monthly',
  'monthly_week',case when extract(day from current_date)<=21 then 4 else 1 end,
  'first_meeting_date',to_char(date_trunc('month',current_date)-interval '1 month','YYYY-MM-DD'),
  'ends_on',to_char(date_trunc('month',current_date)+interval '3 months','YYYY-MM-DD')),'64200000-0000-0000-0000-000000000052') id;
create temporary table late as select m.id,m.planned_window_start,m.planned_window_end,qarar_meetings.next_cycle_start_v2(m.id) next_start
  from qarar_meetings.meetings m where m.governance_unit_id=(select id from monthly)
  and m.planned_window_end<current_date and qarar_meetings.next_cycle_start_v2(m.id)>current_date;
select is((select count(*)::integer from late),1,'one monthly meeting is late but its next cycle has not begun');
select is((select status from qarar_meetings.meetings where id=(select id from late)),'draft','the late meeting stays open for action');
select throws_ok(format($$select api_v2.reschedule_meeting_session_v2(%L,%L,'10:00','12:00','onsite',null,'موعد داخل الدورة التالية',(select updated_at from qarar_meetings.meetings where id=%L))$$,
  (select id from late),(select next_start+1 from late),(select id from late)),
  '22023','يقع هذا اليوم في دورة الاجتماع التالية التي تبدأ في '||(select qarar_meetings.arabic_date_v2(next_start) from late)||'؛ اختر يومًا قبلها.',
  'a day inside the next cycle is refused');
select lives_ok(format($$select api_v2.reschedule_meeting_session_v2(%L,%L,'10:00','12:00','onsite',null,null,(select updated_at from qarar_meetings.meetings where id=%L))$$,
  (select id from late),(select planned_window_end from late),(select id from late)),'a day inside its own ended window is taken without a reason');
select lives_ok(format($$update qarar_meetings.meetings set status='scheduled' where id=%L$$,(select id from late)),'the late meeting is scheduled');
select throws_ok(format($$update qarar_meetings.meetings set status='ready_to_start' where id=%L$$,(select id from late)),
  '55000',null,'after its window, the session is not prepared without a new day and a reason');
update qarar_meetings.meetings set status='draft' where id=(select id from late);
insert into auth.users(id,email) values ('64200000-0000-0000-0000-000000000011','late-member@example.test');
insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
select '64200000-0000-0000-0000-000000000001','meeting',id,'meeting.invitation.requested',
  jsonb_build_object('meeting_id',id,'recipient_user_id','64200000-0000-0000-0000-000000000011'),'late-invite:'||id from late;
select lives_ok(format($$select api_v2.reschedule_meeting_session_v2(%L,current_date,'10:00','12:00','onsite',null,'تأخر بسبب سفر رئيس المجلس',(select updated_at from qarar_meetings.meetings where id=%L))$$,
  (select id from late),(select id from late)),'a new day today with a reason is taken');
select lives_ok(format($$update qarar_meetings.meetings set status='scheduled' where id=%1$L; update qarar_meetings.meetings set status='ready_to_start' where id=%1$L$$,(select id from late)),
  'with its reason the late meeting is prepared for its session normally');
select is((select count(*)::integer from qarar_governance.notification_outbox where event_type='meeting.postponed'
  and aggregate_id=(select id from late) and payload->>'recipient_user_id'='64200000-0000-0000-0000-000000000011'),1,
  'an invitee is told when the late session moves');
select is((select schedule_exception_reason from qarar_meetings.meetings where id=(select id from late)),'تأخر بسبب سفر رئيس المجلس','the reason is kept, so the meeting carries the out-of-cycle label');
alter table qarar_meetings.meetings enable trigger enforce_ready_meeting_integrity;

select * from finish();
rollback;
