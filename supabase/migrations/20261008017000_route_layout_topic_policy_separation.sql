begin;
alter table qarar_governance.workflow_template_versions add column layout_only boolean not null default false;
alter table qarar_governance.workflow_templates add column internal_topic_policy boolean not null default false;
alter table qarar_governance.topic_type_workflow_bindings_v2
 add column source_layout_version_id uuid,
 add column stage_policies jsonb,
 add constraint topic_binding_layout_fk foreign key(source_layout_version_id,organization_id) references qarar_governance.workflow_template_versions(id,organization_id),
 add constraint topic_binding_policy_pair check((source_layout_version_id is null)=(stage_policies is null)),
 add constraint topic_binding_policy_array check(stage_policies is null or jsonb_typeof(stage_policies)='array');

create function qarar_governance.guard_executable_route_version() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from qarar_governance.workflow_template_versions where id=new.workflow_template_version_id and layout_only) then
  raise exception using errcode='23514',message='ROUTE_LAYOUT_NOT_EXECUTABLE'; end if;
 return new;
end $$;
create trigger workflow_instance_executable_guard before insert or update of workflow_template_version_id on qarar_governance.workflow_instances
for each row execute function qarar_governance.guard_executable_route_version();

create function qarar_governance.admin_get_route_layouts_v2() returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; items jsonb;
begin
 result:=qarar_governance.admin_get_route_designer_v2();
 select coalesce(jsonb_agg(t||jsonb_build_object('layout_only',v.layout_only,'payload',case when v.layout_only then v.designer_payload else null end,
 'activation_issues',case when v.layout_only then '[]'::jsonb else t->'activation_issues' end) order by t->>'name_ar'),'[]') into items
 from jsonb_array_elements(result->'items') t join qarar_governance.workflow_templates w on w.id=(t->>'id')::uuid
 left join qarar_governance.workflow_template_versions v on v.id=(t->>'version_id')::uuid where not w.internal_topic_policy;
 return result||jsonb_build_object('items',items);
end $$;

create function qarar_governance.admin_save_route_layout_v2(p_template_id uuid,p_action text,p_payload jsonb,p_expected_revision text,p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); result jsonb; t jsonb; v uuid; tid uuid:=p_template_id;
 normalized jsonb; nodes jsonb:='[]'; node jsonb; following text; pos integer:=0; n integer; fp text; receipt qarar_governance.workflow_template_versions%rowtype;
