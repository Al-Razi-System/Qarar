begin;

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
  v_unit_level text;
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
  perform qarar_iam.assert_permission('topics.create',p_governance_unit_id);
  select * into v_unit from qarar_core.governance_units
  where id=p_governance_unit_id and organization_id=v_org and status='active';
  if v_unit.id is null then
    raise exception using errcode='P0002',message='وحدة الحوكمة غير موجودة أو غير نشطة';
  end if;
  select governance_level into v_unit_level
  from qarar_governance.governance_unit_classes
  where id=v_unit.governance_class_id and organization_id=v_org;
  if p_topic_category_id is not null and not exists(
    select 1 from qarar_topics.topic_categories
    where id=p_topic_category_id and organization_id=v_org and is_active
  ) then
    raise exception using errcode='P0002',message='تصنيف الموضوع غير موجود أو غير نشط';
  end if;

  create temporary table if not exists pg_temp.governance_candidates(
    policy_id uuid,policy_version_id uuid,policy_item_id uuid,scope_id uuid,
    workflow_version_id uuid,automation_status text,governance_mode text,score integer
  ) on commit drop;
  truncate pg_temp.governance_candidates;

  insert into pg_temp.governance_candidates
  select p.id,pv.id,pi.id,sa.id,pi.workflow_template_version_id,
    pv.automation_status,pi.governance_mode,
    sa.priority + case sa.scope_type
      when 'governance_unit' then 600 when 'governance_class' then 500
      when 'governance_level' then 400 when 'governance_unit_type' then 300
      when 'unit_subtree' then 200 else 100 end
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
      or (sa.scope_type='governance_level' and sa.governance_level=v_unit_level)
      or (sa.scope_type='governance_unit_type' and sa.governance_unit_type_id=v_unit.unit_type_id)
      or (sa.scope_type='unit_subtree' and exists(
        with recursive descendants as (
          select id from qarar_core.governance_units
          where id=sa.governance_unit_id and organization_id=v_org
          union all
          select c.id from qarar_core.governance_units c
          join descendants d on c.parent_unit_id=d.id where c.organization_id=v_org
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
    when v_selected.automation_status in ('validation_pending','partially_ready') then 'policy_partially_ready'
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
    jsonb_build_object('outcome',v_outcome,'candidate_count',v_count,'winning_score',v_max_score,
      'priority_rule','unit>class>level>type>subtree>organization','effective_on',p_effective_on),
    v_candidates,v_user
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

alter function qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid)
  from public,anon,authenticated,service_role;

commit;
