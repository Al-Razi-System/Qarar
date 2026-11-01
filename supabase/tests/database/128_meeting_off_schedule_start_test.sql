begin;
create extension if not exists pgtap;
select plan(22);

insert into public.organizations(id,code,name_ar,timezone) values
('c8000000-0000-0000-0000-000000000001','off-schedule-start','اختبار بدء الاجتماع','Asia/Riyadh');
insert into auth.users(id,email) values
('c8000000-0000-0000-0000-000000000011','chair@off-schedule.test'),
('c8000000-0000-0000-0000-000000000012','manager@off-schedule.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('c8000000-0000-0000-0000-000000000011','c8000000-0000-0000-0000-000000000001','chair@off-schedule.test','رئيس المجلس'),
('c8000000-0000-0000-0000-000000000012','c8000000-0000-0000-0000-000000000001','manager@off-schedule.test','مدير الحضور');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('c8000000-0000-0000-0000-000000000021','c8000000-0000-0000-0000-000000000001','council','مجلس');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('c8000000-0000-0000-0000-000000000022','c8000000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-000000000021','main','مجلس الاختبار');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('c8000000-0000-0000-0000-000000000032','c8000000-0000-0000-0000-000000000001','attendance_manager','مدير الحضور','governance_unit');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'c8000000-0000-0000-0000-000000000001',r.id,p.id
from public.roles r cross join public.permissions p
where r.organization_id='c8000000-0000-0000-0000-000000000001'
  and r.code in('council_chair','attendance_manager')
  and p.organization_id=r.organization_id
  and (p.code='attendance.manage' or (r.code='council_chair' and p.code='meetings.manage'))
on conflict do nothing;
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('c8000000-0000-0000-0000-000000000061','c8000000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-000000000011','c8000000-0000-0000-0000-000000000022',(select id from public.roles where organization_id='c8000000-0000-0000-0000-000000000001' and code='council_chair')),
('c8000000-0000-0000-0000-000000000062','c8000000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-000000000012','c8000000-0000-0000-0000-000000000022','c8000000-0000-0000-0000-000000000032');

insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,start_time,end_time,created_by_user_id,status) values
('c8000000-0000-0000-0000-000000000081','c8000000-0000-0000-0000-000000000001','MTG-2026-800001','c8000000-0000-0000-0000-000000000022','اجتماع داخل الموعد',(clock_timestamp() at time zone 'Asia/Riyadh')::date,'00:00','23:59:59','c8000000-0000-0000-0000-000000000011','ready_to_start'),
('c8000000-0000-0000-0000-000000000082','c8000000-0000-0000-0000-000000000001','MTG-2026-800002','c8000000-0000-0000-0000-000000000022','اجتماع مبكر',(clock_timestamp() at time zone 'Asia/Riyadh')::date+1,'10:00','11:00','c8000000-0000-0000-0000-000000000011','ready_to_start'),
('c8000000-0000-0000-0000-000000000083','c8000000-0000-0000-0000-000000000001','MTG-2026-800003','c8000000-0000-0000-0000-000000000022','اجتماع متأخر',(clock_timestamp() at time zone 'Asia/Riyadh')::date-1,'10:00','11:00','c8000000-0000-0000-0000-000000000011','ready_to_start'),
('c8000000-0000-0000-0000-000000000084','c8000000-0000-0000-0000-000000000001','MTG-2026-800004','c8000000-0000-0000-0000-000000000022','اجتماع قديم بلا وقت',(clock_timestamp() at time zone 'Asia/Riyadh')::date,null,null,'c8000000-0000-0000-0000-000000000011','ready_to_start'),
('c8000000-0000-0000-0000-000000000085','c8000000-0000-0000-0000-000000000001','MTG-2026-800005','c8000000-0000-0000-0000-000000000022','تجاوز دون رئيس',(clock_timestamp() at time zone 'Asia/Riyadh')::date+1,'10:00','11:00','c8000000-0000-0000-0000-000000000011','ready_to_start');

create function pg_temp.s128_token(p_id uuid) returns timestamptz language sql security definer as
$$select updated_at from qarar_meetings.meetings where id=p_id$$;
create function pg_temp.s128_status(p_id uuid) returns text language sql security definer as
$$select status from qarar_meetings.meetings where id=p_id$$;
create function pg_temp.s128_roster_count(p_id uuid) returns integer language sql security definer as
$$select count(*)::integer from qarar_attendance.attendance_records where meeting_id=p_id$$;
create function pg_temp.s128_opening_text(p_id uuid,p_field text) returns text language sql security definer as
$$select to_jsonb(o)->>p_field from qarar_attendance.meeting_session_openings o where meeting_id=p_id$$;
create function pg_temp.s128_audit_count(p_id uuid) returns integer language sql security definer as
$$select count(*)::integer from qarar_audit.audit_logs where entity_id=p_id and action='meetings.session.open'$$;
create function pg_temp.s128_move_to_minutes(p_id uuid) returns void language sql security definer as
$$update qarar_meetings.meetings set status='waiting_for_minutes',quorum_status='met' where id=p_id$$;

