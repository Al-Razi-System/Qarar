begin;

-- Produces the complete set of regulations a topic creator may choose from.
-- It intentionally does not apply the historical "highest score wins" rule: the
-- user chooses one eligible option and the creation command validates it again.
create or replace function qarar_governance.eligible_topic_regulation_options(
  p_governance_unit_id uuid,
  p_topic_category_id uuid,
  p_priority text,
  p_source_type text,
  p_effective_on date default current_date
) returns table(
  policy_id uuid,
  policy_version_id uuid,
  policy_item_id uuid,
  scope_assignment_id uuid,
  workflow_template_version_id uuid,
  policy_code text,
  policy_name_ar text,
  policy_name_en text,
  version_no integer,
  version_label text,
  item_code text,
  item_title_ar text,
  item_title_en text,
  scope_type text,
  scope_priority integer,
  governance_mode text,
  automation_status text,
  routing_outcome text,
  score integer
) language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_unit qarar_core.governance_units%rowtype;
  v_level text;
  v_context jsonb;
begin
  if v_org is null or v_actor is null then
    raise exception using errcode='42501',message='An active account is required';
  end if;
  perform qarar_iam.assert_permission('topics.create',p_governance_unit_id);
  select * into v_unit from qarar_core.governance_units
  where id=p_governance_unit_id and organization_id=v_org and status='active';
  if v_unit.id is null then
    raise exception using errcode='P0002',message='Governance unit was not found or is inactive';
  end if;
  select governance_level into v_level from qarar_governance.governance_unit_classes
  where id=v_unit.governance_class_id and organization_id=v_org;
  v_context:=jsonb_build_object(
    'governance_unit_id',v_unit.id,
    'governance_class_id',v_unit.governance_class_id,
    'governance_level',v_level,
    'governance_unit_type_id',v_unit.unit_type_id,
    'topic_category_id',p_topic_category_id,
    'priority',p_priority,
    'source_type',p_source_type
  );

  return query
  select p.id,pv.id,pi.id,sa.id,pi.workflow_template_version_id,
    p.code,p.name_ar,p.name_en,pv.version_no,pv.version_label,
    pi.item_code,pi.title_ar,pi.title_en,sa.scope_type,coalesce(ov.priority,sa.priority),
    pi.governance_mode,pv.automation_status,
    case
      when pv.automation_status='blocked' then 'blocked'
      when pv.automation_status in('not_configured','mapping_in_progress')
        and pi.governance_mode in('custom_route_allowed','regulated_fallback_allowed') then 'custom_route_required'
      when pv.automation_status<>'ready' then 'policy_partially_ready'
      when pi.workflow_template_version_id is null then
        case when pi.governance_mode in('custom_route_allowed','regulated_fallback_allowed')
          then 'custom_route_required' else 'policy_not_implemented' end
      when not exists(
        select 1 from qarar_governance.workflow_template_versions w
        where w.id=pi.workflow_template_version_id and w.organization_id=v_org
          and w.status='active' and w.validation_status='valid'
      ) then case when pi.governance_mode in('custom_route_allowed','regulated_fallback_allowed')
          then 'custom_route_required' else 'policy_not_implemented' end
      else 'resolved'
    end,
    (case
      when ov.is_included then 7000000
      when sa.scope_type='governance_unit' then 6000000
      when sa.scope_type='governance_class' then 5000000
      when sa.scope_type='governance_level' then 4000000
      when sa.scope_type='governance_unit_type' then 3000000
      when sa.scope_type='unit_subtree' then 2000000 else 1000000 end)
      + greatest(-99999,least(99999,coalesce(ov.priority,sa.priority)))
  from qarar_governance.policies p
  join qarar_governance.policy_versions pv on pv.policy_id=p.id and pv.organization_id=p.organization_id
  join qarar_governance.policy_items pi on pi.policy_version_id=pv.id and pi.organization_id=p.organization_id
  join qarar_governance.policy_scope_assignments sa on sa.policy_version_id=pv.id and sa.organization_id=p.organization_id
  left join lateral(
    select x.is_included,x.priority from qarar_governance.policy_item_scope_overrides x
    where x.policy_item_id=pi.id and x.scope_assignment_id=sa.id and x.governance_unit_id=v_unit.id
      and (x.valid_from is null or p_effective_on>=x.valid_from)
      and (x.valid_to is null or p_effective_on<=x.valid_to)
    order by x.priority desc limit 1
  ) ov on true
  where p.organization_id=v_org and p.status='active' and pi.is_active and sa.is_active
    and pv.legal_status='effective' and p_effective_on>=pv.effective_from
    and (pv.effective_to is null or p_effective_on<=pv.effective_to)
    and (sa.valid_from is null or p_effective_on>=sa.valid_from)
    and (sa.valid_to is null or p_effective_on<=sa.valid_to)
    and (pi.topic_category_id is null or pi.topic_category_id=p_topic_category_id)
    and qarar_governance.conditions_match(pi.match_criteria,v_context)
    and coalesce(ov.is_included,true)
    and (ov.is_included or sa.scope_type='organization'
      or (sa.scope_type='governance_unit' and sa.governance_unit_id=v_unit.id)
      or (sa.scope_type='governance_class' and sa.governance_class_id=v_unit.governance_class_id)
      or (sa.scope_type='governance_level' and sa.governance_level=v_level)
      or (sa.scope_type='governance_unit_type' and sa.governance_unit_type_id=v_unit.unit_type_id)
      or (sa.scope_type='unit_subtree' and exists(
        with recursive descendants(id) as (
          select sa.governance_unit_id
          union all
          select child.id from qarar_core.governance_units child
          join descendants parent on child.parent_unit_id=parent.id
          where child.organization_id=v_org
        ) select 1 from descendants where id=v_unit.id
      )));
