begin;
alter table qarar_governance.workflow_templates add column reference_number text;
create unique index workflow_reference_uidx on qarar_governance.workflow_templates(organization_id,reference_number) where reference_number is not null;
alter table qarar_governance.workflow_template_versions
 add column designer_payload jsonb,
 add column designer_request_id uuid,
 add column designer_fingerprint text,
 add column designer_activation_request_id uuid,
 add column designer_activation_fingerprint text;
create unique index workflow_designer_request_uidx on qarar_governance.workflow_template_versions(organization_id,created_by_user_id,designer_request_id) where designer_request_id is not null;
create unique index workflow_designer_activation_uidx on qarar_governance.workflow_template_versions(organization_id,activated_by_user_id,designer_activation_request_id) where designer_activation_request_id is not null;

create function qarar_governance.admin_get_route_designer_v2() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); inventory jsonb; items jsonb;
begin
 perform qarar_iam.assert_permission('governance.workflows.manage',null);
 inventory:=qarar_governance.admin_list_workflow_templates();
 select coalesce(jsonb_agg(t||jsonb_build_object('revision',md5(t::text),'reference_number',w.reference_number,
  'payload',v.designer_payload,'version_id',v.id,'version_status',v.status,'validation_errors',v.validation_errors)
  order by t->>'name_ar'),'[]') into items
 from jsonb_array_elements(inventory->'items') t
 join qarar_governance.workflow_templates w on w.id=(t->>'id')::uuid
 left join lateral (select * from qarar_governance.workflow_template_versions x where x.workflow_template_id=w.id order by version_no desc limit 1) v on true;
 return jsonb_build_object('items',items,'councils',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'status',u.status) order by u.name_ar)
 from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id
 where u.organization_id=o and t.is_council_type and u.status<>'archived'),'[]'),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name_ar',c.name_ar) order by c.governance_level,c.name_ar)
 from qarar_governance.governance_unit_classes c where c.organization_id=o and c.is_active),'[]'));
end $$;

create function qarar_governance.admin_save_route_designer_v2(p_template_id uuid,p_action text,p_payload jsonb,p_expected_revision text,p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); tid uuid:=p_template_id; vid uuid;
 receipt qarar_governance.workflow_template_versions%rowtype; inventory jsonb; item jsonb; fp text;
 spec jsonb; node jsonb; edge record; node_ids jsonb:='{}'; sid uuid; target uuid; idx integer:=0; total integer;
 next_version integer; ref text; allowed text[]; kind text; dest text; validation jsonb;