begin
 perform qarar_iam.assert_permission('governance.workflows.manage',null);
 if p_action is null or p_action not in ('save','activate') or p_client_request_id is null then raise exception using errcode='22023',message='ROUTE_INVALID_COMMAND'; end if;
 if tid is not null then
  perform 1 from qarar_governance.workflow_templates where id=tid and organization_id=o and not internal_topic_policy for update;
  if not found then raise exception using errcode='P0002',message='ROUTE_NOT_FOUND'; end if;
  select x into t from jsonb_array_elements(qarar_governance.admin_get_route_layouts_v2()->'items') x where x->>'id'=tid::text;
  if not coalesce((t->>'layout_only')::boolean,false) then raise exception using errcode='55000',message='ROUTE_LEGACY_READ_ONLY'; end if;
 end if;
 if p_action='save' then
  if jsonb_typeof(p_payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('name_ar','description','steps'))
   or jsonb_typeof(p_payload->'steps') is distinct from 'array' then raise exception using errcode='22023',message='ROUTE_INVALID_PAYLOAD'; end if;
  n:=jsonb_array_length(p_payload->'steps');
  for node in select value from jsonb_array_elements(p_payload->'steps') loop
   if jsonb_typeof(node) is distinct from 'object' or exists(select 1 from jsonb_object_keys(node) k where k not in ('key','target_kind','target_id')) then
    raise exception using errcode='22023',message='ROUTE_POLICY_BELONGS_TO_TOPIC_TYPE'; end if;
   following:=p_payload->'steps'->(pos+1)->>'key'; pos:=pos+1;
   nodes:=nodes||jsonb_build_array(node||jsonb_build_object('kind','discussion','approved',coalesce(following,'complete'),'rejected','reject','returned',''));
  end loop;
  normalized:=p_payload||jsonb_build_object('steps',nodes);
  result:=qarar_governance.admin_save_route_designer_v2(tid,'save',normalized,p_expected_revision,p_client_request_id);
  v:=(result->>'saved_version_id')::uuid;tid:=(result->>'saved_id')::uuid;
  if not coalesce((result->>'idempotent_replay')::boolean,false) then
   -- The graph is a neutral ordering projection, never an executable decision policy.
   delete from qarar_governance.workflow_template_transitions where workflow_template_version_id=v;
   update qarar_governance.workflow_template_steps set allowed_outcomes=array['completed'],responsibility='present' where workflow_template_version_id=v;
   insert into qarar_governance.workflow_template_transitions(organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code,transition_type)
    select o,v,s.id,nxt.id,'completed',case when nxt.id is null then 'complete' else 'forward' end
    from qarar_governance.workflow_template_steps s left join qarar_governance.workflow_template_steps nxt on nxt.workflow_template_version_id=v and nxt.sequence_no=s.sequence_no+1
    where s.workflow_template_version_id=v;
   update qarar_governance.workflow_template_versions set layout_only=true,designer_payload=p_payload where id=v;
   perform qarar_governance.validate_workflow_template_version(v);
  end if;
 else
  if tid is null then raise exception using errcode='22023',message='ROUTE_SAVE_FIRST'; end if;
  fp:=md5(jsonb_build_object('id',tid,'action',p_action,'payload',p_payload,'revision',p_expected_revision)::text);
  perform pg_advisory_xact_lock(hashtextextended(o::text||actor::text||p_client_request_id::text,0));
  select * into receipt from qarar_governance.workflow_template_versions where organization_id=o and activated_by_user_id=actor and designer_activation_request_id=p_client_request_id;
  if receipt.id is not null then
   if receipt.designer_activation_fingerprint is distinct from fp then raise exception using errcode='PT409',message='ROUTE_REQUEST_CONFLICT'; end if;
   return qarar_governance.admin_get_route_layouts_v2()||jsonb_build_object('saved_id',tid,'saved_version_id',receipt.id,'idempotent_replay',true);
  end if;
  if t->>'revision' is distinct from p_expected_revision then raise exception using errcode='PT409',message='ROUTE_STALE'; end if;
  v:=(t->>'version_id')::uuid;
  perform qarar_governance.admin_activate_workflow_template_version(v);
  update qarar_governance.workflow_template_versions set designer_activation_request_id=p_client_request_id,designer_activation_fingerprint=fp where id=v;
  perform qarar_audit.append_audit_log(o,'governance.route_layout.activate','workflow_templates',tid,jsonb_build_object('version_id',v,'request_id',p_client_request_id));
  result:=jsonb_build_object('idempotent_replay',false);
 end if;
 return qarar_governance.admin_get_route_layouts_v2()||jsonb_build_object('saved_id',tid,'saved_version_id',v,'idempotent_replay',result->'idempotent_replay');
end $$;

alter function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) rename to save_governance_bundle_legacy_v2;
create function qarar_governance.save_governance_bundle_draft_v2(p_bundle_id uuid,p_expected_lock_version integer,p_client_request_id uuid,p_bundle jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); layout_id uuid; layout qarar_governance.workflow_template_versions%rowtype;
 policies jsonb:=p_bundle->'workflow'->'stage_policies'; fp text; receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype;
 tid uuid; vid uuid; ref text; steps uuid[]:=array[]::uuid[]; s record; policy jsonb; result jsonb; clean jsonb; version_id uuid; total integer; i integer; dest uuid; outcome text; behavior text;
