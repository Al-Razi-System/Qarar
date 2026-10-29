begin;
create extension if not exists pgtap;
select no_plan();
select is((qarar_meetings.council_month_week_window_v2('2026-10-11',1)->>'starts_on')::date,'2026-10-01'::date,'first week starts at day 1');
select is((qarar_meetings.council_month_week_window_v2('2026-10-11',2)->>'ends_on')::date,'2026-10-14'::date,'second week ends at day 14');
select is((qarar_meetings.council_month_week_window_v2('2026-10-11',3)->>'starts_on')::date,'2026-10-15'::date,'third week starts at day 15');
select is((qarar_meetings.council_month_week_window_v2('2028-02-01',5)->>'ends_on')::date,'2028-02-29'::date,'leap February final week');
select throws_ok($$select qarar_meetings.council_month_week_window_v2('2026-02-01',5)$$,'22023','لا يوجد هذا الأسبوع في الشهر المختار','nonexistent fifth week denied');
select throws_ok($$select qarar_meetings.council_month_week_window_v2('2026-10-01',0)$$,'22023','اختر أسبوعاً شهرياً صحيحاً','invalid week denied');

insert into qarar_core.organizations(id,code,name_ar) values
('93000000-0000-0000-0000-000000000001','permission-matrix-test','اختبار المنح والسحب');
insert into auth.users(id,email) values
('93000000-0000-0000-0000-000000000010','permission-requester@example.test'),
('93000000-0000-0000-0000-000000000011','permission-approver@example.test'),
('93000000-0000-0000-0000-000000000012','permission-member@example.test'),
('93000000-0000-0000-0000-000000000013','permission-unassigned@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,status,is_system_admin)
select id,'93000000-0000-0000-0000-000000000001',email,'مستخدم اختبار','active',
id in ('93000000-0000-0000-0000-000000000010','93000000-0000-0000-0000-000000000011')
from auth.users where id in (
'93000000-0000-0000-0000-000000000010','93000000-0000-0000-0000-000000000011',
'93000000-0000-0000-0000-000000000012','93000000-0000-0000-0000-000000000013');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('93000000-0000-0000-0000-000000000020','93000000-0000-0000-0000-000000000001','fixture_scope','جهة اختبار',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('93000000-0000-0000-0000-000000000021','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000020','unit_a','الجهة الأولى','active'),
('93000000-0000-0000-0000-000000000022','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000020','unit_b','الجهة الثانية','active');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope)
values('93000000-0000-0000-0000-000000000030','93000000-0000-0000-0000-000000000001','fixture_matrix','دور الاختبار','organization');
insert into qarar_iam.memberships(id,organization_id,user_id,role_id,governance_unit_id,membership_status,start_date)
values('93000000-0000-0000-0000-000000000031','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000012','93000000-0000-0000-0000-000000000030','93000000-0000-0000-0000-000000000021','active',current_date);


select set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal2"}',true);

insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values
('93000000-0000-0000-0000-000000000080','93000000-0000-0000-0000-000000000001','fixture_regular','اجتماع دوري');

insert into qarar_meetings.council_meeting_plans_v2(id,organization_id,governance_unit_id,meeting_type_id,recurrence,monthly_week,first_meeting_date,status,created_by_user_id)
values('93000000-0000-0000-0000-000000000081','93000000-0000-0000-0000-000000000001',
'93000000-0000-0000-0000-000000000021','93000000-0000-0000-0000-000000000080','monthly',2,'2026-10-08','active','93000000-0000-0000-0000-000000000010');
select cmp_ok((select count(*)::integer from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081'),'>=',12,'the complete rolling cycle is materialized');
create temp table pg_temp.initial_plan_meetings as
select id,planned_window_start,planned_window_end from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081';
select is((select planned_window_end from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'),'2026-10-14'::date,'draft has the full window');
select ok((select not schedule_date_confirmed from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'),'anchor is not an actual confirmed date');
select ok(not (api_v1.get_meeting_detail((select id from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'))#>>'{capabilities,can_schedule}')::boolean,'backend capability does not offer predictable rejection');
select throws_ok($q$update qarar_meetings.meetings set status='scheduled' where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'$q$,'55000','حدد يوم الاجتماع ووقت انعقاده داخل الأسبوع قبل الجدولة','cannot schedule unconfirmed anchor');
select throws_ok($q$update qarar_meetings.meetings set scheduled_date='2026-10-22',start_time='09:00',end_time='10:00' where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'$q$,'22023','حدد يوماً داخل أسبوع الاجتماع ووقتي بداية ونهاية صحيحين','confirmation must be inside window');
select lives_ok($q$update qarar_meetings.meetings set scheduled_date='2026-10-12',start_time='09:00',end_time='10:00' where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'$q$,'explicit date and times confirm meeting');
select ok((select schedule_date_confirmed from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'),'stored confirmation is true');
select ok((api_v1.get_meeting_detail((select id from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'))#>>'{capabilities,can_schedule}')::boolean,'confirmed draft enables permitted scheduling');
select lives_ok($q$update qarar_meetings.meetings set start_time=null,end_time=null where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'$q$,'draft may clear its time');
select ok((select not schedule_date_confirmed from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'),'clearing time removes confirmation');
select throws_ok($q$update qarar_meetings.meetings set status='scheduled' where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'$q$,'55000','حدد يوم الاجتماع ووقت انعقاده داخل الأسبوع قبل الجدولة','cleared times cannot be scheduled');
select lives_ok($q$update qarar_meetings.meetings set start_time='09:00',end_time='10:00' where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2026-10-08'$q$,'valid times restore confirmation');
select lives_ok($q$select qarar_meetings.create_council_plan_occurrence_v2('93000000-0000-0000-0000-000000000081','2026-10-01')$q$,'retry after changing actual date returns same window');
select is((select count(*)::integer from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081'),(select count(*)::integer from pg_temp.initial_plan_meetings),'retry cannot duplicate after confirmation');
select lives_ok($q$select qarar_meetings.create_council_plan_occurrence_v2('93000000-0000-0000-0000-000000000081','2027-01-01')$q$,'next year draft uses same plan');
select is((select status from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2027-01-08'),'draft','next occurrence never opens session');
select ok(not has_function_privilege('authenticated','qarar_meetings.generate_council_monthly_drafts_v2()','execute'),'ordinary client cannot invoke the cross-tenant scheduler');
select ok(not has_function_privilege('authenticated','qarar_meetings.create_council_plan_occurrence_v2(uuid,date)','execute'),'ordinary client cannot invoke internal generation helper');
select lives_ok($q$select api_v2.admin_update_council_v2('93000000-0000-0000-0000-000000000022',
'{"name_ar":"مجلس الأسبوع الثالث","unit_type_id":"93000000-0000-0000-0000-000000000020","minimum_active_members":3,"allow_dual_leadership":false}',
(select updated_at from qarar_core.governance_units where id='93000000-0000-0000-0000-000000000022'),
'{"meeting_type_id":"93000000-0000-0000-0000-000000000080","recurrence":"monthly","monthly_week":3,"first_meeting_date":"2026-10-01"}')$q$,'editing normalizes monthly week to its window');
select is((select first_meeting_date from qarar_meetings.council_meeting_plans_v2 where governance_unit_id='93000000-0000-0000-0000-000000000022'),'2026-10-15'::date,'third week is anchored to day 15');
create function pg_temp.create_weekly_council() returns jsonb language sql as $$
select api_v2.admin_create_council_with_plan_v2(
'{"name_ar":"مجلس اختبار الخطة الشهرية","unit_type_id":"93000000-0000-0000-0000-000000000020","minimum_active_members":3,"allow_dual_leadership":false}',
'{"meeting_type_id":"93000000-0000-0000-0000-000000000080","recurrence":"monthly","monthly_week":1,"first_meeting_date":"2026-11-01"}',
'93000000-0000-0000-0000-000000000091');
$$;
select lives_ok($q$select pg_temp.create_weekly_council()$q$,'create journey supports monthly week atomically');
select ok((pg_temp.create_weekly_council()->>'idempotent_replay')::boolean,'create retry is idempotent');
select cmp_ok((select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(pg_temp.create_weekly_council()->>'id')::uuid),'>=',12,'create retry preserves the materialized cycle');
select is(api_v1.get_meeting_detail((select id from qarar_meetings.meetings where source_plan_id='93000000-0000-0000-0000-000000000081' and planned_window_start='2027-01-08'))->>'planned_window_end','2027-01-14','meeting detail exposes window for date confirmation');
select is((api_v1.search_meetings(null,null,null,'2027-01-10','2027-01-10',100,0)->>'total')::integer,1,'date search includes overlap with proposed week');
select set_config('request.jwt.claims','{}',true);
select lives_ok($q$select qarar_meetings.generate_council_monthly_drafts_v2()$q$,'scheduled task runs with system context without impersonating creator');
select is(qarar_meetings.generate_council_monthly_drafts_v2(),0,'repeat scheduled task makes no duplicate');

select * from finish();
rollback;
