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
insert into results values('a',pg_temp.cmd('save_item',jsonb_build_object('version_id',pg_temp.vid(),'item_type','article','title_ar','البند الأول','body_text','النص الأول')));
insert into results values('b',pg_temp.cmd('save_item',jsonb_build_object('version_id',pg_temp.vid(),'item_type','clause','title_ar','البند الثاني','body_text','النص الثاني')));
insert into qarar_governance.policy_attachments(organization_id,policy_item_id,file_name,file_url,mime_type,created_by_user_id)
 values('70000000-0000-0000-0000-000000000001',(select (data->>'item_id')::uuid from results where name='a'),'source.pdf','https://example.test/source.pdf','application/pdf','70000000-0000-0000-0000-000000000010');
create function pg_temp.toggle(p_name text,p_active boolean) returns jsonb language sql as $$
 select pg_temp.cmd('set_item_publication',jsonb_build_object('version_id',pg_temp.vid(),'item_id',(select data->>'item_id' from results where name=p_name),'is_active',p_active))
$$;
select lives_ok($$select pg_temp.toggle('a',true)$$,'activate first item independently');
select is((select count(*)::integer from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id where v.policy_id=pg_temp.pid() and v.legal_status='effective'),1,'other unpublished item not included');
select is((select legal_status from qarar_governance.policy_versions where id=pg_temp.vid()),'draft','working draft stays editable');
select is((select count(*)::integer from qarar_governance.policy_attachments a join qarar_governance.policy_items i on i.id=a.policy_item_id join qarar_governance.policy_versions v on v.id=i.policy_version_id where v.policy_id=pg_temp.pid() and v.legal_status='effective'),1,'selected source attachment survives item publication');
select lives_ok($$select pg_temp.toggle('b',true)$$,'activate second item independently');
select is((select count(*)::integer from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id where v.policy_id=pg_temp.pid() and v.legal_status='effective'),2,'second activation preserves first item');
insert into results values('old_current',jsonb_build_object('id',(select id from qarar_governance.policy_versions where policy_id=pg_temp.pid() and legal_status='effective')));
select pg_temp.cmd('save_item',jsonb_build_object('version_id',pg_temp.vid(),'item_id',(select data->>'item_id' from results where name='a'),'item_type','article','title_ar','البند الأول','body_text','تعديل الأول'));
select pg_temp.cmd('save_item',jsonb_build_object('version_id',pg_temp.vid(),'item_id',(select data->>'item_id' from results where name='b'),'item_type','clause','title_ar','البند الثاني','body_text','تعديل الثاني'));
select lives_ok($$select pg_temp.toggle('a',true)$$,'publish only selected edit');
select is((select i.body_text from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id where v.policy_id=pg_temp.pid() and v.legal_status='effective' and i.title_ar='البند الأول'),'تعديل الأول','selected edit published');
select is((select i.body_text from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id where v.policy_id=pg_temp.pid() and v.legal_status='effective' and i.title_ar='البند الثاني'),'النص الثاني','other pending edit not published');
select is((select body_text from qarar_governance.policy_items where id=(select (data->>'item_id')::uuid from results where name='b')),'تعديل الثاني','other draft preserved');
select lives_ok($$select pg_temp.toggle('b',false)$$,'disable without publishing pending text');
select is((select i.body_text from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id where v.policy_id=pg_temp.pid() and v.legal_status='effective' and i.title_ar='البند الثاني'),'النص الثاني','disable retains published text not draft');
select is((select i.is_active from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id where v.policy_id=pg_temp.pid() and v.legal_status='effective' and i.title_ar='البند الثاني'),false,'disabled published state persisted');
select is((select body_text from qarar_governance.policy_items where policy_version_id=(select (data->>'id')::uuid from results where name='old_current') and title_ar='البند الأول'),'النص الأول','historical source text immutable');
select throws_ok($$select pg_temp.cmd('remove_item',jsonb_build_object('version_id',pg_temp.vid(),'item_id',(select data->>'item_id' from results where name='a')))$$,'23503',null,'published item cannot be deleted from working draft');
select lives_ok($$select pg_temp.toggle('a',false)$$,'last active item can be disabled');
select is((select count(*)::integer from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id where v.policy_id=pg_temp.pid() and v.legal_status='effective' and i.is_active),0,'no invented active item is required');
insert into results values('request',jsonb_build_object('revision',api_v2.admin_get_regulation_library_v2(pg_temp.pid())->>'revision','request_id',gen_random_uuid()));
create function pg_temp.replay() returns jsonb language sql as $$
 select api_v2.admin_save_regulation_library_v2(pg_temp.pid(),'set_item_publication',jsonb_build_object('version_id',pg_temp.vid(),'item_id',(select data->>'item_id' from results where name='a'),'is_active',true),(select data->>'revision' from results where name='request'),(select (data->>'request_id')::uuid from results where name='request'))
$$;
insert into results values('first_request',pg_temp.replay());
select is((pg_temp.replay()->>'idempotent_replay')::boolean,true,'selected-item retry replays receipt');
select throws_ok($$select api_v2.admin_save_regulation_library_v2(pg_temp.pid(),'set_item_publication',jsonb_build_object('version_id',pg_temp.vid(),'item_id',(select data->>'item_id' from results where name='b'),'is_active',true),(select data->>'revision' from results where name='request'),gen_random_uuid())$$,'PT409',null,'stale selected-item activation cannot overwrite a newer snapshot');
select pg_temp.actor('70000000-0000-0000-0000-000000000011');
select throws_ok($$select pg_temp.toggle('a',false)$$,'42501',null,'read-only actor denied');
select pg_temp.actor('70000000-0000-0000-0000-000000000012');
select throws_ok($$select pg_temp.toggle('a',false)$$,'P0002',null,'other tenant denied');
select * from finish();
rollback;