begin
 perform qarar_iam.assert_permission('governance.model.edit',null);
 layout_id:=(p_bundle->'workflow'->>'workflow_template_version_id')::uuid;
 select * into layout from qarar_governance.workflow_template_versions where id=layout_id and organization_id=o;
 if not coalesce(layout.layout_only,false) then
  if policies is not null then raise exception using errcode='22023',message='اختر مسار ترتيب جديدًا لإعداد سياسة مستقلة لهذا التصنيف'; end if;
  return qarar_governance.save_governance_bundle_legacy_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,p_bundle);
 end if;
 if p_client_request_id is null or jsonb_typeof(policies) is distinct from 'array' then raise exception using errcode='22023',message='أكمل سياسة مراحل تصنيف الموضوع'; end if;
 fp:=encode(pg_catalog.sha256(convert_to(coalesce(p_bundle_id::text,'new')||':'||coalesce(p_expected_lock_version::text,'new')||':'||p_bundle::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||actor::text||':'||p_client_request_id::text,0));
 select * into receipt from qarar_governance.governance_bundle_command_receipts_v2 where organization_id=o and actor_user_id=actor and command_name='save_governance_bundle_draft_v2' and client_request_id=p_client_request_id;
 if receipt.id is not null then
  if receipt.request_fingerprint<>fp then raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف'; end if;
  return receipt.response_payload||jsonb_build_object('idempotent_replay',true);
 end if;
 if layout.status<>'active' or layout.validation_status<>'valid' then raise exception using errcode='22023',message='اختر مسار ترتيب متاحًا ومتحققًا منه'; end if;
 select count(*) into total from qarar_governance.workflow_template_steps where workflow_template_version_id=layout_id;
 if jsonb_array_length(policies)<>total then raise exception using errcode='22023',message='حدد سياسة لكل مرحلة دون تكرار'; end if;
 ref:=qarar_governance.next_v2_reference('WFL');
 insert into qarar_governance.workflow_templates(organization_id,code,reference_number,name_ar,created_by_user_id,internal_topic_policy)
  values(o,lower(replace(ref,'-','_')),ref,'مسار تنفيذي: '||left(p_bundle->'topic_type'->>'name_ar',270),actor,true) returning id into tid;
 insert into qarar_governance.workflow_template_versions(organization_id,workflow_template_id,version_no,created_by_user_id)
  values(o,tid,1,actor) returning id into vid;
 for s in select * from qarar_governance.workflow_template_steps where workflow_template_version_id=layout_id order by sequence_no loop
  select x into policy from jsonb_array_elements(policies) x where x->>'step_key'=layout.designer_payload->'steps'->(s.sequence_no-1)->>'key';
  if policy is null or (select count(*) from jsonb_array_elements(policies) x where x->>'step_key'=policy->>'step_key')<>1
   or exists(select 1 from jsonb_object_keys(policy) k where k not in ('step_key','kind','approved','rejected'))
   or coalesce(policy->>'kind','') not in ('review','discussion','recommendation','approval')
   or coalesce(policy->>'approved','') not in ('advance','complete')
   or coalesce(policy->>'rejected','') not in ('advance','complete','return_previous')
   or (s.sequence_no=1 and policy->>'rejected'='return_previous')
   or (s.sequence_no=total and (policy->>'approved'='advance' or policy->>'rejected'='advance')) then
   raise exception using errcode='22023',message='راجع عمل المجلس ونتيجة القبول والرفض لكل مرحلة'; end if;
  insert into qarar_governance.workflow_template_steps(organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,governance_class_id,is_initial,is_terminal,allowed_outcomes)
   values(o,vid,s.step_code,s.name_ar,s.sequence_no,policy->>'kind',case policy->>'kind' when 'review' then 'review' when 'recommendation' then 'recommend' when 'approval' then 'final_approve' else 'discuss' end,
    s.governance_unit_id,s.governance_class_id,s.is_initial,policy->>'approved'='complete',array['approved','rejected']) returning id into version_id;
  steps:=steps||version_id;
 end loop;
 for i in 1..total loop
  select x into policy from jsonb_array_elements(policies) x where x->>'step_key'=layout.designer_payload->'steps'->(i-1)->>'key';
  foreach outcome in array array['approved','rejected'] loop
   behavior:=policy->>outcome; dest:=case behavior when 'advance' then steps[i+1] when 'return_previous' then steps[i-1] else null end;
   insert into qarar_governance.workflow_template_transitions(organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code,transition_type)
    values(o,vid,steps[i],dest,outcome,case behavior when 'advance' then 'forward' when 'return_previous' then 'return' else case outcome when 'rejected' then 'reject' else 'complete' end end);
  end loop;
 end loop;
 update qarar_governance.workflow_template_versions set allow_cycles=exists(select 1 from jsonb_array_elements(policies) p where p->>'rejected'='return_previous') where id=vid;
 -- A classification may end before the shared layout's final council. Retain
 -- its full policy specification but execute only the reachable prefix.
 for i in 1..total loop
  select x into policy from jsonb_array_elements(policies) x where x->>'step_key'=layout.designer_payload->'steps'->(i-1)->>'key';
  if policy->>'approved'='complete' and policy->>'rejected'='complete' then
   delete from qarar_governance.workflow_template_transitions where workflow_template_version_id=vid and from_step_id in(select id from qarar_governance.workflow_template_steps where workflow_template_version_id=vid and sequence_no>i);
   delete from qarar_governance.workflow_template_steps where workflow_template_version_id=vid and sequence_no>i;
   exit;
  end if;
 end loop;
 if not (qarar_governance.validate_workflow_template_version(vid)->>'valid')::boolean then
  raise exception using errcode='23514',message='سياسة التصنيف لا تنتج مسارًا مكتملًا؛ راجع النتائج'; end if;
 update qarar_governance.workflow_template_versions set status='active',activated_by_user_id=actor,activated_at=now() where id=vid;
 clean:=jsonb_set(p_bundle,'{workflow}',jsonb_build_object('workflow_template_version_id',vid));
 result:=qarar_governance.save_governance_bundle_legacy_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,clean);
 select topic_type_version_id into version_id from qarar_governance.governance_bundles_v2 where id=(result->>'bundle_id')::uuid;
 update qarar_governance.topic_type_workflow_bindings_v2 set source_layout_version_id=layout_id,stage_policies=policies where topic_type_version_id=version_id and workflow_template_version_id=vid;
 update qarar_governance.governance_bundle_command_receipts_v2 set request_fingerprint=fp where organization_id=o and actor_user_id=actor and command_name='save_governance_bundle_draft_v2' and client_request_id=p_client_request_id;
 return result;
