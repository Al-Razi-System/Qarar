begin;
create extension if not exists pgtap;
select plan(10);

insert into public.organizations(id,code,name_ar) values
('d3000000-0000-0000-0000-000000000001','s130','مؤسسة اختبار تصدير الموضوع'),
('d3000000-0000-0000-0000-000000000002','s130f','مؤسسة أخرى');
insert into auth.users(id,email) values
('d3000000-0000-0000-0000-000000000011','admin@s130.test'),
('d3000000-0000-0000-0000-000000000012','denied@s130.test'),
('d3000000-0000-0000-0000-000000000013','foreign@s130.test');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('d3000000-0000-0000-0000-000000000011','d3000000-0000-0000-0000-000000000001','admin@s130.test','مدير المؤسسة',true),
('d3000000-0000-0000-0000-000000000012','d3000000-0000-0000-0000-000000000001','denied@s130.test','مستخدم بلا صلاحية',false),
('d3000000-0000-0000-0000-000000000013','d3000000-0000-0000-0000-000000000002','foreign@s130.test','مدير مؤسسة أخرى',true);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('d3000000-0000-0000-0000-000000000021','d3000000-0000-0000-0000-000000000001','council','مجلس');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('d3000000-0000-0000-0000-000000000022','d3000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000021','main','مجلس الجامعة'),
('d3000000-0000-0000-0000-000000000023','d3000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000021','other','مجلس آخر');
insert into public.topic_categories(id,organization_id,code,name_ar) values
('d3000000-0000-0000-0000-000000000031','d3000000-0000-0000-0000-000000000001','academic','شؤون أكاديمية');
insert into public.topics(id,organization_id,topic_no,title_ar,description,category_id,current_unit_id,submitted_by_user_id,status) values
('d3000000-0000-0000-0000-000000000041','d3000000-0000-0000-0000-000000000001','TOP-2026-130001','اعتماد خطة أكاديمية','وصف موضوع التصدير الرسمي','d3000000-0000-0000-0000-000000000031','d3000000-0000-0000-0000-000000000022','d3000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('d3000000-0000-0000-0000-000000000051','d3000000-0000-0000-0000-000000000001','MTG-2026-130001','d3000000-0000-0000-0000-000000000022','اجتماع اختبار الملف','2026-10-27','d3000000-0000-0000-0000-000000000011','draft'),
('d3000000-0000-0000-0000-000000000052','d3000000-0000-0000-0000-000000000001','MTG-2026-130002','d3000000-0000-0000-0000-000000000023','اجتماع سياق غير مرتبط','2026-10-27','d3000000-0000-0000-0000-000000000011','draft');

select has_function('api_v1','record_topic_pdf_export',array['uuid','uuid'],'topic PDF export audit contract exists');
select function_returns('api_v1','record_topic_pdf_export',array['uuid','uuid'],'jsonb','contract returns the print receipt');
select ok(has_function_privilege('authenticated','api_v1.record_topic_pdf_export(uuid,uuid)','execute'),'authenticated callers reach the contextual guard');
select ok(not has_function_privilege('anon','api_v1.record_topic_pdf_export(uuid,uuid)','execute'),'anonymous callers cannot record exports');

select set_config('request.jwt.claims','{"sub":"d3000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
set local role authenticated;
select is(api_v1.record_topic_pdf_export('d3000000-0000-0000-0000-000000000041','d3000000-0000-0000-0000-000000000051')->>'recorded','true','authorized export is recorded');
select throws_ok($$select api_v1.record_topic_pdf_export('d3000000-0000-0000-0000-000000000041','d3000000-0000-0000-0000-000000000052')$$,'42501',null,'meeting context must contain an eligible agenda proposal');
reset role;
select is((select count(*)::integer from qarar_audit.audit_logs where action='topics.pdf.export' and entity_id='d3000000-0000-0000-0000-000000000041'),1,'one topic audit event is appended');
select is((select metadata->>'meeting_id' from qarar_audit.audit_logs where action='topics.pdf.export' and entity_id='d3000000-0000-0000-0000-000000000041'),'d3000000-0000-0000-0000-000000000051','meeting context is preserved in the audit event');

select set_config('request.jwt.claims','{"sub":"d3000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select api_v1.record_topic_pdf_export('d3000000-0000-0000-0000-000000000041',null)$$,'42501',null,'same-tenant user without topic access is denied');
reset role;

select set_config('request.jwt.claims','{"sub":"d3000000-0000-0000-0000-000000000013","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select api_v1.record_topic_pdf_export('d3000000-0000-0000-0000-000000000041',null)$$,'P0002',null,'foreign tenant cannot record the export');
reset role;

select * from finish();
rollback;