begin
 perform qarar_iam.assert_permission('governance.workflows.manage',null);
 if actor is null or p_client_request_id is null or p_action not in ('save','activate') or p_action is null
  or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='ROUTE_INVALID_COMMAND'; end if;
 fp:=md5(jsonb_build_object('id',p_template_id,'action',p_action,'payload',p_payload,'revision',p_expected_revision)::text);
 perform pg_advisory_xact_lock(hashtextextended(o::text||actor::text||p_client_request_id::text,0));
 select * into receipt from qarar_governance.workflow_template_versions v where v.organization_id=o and
  ((v.created_by_user_id=actor and v.designer_request_id=p_client_request_id) or (v.activated_by_user_id=actor and v.designer_activation_request_id=p_client_request_id));
 if receipt.id is not null then
  if fp is distinct from (case when p_action='save' then receipt.designer_fingerprint else receipt.designer_activation_fingerprint end)
   or (p_action='save' and receipt.designer_request_id<>p_client_request_id)
   or (p_action='activate' and receipt.designer_activation_request_id is distinct from p_client_request_id)
   then raise exception using errcode='PT409',message='ROUTE_REQUEST_CONFLICT'; end if;
  return qarar_governance.admin_get_route_designer_v2()||jsonb_build_object('saved_id',receipt.workflow_template_id,'saved_version_id',receipt.id,'idempotent_replay',true);
 end if;
 if tid is not null then
  perform 1 from qarar_governance.workflow_templates where id=tid and organization_id=o and status='active' for update;
  if not found then raise exception using errcode='P0002',message='ROUTE_NOT_FOUND'; end if;
  inventory:=qarar_governance.admin_get_route_designer_v2();
  select t into item from jsonb_array_elements(inventory->'items') t where t->>'id'=tid::text;
  if p_expected_revision is distinct from item->>'revision' then raise exception using errcode='PT409',message='ROUTE_STALE'; end if;
  if item->'payload'='null'::jsonb then raise exception using errcode='55000',message='ROUTE_LEGACY_READ_ONLY'; end if;
 end if;
 if p_action='activate' then
  if tid is null then raise exception using errcode='22023',message='ROUTE_SAVE_FIRST'; end if;
  vid:=(item->>'version_id')::uuid;
  -- The template can be authored while councils are inactive. Explicit destinations
  -- must be operational before publication; class resolution remains topic-scoped.
  if exists(select 1 from qarar_governance.workflow_template_steps s join qarar_core.governance_units u on u.id=s.governance_unit_id
    where s.workflow_template_version_id=vid and u.status<>'active') then
    raise exception using errcode='55000',message='ROUTE_COUNCIL_INACTIVE'; end if;
  if exists(select 1 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=vid and s.governance_class_id is not null
    and not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types ut on ut.id=u.unit_type_id
      where u.organization_id=o and ut.is_council_type and u.status='active' and u.governance_class_id=s.governance_class_id)) then
    raise exception using errcode='55000',message='ROUTE_CLASS_UNAVAILABLE'; end if;
  perform qarar_governance.admin_activate_workflow_template_version(vid);
  update qarar_governance.workflow_template_versions set designer_activation_request_id=p_client_request_id,designer_activation_fingerprint=fp where id=vid;
 else
  spec:=p_payload;
  if exists(select 1 from jsonb_object_keys(spec) k where k not in ('name_ar','description','steps'))
   or length(btrim(coalesce(spec->>'name_ar','')))<3 or length(spec->>'name_ar')>300
   or jsonb_typeof(spec->'steps') is distinct from 'array' then raise exception using errcode='22023',message='ROUTE_INVALID_PAYLOAD'; end if;
  total:=jsonb_array_length(spec->'steps');
  if total<1 or total>30 then raise exception using errcode='22023',message='ROUTE_STAGE_COUNT'; end if;
  if tid is null then
   ref:=qarar_governance.next_v2_reference('WFL');
   insert into qarar_governance.workflow_templates(organization_id,code,reference_number,name_ar,description,created_by_user_id)
    values(o,lower(replace(ref,'-','_')),ref,btrim(spec->>'name_ar'),nullif(btrim(spec->>'description'),''),actor) returning id into tid;
   next_version:=1;
  else
   update qarar_governance.workflow_templates set name_ar=btrim(spec->>'name_ar'),description=nullif(btrim(spec->>'description'),'') where id=tid;
   select max(version_no)+1 into next_version from qarar_governance.workflow_template_versions where workflow_template_id=tid;
  end if;
  insert into qarar_governance.workflow_template_versions(organization_id,workflow_template_id,version_no,created_by_user_id,designer_payload,designer_request_id,designer_fingerprint,allow_cycles)
   values(o,tid,next_version,actor,spec,p_client_request_id,fp,true) returning id into vid;
  for node in select value from jsonb_array_elements(spec->'steps') loop
   idx:=idx+1; kind:=node->>'kind';
   if jsonb_typeof(node)<>'object' or exists(select 1 from jsonb_object_keys(node) k where k not in ('key','target_kind','target_id','kind','approved','rejected','returned'))
    or coalesce(node->>'key','') !~ '^s[0-9]+$' or node_ids ? (node->>'key')
    or kind not in ('review','discussion','recommendation','approval') or kind is null
    or node->>'target_kind' not in ('council','class') or node->>'target_kind' is null then
    raise exception using errcode='22023',message='ROUTE_INVALID_STAGE'; end if;
   if node->>'target_kind'='council' then
    perform 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id where u.id=(node->>'target_id')::uuid and u.organization_id=o and t.is_council_type and u.status<>'archived';
   else
    perform 1 from qarar_governance.governance_unit_classes c where c.id=(node->>'target_id')::uuid and c.organization_id=o and c.is_active;
   end if;
   if not found then raise exception using errcode='22023',message='ROUTE_TARGET_INVALID'; end if;
   allowed:=array['approved','rejected'];
   if nullif(node->>'returned','') is not null then allowed:=allowed||'returned'::text; end if;
   insert into qarar_governance.workflow_template_steps(organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,governance_class_id,is_initial,is_terminal,allowed_outcomes)
    values(o,vid,'step_'||idx,
     case when node->>'target_kind'='council' then (select name_ar from qarar_core.governance_units where id=(node->>'target_id')::uuid)
     else (select name_ar from qarar_governance.governance_unit_classes where id=(node->>'target_id')::uuid) end,
     idx,kind,case kind when 'review' then 'review' when 'recommendation' then 'recommend' when 'approval' then 'final_approve' else 'discuss' end,
     case when node->>'target_kind'='council' then (node->>'target_id')::uuid end,
     case when node->>'target_kind'='class' then (node->>'target_id')::uuid end,idx=1,node->>'approved'='complete',allowed) returning id into sid;
   node_ids:=node_ids||jsonb_build_object(node->>'key',sid);
  end loop;
  for node in select value from jsonb_array_elements(spec->'steps') loop
   for edge in select * from (values ('approved'),('rejected'),('returned')) e(outcome) loop
    dest:=node->>edge.outcome;
    if edge.outcome='returned' and coalesce(dest,'')='' then continue; end if;
    target:=null;
    if (edge.outcome='approved' and dest='complete') or (edge.outcome='rejected' and dest='reject') then
     kind:=case when edge.outcome='rejected' then 'reject' else 'complete' end;
    else
     if dest is null or not(node_ids ? dest) or dest=node->>'key' then raise exception using errcode='22023',message='ROUTE_DESTINATION_INVALID'; end if;
     target:=(node_ids->>dest)::uuid;
     kind:=case when (select sequence_no from qarar_governance.workflow_template_steps where id=target)<
      (select sequence_no from qarar_governance.workflow_template_steps where id=(node_ids->>(node->>'key'))::uuid) then 'return' else 'forward' end;
    end if;
    insert into qarar_governance.workflow_template_transitions(organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code,transition_type)
     values(o,vid,(node_ids->>(node->>'key'))::uuid,target,edge.outcome,kind);
   end loop;
  end loop;
  update qarar_governance.workflow_template_versions set allow_cycles=exists(select 1 from qarar_governance.workflow_template_transitions where workflow_template_version_id=vid and transition_type='return') where id=vid;
  validation:=qarar_governance.validate_workflow_template_version(vid);
 end if;
 perform qarar_audit.append_audit_log(o,'governance.route_designer.'||p_action,'workflow_templates',tid,jsonb_build_object('version_id',vid,'request_id',p_client_request_id));
 return qarar_governance.admin_get_route_designer_v2()||jsonb_build_object('saved_id',tid,'saved_version_id',vid,'idempotent_replay',false);