end $$;

alter function qarar_governance.get_governance_authoring_options_v2() rename to get_governance_authoring_options_legacy_v2;
create function qarar_governance.get_governance_authoring_options_v2() returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; workflows jsonb;
begin
 result:=qarar_governance.get_governance_authoring_options_legacy_v2();
 select coalesce(jsonb_agg(x||jsonb_build_object('layout_only',v.layout_only,'steps',coalesce((select jsonb_agg(s||jsonb_build_object('step_key',v.designer_payload->'steps'->((s->>'sequence_no')::integer-1)->>'key') order by (s->>'sequence_no')::integer) from jsonb_array_elements(x->'steps') s),'[]'))),'[]') into workflows
 from jsonb_array_elements(result->'workflow_versions') x join qarar_governance.workflow_template_versions v on v.id=(x->>'id')::uuid
 join qarar_governance.workflow_templates t on t.id=v.workflow_template_id where not t.internal_topic_policy;
 return result||jsonb_build_object('workflow_versions',workflows);
end $$;

do $$ declare f record; begin
 for f in select p.oid, p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p where p.pronamespace='qarar_governance'::regnamespace and p.proname in ('guard_executable_route_version','admin_get_route_layouts_v2','admin_save_route_layout_v2','save_governance_bundle_draft_v2','get_governance_authoring_options_v2') loop
  execute format('alter function qarar_governance.%I(%s) owner to qarar_governance_executor',f.proname,f.args);
  execute format('revoke all on function qarar_governance.%I(%s) from public,anon,authenticated,service_role',f.proname,f.args);
  execute format('grant execute on function qarar_governance.%I(%s) to qarar_api_executor,qarar_governance_executor',f.proname,f.args);
 end loop;
end $$;
create function api_v2.admin_get_route_layouts_v2() returns jsonb language sql stable security definer set search_path=pg_catalog as $$ select qarar_governance.admin_get_route_layouts_v2() $$;
create function api_v2.admin_save_route_layout_v2(p_template_id uuid,p_action text,p_payload jsonb,p_expected_revision text,p_client_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$ select qarar_governance.admin_save_route_layout_v2($1,$2,$3,$4,$5) $$;
alter function api_v2.admin_get_route_layouts_v2() owner to qarar_api_executor;
alter function api_v2.admin_save_route_layout_v2(uuid,text,jsonb,text,uuid) owner to qarar_api_executor;
revoke all on function api_v2.admin_get_route_layouts_v2(),api_v2.admin_save_route_layout_v2(uuid,text,jsonb,text,uuid) from public,anon,service_role;
grant execute on function api_v2.admin_get_route_layouts_v2(),api_v2.admin_save_route_layout_v2(uuid,text,jsonb,text,uuid) to authenticated;
update qarar_architecture.function_registry r set function_name=p.proname from pg_proc p where r.function_oid=p.oid and p.proname in ('save_governance_bundle_legacy_v2','get_governance_authoring_options_legacy_v2');
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='qarar_governance' and p.proname in ('guard_executable_route_version','admin_get_route_layouts_v2','admin_save_route_layout_v2','save_governance_bundle_draft_v2','get_governance_authoring_options_v2');
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_governance',p.proname,pg_get_function_identity_arguments(p.oid),'governance','authenticated' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v2' and p.proname in ('admin_get_route_layouts_v2','admin_save_route_layout_v2');
notify pgrst,'reload schema';
commit;
