begin;
create extension if not exists pgtap;
select plan(7);
insert into qarar_core.organizations(id,code,name_ar) values('53000000-0000-0000-0000-000000000001','ov153','نظرة');
insert into auth.users(id,email) values('53000000-0000-0000-0000-000000000002','ov153@example.test'),('53000000-0000-0000-0000-000000000005','ov153b@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('53000000-0000-0000-0000-000000000002','53000000-0000-0000-0000-000000000001','ov153@example.test','مدير',true),
('53000000-0000-0000-0000-000000000005','53000000-0000-0000-0000-000000000001','ov153b@example.test','رئيس المجلس',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values('53000000-0000-0000-0000-000000000003','53000000-0000-0000-0000-000000000001','c','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('53000000-0000-0000-0000-000000000004','53000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000003','c1','مجلس بلا شيء','active'),
('53000000-0000-0000-0000-000000000006','53000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000003','c2','مجلس بخطة','active');
delete from qarar_iam.roles where organization_id='53000000-0000-0000-0000-000000000001' and code='council_chair';
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values('53000000-0000-0000-0000-000000000007','53000000-0000-0000-0000-000000000001','council_chair','رئيس','governance_unit');
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date) values('53000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000005','53000000-0000-0000-0000-000000000006','53000000-0000-0000-0000-000000000007',current_date-30);
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('53000000-0000-0000-0000-000000000010','53000000-0000-0000-0000-000000000001','M-NEXT','53000000-0000-0000-0000-000000000006','قادم',current_date+5,'53000000-0000-0000-0000-000000000002','scheduled'),
('53000000-0000-0000-0000-000000000011','53000000-0000-0000-0000-000000000001','M-LATER','53000000-0000-0000-0000-000000000006','أبعد',current_date+40,'53000000-0000-0000-0000-000000000002','draft');
set local "request.jwt.claims"='{"sub":"53000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
create temporary table ov as select api_v2.get_council_overview_v2() p;
grant select on ov to authenticated;
select is((select p->'53000000-0000-0000-0000-000000000006'->>'chair_name_ar' from ov),'رئيس المجلس','a council shows who chairs it');
select is((select (p->'53000000-0000-0000-0000-000000000006'->>'member_count')::int from ov),1,'and how many members it has');
select is((select (p->'53000000-0000-0000-0000-000000000006'->>'meetings_total')::int from ov),2,'and how many meetings');
select is((select p->'53000000-0000-0000-0000-000000000006'->'next_meeting'->>'meeting_no' from ov),'M-NEXT','and its next meeting is the nearest one');
select is((select p->'53000000-0000-0000-0000-000000000004'->>'chair_name_ar' from ov),null,'a council without a chair says so');
select is((select (p->'53000000-0000-0000-0000-000000000004'->'next_meeting')::text from ov),'null','and without meetings has no next one');
select is((select (p->'53000000-0000-0000-0000-000000000004'->>'has_plan')::boolean from ov),false,'and no plan');
select * from finish();
rollback;
