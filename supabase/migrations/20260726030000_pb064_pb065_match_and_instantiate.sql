begin;

create or replace function qarar_topics.apply_governance_snapshot(
  p_topic_id uuid,
  p_governance_source text,
  p_routing_status text,
  p_policy_id uuid,
  p_policy_version_id uuid,
  p_policy_item_id uuid,
  p_scope_assignment_id uuid,
  p_workflow_template_version_id uuid,
  p_workflow_instance_id uuid,
  p_current_workflow_step_id uuid,
  p_routing_decision_id uuid
) returns void
language plpgsql
security definer
set search_path=pg_catalog,qarar_topics
as $$
declare v_org uuid;
begin
  select organization_id into v_org from qarar_topics.topics where id=p_topic_id for update;
  if v_org is null then
    raise exception using errcode='P0002',message='الموضوع غير موجود';
  end if;
  update qarar_topics.topics set
    governance_source=p_governance_source,
    routing_status=p_routing_status,
    policy_id=p_policy_id,
    policy_version_id=p_policy_version_id,
    policy_item_id=p_policy_item_id,
    policy_scope_assignment_id=p_scope_assignment_id,
    workflow_template_version_id=p_workflow_template_version_id,
    workflow_instance_id=p_workflow_instance_id,
    current_workflow_step_id=p_current_workflow_step_id,
    routing_decision_id=p_routing_decision_id,
    updated_at=now()
  where id=p_topic_id;
end;
$$;

create or replace function qarar_governance.resolve_step_unit(
  p_organization_id uuid,
  p_origin_unit_id uuid,
  p_explicit_unit_id uuid,
  p_governance_class_id uuid
) returns uuid
language sql
stable
security invoker
set search_path=pg_catalog,qarar_core
as $$
  with recursive ancestors as (
    select u.id,u.parent_unit_id,u.governance_class_id,0 as depth
    from qarar_core.governance_units u
    where u.id=p_origin_unit_id and u.organization_id=p_organization_id
    union all
    select p.id,p.parent_unit_id,p.governance_class_id,a.depth+1
    from ancestors a
    join qarar_core.governance_units p on p.id=a.parent_unit_id
    where p.organization_id=p_organization_id
  )
  select case
    when p_explicit_unit_id is not null then p_explicit_unit_id
    else (select id from ancestors where governance_class_id=p_governance_class_id order by depth limit 1)
  end;
$$;

