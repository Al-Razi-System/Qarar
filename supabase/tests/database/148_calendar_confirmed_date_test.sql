begin;
create extension if not exists pgtap;
select plan(4);
insert into qarar_core.organizations(id,code,name_ar) values('48000000-0000-0000-0000-000000000001','cal148','تقويم');
insert into auth.users(id,email) values('48000000-0000-0000-0000-000000000002','cal148@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values('48000000-0000-0000-0000-000000000002','48000000-0000-0000-0000-000000000001','cal148@example.test','مدير',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values('48000000-0000-0000-0000-000000000003','48000000-0000-0000-0000-000000000001','c','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values('48000000-0000-0000-0000-000000000004','48000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000003','c1','مجلس','active');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,planned_window_start,planned_window_end,schedule_date_confirmed,schedule_exception_reason,created_by_user_id,status) values
('48000000-0000-0000-0000-000000000010','48000000-0000-0000-0000-000000000001','M-DATED','48000000-0000-0000-0000-000000000004','محدد','2026-11-07','2026-10-08','2026-10-14',true,'انعقاد خارج الدورة','48000000-0000-0000-0000-000000000002','draft'),
('48000000-0000-0000-0000-000000000011','48000000-0000-0000-0000-000000000001','M-WINDOW','48000000-0000-0000-0000-000000000004','بنافذة','2026-11-08','2026-11-08','2026-11-14',false,null,'48000000-0000-0000-0000-000000000002','draft');
set local "request.jwt.claims"='{"sub":"48000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select ok((select count(*) from jsonb_array_elements(api_v2.list_meetings_calendar_v2('2026-11-01','2026-11-30',null)) e where e->>'meeting_no'='M-DATED')=1,'a meeting with a confirmed date is in the month it is held');
select ok((select count(*) from jsonb_array_elements(api_v2.list_meetings_calendar_v2('2026-10-01','2026-10-31',null)) e where e->>'meeting_no'='M-DATED')=0,'and not in the month of its old window');
select ok((select count(*) from jsonb_array_elements(api_v2.list_meetings_calendar_v2('2026-11-10','2026-11-12',null)) e where e->>'meeting_no'='M-WINDOW')=1,'a meeting without a confirmed date still spans its window');
select ok((select count(*) from jsonb_array_elements(api_v2.list_meetings_calendar_v2('2026-11-10','2026-11-12',null)) e where e->>'meeting_no'='M-DATED')=0,'a dated meeting does not span its old window');
select * from finish();
rollback;
