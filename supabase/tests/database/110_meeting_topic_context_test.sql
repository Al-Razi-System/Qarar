begin;
create extension if not exists pgtap;
select plan(10);
insert into public.organizations(id,code,name_ar) values
('c2000000-0000-0000-0000-000000000001','s110','Context'),
('c2000000-0000-0000-0000-000000000002','s110f','Foreign');
insert into auth.users(id,email) values
('c2000000-0000-0000-0000-000000000011','reader@s110.test'),
('c2000000-0000-0000-0000-000000000012','denied@s110.test'),
('c2000000-0000-0000-0000-000000000013','foreign@s110.test'),
('c2000000-0000-0000-0000-000000000014','owner@s110.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('c2000000-0000-0000-0000-000000000011','c2000000-0000-0000-0000-000000000001','reader@s110.test','Reader'),
('c2000000-0000-0000-0000-000000000012','c2000000-0000-0000-0000-000000000001','denied@s110.test','Denied'),
('c2000000-0000-0000-0000-000000000013','c2000000-0000-0000-0000-000000000002','foreign@s110.test','Foreign'),
('c2000000-0000-0000-0000-000000000014','c2000000-0000-0000-0000-000000000001','owner@s110.test','Owner');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('c2000000-0000-0000-0000-000000000021','c2000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('c2000000-0000-0000-0000-000000000022','c2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000021','first','First council'),
('c2000000-0000-0000-0000-000000000023','c2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000021','next','Next council');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('c2000000-0000-0000-0000-000000000031','c2000000-0000-0000-0000-000000000001','s110_reader','Reader','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar) values
('c2000000-0000-0000-0000-000000000001','meetings.read','meetings','read','governance_unit','Read meeting') on conflict do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select organization_id,'c2000000-0000-0000-0000-000000000031',id from public.permissions
where organization_id='c2000000-0000-0000-0000-000000000001' and code='meetings.read';
insert into public.memberships(organization_id,user_id,governance_unit_id,role_id) values
('c2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000011','c2000000-0000-0000-0000-000000000022','c2000000-0000-0000-0000-000000000031');
insert into public.topics(id,organization_id,topic_no,title_ar,description,current_unit_id,submitted_by_user_id,status) values
('c2000000-0000-0000-0000-000000000071','c2000000-0000-0000-0000-000000000001','TOP-S110','Budget','وصف الموضوع المقدم','c2000000-0000-0000-0000-000000000023','c2000000-0000-0000-0000-000000000012','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('c2000000-0000-0000-0000-000000000081','c2000000-0000-0000-0000-000000000001','MTG-S110','c2000000-0000-0000-0000-000000000022','Current','2026-10-19','c2000000-0000-0000-0000-000000000014','draft'),
('c2000000-0000-0000-0000-000000000082','c2000000-0000-0000-0000-000000000001','MTG-S110-PREV','c2000000-0000-0000-0000-000000000022','Previous','2026-10-18','c2000000-0000-0000-0000-000000000014','draft'),
('c2000000-0000-0000-0000-000000000083','c2000000-0000-0000-0000-000000000001','MTG-S110-OPEN','c2000000-0000-0000-0000-000000000022','Open','2026-10-20','c2000000-0000-0000-0000-000000000014','draft');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order)
select ('c2000000-0000-0000-0000-00000000009'||n)::uuid,'c2000000-0000-0000-0000-000000000001',
 ('c2000000-0000-0000-0000-00000000008'||n)::uuid,'c2000000-0000-0000-0000-000000000071',1 from generate_series(1,3)n;
-- Synthetic historical states only: no bypass is used by the reads under test.
set local session_replication_role=replica;
update qarar_meetings.meetings set status='closed' where id='c2000000-0000-0000-0000-000000000082';
update qarar_topics.topics set workflow_instance_id='c2000000-0000-0000-0000-000000000201',current_workflow_step_id='c2000000-0000-0000-0000-000000000212'
where id='c2000000-0000-0000-0000-000000000071';
insert into qarar_governance.workflow_instance_steps(id,organization_id,workflow_instance_id,template_step_id,sequence_no,status,assigned_unit_id,snapshot,comment) values
('c2000000-0000-0000-0000-000000000211','c2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000201','c2000000-0000-0000-0000-000000000301',1,'completed','c2000000-0000-0000-0000-000000000022','{"name_ar":"مراجعة المجلس الأول","private":"SECRET"}','SECRET'),
('c2000000-0000-0000-0000-000000000212','c2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000201','c2000000-0000-0000-0000-000000000302',2,'active','c2000000-0000-0000-0000-000000000023','{"name_ar":"اعتماد المجلس التالي"}','SECRET');
insert into qarar_decisions.decisions(organization_id,decision_no,topic_id,meeting_id,agenda_item_id,governance_unit_id,decision_text,decision_status,issued_by_user_id) values
('c2000000-0000-0000-0000-000000000001','DEC-S110-PREV','c2000000-0000-0000-0000-000000000071','c2000000-0000-0000-0000-000000000082','c2000000-0000-0000-0000-000000000092','c2000000-0000-0000-0000-000000000022','قرار سابق معتمد','approved','c2000000-0000-0000-0000-000000000014'),
('c2000000-0000-0000-0000-000000000001','DEC-S110-OPEN','c2000000-0000-0000-0000-000000000071','c2000000-0000-0000-0000-000000000083','c2000000-0000-0000-0000-000000000093','c2000000-0000-0000-0000-000000000022','OPEN_SECRET','ready_for_approval','c2000000-0000-0000-0000-000000000014');
set local session_replication_role=origin;
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('c2000000-0000-0000-0000-000000000072','c2000000-0000-0000-0000-000000000001','TOP-S110-HIDDEN','موضوع غير مدرج','c2000000-0000-0000-0000-000000000023','c2000000-0000-0000-0000-000000000012','approved');
create function pg_temp.s110_detail() returns jsonb language sql as $$select api_v1.get_meeting_detail('c2000000-0000-0000-0000-000000000081')$$;
create function pg_temp.s110_context() returns jsonb language sql as $$select pg_temp.s110_detail()#>'{agenda_items,0,topic,context}'$$;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
set local role authenticated;
select is(pg_temp.s110_context()->>'description','وصف الموضوع المقدم','meeting reader sees the submitted body after topic moves away');
select is(jsonb_array_length(pg_temp.s110_context()->'route'),2,'all route stages are visible');
select is(pg_temp.s110_context()#>>'{route,1,unit_name_ar}','Next council','next council named without global topics access');
select ok(position('SECRET' in pg_temp.s110_context()::text)=0,'no workflow comments or raw snapshot');
select is(jsonb_array_length(pg_temp.s110_context()->'previous_decisions'),1,'only the closed meeting decision is shared');
select ok(position('موضوع غير مدرج' in pg_temp.s110_detail()::text)=0,'unlisted topics are not disclosed');
select ok(position('OPEN_SECRET' in pg_temp.s110_context()::text)=0,'unclosed meeting draft decision stays private');
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
select throws_ok($$select pg_temp.s110_detail()$$,'42501',null,'same tenant without meeting authority denied');
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000013","role":"authenticated"}',true);
select throws_ok($$select pg_temp.s110_detail()$$,'P0002',null,'foreign organization denied');
reset role;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
update public.role_permissions set is_active=false where role_id='c2000000-0000-0000-0000-000000000031';
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select pg_temp.s110_detail()$$,'42501',null,'revoked permission removes context access');
select * from finish();
rollback;