create or replace function qarar_governance.resolve_topic_governance(
  p_governance_unit_id uuid,
  p_topic_category_id uuid,
  p_effective_on date default current_date,
  p_topic_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_user uuid := auth.uid();
  v_unit qarar_core.governance_units%rowtype;
  v_count integer;
  v_max_score integer;
  v_winners integer;
  v_selected record;
  v_outcome text;
  v_candidates jsonb;
  v_decision_id uuid;
begin
  if v_org is null or v_user is null then
    raise exception using errcode='42501',message='يلزم حساب نشط ومصادق عليه';
  end if;
  perform qarar_iam.assert_permission('governance.resolve',p_governance_unit_id);
  select * into v_unit from qarar_core.governance_units
  where id=p_governance_unit_id and organization_id=v_org and status='active';
  if v_unit.id is null then
    raise exception using errcode='P0002',message='وحدة الحوكمة غير موجودة أو غير نشطة';
  end if;
  if p_topic_category_id is not null and not exists(
    select 1 from qarar_topics.topic_categories
    where id=p_topic_category_id and organization_id=v_org and is_active
  ) then
    raise exception using errcode='P0002',message='تصنيف الموضوع غير موجود أو غير نشط';
  end if;

  create temporary table if not exists pg_temp.governance_candidates(
    policy_id uuid,policy_version_id uuid,policy_item_id uuid,scope_id uuid,
    workflow_version_id uuid,automation_status text,governance_mode text,
    score integer
  ) on commit drop;
  truncate pg_temp.governance_candidates;

  insert into pg_temp.governance_candidates
  select p.id,pv.id,pi.id,sa.id,pi.workflow_template_version_id,
    pv.automation_status,pi.governance_mode,
    sa.priority + case sa.scope_type
      when 'governance_unit' then 600
      when 'governance_class' then 500
      when 'governance_level' then 400
      when 'governance_unit_type' then 300
      when 'unit_subtree' then 200
      else 100 end
  from qarar_governance.policies p
  join qarar_governance.policy_versions pv on pv.policy_id=p.id and pv.organization_id=p.organization_id
  join qarar_governance.policy_items pi on pi.policy_version_id=pv.id and pi.organization_id=p.organization_id
  join qarar_governance.policy_scope_assignments sa on sa.policy_version_id=pv.id and sa.organization_id=p.organization_id
  where p.organization_id=v_org and p.status='active' and pi.is_active and sa.is_active
    and pv.legal_status='effective'
    and p_effective_on>=pv.effective_from and (pv.effective_to is null or p_effective_on<=pv.effective_to)
    and (sa.valid_from is null or p_effective_on>=sa.valid_from)
    and (sa.valid_to is null or p_effective_on<=sa.valid_to)
    and (pi.topic_category_id is null or pi.topic_category_id=p_topic_category_id)
    and (
      sa.scope_type='organization'
      or (sa.scope_type='governance_unit' and sa.governance_unit_id=v_unit.id)
      or (sa.scope_type='governance_class' and sa.governance_class_id=v_unit.governance_class_id)
      or (sa.scope_type='governance_level' and sa.governance_level::text=v_unit.level_no::text)
      or (sa.scope_type='governance_unit_type' and sa.governance_unit_type_id=v_unit.unit_type_id)
      or (sa.scope_type='unit_subtree' and exists(
        with recursive descendants as (
          select id from qarar_core.governance_units
          where id=sa.governance_unit_id and organization_id=v_org
          union all
          select c.id from qarar_core.governance_units c
          join descendants d on c.parent_unit_id=d.id
          where c.organization_id=v_org
        ) select 1 from descendants where id=v_unit.id
      ))
    )
    and not exists(
      select 1 from qarar_governance.policy_item_scope_overrides o
      where o.policy_item_id=pi.id and o.scope_assignment_id=sa.id
        and o.governance_unit_id=v_unit.id and not o.is_included
        and (o.valid_from is null or p_effective_on>=o.valid_from)
        and (o.valid_to is null or p_effective_on<=o.valid_to)
    );

  select count(*),max(score) into v_count,v_max_score from pg_temp.governance_candidates;
  select count(*) into v_winners from pg_temp.governance_candidates where score=v_max_score;
  select * into v_selected from pg_temp.governance_candidates
  where score=v_max_score order by policy_version_id,policy_item_id limit 1;

  v_outcome := case
    when v_count=0 then 'no_applicable_policy'
    when v_winners>1 then 'multiple_policy_conflict'
    when v_selected.automation_status='blocked' then 'blocked'
    when v_selected.automation_status in ('not_configured','mapping_in_progress')
      then case when v_selected.governance_mode='custom_route_allowed'
        then 'custom_route_required' else 'policy_not_implemented' end
    when v_selected.automation_status in ('validation_pending','partially_ready')
      then 'policy_partially_ready'
    when v_selected.workflow_version_id is null then 'policy_not_implemented'
    when not exists(select 1 from qarar_governance.workflow_template_versions
                    where id=v_selected.workflow_version_id and status='active' and validation_status='valid')
      then 'policy_not_implemented'
    else 'resolved' end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'policy_id',policy_id,'policy_version_id',policy_version_id,'policy_item_id',policy_item_id,
    'scope_assignment_id',scope_id,'workflow_template_version_id',workflow_version_id,
    'automation_status',automation_status,'score',score
  ) order by score desc,policy_version_id,policy_item_id),'[]'::jsonb)
  into v_candidates from pg_temp.governance_candidates;

  insert into qarar_governance.regulation_match_decisions(
    organization_id,topic_id,governance_unit_id,topic_category_id,effective_on,outcome,
    selected_policy_id,selected_policy_version_id,selected_policy_item_id,
    selected_scope_assignment_id,selected_workflow_template_version_id,
    specificity_score,candidate_count,explanation,candidates,created_by_user_id
  ) values(
    v_org,p_topic_id,p_governance_unit_id,p_topic_category_id,p_effective_on,v_outcome,
    case when v_outcome='resolved' then v_selected.policy_id end,
    case when v_outcome='resolved' then v_selected.policy_version_id end,
    case when v_outcome='resolved' then v_selected.policy_item_id end,
    case when v_outcome='resolved' then v_selected.scope_id end,
    case when v_outcome='resolved' then v_selected.workflow_version_id end,
    v_max_score,v_count,
    jsonb_build_object(
      'outcome',v_outcome,'candidate_count',v_count,'winning_score',v_max_score,
      'priority_rule','unit>class>level>type>subtree>organization',
      'effective_on',p_effective_on
    ),v_candidates,v_user
  ) returning id into v_decision_id;

  return jsonb_build_object(
    'decision_id',v_decision_id,'outcome',v_outcome,'candidate_count',v_count,
    'policy_id',case when v_outcome='resolved' then v_selected.policy_id end,
    'policy_version_id',case when v_outcome='resolved' then v_selected.policy_version_id end,
    'policy_item_id',case when v_outcome='resolved' then v_selected.policy_item_id end,
    'scope_assignment_id',case when v_outcome='resolved' then v_selected.scope_id end,
    'workflow_template_version_id',case when v_outcome='resolved' then v_selected.workflow_version_id end,
    'explanation',jsonb_build_object('winning_score',v_max_score,'candidates',v_candidates)
  );