end;
$$;

create or replace function qarar_governance.get_topic_regulation_options(
  p_governance_unit_id uuid,
  p_topic_category_id uuid,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_effective_on date default current_date
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'selection',jsonb_build_object(
      'policy_id',policy_id,'policy_version_id',policy_version_id,
      'policy_item_id',policy_item_id,'scope_assignment_id',scope_assignment_id
    ),
    'policy',jsonb_build_object('code',policy_code,'name_ar',policy_name_ar,'name_en',policy_name_en),
    'version',jsonb_build_object('number',version_no,'label',version_label),
    'item',jsonb_build_object('code',item_code,'title_ar',item_title_ar,'title_en',item_title_en),
    'scope',jsonb_build_object('type',scope_type,'priority',scope_priority),
    'governance_mode',governance_mode,'automation_status',automation_status,
    'routing_outcome',routing_outcome,'can_start_workflow',(routing_outcome='resolved')
  ) order by policy_name_ar,version_no desc,item_code,scope_priority desc),'[]'::jsonb) into v_items
  from qarar_governance.eligible_topic_regulation_options(
    p_governance_unit_id,p_topic_category_id,p_priority,p_source_type,p_effective_on
  );
  return jsonb_build_object(
    'governance_unit_id',p_governance_unit_id,
    'topic_category_id',p_topic_category_id,
    'effective_on',p_effective_on,
    'items',v_items,
    'total',jsonb_array_length(v_items)
  );
end;
$$;

