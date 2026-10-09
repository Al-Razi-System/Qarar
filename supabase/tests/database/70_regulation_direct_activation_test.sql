begin;
create extension if not exists pgtap;
select no_plan();
insert into qarar_core.organizations(id,code,name_ar) values
 ('70000000-0000-0000-0000-000000000001','direct-library','النشر المباشر'),
 ('70000000-0000-0000-0000-000000000002','direct-other','مؤسسة أخرى');
insert into auth.users(id,email) values
 ('70000000-0000-0000-0000-000000000010','direct-manager@example.test'),
 ('70000000-0000-0000-0000-000000000011','direct-denied@example.test'),
 ('70000000-0000-0000-0000-000000000012','direct-other@example.test'),
 ('70000000-0000-0000-0000-000000000013','direct-system@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
 ('70000000-0000-0000-0000-000000000010','70000000-0000-0000-0000-000000000001','direct-manager@example.test','مدير',true),
 ('70000000-0000-0000-0000-000000000011','70000000-0000-0000-0000-000000000001','direct-denied@example.test','قارئ',false),
 ('70000000-0000-0000-0000-000000000012','70000000-0000-0000-0000-000000000002','direct-other@example.test','مدير آخر',true),
 ('70000000-0000-0000-0000-000000000013','70000000-0000-0000-0000-000000000001','direct-system@example.test','مدير نظام غير مشارك',true);
create function pg_temp.actor(p_id uuid) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',p_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated','aal','aal2')::text,true);
end $$;
select pg_temp.actor('70000000-0000-0000-0000-000000000010');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
 ('70000000-0000-0000-0000-000000000031','70000000-0000-0000-0000-000000000001','direct-council','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
 ('70000000-0000-0000-0000-000000000041','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000031','direct_council','مجلس الاختبار','inactive');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values
 ('70000000-0000-0000-0000-000000000021','70000000-0000-0000-0000-000000000001','direct-editor','مدير لوائح','organization'),
 ('70000000-0000-0000-0000-000000000022','70000000-0000-0000-0000-000000000001','direct-reader','قارئ لوائح','organization');
insert into qarar_iam.permissions(organization_id,code,module,action,context_scope,name_ar) values
 ('70000000-0000-0000-0000-000000000001','governance.policies.read','governance','read','organization','قراءة اللوائح'),
 ('70000000-0000-0000-0000-000000000001','governance.policies.manage','governance','manage','organization','إدارة اللوائح') on conflict(organization_id,code) do nothing;
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id)
 select organization_id,'70000000-0000-0000-0000-000000000021',id from qarar_iam.permissions
 where organization_id='70000000-0000-0000-0000-000000000001' and code in ('governance.policies.read','governance.policies.manage');
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id)
 select organization_id,'70000000-0000-0000-0000-000000000022',id from qarar_iam.permissions
 where organization_id='70000000-0000-0000-0000-000000000001' and code='governance.policies.read';
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id) values
 ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000010','70000000-0000-0000-0000-000000000041','70000000-0000-0000-0000-000000000021'),
 ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000011','70000000-0000-0000-0000-000000000041','70000000-0000-0000-0000-000000000022');
update qarar_iam.users set is_system_admin=false where id='70000000-0000-0000-0000-000000000010';
select ok(not qarar_iam.has_permission('governance.policies.approve',null),'author has manage but no independent approval permission');
create temporary table results(name text primary key,data jsonb);
insert into results values('create',api_v2.admin_save_regulation_library_v2(null,'create','{"name_ar":"لائحة مباشرة"}',null,gen_random_uuid()));
create function pg_temp.pid() returns uuid language sql as $$ select (data->'policy'->>'id')::uuid from results where name='create' $$;
create function pg_temp.vid() returns uuid language sql as $$ select (data->>'selected_version_id')::uuid from results where name='create' $$;
create function pg_temp.cmd(p_action text,p_payload jsonb) returns jsonb language sql as $$
 select api_v2.admin_save_regulation_library_v2(pg_temp.pid(),p_action,p_payload,api_v2.admin_get_regulation_library_v2(pg_temp.pid())->>'revision',gen_random_uuid())
$$;
select throws_ok($$select pg_temp.cmd('publish',jsonb_build_object('version_id',pg_temp.vid()))$$,'23514',null,'empty publication rejected');
insert into results values('item',pg_temp.cmd('save_item',jsonb_build_object('version_id',pg_temp.vid(),'item_type','article','title_ar','قبول الطلاب','body_text','النص الأصلي')));
insert into qarar_governance.policy_attachments(organization_id,policy_item_id,file_name,file_url,mime_type,created_by_user_id)
 values('70000000-0000-0000-0000-000000000001',(select (data->>'item_id')::uuid from results where name='item'),'source.pdf','https://example.test/source.pdf','application/pdf','70000000-0000-0000-0000-000000000010');
