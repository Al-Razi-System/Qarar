begin;
create extension if not exists pgtap;
select no_plan();

-- A plan may end after a number of cycles; a plan made with a past start does
-- not create the cycles that are already history.
insert into qarar_core.organizations(id,code,name_ar) values ('64300000-0000-0000-0000-000000000001','plan-count-ci','اختبار عدد الدورات');
insert into auth.users(id,email) values ('64300000-0000-0000-0000-000000000010','count-admin@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('64300000-0000-0000-0000-000000000010','64300000-0000-0000-0000-000000000001','count-admin@example.test','مسؤول الخطة',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('64300000-0000-0000-0000-000000000020','64300000-0000-0000-0000-000000000001','college','كلية',false),
('64300000-0000-0000-0000-000000000021','64300000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values ('64300000-0000-0000-0000-000000000040','64300000-0000-0000-0000-000000000001','regular','دوري');
select set_config('request.jwt.claim.sub','64300000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table scope_unit as select (api_v2.admin_create_organizational_unit_v2('كلية الخطة','64300000-0000-0000-0000-000000000020',null,'64300000-0000-0000-0000-000000000050')->>'id')::uuid id;
create function pg_temp.council(p_name text,p_plan jsonb,p_request uuid) returns uuid language sql as $$
  select (api_v2.admin_create_council_with_plan_v2(
    jsonb_build_object('name_ar',p_name,'unit_type_id','64300000-0000-0000-0000-000000000021','scope_unit_id',(select id from scope_unit),'minimum_active_members',1,'allow_dual_leadership',false),
    p_plan,p_request)->>'id')::uuid $$;
create function pg_temp.plan(p_extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('meeting_type_id','64300000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',2,
    'first_meeting_date',to_char(date_trunc('month',current_date)+interval '1 month','YYYY-MM-DD'))||p_extra $$;

-- 1. A number of cycles.
create temporary table counted as select pg_temp.council('مجلس بست دورات',pg_temp.plan('{"occurrence_count":6}'),'64300000-0000-0000-0000-000000000051') id;
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select id from counted)),6,'a plan of six cycles creates six meetings');
select is((select ends_on from qarar_meetings.council_meeting_plans_v2 where governance_unit_id=(select id from counted)),
  (date_trunc('month',current_date)+interval '6 months')::date+7,'and ends with its sixth cycle');
select throws_ok($$select pg_temp.council('مجلس بنهايتين',pg_temp.plan(jsonb_build_object('occurrence_count',3,'ends_on',to_char(current_date+400,'YYYY-MM-DD'))),'64300000-0000-0000-0000-000000000052')$$,
  '22023','حدد نهاية الخطة بتاريخ أو بعدد دورات، لا بالاثنين.','an end date and a number of cycles together are refused');
select throws_ok($$select pg_temp.council('مجلس بعدد خاطئ',pg_temp.plan('{"occurrence_count":0}'),'64300000-0000-0000-0000-000000000053')$$,
  '22023','عدد الدورات يجب أن يكون عددًا صحيحًا من 1 إلى 520.','a number of cycles outside 1–520 is refused');
create temporary table weekly_counted as select (api_v2.admin_create_council_v2('مجلس أسبوعي معدود',null,null,'64300000-0000-0000-0000-000000000021',(select id from scope_unit),null,null,1,false,null,'64300000-0000-0000-0000-000000000054')->>'id')::uuid id;
select api_v2.save_council_meeting_plan_v2((select id from weekly_counted),jsonb_build_object('meeting_type_id','64300000-0000-0000-0000-000000000040','recurrence','weekly',
  'first_meeting_date',to_char(current_date+14,'YYYY-MM-DD'),'occurrence_count',4),'64300000-0000-0000-0000-000000000055');
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select id from weekly_counted)),4,'a weekly plan saved for an existing council takes its number of cycles too');

-- 2. A plan made today with a start four months back.
create temporary table back as select pg_temp.council('مجلس بداية سابقة',jsonb_build_object('meeting_type_id','64300000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',1,
  'first_meeting_date',to_char(date_trunc('month',current_date)-interval '4 months','YYYY-MM-DD'),
  'ends_on',to_char(date_trunc('month',current_date)+interval '2 months','YYYY-MM-DD')),'64300000-0000-0000-0000-000000000056') id;
select is((select min(planned_window_start) from qarar_meetings.meetings where governance_unit_id=(select id from back)),date_trunc('month',current_date)::date,
  'cycles whose next cycle already began are not created; the first meeting is this month''s');
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select id from back)),3,'this month and the two ahead');
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select id from back) and status='not_held'),0,'nothing is created only to be «لم يُنفذ»');

-- 3. A plan's last cycle, already passed, is kept: no next cycle makes it history.
create temporary table last_only as select pg_temp.council('مجلس دورة أخيرة',jsonb_build_object('meeting_type_id','64300000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',1,
  'first_meeting_date',to_char(date_trunc('month',current_date)-interval '1 month','YYYY-MM-DD'),
  'ends_on',to_char(date_trunc('month',current_date)-interval '1 day','YYYY-MM-DD')),'64300000-0000-0000-0000-000000000057') id;
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id=(select id from last_only)),1,'the plan''s only and last cycle is created');

select * from finish();
rollback;
