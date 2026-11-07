begin;
create extension if not exists pgtap;
select plan(2);
insert into qarar_core.organizations(id,code,name_ar) values('49000000-0000-0000-0000-000000000001','nm149','تسمية');
insert into auth.users(id,email) values('49000000-0000-0000-0000-000000000002','nm149@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values('49000000-0000-0000-0000-000000000002','49000000-0000-0000-0000-000000000001','nm149@example.test','مدير',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values('49000000-0000-0000-0000-000000000003','49000000-0000-0000-0000-000000000001','c','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values('49000000-0000-0000-0000-000000000004','49000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000003','c1','كلية العلوم','active');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,title_is_custom,scheduled_date,planned_window_start,planned_window_end,schedule_date_confirmed,schedule_exception_reason,created_by_user_id,status) values
('49000000-0000-0000-0000-000000000010','49000000-0000-0000-0000-000000000001','M-OCT','49000000-0000-0000-0000-000000000004','x',false,'2026-11-07','2026-10-08','2026-10-14',true,'انعقاد خارج الدورة','49000000-0000-0000-0000-000000000002','draft');
select ok((select title_ar from qarar_meetings.meetings where id='49000000-0000-0000-0000-000000000010') like '%أكتوبر 2026','a session of the October cycle held in November is named after October');
update qarar_meetings.meetings set status='scheduled' where id='49000000-0000-0000-0000-000000000010';
select ok((select title_ar from qarar_meetings.meetings where id='49000000-0000-0000-0000-000000000010') like '%أكتوبر 2026','and keeps that name when it moves on');
select * from finish();
rollback;
