begin;
create extension if not exists pgtap;
select no_plan();
select has_function('api_v2','admin_get_route_designer_v2',array[]::text[],'route inventory contract exists');
select has_function('api_v2','admin_save_route_designer_v2',array['uuid','text','jsonb','text','uuid'],'atomic authoring contract exists');
insert into qarar_core.organizations(id,code,name_ar) values
 ('72000000-0000-0000-0000-000000000001','route-designer','اختبار المسارات'),
 ('72000000-0000-0000-0000-000000000002','route-other','مؤسسة أخرى');
insert into auth.users(id,email) values
 ('72000000-0000-0000-0000-000000000010','route-manager@example.test'),
 ('72000000-0000-0000-0000-000000000011','route-denied@example.test'),
 ('72000000-0000-0000-0000-000000000012','route-other@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
 ('72000000-0000-0000-0000-000000000010','72000000-0000-0000-0000-000000000001','route-manager@example.test','مدير المسارات',true),
 ('72000000-0000-0000-0000-000000000011','72000000-0000-0000-0000-000000000001','route-denied@example.test','غير مخول',false),
 ('72000000-0000-0000-0000-000000000012','72000000-0000-0000-0000-000000000002','route-other@example.test','مدير آخر',true);
create function pg_temp.actor(p_id uuid) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',p_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated','aal','aal2')::text,true);
end $$;
select pg_temp.actor('72000000-0000-0000-0000-000000000010');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
 ('72000000-0000-0000-0000-000000000031','72000000-0000-0000-0000-000000000001','route-council','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
 ('72000000-0000-0000-0000-000000000041','72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000031','route_one','المجلس الأول','inactive'),
 ('72000000-0000-0000-0000-000000000042','72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000031','route_two','المجلس الثاني','inactive');
create function pg_temp.spec() returns jsonb language sql as $$ select '{"name_ar":"مسار اختبار","description":"وصف","steps":[{"key":"s1","target_kind":"council","target_id":"72000000-0000-0000-0000-000000000041","kind":"discussion","approved":"s2","rejected":"reject","returned":""},{"key":"s2","target_kind":"council","target_id":"72000000-0000-0000-0000-000000000042","kind":"approval","approved":"complete","rejected":"reject","returned":"s1"}]}'::jsonb $$;
create temporary table results(name text primary key,data jsonb);
insert into results values('request',jsonb_build_object('id',gen_random_uuid()));
insert into results values('create',api_v2.admin_save_route_designer_v2(null,'save',pg_temp.spec(),null,(select (data->>'id')::uuid from results where name='request')));
create function pg_temp.tid() returns uuid language sql as $$ select (data->>'saved_id')::uuid from results where name='create' $$;
create function pg_temp.revision() returns text language sql as $$ select t->>'revision' from jsonb_array_elements(api_v2.admin_get_route_designer_v2()->'items') t where t->>'id'=pg_temp.tid()::text $$;
select is((select count(*)::integer from qarar_governance.workflow_template_steps where workflow_template_version_id=(select (data->>'saved_version_id')::uuid from results where name='create')),2,'inactive councils supported in atomic draft');
select matches((select reference_number from qarar_governance.workflow_templates where id=pg_temp.tid()),'^WFL-[0-9]{4}-[0-9]+$','server generated reference');
select is((select status from qarar_core.governance_units where id='72000000-0000-0000-0000-000000000041'),'inactive','authoring never activates a council');
select is((api_v2.admin_save_route_designer_v2(null,'save',pg_temp.spec(),null,(select (data->>'id')::uuid from results where name='request'))->>'idempotent_replay')::boolean,true,'retry does not create duplicate');
select throws_ok($$select api_v2.admin_save_route_designer_v2(null,'save',jsonb_set(pg_temp.spec(),'{name_ar}','"مختلف"'),null,(select (data->>'id')::uuid from results where name='request'))$$,'PT409',null,'request key cannot be reused with different content');
select is((select validation_status from qarar_governance.workflow_template_versions where workflow_template_id=pg_temp.tid()),'valid','return graph validates');
select is((select count(*)::integer from qarar_governance.workflow_template_transitions where workflow_template_version_id=(select (data->>'saved_version_id')::uuid from results where name='create') and transition_type='return'),1,'reverse referral targets prior stage');
select throws_ok($$select api_v2.admin_save_route_designer_v2(pg_temp.tid(),'activate','{}',pg_temp.revision(),gen_random_uuid())$$,'55000','ROUTE_COUNCIL_INACTIVE','activation explains inactive destination');
select throws_ok($$select api_v2.admin_save_route_designer_v2(pg_temp.tid(),'save',pg_temp.spec(),'stale',gen_random_uuid())$$,'PT409',null,'stale editor blocked');
select throws_ok($$select api_v2.admin_save_route_designer_v2(pg_temp.tid(),'save',jsonb_set(pg_temp.spec(),'{steps,0,approved}','"s99"'),pg_temp.revision(),gen_random_uuid())$$,'22023',null,'invalid edge rejected');
select is((select count(*)::integer from qarar_governance.workflow_template_versions where workflow_template_id=pg_temp.tid()),1,'failure rolls whole draft back');
-- Fixture activation bypasses council readiness only inside this rolled-back test.
update qarar_core.governance_units set status='active',activated_at=now() where organization_id='72000000-0000-0000-0000-000000000001';
insert into results values('activation_request',jsonb_build_object('id',gen_random_uuid(),'revision',pg_temp.revision()));
select lives_ok($$select api_v2.admin_save_route_designer_v2(pg_temp.tid(),'activate','{}',pg_temp.revision(),(select (data->>'id')::uuid from results where name='activation_request'))$$,'publish validated route');
select is((api_v2.admin_save_route_designer_v2(pg_temp.tid(),'activate','{}',(select data->>'revision' from results where name='activation_request'),(select (data->>'id')::uuid from results where name='activation_request'))->>'idempotent_replay')::boolean,true,'activation retry supported');
select lives_ok($$select api_v2.admin_save_route_designer_v2(pg_temp.tid(),'save',jsonb_set(pg_temp.spec(),'{name_ar}','"مسار محدث"'),pg_temp.revision(),gen_random_uuid())$$,'edit produces new internal draft');
select is((select count(*)::integer from qarar_governance.workflow_template_versions where workflow_template_id=pg_temp.tid() and status='active'),1,'editing preserves published route');
select is((select count(*)::integer from qarar_governance.workflow_template_steps s join qarar_governance.workflow_template_versions v on v.id=s.workflow_template_version_id where v.workflow_template_id=pg_temp.tid() and v.status='active'),2,'historical graph untouched');
create function pg_temp.layoutspec() returns jsonb language sql as $$ select jsonb_build_object('name_ar','ترتيب مشترك','description','', 'steps',(select jsonb_agg(n-'kind'-'approved'-'rejected'-'returned') from jsonb_array_elements(pg_temp.spec()->'steps') n)) $$;
insert into results values('layout',api_v2.admin_save_route_layout_v2(null,'save',pg_temp.layoutspec(),null,gen_random_uuid()));
select throws_ok($$select api_v2.admin_save_route_layout_v2(null,'save',pg_temp.spec(),null,gen_random_uuid())$$,'22023','ROUTE_POLICY_BELONGS_TO_TOPIC_TYPE','route API rejects embedded decision policies');
create function pg_temp.layoutid() returns uuid language sql as $$ select (data->>'saved_version_id')::uuid from results where name='layout' $$;
select is((select layout_only from qarar_governance.workflow_template_versions where id=pg_temp.layoutid()),true,'new route is explicitly layout only');
select is((select count(*)::integer from qarar_governance.workflow_template_transitions where workflow_template_version_id=pg_temp.layoutid() and outcome_code in ('approved','rejected','returned')),0,'shared order has no decision or referral edges');
select is((select count(*)::integer from qarar_governance.workflow_template_steps where workflow_template_version_id=pg_temp.layoutid() and allowed_outcomes<>array['completed']),0,'layout stages expose neutral traversal only');
select throws_ok($$insert into qarar_governance.workflow_instances(organization_id,topic_id,workflow_template_version_id,started_by_user_id) values('72000000-0000-0000-0000-000000000001',gen_random_uuid(),pg_temp.layoutid(),'72000000-0000-0000-0000-000000000010')$$,'23514','ROUTE_LAYOUT_NOT_EXECUTABLE','layout cannot be executed as a topic workflow');
select lives_ok($$select api_v2.admin_save_route_layout_v2((select (data->>'saved_id')::uuid from results where name='layout'),'activate','{}',(select x->>'revision' from jsonb_array_elements(api_v2.admin_get_route_layouts_v2()->'items') x where x->>'id'=(select data->>'saved_id' from results where name='layout')),gen_random_uuid())$$,'layout can be made available for classifications');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values('72000000-0000-0000-0000-000000000021','72000000-0000-0000-0000-000000000001','type-editor','محرر تصنيفات','organization');
insert into qarar_iam.permissions(organization_id,code,module,action,context_scope,name_ar) values('72000000-0000-0000-0000-000000000001','governance.model.edit','governance','edit','organization','تحرير التصنيفات') on conflict(organization_id,code) do nothing;
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id) select organization_id,'72000000-0000-0000-0000-000000000021',id from qarar_iam.permissions where organization_id='72000000-0000-0000-0000-000000000001' and code='governance.model.edit';
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id) values('72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000010','72000000-0000-0000-0000-000000000041','72000000-0000-0000-0000-000000000021');
insert into auth.users(id,email) values('72000000-0000-0000-0000-000000000013','route-system@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values('72000000-0000-0000-0000-000000000013','72000000-0000-0000-0000-000000000001','route-system@example.test','مدير النظام',true);
update qarar_iam.users set is_system_admin=false where id='72000000-0000-0000-0000-000000000010';
select ok(not qarar_iam.has_permission('governance.workflows.manage',null),'classification editor does not need shared route management');
create function pg_temp.bundle(p_code text,p_early boolean) returns jsonb language sql as $$ select jsonb_build_object('classification',jsonb_build_object('code','academic','name_ar','أكاديمي'),'topic_type',jsonb_build_object('code',p_code,'name_ar','تصنيف '||p_code),'version','{"is_governed":true,"acceptance_finality":"advance","rejection_finality":"complete"}'::jsonb,'workflow',jsonb_build_object('workflow_template_version_id',pg_temp.layoutid(),'stage_policies',jsonb_build_array(jsonb_build_object('step_key','s1','kind',case when p_early then 'approval' else 'recommendation' end,'approved',case when p_early then 'complete' else 'advance' end,'rejected','complete'),'{"step_key":"s2","kind":"approval","approved":"complete","rejected":"complete"}'::jsonb)),'schedule','{"rule_type":"none","rule_config":{},"maximum_postponements":0}'::jsonb) $$;
insert into results values('type_request',jsonb_build_object('id',gen_random_uuid()));
insert into results values('type_a',qarar_governance.save_governance_bundle_draft_v2(null,null,(select (data->>'id')::uuid from results where name='type_request'),pg_temp.bundle('type_a',true)));
insert into results values('type_b',qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),pg_temp.bundle('type_b',false)));
insert into results values('auto_request',jsonb_build_object('id',gen_random_uuid()));
insert into results values('auto_type',qarar_governance.save_governance_bundle_draft_v2(null,null,(select (data->>'id')::uuid from results where name='auto_request'),pg_temp.bundle('unused',false)#-'{topic_type,code}'));
select matches((select data#>>'{reference_numbers,topic_type}' from results where name='auto_type'),'^TYP-[0-9]{4}-[0-9]{6,}$','automatic topic type has typed server reference');
select is((select t.code from qarar_governance.topic_types_v2 t where t.reference_number=(select data#>>'{reference_numbers,topic_type}' from results where name='auto_type') and t.organization_id='72000000-0000-0000-0000-000000000001'),lower(replace((select data#>>'{reference_numbers,topic_type}' from results where name='auto_type'),'-','_')),'internal code derives from same reference without extra sequence');
select is((qarar_governance.save_governance_bundle_draft_v2(null,null,(select (data->>'id')::uuid from results where name='auto_request'),pg_temp.bundle('unused',false)#-'{topic_type,code}')->>'idempotent_replay')::boolean,true,'automatic identity replay is stable');
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2(null,null,(select (data->>'id')::uuid from results where name='auto_request'),jsonb_set(pg_temp.bundle('unused',false)#-'{topic_type,code}','{topic_type,name_ar}','"محتوى مختلف"'))$$,'40001',null,'automatic identity rejects changed replay');
insert into results values('auto_update',qarar_governance.save_governance_bundle_draft_v2((select (data->>'bundle_id')::uuid from results where name='auto_type'),1,gen_random_uuid(),jsonb_set(pg_temp.bundle('unused',false)#-'{topic_type,code}','{topic_type,name_ar}','"اسم معدل"')));
select is((select data#>>'{reference_numbers,topic_type}' from results where name='auto_update'),(select data#>>'{reference_numbers,topic_type}' from results where name='auto_type'),'editing automatic type keeps reference');
select is((qarar_governance.save_governance_bundle_draft_v2(null,null,(select (data->>'id')::uuid from results where name='type_request'),pg_temp.bundle('type_a',true))->>'idempotent_replay')::boolean,true,'classification retry returns same independent policy');
select is((select count(distinct workflow_template_version_id)::integer from qarar_governance.topic_type_workflow_bindings_v2 where source_layout_version_id=pg_temp.layoutid()),3,'same council order produces isolated executable policies including automatic type');
select is((select count(*)::integer from qarar_governance.workflow_template_steps s join qarar_governance.topic_type_workflow_bindings_v2 b on b.workflow_template_version_id=s.workflow_template_version_id join qarar_governance.governance_bundles_v2 g on g.topic_type_version_id=b.topic_type_version_id where g.id=(select (data->>'bundle_id')::uuid from results where name='type_a')),1,'early completion is specific to first classification');
select is((select count(*)::integer from qarar_governance.workflow_template_steps s join qarar_governance.topic_type_workflow_bindings_v2 b on b.workflow_template_version_id=s.workflow_template_version_id join qarar_governance.governance_bundles_v2 g on g.topic_type_version_id=b.topic_type_version_id where g.id=(select (data->>'bundle_id')::uuid from results where name='type_b')),2,'other classification continues through both councils');
select is((select count(*)::integer from qarar_governance.workflow_template_steps where workflow_template_version_id=pg_temp.layoutid()),2,'shared council order remains unchanged');
select is((select count(*)::integer from jsonb_array_elements(qarar_governance.get_governance_authoring_options_v2()->'workflow_versions') x join qarar_governance.workflow_templates t on t.id=(x->>'template_id')::uuid where t.internal_topic_policy),0,'internal execution copies never pollute selectable shared routes');
-- Requirements authoring uses published source snapshots and date-only recurrence.
select pg_temp.actor('72000000-0000-0000-0000-000000000013');
insert into results values('source_policy',api_v2.admin_save_regulation_library_v2(null,'create','{"name_ar":"لائحة اختصاص المجلس"}',null,gen_random_uuid()));
create function pg_temp.source_command(p_action text,p_payload jsonb) returns jsonb language sql as $$ select api_v2.admin_save_regulation_library_v2((select (data#>>'{policy,id}')::uuid from results where name='source_policy'),p_action,p_payload,api_v2.admin_get_regulation_library_v2((select (data#>>'{policy,id}')::uuid from results where name='source_policy'))->>'revision',gen_random_uuid()) $$;
insert into results values('source_item',pg_temp.source_command('save_item',jsonb_build_object('version_id',(select data->>'selected_version_id' from results where name='source_policy'),'title_ar','اختصاص مراجعة البرامج','body_text','يختص المجلس بمراجعة واعتماد البرامج الأكاديمية.','item_type','article')));
select pg_temp.source_command('set_item_publication',jsonb_build_object('item_id',(select data->>'item_id' from results where name='source_item'),'version_id',(select data->>'selected_version_id' from results where name='source_policy'),'is_active',true));
create function pg_temp.requirements() returns jsonb language sql as $$ select jsonb_set(pg_temp.bundle('unused',false)#-'{topic_type,code}','{schedule}','{"rule_type":"monthly_week","rule_config":{"week":1,"starts_on":"2026-01-01","ends_on":"2026-12-31"},"maximum_postponements":0}')||jsonb_build_object('authoring',jsonb_build_object('scope_kind','councils','scope_ids',jsonb_build_array('72000000-0000-0000-0000-000000000041'),'source_item_ids',(select jsonb_build_array(i.id) from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id where v.policy_id=(select (data#>>'{policy,id}')::uuid from results where name='source_policy') and v.legal_status='effective' and i.item_type='article'),'required_attachment_count',2,'submission_mode','automatic_agenda')) $$;
select pg_temp.actor('72000000-0000-0000-0000-000000000010');
insert into results values('requirements_request',jsonb_build_object('id',gen_random_uuid()));
insert into results values('requirements',qarar_governance.save_governance_bundle_draft_v2(null,null,(select (data->>'id')::uuid from results where name='requirements_request'),pg_temp.requirements()));
select is((select (data#>>'{authoring,required_attachment_count}')::integer from results where name='requirements'),2,'attachment minimum persists on type, not source item');
select is((select data#>>'{authoring,submission_mode}' from results where name='requirements'),'automatic_agenda','agenda mode is saved without creating topics or meetings');
select is((qarar_governance.save_governance_bundle_draft_v2(null,null,(select (data->>'id')::uuid from results where name='requirements_request'),pg_temp.requirements())->>'idempotent_replay')::boolean,true,'requirements save replays full original payload');
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2(null,null,(select (data->>'id')::uuid from results where name='requirements_request'),jsonb_set(pg_temp.requirements(),'{authoring,required_attachment_count}','3'))$$,'40001',null,'changed requirements cannot reuse request key');
create function pg_temp.requirement_version() returns uuid language sql as $$ select topic_type_version_id from qarar_governance.governance_bundles_v2 where id=(select (data->>'bundle_id')::uuid from results where name='requirements') $$;
select ok(qarar_governance.topic_type_origin_allowed_v2(pg_temp.requirement_version(),'72000000-0000-0000-0000-000000000041'),'selected origin is eligible');
select ok(not qarar_governance.topic_type_origin_allowed_v2(pg_temp.requirement_version(),'72000000-0000-0000-0000-000000000042'),'other origin excluded despite same institution');
select is((select count(*)::integer from qarar_governance.topic_type_authorities_v2 a join qarar_governance.legal_authorities_v2 l on l.id=a.legal_authority_id where a.topic_type_version_id=pg_temp.requirement_version() and l.source_policy_item_id is not null and l.authority_text='يختص المجلس بمراجعة واعتماد البرامج الأكاديمية.'),1,'published regulation is linked as immutable source snapshot');
select is((qarar_governance.topic_schedule_window_v2('monthly_week','{"week":1,"starts_on":"2026-01-01","ends_on":"2026-12-31"}','2026-10-04')->>'due_on'),'2026-10-07','first monthly week is days 1 through 7');
select is(qarar_governance.topic_schedule_window_v2('monthly_week','{"week":1,"starts_on":"2026-01-01","ends_on":"2026-03-31"}','2026-10-04'),null::jsonb,'bounded recurrence stops outside configured period');
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),jsonb_set(pg_temp.requirements(),'{authoring,scope_ids}','["72000000-0000-0000-0000-000000000099"]'))$$,'22023',null,'invalid council rolls back entire aggregate');
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),jsonb_set(pg_temp.requirements(),'{authoring,source_item_ids}','["72000000-0000-0000-0000-000000000099"]'))$$,'22023',null,'invalid source rolls back entire aggregate');
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),jsonb_set(pg_temp.requirements(),'{authoring,source_item_ids}',jsonb_build_array((select data->>'item_id' from results where name='source_item'))))$$,'22023',null,'original draft source cannot replace its published snapshot');
insert into results values('count_before_failure',jsonb_build_object('count',(select count(*) from qarar_governance.governance_bundles_v2 where organization_id='72000000-0000-0000-0000-000000000001')));
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),jsonb_set(pg_temp.requirements(),'{authoring,required_attachment_count}','51'))$$,'22023',null,'invalid attachment count is rejected by database');
select is((select count(*)::integer from qarar_governance.governance_bundles_v2 where organization_id='72000000-0000-0000-0000-000000000001'),(select (data->>'count')::integer from results where name='count_before_failure'),'failed requirements do not leave a partial aggregate');
select throws_ok($$select qarar_governance.topic_schedule_window_v2('seasonal','{"month":2,"day":31,"starts_on":"2026-01-01"}','2026-01-01')$$,'22023',null,'impossible seasonal day rejected');
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),jsonb_set(pg_temp.requirements(),'{schedule}','{"rule_type":"none","rule_config":{},"maximum_postponements":0}'))$$,'22023',null,'automatic agenda mode requires a schedule');
select pg_temp.actor('72000000-0000-0000-0000-000000000011');
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),pg_temp.requirements())$$,'42501',null,'requirements authoring denied without edit permission');
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),pg_temp.bundle('unused',false)#-'{topic_type,code}')$$,'42501',null,'automatic identity requires contextual editing permission');
select throws_ok($$select api_v2.admin_get_route_designer_v2()$$,'42501',null,'unauthorized inventory denied');
select throws_ok($$select api_v2.admin_save_route_designer_v2(pg_temp.tid(),'save',pg_temp.spec(),pg_temp.revision(),gen_random_uuid())$$,'42501',null,'unauthorized save denied');
select pg_temp.actor('72000000-0000-0000-0000-000000000012');
select throws_ok($$select qarar_governance.save_governance_bundle_draft_v2((select (data->>'bundle_id')::uuid from results where name='auto_type'),2,gen_random_uuid(),pg_temp.bundle('unused',false)#-'{topic_type,code}')$$,'P0002',null,'automatic identity update rejects another organization');
select throws_ok($$select api_v2.admin_save_route_designer_v2(pg_temp.tid(),'save',pg_temp.spec(),'unknown',gen_random_uuid())$$,'P0002',null,'cross organization write denied');
select is(jsonb_array_length(api_v2.admin_get_route_designer_v2()->'items'),0,'cross organization inventory isolated');
select * from finish();
rollback;