select lives_ok($$select pg_temp.cmd('publish',jsonb_build_object('version_id',pg_temp.vid()))$$,'author publishes directly without reviewer');
select is((select legal_status from qarar_governance.policy_versions where id=pg_temp.vid()),'effective','direct publication is effective');
select is((select approved_by_user_id from qarar_governance.policy_versions where id=pg_temp.vid()),'70000000-0000-0000-0000-000000000010'::uuid,'same actor recorded');
select is((select automation_status from qarar_governance.policy_versions where id=pg_temp.vid()),'not_configured','publication does not claim engine readiness');
insert into results values('disabled',pg_temp.cmd('set_item_active',jsonb_build_object('version_id',pg_temp.vid(),'item_id',(select data->>'item_id' from results where name='item'),'is_active',false)));
select is((select is_active from qarar_governance.policy_items where id=(select (data->>'item_id')::uuid from results where name='disabled')),false,'last item can be disabled directly');
select is((select is_active from qarar_governance.policy_items where id=(select (data->>'item_id')::uuid from results where name='item')),true,'historical item status remains unchanged');
select is((select official_text from qarar_governance.policy_items where id=(select (data->>'item_id')::uuid from results where name='disabled')),'النص الأصلي','legal text inherited unchanged');
select is((select count(*)::integer from qarar_governance.policy_attachments where policy_item_id=(select (data->>'item_id')::uuid from results where name='disabled')),1,'source attachment inherited during toggle');
select is((select legal_status from qarar_governance.policy_versions where id=pg_temp.vid()),'expired','prior source retained as history');
select throws_ok($$select pg_temp.cmd('set_item_active',jsonb_build_object('version_id',pg_temp.vid(),'item_id',(select data->>'item_id' from results where name='item'),'is_active',false))$$,'PT409',null,'historical version cannot be toggled');
insert into results values('enabled',pg_temp.cmd('set_item_active',jsonb_build_object('version_id',(select data->>'selected_version_id' from results where name='disabled'),'item_id',(select data->>'item_id' from results where name='disabled'),'is_active',true)));
select is((select is_active from qarar_governance.policy_items where id=(select (data->>'item_id')::uuid from results where name='enabled')),true,'same user reactivates directly');
select is((select count(*)::integer from qarar_governance.policy_versions where policy_id=pg_temp.pid() and legal_status='effective'),1,'only one current source');
select lives_ok($$select pg_temp.cmd('set_item_active',jsonb_build_object('version_id',(select data->>'selected_version_id' from results where name='enabled'),'item_id',(select data->>'item_id' from results where name='enabled'),'is_active',true))$$,'already active target is a safe no-op');
select is((select count(*)::integer from qarar_governance.policy_versions where policy_id=pg_temp.pid()),3,'no-op does not produce another source version');
select throws_ok($$select pg_temp.cmd('set_item_active',jsonb_build_object('version_id',(select data->>'selected_version_id' from results where name='enabled'),'item_id',(select data->>'item_id' from results where name='enabled'),'is_active','false'))$$,'22023',null,'string boolean rejected');
select pg_temp.actor('70000000-0000-0000-0000-000000000011');
select lives_ok($$select api_v2.admin_get_regulation_library_v2(pg_temp.pid())$$,'reader still sees source');
select throws_ok($$select pg_temp.cmd('publish',jsonb_build_object('version_id',pg_temp.vid()))$$,'42501',null,'unprivileged mutation denied');
select pg_temp.actor('70000000-0000-0000-0000-000000000012');
select throws_ok($$select pg_temp.cmd('publish',jsonb_build_object('version_id',pg_temp.vid()))$$,'P0002',null,'cross organization denied');
select pg_temp.actor('70000000-0000-0000-0000-000000000010');
insert into results values('edit',pg_temp.cmd('begin_edit','{}'));
select throws_ok($$select pg_temp.cmd('set_item_active',jsonb_build_object('version_id',(select data->>'selected_version_id' from results where name='enabled'),'item_id',(select data->>'item_id' from results where name='enabled'),'is_active',false))$$,'PT409',null,'current source toggle cannot silently publish pending changes');
select lives_ok($$select pg_temp.cmd('submit',jsonb_build_object('version_id',(select data->>'selected_version_id' from results where name='edit')))$$,'existing review queue can be reproduced');
select lives_ok($$select pg_temp.cmd('publish',jsonb_build_object('version_id',(select data->>'selected_version_id' from results where name='edit')))$$,'author can directly publish an existing library review queue');
insert into results values('replay_input',jsonb_build_object('revision',api_v2.admin_get_regulation_library_v2(pg_temp.pid())->>'revision','request',gen_random_uuid(),'payload',jsonb_build_object('version_id',(select data->>'selected_version_id' from results where name='edit'),'item_id',(select data->'policy'->'versions'->0->'items'->0->>'id' from results where name='edit'),'is_active',false)));
insert into results values('first_toggle',api_v2.admin_save_regulation_library_v2(pg_temp.pid(),'set_item_active',(select data->'payload' from results where name='replay_input'),(select data->>'revision' from results where name='replay_input'),(select (data->>'request')::uuid from results where name='replay_input')));
select is((api_v2.admin_save_regulation_library_v2(pg_temp.pid(),'set_item_active',(select data->'payload' from results where name='replay_input'),(select data->>'revision' from results where name='replay_input'),(select (data->>'request')::uuid from results where name='replay_input'))->>'idempotent_replay')::boolean,true,'uncertain toggle retry uses receipt without another clone');
select throws_ok($$select api_v2.admin_save_regulation_library_v2(pg_temp.pid(),'set_item_active',(select data->'payload' from results where name='replay_input'),(select data->>'revision' from results where name='replay_input'),gen_random_uuid())$$,'PT409',null,'stale toggle rejected atomically');
insert into results values('stale_draft',pg_temp.cmd('begin_edit','{}'));
select qarar_governance.admin_create_policy_version(pg_temp.pid(),null,null);
select throws_ok($$select pg_temp.cmd('publish',jsonb_build_object('version_id',(select data->>'selected_version_id' from results where name='stale_draft')))$$,'PT409',null,'older draft cannot replace newer source work');
select ok(not (api_v2.admin_get_regulation_library_v2(pg_temp.pid())->'direct_activation_version_ids' ? (select data->>'selected_version_id' from results where name='stale_draft')),'UI capability excludes stale draft publication');
select ok(not has_function_privilege('authenticated','qarar_governance.admin_save_regulation_library_v2(uuid,text,jsonb,text,uuid)','execute'),'client cannot bypass API boundary');
select * from finish();
rollback;