create or replace function qarar_governance.resolve_selected_topic_governance(
  p_topic_id uuid,
  p_policy_id uuid,
  p_policy_version_id uuid,
  p_policy_item_id uuid,
  p_scope_assignment_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_topic qarar_topics.topics%rowtype;
  v_selected record;
  v_candidates jsonb;
  v_decision_id uuid;
begin
  select * into v_topic from qarar_topics.topics
  where id=p_topic_id and organization_id=v_org;
  if v_topic.id is null then
    raise exception using errcode='P0002',message='Topic was not found';
  end if;
  perform qarar_iam.assert_permission('topics.create',v_topic.current_unit_id);
  select * into v_selected from qarar_governance.eligible_topic_regulation_options(
    v_topic.current_unit_id,v_topic.category_id,v_topic.priority,v_topic.source_type,current_date
  ) where policy_id=p_policy_id and policy_version_id=p_policy_version_id
    and policy_item_id=p_policy_item_id and scope_assignment_id=p_scope_assignment_id;
  if v_selected.policy_id is null then
    raise exception using errcode='23514',message='The selected regulation is no longer eligible for this topic';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'policy_id',policy_id,'policy_version_id',policy_version_id,
    'policy_item_id',policy_item_id,'scope_assignment_id',scope_assignment_id,
    'routing_outcome',routing_outcome
  ) order by score desc),'[]'::jsonb) into v_candidates
  from qarar_governance.eligible_topic_regulation_options(
    v_topic.current_unit_id,v_topic.category_id,v_topic.priority,v_topic.source_type,current_date
  );
  insert into qarar_governance.regulation_match_decisions(
    organization_id,topic_id,governance_unit_id,topic_category_id,effective_on,outcome,
    selected_policy_id,selected_policy_version_id,selected_policy_item_id,
    selected_scope_assignment_id,selected_workflow_template_version_id,specificity_score,
    candidate_count,explanation,candidates,created_by_user_id
  ) values(
    v_org,v_topic.id,v_topic.current_unit_id,v_topic.category_id,current_date,v_selected.routing_outcome,
    v_selected.policy_id,v_selected.policy_version_id,v_selected.policy_item_id,
    v_selected.scope_assignment_id,
    case when v_selected.routing_outcome='resolved' then v_selected.workflow_template_version_id end,
    v_selected.score,jsonb_array_length(v_candidates),
    jsonb_build_object('outcome',v_selected.routing_outcome,'selection_source','user_selected'),
    v_candidates,v_actor
  ) returning id into v_decision_id;
  perform qarar_audit.append_audit_log(v_org,'governance.topic_regulation.select','topics',v_topic.id,
    jsonb_build_object('decision_id',v_decision_id,'policy_id',v_selected.policy_id,
      'policy_version_id',v_selected.policy_version_id,'policy_item_id',v_selected.policy_item_id,
      'scope_assignment_id',v_selected.scope_assignment_id));
  return jsonb_build_object(
    'decision_id',v_decision_id,'outcome',v_selected.routing_outcome,
    'candidate_count',jsonb_array_length(v_candidates),'policy_id',v_selected.policy_id,
    'policy_version_id',v_selected.policy_version_id,'policy_item_id',v_selected.policy_item_id,
    'scope_assignment_id',v_selected.scope_assignment_id,
    'workflow_template_version_id',case when v_selected.routing_outcome='resolved'
      then v_selected.workflow_template_version_id end
  );
end;
$$;

