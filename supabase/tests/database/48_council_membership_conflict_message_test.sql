begin;
create extension if not exists pgtap;
select plan(2);

insert into qarar_core.organizations(id,code,name_ar)
values('48000000-0000-0000-0000-000000000001','membership-conflict-ci','منظمة اختبار تعارض العضوية');
insert into auth.users(id,email) values
('48000000-0000-0000-0000-000000000002','admin-membership@example.test'),
('48000000-0000-0000-0000-000000000003','member@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('48000000-0000-0000-0000-000000000002','48000000-0000-0000-0000-000000000001','admin-membership@example.test','مدير العضويات',true),
('48000000-0000-0000-0000-000000000003','48000000-0000-0000-0000-000000000001','member@example.test','طارق الاختبار',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type,is_system)
values('48000000-0000-0000-0000-000000000004','48000000-0000-0000-0000-000000000001','test_council','مجلس اختباري',true,true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status)
values('48000000-0000-0000-0000-000000000005','48000000-0000-0000-0000-000000000001',
 '48000000-0000-0000-0000-000000000004','trustees_test','مجلس الأمناء الاختباري','active');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope,is_active)
values('48000000-0000-0000-0000-000000000006','48000000-0000-0000-0000-000000000001',
 'test_council_member','عضو مجلس','governance_unit',true);
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,membership_status,start_date,end_date)
values('48000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000003',
 '48000000-0000-0000-0000-000000000005','48000000-0000-0000-0000-000000000006','ended',date '2026-01-01',date '2026-06-30');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"48000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select api_v1.admin_add_council_member(
 '48000000-0000-0000-0000-000000000005','48000000-0000-0000-0000-000000000003',
 '48000000-0000-0000-0000-000000000006','عضو مجلس',date '2026-06-15',null)$$,
 '23P01','لا يمكن إضافة العضوية: توجد فترة متداخلة للدور «عضو مجلس» من 2026-01-01 إلى 2026-06-30. غيّر تاريخ البداية أو أنهِ العضوية السابقة أولاً.',
 'overlap failure explains the exact conflicting role and period');
select lives_ok($$select api_v1.admin_add_council_member(
 '48000000-0000-0000-0000-000000000005','48000000-0000-0000-0000-000000000003',
 '48000000-0000-0000-0000-000000000006','عضو مجلس',date '2026-07-01',null)$$,
 'a new non-overlapping membership is accepted after an ended one');

select * from finish();
rollback;
