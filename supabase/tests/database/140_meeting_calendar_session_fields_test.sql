begin;
create extension if not exists pgtap;
select no_plan();

-- The calendar names a generated session by its council and number.
insert into qarar_core.organizations(id,code,name_ar) values ('64000000-0000-0000-0000-000000000001','calendar-fields-ci','اختبار التقويم');
insert into auth.users(id,email) values ('64000000-0000-0000-0000-000000000010','calendar-admin@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('64000000-0000-0000-0000-000000000010','64000000-0000-0000-0000-000000000001','calendar-admin@example.test','مسؤول التقويم',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('64000000-0000-0000-0000-000000000020','64000000-0000-0000-0000-000000000001','college','كلية',false),
('64000000-0000-0000-0000-000000000021','64000000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values ('64000000-0000-0000-0000-000000000040','64000000-0000-0000-0000-000000000001','regular','دوري');
select set_config('request.jwt.claim.sub','64000000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table scope_unit as select api_v2.admin_create_organizational_unit_v2('كلية التقويم','64000000-0000-0000-0000-000000000020',null,'64000000-0000-0000-0000-000000000050') payload;
select api_v2.admin_create_council_with_plan_v2(
  jsonb_build_object('name_ar','مجلس قسم الصيدلة','unit_type_id','64000000-0000-0000-0000-000000000021','scope_unit_id',(select payload->>'id' from scope_unit),'minimum_active_members',3,'allow_dual_leadership',false),
  jsonb_build_object('meeting_type_id','64000000-0000-0000-0000-000000000040','recurrence','monthly','monthly_week',1,'first_meeting_date','2026-11-01','ends_on','2026-12-31'),
  '64000000-0000-0000-0000-000000000051');
create temporary table first_item as select api_v2.list_meetings_calendar_v2('2026-11-01','2026-11-30',null)->0 item;
select is((select (item->>'session_sequence_no')::integer from first_item),1,'the calendar carries the session number');
select is((select (item->>'title_is_custom')::boolean from first_item),false,'and whether the name is generated');
select is((select item->>'academic_year_start' from first_item),'2026-09-01','and the academic year');
select is((select item->>'unit_name_ar' from first_item),'مجلس قسم الصيدلة','and still the council name');

select * from finish();
rollback;