create or replace function qarar_topics.create_topic_with_selected_regulation(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
  p_policy_id uuid,p_policy_version_id uuid,p_policy_item_id uuid,p_scope_assignment_id uuid,
  p_priority text default 'medium',p_source_type text default 'new',
  p_title_en text default null,p_client_request_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_topics
as $$
declare v_topic jsonb;v_decision jsonb;v_route jsonb;v_topic_id uuid;v_outcome text;
begin
  if qarar_iam.current_organization_id() is null then
    raise exception using errcode='42501',message='An active account is required';
  end if;
  v_topic:=qarar_topics.create_topic_unrouted(
    p_title_ar,p_description,p_category_id,p_current_unit_id,
    p_priority,p_source_type,p_title_en,p_client_request_id
  );
  v_topic_id:=(v_topic->>'id')::uuid;
  if coalesce((v_topic->>'idempotent_replay')::boolean,false) then
    return v_topic || coalesce((
      select jsonb_build_object(
        'decision_id',m.routing_decision_id,'routing_status',m.routing_status,
        'policy_id',m.policy_id,'policy_version_id',m.policy_version_id,
        'policy_item_id',m.policy_item_id,'scope_assignment_id',m.policy_scope_assignment_id,
        'workflow_template_version_id',m.workflow_template_version_id,
        'workflow_instance_id',w.id,'current_workflow_step_id',w.current_step_id
      ) from qarar_governance.topic_governance_mappings m
      left join qarar_governance.workflow_instances w on w.topic_governance_mapping_id=m.id
      where m.topic_id=v_topic_id
    ),'{}'::jsonb);
  end if;
  v_decision:=qarar_governance.resolve_selected_topic_governance(
    v_topic_id,p_policy_id,p_policy_version_id,p_policy_item_id,p_scope_assignment_id
  );
  v_outcome:=v_decision->>'outcome';
  if v_outcome='resolved' then
    v_route:=qarar_governance.instantiate_topic_workflow(v_topic_id,(v_decision->>'decision_id')::uuid);
  else
    v_route:=qarar_governance.record_unresolved_topic_governance(
      v_topic_id,(v_decision->>'decision_id')::uuid,v_outcome
    );
    if v_outcome='custom_route_required' then
      update qarar_topics.topics set governance_source='custom',routing_status='routing_exception_pending'
      where id=v_topic_id;
      v_route:=v_route||jsonb_build_object('routing_status','routing_exception_pending','custom_route_required',true);
    end if;
  end if;
  return v_topic||v_decision||v_route;
end;
$$;

alter function qarar_governance.eligible_topic_regulation_options(uuid,uuid,text,text,date) owner to qarar_governance_executor;
alter function qarar_governance.get_topic_regulation_options(uuid,uuid,text,text,date) owner to qarar_governance_executor;
alter function qarar_governance.resolve_selected_topic_governance(uuid,uuid,uuid,uuid,uuid) owner to qarar_governance_executor;
alter function qarar_topics.create_topic_with_selected_regulation(text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid) owner to qarar_topics_executor;

revoke all on function qarar_governance.eligible_topic_regulation_options(uuid,uuid,text,text,date) from public,anon,authenticated,service_role;
revoke all on function qarar_governance.get_topic_regulation_options(uuid,uuid,text,text,date) from public,anon,authenticated,service_role;
revoke all on function qarar_governance.resolve_selected_topic_governance(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_topics.create_topic_with_selected_regulation(text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid) from public,anon,authenticated,service_role;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values
  ('topics','qarar_governance','resolve_selected_topic_governance',
    'p_topic_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid',
    'Validate the user-selected eligible regulation and record an immutable governance decision'),
  ('governance','qarar_audit','append_audit_log',
    'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb',
    'Audit the explicit regulation selected for a topic')
on conflict do nothing;

grant usage on schema qarar_governance to qarar_topics_executor;
grant execute on function qarar_governance.resolve_selected_topic_governance(uuid,uuid,uuid,uuid,uuid) to qarar_topics_executor;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
  case when n.nspname='qarar_topics' then 'topics' else 'governance' end,n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname,p.proname) in(
  ('qarar_governance','get_topic_regulation_options'),
  ('qarar_topics','create_topic_with_selected_regulation')
)
on conflict(function_oid) do update set function_name=excluded.function_name,
  identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,
  owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
)
values
  ('v1','get_topic_regulation_options','qarar_governance','get_topic_regulation_options',
    'p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date',
    'governance','authenticated'),
  ('v1','create_topic_with_selected_regulation','qarar_topics','create_topic_with_selected_regulation',
    'p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid',
    'topics','authenticated')
on conflict do nothing;

do $$
declare c record; f record; v_arguments text; v_result text; v_call_arguments text; v_call text; v_sql text;
begin
  for c in select * from qarar_architecture.api_contract_registry
    where api_version='v1' and contract_name in('get_topic_regulation_options','create_topic_with_selected_regulation')
  loop
    select p.* into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname=c.implementation_schema and p.proname=c.implementation_name
      and pg_get_function_identity_arguments(p.oid)=c.identity_arguments;
    v_arguments:=pg_get_function_arguments(f.oid);
    v_result:=pg_get_function_result(f.oid);
    select string_agg(format('$%s',i),',' order by i) into v_call_arguments from generate_series(1,f.pronargs)i;
    v_call:=format('%I.%I(%s)',c.implementation_schema,c.implementation_name,coalesce(v_call_arguments,''));
    v_sql:=format('select %s',v_call);
    execute format('create or replace function api_v1.%I(%s) returns %s language sql volatile security definer set search_path=pg_catalog as %L',
      c.contract_name,v_arguments,v_result,v_sql);
    execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',c.contract_name,c.identity_arguments);
    execute format('revoke all on function api_v1.%I(%s) from public,anon,authenticated,service_role',c.contract_name,c.identity_arguments);
    execute format('grant execute on function api_v1.%I(%s) to authenticated,service_role',c.contract_name,c.identity_arguments);
    execute format('grant usage on schema %I to qarar_api_executor',c.implementation_schema);
    execute format('grant execute on function %I.%I(%s) to qarar_api_executor',c.implementation_schema,c.implementation_name,c.identity_arguments);
  end loop;
end;
$$;

commit;