end $$;

alter function qarar_governance.admin_get_route_designer_v2() owner to qarar_governance_executor;
alter function qarar_governance.admin_save_route_designer_v2(uuid,text,jsonb,text,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_get_route_designer_v2(),qarar_governance.admin_save_route_designer_v2(uuid,text,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_list_workflow_templates(),qarar_governance.admin_activate_workflow_template_version(uuid) to qarar_governance_executor;
grant execute on function qarar_governance.admin_get_route_designer_v2(),qarar_governance.admin_save_route_designer_v2(uuid,text,jsonb,text,uuid) to qarar_api_executor;
create function api_v2.admin_get_route_designer_v2() returns jsonb language sql stable security definer set search_path=pg_catalog as $$ select qarar_governance.admin_get_route_designer_v2() $$;
create function api_v2.admin_save_route_designer_v2(p_template_id uuid,p_action text,p_payload jsonb,p_expected_revision text,p_client_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$ select qarar_governance.admin_save_route_designer_v2($1,$2,$3,$4,$5) $$;
alter function api_v2.admin_get_route_designer_v2() owner to qarar_api_executor;
alter function api_v2.admin_save_route_designer_v2(uuid,text,jsonb,text,uuid) owner to qarar_api_executor;
revoke all on function api_v2.admin_get_route_designer_v2(),api_v2.admin_save_route_designer_v2(uuid,text,jsonb,text,uuid) from public,anon,service_role;
grant execute on function api_v2.admin_get_route_designer_v2(),api_v2.admin_save_route_designer_v2(uuid,text,jsonb,text,uuid) to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='qarar_governance' and p.proname in ('admin_get_route_designer_v2','admin_save_route_designer_v2');
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_governance',p.proname,pg_get_function_identity_arguments(p.oid),'governance','authenticated' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v2' and p.proname in ('admin_get_route_designer_v2','admin_save_route_designer_v2');
update qarar_architecture.api_release_registry r set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v2'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v2' join qarar_architecture.api_contract_registry c on c.api_version='v2' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid)) where r.api_version='v2';
notify pgrst,'reload schema';
commit;
