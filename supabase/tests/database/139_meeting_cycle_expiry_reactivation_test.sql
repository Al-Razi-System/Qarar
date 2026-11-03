begin;
create extension if not exists pgtap;
select no_plan();

insert into qarar_core.organizations(id,code,name_ar)
values ('63900000-0000-0000-0000-000000000001','cycle-ci','اختبار دورة الاجتماع');
insert into auth.users(id,email) values
('63900000-0000-0000-0000-000000000010','cycle-admin@example.test'),
('63900000-0000-0000-0000-000000000011','cycle-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('63900000-0000-0000-0000-000000000010','63900000-0000-0000-0000-000000000001','cycle-admin@example.test','مسؤول الدورة',true),
('63900000-0000-0000-0000-000000000011','63900000-0000-0000-0000-000000000001','cycle-denied@example.test','غير مخول',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('63900000-0000-0000-0000-000000000020','63900000-0000-0000-0000-000000000001','college','كلية',false),
('63900000-0000-0000-0000-000000000021','63900000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar)
values ('63900000-0000-0000-0000-000000000040','63900000-0000-0000-0000-000000000001','regular','دوري');
select set_config('request.jwt.claim.sub','63900000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);

create temporary table scope_unit as select api_v2.admin_create_organizational_unit_v2(
  'كلية اختبار الدورة','63900000-0000-0000-0000-000000000020',null,'63900000-0000-0000-0000-000000000050') payload;

create temporary table week_one_council as select api_v2.admin_create_council_with_plan_v2(
  jsonb_build_object('name_ar','مجلس الأسبوع الأول','unit_type_id','63900000-0000-0000-0000-000000000021','scope_unit_id',(select payload->>'id' from scope_unit),'minimum_active_members',3,'allow_dual_leadership',false),
  jsonb_build_object('meeting_type_id','63900000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',1,'first_meeting_date','2026-10-01','ends_on','2026-11-30'),
  '63900000-0000-0000-0000-000000000051') payload;
create temporary table week_four_council as select api_v2.admin_create_council_with_plan_v2(
  jsonb_build_object('name_ar','مجلس الأسبوع الرابع','unit_type_id','63900000-0000-0000-0000-000000000021','scope_unit_id',(select payload->>'id' from scope_unit),'minimum_active_members',3,'allow_dual_leadership',false),
  jsonb_build_object('meeting_type_id','63900000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',4,'first_meeting_date','2026-10-01','ends_on','2026-11-30'),
  '63900000-0000-0000-0000-000000000052') payload;
create temporary table one_cycle_council as select api_v2.admin_create_council_with_plan_v2(
  jsonb_build_object('name_ar','مجلس بلا دورة تالية','unit_type_id','63900000-0000-0000-0000-000000000021','scope_unit_id',(select payload->>'id' from scope_unit),'minimum_active_members',3,'allow_dual_leadership',false),
  jsonb_build_object('meeting_type_id','63900000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',1,'first_meeting_date','2026-10-01','ends_on','2026-10-31'),
  '63900000-0000-0000-0000-000000000053') payload;
create temporary table future_council as select api_v2.admin_create_council_with_plan_v2(
  jsonb_build_object('name_ar','مجلس دورة مستقبلية','unit_type_id','63900000-0000-0000-0000-000000000021','scope_unit_id',(select payload->>'id' from scope_unit),'minimum_active_members',3,'allow_dual_leadership',false),
  jsonb_build_object('meeting_type_id','63900000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',2,'first_meeting_date','2027-06-01','ends_on','2027-06-30'),
  '63900000-0000-0000-0000-000000000054') payload;

-- Internal clock: expiry alone warns; only the next cycle's window finalises.
select set_config('request.jwt.claim.sub','',true);
select lives_ok($$select qarar_meetings.finalize_unheld_plan_meetings_v2('2026-10-08')$$,'housekeeping can evaluate the day after week one');
select is((select status from qarar_meetings.meetings where governance_unit_id=(select (payload->>'id')::uuid from week_one_council) and planned_date='2026-10-01'),'draft','week one stays actionable after its window ends');
select lives_ok($$select qarar_meetings.finalize_unheld_plan_meetings_v2('2026-10-31')$$,'housekeeping can evaluate the end of the month');
select is((select status from qarar_meetings.meetings where governance_unit_id=(select (payload->>'id')::uuid from week_one_council) and planned_date='2026-10-01'),'draft','week one stays actionable through the month');
select lives_ok($$select qarar_meetings.finalize_unheld_plan_meetings_v2('2026-11-01')$$,'the next first-week cycle starts');
select is((select status from qarar_meetings.meetings where governance_unit_id=(select (payload->>'id')::uuid from week_one_council) and planned_date='2026-10-01'),'not_held','the previous first-week cycle becomes not held when the new one starts');
select is((select status from qarar_meetings.meetings where governance_unit_id=(select (payload->>'id')::uuid from week_four_council) and planned_date='2026-10-22'),'draft','week four stays actionable at the start of the next month');
select lives_ok($$select qarar_meetings.finalize_unheld_plan_meetings_v2('2026-11-21')$$,'the day before the fourth-week cycle starts');
select is((select status from qarar_meetings.meetings where governance_unit_id=(select (payload->>'id')::uuid from week_four_council) and planned_date='2026-10-22'),'draft','week four stays actionable through day 21');
select lives_ok($$select qarar_meetings.finalize_unheld_plan_meetings_v2('2026-11-22')$$,'the fourth-week cycle starts');
select is((select status from qarar_meetings.meetings where governance_unit_id=(select (payload->>'id')::uuid from week_four_council) and planned_date='2026-10-22'),'not_held','the previous fourth-week cycle becomes not held on day 22');
select is((select status from qarar_meetings.meetings where governance_unit_id=(select (payload->>'id')::uuid from one_cycle_council) and planned_date='2026-10-01'),'draft','without a following occurrence the meeting is not finalised automatically');
select is((select count(*)::integer from qarar_meetings.meeting_status_history where to_status='not_held' and organization_id='63900000-0000-0000-0000-000000000001'),2,'each automatic classification has one status record');
select lives_ok($$select qarar_meetings.finalize_unheld_plan_meetings_v2('2026-11-22')$$,'repeating housekeeping is safe');
select is((select count(*)::integer from qarar_meetings.meeting_status_history where to_status='not_held' and organization_id='63900000-0000-0000-0000-000000000001'),2,'repeating housekeeping does not duplicate history');
select is((select count(*)::integer from qarar_audit.audit_logs where action='meeting.cycle.not_held' and organization_id='63900000-0000-0000-0000-000000000001'),2,'automatic classifications are audited');

-- Cancellation is the same occurrence, explicitly reactivated by an authorised actor.
select set_config('request.jwt.claim.sub','63900000-0000-0000-0000-000000000010',true);
create temporary table cancelled as select id,updated_at from qarar_meetings.meetings
where governance_unit_id=(select (payload->>'id')::uuid from week_one_council) and planned_date='2026-11-01';
update qarar_meetings.meetings set status='cancelled' where id=(select id from cancelled);
select is((api_v2.reactivate_cancelled_meeting_v2((select id from cancelled),(select updated_at from qarar_meetings.meetings where id=(select id from cancelled)))->>'status'),'draft','an unconfirmed cancelled occurrence reactivates as the same draft');
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select (payload->>'id')::uuid from week_one_council) and planned_date='2026-11-01'),1,'reactivation never creates a replacement');

select api_v2.reschedule_meeting_session_v2((select id from cancelled),'2026-11-03','09:00','10:00','onsite','قاعة الاختبار',null,(select updated_at from qarar_meetings.meetings where id=(select id from cancelled)));
select api_v1.transition_meeting((select id from cancelled),'scheduled',null,(select updated_at from qarar_meetings.meetings where id=(select id from cancelled)));
select api_v1.transition_meeting((select id from cancelled),'cancelled','إلغاء تجريبي للدورة',(select updated_at from qarar_meetings.meetings where id=(select id from cancelled)));
select is((api_v2.reactivate_cancelled_meeting_v2((select id from cancelled),(select updated_at from qarar_meetings.meetings where id=(select id from cancelled)))->>'status'),'scheduled','a fully timed cancelled occurrence reactivates as scheduled');
select ok(exists(select 1 from qarar_meetings.meeting_status_history where meeting_id=(select id from cancelled) and from_status='cancelled' and to_status='scheduled'),'reactivation is recorded in status history');
select ok(exists(select 1 from qarar_audit.audit_logs where entity_id=(select id from cancelled) and action='meeting.cancelled.reactivated'),'reactivation is audited');

select throws_ok($$select api_v2.reactivate_cancelled_meeting_v2((select id from cancelled),'2000-01-01')$$,'23514','لا يمكن إعادة تفعيل اجتماع غير ملغى.','a non-cancelled meeting cannot be reactivated');
select api_v1.transition_meeting((select id from cancelled),'cancelled','إلغاء ثانٍ لاختبار التعارض',(select updated_at from qarar_meetings.meetings where id=(select id from cancelled)));
select throws_ok($$select api_v2.reactivate_cancelled_meeting_v2((select id from cancelled),'2000-01-01')$$,'40001',null,'a stale version is rejected');
select set_config('request.jwt.claim.sub','63900000-0000-0000-0000-000000000011',true);
select throws_ok($$select api_v2.reactivate_cancelled_meeting_v2((select id from cancelled),(select updated_at from qarar_meetings.meetings where id=(select id from cancelled)))$$,'42501',null,'a user without contextual management cannot reactivate');

-- A generated future occurrence can be prepared as a plan, but cannot become
-- session-ready before its own cycle window begins.
select set_config('request.jwt.claim.sub','63900000-0000-0000-0000-000000000010',true);
create temporary table future_occurrence as select id from qarar_meetings.meetings
where governance_unit_id=(select (payload->>'id')::uuid from future_council) and planned_date='2027-06-08';
select api_v2.reschedule_meeting_session_v2((select id from future_occurrence),'2027-06-10','09:00','10:00','onsite','قاعة مستقبلية','اختبار منع دورة مستقبلية',(select updated_at from qarar_meetings.meetings where id=(select id from future_occurrence)));
select api_v1.transition_meeting((select id from future_occurrence),'scheduled',null,(select updated_at from qarar_meetings.meetings where id=(select id from future_occurrence)));
select throws_ok(
  $$select api_v1.transition_meeting((select id from future_occurrence),'ready_to_start',null,(select updated_at from qarar_meetings.meetings where id=(select id from future_occurrence)))$$,
  '23514','لا يمكن تجهيز الجلسة قبل بدء دورة الاجتماع في 2027-06-08.','a future plan occurrence cannot be prepared for session before its window starts');
select is(
  (qarar_meetings.search_meetings(null,null,(select (payload->>'id')::uuid from future_council),null,null,25,0)->>'total')::integer,
  0,'the operational search hides plan cycles whose windows have not started');
select is(
  (qarar_meetings.search_meetings(null,null,(select (payload->>'id')::uuid from future_council),'2027-06-01','2027-06-30',25,0)->>'total')::integer,
  1,'an explicit planning date search can still inspect a future cycle');
select is(
  (qarar_meetings.get_meeting_detail((select id from future_occurrence))->>'cycle_available')::boolean,
  false,'meeting detail marks the future cycle unavailable');
select is(
  (qarar_meetings.get_meeting_detail((select id from future_occurrence))#>>'{capabilities,can_prepare_session}')::boolean,
  false,'meeting detail never advertises session preparation for a future cycle');

select * from finish();
rollback;