select has_function('api_v1','get_meeting_session_start_timing_v2',array['uuid'],'start timing read contract exists');
select has_function('api_v1','open_meeting_session',array['uuid','timestamp with time zone','boolean'],'opening contract accepts explicit confirmation');
select is(qarar_attendance.calculate_meeting_start_timing('2026-10-26','12:00','13:00','Asia/Riyadh','2026-10-26 07:00+00')->>'timing_status','within_window','two-hour boundary is allowed without confirmation');
select is(qarar_attendance.calculate_meeting_start_timing('2026-10-26','12:00','13:00','Asia/Riyadh','2026-10-26 06:59+00')->>'timing_status','early','one minute before the boundary requires confirmation');
select is(qarar_attendance.calculate_meeting_start_timing('2026-10-26','12:00','13:00','Asia/Riyadh','2026-10-26 10:01+00')->>'timing_status','late','one minute after the end requires confirmation');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"c8000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(api_v1.get_meeting_session_start_timing_v2('c8000000-0000-0000-0000-000000000082')->>'requires_confirmation','true','early meeting preview requires confirmation');
select throws_ok(
  $$select api_v1.open_meeting_session('c8000000-0000-0000-0000-000000000082',pg_temp.s128_token('c8000000-0000-0000-0000-000000000082'),false)$$,
  'P0001','بدء الجلسة خارج الموعد المحدد يحتاج تأكيد رئيس المجلس. راجع الموعد ثم أكد بدء الجلسة الآن.','server refuses an early opening without confirmation');
select is(pg_temp.s128_status('c8000000-0000-0000-0000-000000000082'),'ready_to_start','rejected early opening leaves meeting unchanged');
select is(pg_temp.s128_roster_count('c8000000-0000-0000-0000-000000000082'),0,'rejected opening creates no roster');
select is(api_v1.open_meeting_session('c8000000-0000-0000-0000-000000000082',pg_temp.s128_token('c8000000-0000-0000-0000-000000000082'),true)->'meeting'->>'status','in_progress','chair confirms early opening');
select is(pg_temp.s128_opening_text('c8000000-0000-0000-0000-000000000082','timing_status'),'early','early classification is stored');
select is(pg_temp.s128_opening_text('c8000000-0000-0000-0000-000000000082','confirmed_off_schedule'),'true','explicit confirmation is stored');
select is(pg_temp.s128_audit_count('c8000000-0000-0000-0000-000000000082'),1,'opening is audited once');
select pg_temp.s128_move_to_minutes('c8000000-0000-0000-0000-000000000082');
select matches(api_v1.generate_meeting_minutes_draft('c8000000-0000-0000-0000-000000000082')->>'content_draft','بدأت الجلسة مبكرًا','official minutes preserve the confirmed early opening');

select throws_ok(
  $$select api_v1.open_meeting_session('c8000000-0000-0000-0000-000000000083',pg_temp.s128_token('c8000000-0000-0000-0000-000000000083'),false)$$,
  'P0001','بدء الجلسة خارج الموعد المحدد يحتاج تأكيد رئيس المجلس. راجع الموعد ثم أكد بدء الجلسة الآن.','server refuses a late opening without confirmation');
select is(api_v1.open_meeting_session('c8000000-0000-0000-0000-000000000083',pg_temp.s128_token('c8000000-0000-0000-0000-000000000083'),true)->'meeting'->>'status','in_progress','chair confirms late opening');
select is(pg_temp.s128_opening_text('c8000000-0000-0000-0000-000000000083','timing_status'),'late','late classification is stored');

set local "request.jwt.claims"='{"sub":"c8000000-0000-0000-0000-000000000012","role":"authenticated"}';
select throws_ok(
  $$select api_v1.open_meeting_session('c8000000-0000-0000-0000-000000000082',pg_temp.s128_token('c8000000-0000-0000-0000-000000000082'),true)$$,
  '23514','الجلسة ليست جاهزة للبدء. حدّث بيانات الاجتماع ثم أعد المحاولة.','repeated opening is rejected without a duplicate event');
select is(api_v1.open_meeting_session('c8000000-0000-0000-0000-000000000081',pg_temp.s128_token('c8000000-0000-0000-0000-000000000081'),false)->'meeting'->>'status','in_progress','contextual manager opens inside the allowed window');
select is(api_v1.open_meeting_session('c8000000-0000-0000-0000-000000000084',pg_temp.s128_token('c8000000-0000-0000-0000-000000000084'),false)->'meeting'->>'status','in_progress','legacy meeting without times remains openable');
select is(pg_temp.s128_opening_text('c8000000-0000-0000-0000-000000000084','timing_status'),'schedule_unavailable','legacy opening is explicitly classified');

set local "request.jwt.claims"='{"sub":"c8000000-0000-0000-0000-000000000012","role":"authenticated"}';
select throws_ok(
  $$select api_v1.open_meeting_session('c8000000-0000-0000-0000-000000000085',pg_temp.s128_token('c8000000-0000-0000-0000-000000000085'),true)$$,
  '42501','تأكيد بدء الجلسة خارج الموعد متاح لرئيس المجلس فقط.','a permission holder cannot confirm off-schedule for the chair');

select * from finish();
rollback;