end;
$$;

create or replace function qarar_governance.instantiate_topic_workflow(
  p_topic_id uuid,
  p_decision_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id(); v_user uuid:=auth.uid();
  v_topic qarar_topics.topics%rowtype; v_decision qarar_governance.regulation_match_decisions%rowtype;
  v_mapping_id uuid; v_instance_id uuid; v_current_step_id uuid; v_missing integer;
begin
  select * into v_topic from qarar_topics.topics
  where id=p_topic_id and organization_id=v_org for update;
  select * into v_decision from qarar_governance.regulation_match_decisions
  where id=p_decision_id and organization_id=v_org and topic_id=p_topic_id;
  if v_topic.id is null or v_decision.id is null then
    raise exception using errcode='P0002',message='الموضوع أو قرار الحوكمة غير موجود';
  end if;
  if v_decision.outcome<>'resolved' then
    raise exception using errcode='55000',message='لا يمكن إنشاء المسار قبل حسم قرار الحوكمة';
  end if;

  insert into qarar_governance.topic_governance_mappings(
    organization_id,topic_id,governance_source,routing_status,routing_decision_id,
    policy_id,policy_version_id,policy_item_id,policy_scope_assignment_id,
    workflow_template_version_id,snapshot,mapped_by_user_id
  ) values(
    v_org,p_topic_id,'regulated','routing_resolved',p_decision_id,
    v_decision.selected_policy_id,v_decision.selected_policy_version_id,
    v_decision.selected_policy_item_id,v_decision.selected_scope_assignment_id,
    v_decision.selected_workflow_template_version_id,
    jsonb_build_object('decision',to_jsonb(v_decision),'captured_at',now()),v_user
  ) returning id into v_mapping_id;

  insert into qarar_governance.workflow_instances(
    organization_id,topic_id,topic_governance_mapping_id,workflow_template_version_id,
    started_by_user_id,snapshot
  ) values(
    v_org,p_topic_id,v_mapping_id,v_decision.selected_workflow_template_version_id,
    v_user,jsonb_build_object('template_version_id',v_decision.selected_workflow_template_version_id)
  ) returning id into v_instance_id;

  insert into qarar_governance.workflow_instance_steps(
    organization_id,workflow_instance_id,template_step_id,sequence_no,status,
    assigned_unit_id,required_permission_code,opened_at,snapshot
  )
  select v_org,v_instance_id,s.id,s.sequence_no,
    case when s.is_initial then 'active' else 'pending' end,
    qarar_governance.resolve_step_unit(v_org,v_topic.current_unit_id,s.governance_unit_id,s.governance_class_id),
    s.required_permission_code,case when s.is_initial then now() end,
    jsonb_build_object(
      'step_code',s.step_code,'name_ar',s.name_ar,'responsibility',s.responsibility,
      'governance_unit_id',s.governance_unit_id,'governance_class_id',s.governance_class_id,
      'allowed_outcomes',s.allowed_outcomes
    )
  from qarar_governance.workflow_template_steps s
  where s.workflow_template_version_id=v_decision.selected_workflow_template_version_id
  order by s.sequence_no;

  select count(*) into v_missing from qarar_governance.workflow_instance_steps
  where workflow_instance_id=v_instance_id and assigned_unit_id is null;
  if v_missing>0 then
    raise exception using errcode='23514',message='تعذر تحديد المجلس المسؤول عن خطوة أو أكثر';
  end if;
  select wis.id into v_current_step_id
  from qarar_governance.workflow_instance_steps wis
  join qarar_governance.workflow_template_steps s on s.id=wis.template_step_id
  where wis.workflow_instance_id=v_instance_id and s.is_initial;
  update qarar_governance.workflow_instances set current_step_id=v_current_step_id
  where id=v_instance_id;
  perform qarar_topics.apply_governance_snapshot(
    p_topic_id,'regulated','routing_ready',
    v_decision.selected_policy_id,v_decision.selected_policy_version_id,
    v_decision.selected_policy_item_id,v_decision.selected_scope_assignment_id,
    v_decision.selected_workflow_template_version_id,v_instance_id,v_current_step_id,p_decision_id
  );
  insert into qarar_governance.governance_compliance_events(
    organization_id,topic_id,workflow_instance_id,event_type,severity,result,details,actor_user_id
  ) values(v_org,p_topic_id,v_instance_id,'governance.workflow_instantiated','info','allowed',
    jsonb_build_object('decision_id',p_decision_id,'mapping_id',v_mapping_id),v_user);
  insert into qarar_governance.notification_outbox(
    organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key
  ) values(v_org,'topic',p_topic_id,'governance.workflow.started',
    jsonb_build_object('topic_id',p_topic_id,'workflow_instance_id',v_instance_id),
    'workflow-started:'||v_instance_id);
  return jsonb_build_object(
    'topic_id',p_topic_id,'mapping_id',v_mapping_id,'workflow_instance_id',v_instance_id,
    'current_workflow_step_id',v_current_step_id,'routing_status','routing_ready'
  );
end;
$$;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values(
  'governance','qarar_topics','apply_governance_snapshot',
  'p_topic_id uuid, p_governance_source text, p_routing_status text, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_workflow_template_version_id uuid, p_workflow_instance_id uuid, p_current_workflow_step_id uuid, p_routing_decision_id uuid',
  'Apply a validated immutable governance snapshot to the topic aggregate'
) on conflict do nothing;

alter function qarar_topics.apply_governance_snapshot(
  uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid
) owner to qarar_topics_executor;
alter function qarar_governance.resolve_step_unit(uuid,uuid,uuid,uuid) owner to qarar_governance_executor;
alter function qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid) owner to qarar_governance_executor;
alter function qarar_governance.instantiate_topic_workflow(uuid,uuid) owner to qarar_governance_executor;

revoke all on function qarar_topics.apply_governance_snapshot(
  uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid
) from public,anon,authenticated,service_role;
grant execute on function qarar_topics.apply_governance_snapshot(
  uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid
) to qarar_governance_executor;
revoke all on function qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid)
  from public,anon,authenticated,service_role;
revoke all on function qarar_governance.instantiate_topic_workflow(uuid,uuid)
  from public,anon,authenticated,service_role;

comment on function qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid) is
'Deterministic explainable matcher. Equal winning specificity is an explicit conflict, never a silent tie-break.';
comment on function qarar_governance.instantiate_topic_workflow(uuid,uuid) is
'Creates immutable topic routing and per-step council snapshots from a resolved decision.';

commit;
