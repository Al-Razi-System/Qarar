begin;

-- A council meeting can cover more than one technical workflow step (for
-- example agenda review followed by voting). Present and prove it once while
-- retaining step-level audit records internally.
create or replace function qarar_governance.topic_prior_route_council_groups(
  p_workflow_template_version_id uuid,
  p_source_unit_id uuid
) returns table(
  group_no bigint,
  group_id uuid,
  template_step_ids uuid[],
  primary_template_step_id uuid,
  sequence_no integer,
  title text,
  step_type text,
  responsibility text,
  responsible_unit_id uuid,
  responsible_entity text,
  covered_steps text[]
)
language sql stable security definer
set search_path=pg_catalog
as $$
  with resolved_steps as (
    select s.*,
      qarar_governance.resolve_step_unit(
        s.organization_id,p_source_unit_id,s.governance_unit_id,s.governance_class_id
      ) as resolved_unit_id
    from qarar_governance.workflow_template_steps s
    where s.organization_id=qarar_iam.current_organization_id()
      and s.workflow_template_version_id=p_workflow_template_version_id
      and not s.is_terminal
  ), council_groups as (
    select
      resolved_unit_id,
      min(sequence_no) as first_sequence,
      array_agg(id order by sequence_no) as step_ids,
      (array_agg(id order by case when step_type='voting' then 0 else 1 end,sequence_no desc))[1] as primary_step_id,
      (array_agg(name_ar order by case when step_type='voting' then 0 else 1 end,sequence_no desc))[1] as group_title,
      (array_agg(step_type order by case when step_type='voting' then 0 else 1 end,sequence_no desc))[1] as primary_step_type,
      (array_agg(responsibility order by case when step_type='voting' then 0 else 1 end,sequence_no desc))[1] as primary_responsibility,
      array_agg(name_ar order by sequence_no) as step_titles
    from resolved_steps
    where resolved_unit_id is not null
    group by resolved_unit_id
    having bool_or(step_type='voting')
  )
  select row_number() over(order by g.first_sequence),g.resolved_unit_id,g.step_ids,g.primary_step_id,
    g.first_sequence,g.group_title,g.primary_step_type,g.primary_responsibility,g.resolved_unit_id,
    coalesce(u.name_ar,'المجلس المحدد في المسار'),g.step_titles
  from council_groups g
  left join qarar_core.governance_units u
    on u.id=g.resolved_unit_id and u.organization_id=qarar_iam.current_organization_id()
  order by g.first_sequence
$$;

alter function qarar_governance.topic_prior_route_council_groups(uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.topic_prior_route_council_groups(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.topic_prior_route_council_groups(uuid,uuid) to qarar_governance_executor;

create or replace function qarar_governance.get_topic_prior_route_candidate_steps(
  p_governance_unit_id uuid,
  p_topic_category_id uuid,
  p_priority text,
  p_source_type text,
  p_effective_on date,
  p_policy_id uuid,
  p_policy_version_id uuid,
  p_policy_item_id uuid,
  p_scope_assignment_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_option record;v_steps jsonb;
begin
  perform qarar_iam.assert_permission('topics.create',p_governance_unit_id);
  perform qarar_iam.assert_permission('governance.prior_route.request',p_governance_unit_id);
  select * into v_option from qarar_governance.eligible_topic_regulation_options(
    p_governance_unit_id,p_topic_category_id,p_priority,p_source_type,p_effective_on
  ) where policy_id=p_policy_id and policy_version_id=p_policy_version_id
    and policy_item_id=p_policy_item_id and scope_assignment_id=p_scope_assignment_id;
  if v_option.policy_id is null or v_option.routing_outcome<>'resolved'
    or v_option.workflow_template_version_id is null then
    raise exception using errcode='23514',message='المسار اللائحي المختار غير جاهز لاستكمال مسار سابق';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'group_id',g.group_id,'template_step_id',g.primary_template_step_id,
    'template_step_ids',to_jsonb(g.template_step_ids),'sequence_no',g.group_no,
    'title',g.title,'step_type',g.step_type,'responsibility',g.responsibility,
    'responsible_unit_id',g.responsible_unit_id,'responsible_entity',g.responsible_entity,
    'is_terminal',false,'covered_steps',to_jsonb(g.covered_steps)
  ) order by g.group_no),'[]'::jsonb) into v_steps
  from qarar_governance.topic_prior_route_council_groups(
    v_option.workflow_template_version_id,p_governance_unit_id
  ) g;
  return jsonb_build_object('workflow_template_version_id',v_option.workflow_template_version_id,'steps',v_steps);
end $$;

create or replace function qarar_governance.create_topic_prior_route_request(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
  p_policy_id uuid,p_policy_version_id uuid,p_policy_item_id uuid,p_scope_assignment_id uuid,
  p_evidence jsonb,p_priority text default 'medium',p_source_type text default 'new',
  p_title_en text default null,p_client_request_id uuid default null
) returns jsonb
language plpgsql volatile security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();v_created jsonb;
  v_topic_id uuid;v_instance_id uuid;v_request_id uuid;v_total integer;v_selected integer;
  v_workflow_template_version_id uuid;v_inserted integer;v_expected_steps integer;
begin
  if v_org is null or v_actor is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
  perform qarar_iam.assert_permission('topics.create',p_current_unit_id);
  perform qarar_iam.assert_permission('governance.prior_route.request',p_current_unit_id);
  if jsonb_typeof(p_evidence)<>'array' then raise exception using errcode='22023',message='بيانات المجالس السابقة غير صالحة';end if;
  v_selected:=jsonb_array_length(p_evidence);
  select option_row.workflow_template_version_id into v_workflow_template_version_id
  from qarar_governance.eligible_topic_regulation_options(
    p_current_unit_id,p_category_id,p_priority,p_source_type,current_date
  ) option_row
  where option_row.policy_id=p_policy_id and option_row.policy_version_id=p_policy_version_id
    and option_row.policy_item_id=p_policy_item_id and option_row.scope_assignment_id=p_scope_assignment_id
    and option_row.routing_outcome='resolved';
  if v_workflow_template_version_id is null then
    raise exception using errcode='23514',message='المسار اللائحي المختار لم يعد جاهزًا';
  end if;
  select count(*) into v_total from qarar_governance.topic_prior_route_council_groups(
    v_workflow_template_version_id,p_current_unit_id
  );
  if v_selected<1 or v_selected>=v_total then
    raise exception using errcode='22023',message='اختر مجلسًا سابقًا واحدًا على الأقل واترك مجلسًا متبقيًا للنظام';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_evidence) with ordinality evidence(value,position)
    left join qarar_governance.topic_prior_route_council_groups(
      v_workflow_template_version_id,p_current_unit_id
    ) route_group on route_group.group_no=evidence.position
    where route_group.group_id is null
      or coalesce(evidence.value->'template_step_ids','[]'::jsonb)<>to_jsonb(route_group.template_step_ids)
      or coalesce(evidence.value->>'meeting_date','')!~'^\d{4}-\d{2}-\d{2}$'
      or (evidence.value->>'meeting_date')::date>current_date
      or coalesce(evidence.value->>'decision_type','') not in ('approved','recommended','referred','completed')
      or char_length(btrim(coalesce(evidence.value->>'decision_text','')))<3
      or char_length(btrim(coalesce(evidence.value->>'bypass_reason','')))<10
  ) then raise exception using errcode='22023',message='أكمل تاريخ وقرار وسبب كل مجلس سابق بالترتيب';end if;
  select coalesce(sum(cardinality(route_group.template_step_ids)),0) into v_expected_steps
  from qarar_governance.topic_prior_route_council_groups(
    v_workflow_template_version_id,p_current_unit_id
  ) route_group where route_group.group_no<=v_selected;

  v_created:=qarar_topics.create_topic_with_selected_regulation(
    p_title_ar,p_description,p_category_id,p_current_unit_id,p_policy_id,p_policy_version_id,
    p_policy_item_id,p_scope_assignment_id,p_priority,p_source_type,p_title_en,p_client_request_id
  );
  v_topic_id:=coalesce(v_created->>'topic_id',v_created->>'id')::uuid;
  select id into v_request_id from qarar_governance.topic_prior_route_requests
    where topic_id=v_topic_id and organization_id=v_org;
  if v_request_id is not null then
    return jsonb_build_object('topic_id',v_topic_id,'request_id',v_request_id,'status',
      (select status from qarar_governance.topic_prior_route_requests where id=v_request_id),
      'evidence',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'template_step_id',e.template_step_id,'sequence_no',e.sequence_no) order by e.sequence_no),'[]'::jsonb)
        from qarar_governance.topic_prior_route_step_evidence e where e.request_id=v_request_id));
  end if;
  select id into v_instance_id from qarar_governance.workflow_instances
    where topic_id=v_topic_id and organization_id=v_org
      and workflow_template_version_id=v_workflow_template_version_id for update;
  if v_instance_id is null then raise exception using errcode='55000',message='تعذر إنشاء المسار اللائحي للموضوع';end if;
  update qarar_governance.workflow_instance_steps set status='pending',opened_at=null
    where workflow_instance_id=v_instance_id and organization_id=v_org;
  update qarar_governance.workflow_instances set status='blocked',current_step_id=null,updated_at=clock_timestamp()
    where id=v_instance_id and organization_id=v_org;
  insert into qarar_governance.topic_prior_route_requests(
    organization_id,topic_id,workflow_instance_id,status,requested_by_user_id
  ) values(v_org,v_topic_id,v_instance_id,'draft',v_actor) returning id into v_request_id;
  insert into qarar_governance.topic_prior_route_step_evidence(
    organization_id,request_id,workflow_instance_step_id,template_step_id,sequence_no,
    meeting_date,meeting_reference,decision_type,decision_text,bypass_reason
  )
  select v_org,v_request_id,instance_step.id,template_step.id,template_step.sequence_no,
    (evidence.value->>'meeting_date')::date,nullif(btrim(coalesce(evidence.value->>'meeting_reference','')),''),
    evidence.value->>'decision_type',btrim(evidence.value->>'decision_text'),btrim(evidence.value->>'bypass_reason')
  from jsonb_array_elements(p_evidence) with ordinality evidence(value,position)
  join qarar_governance.topic_prior_route_council_groups(
    v_workflow_template_version_id,p_current_unit_id
  ) route_group on route_group.group_no=evidence.position
  cross join unnest(route_group.template_step_ids) as selected_step(selected_step_id)
  join qarar_governance.workflow_template_steps template_step
    on template_step.organization_id=v_org and template_step.id=selected_step_id
  join qarar_governance.workflow_instance_steps instance_step
    on instance_step.organization_id=v_org and instance_step.workflow_instance_id=v_instance_id
    and instance_step.template_step_id=template_step.id;
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_expected_steps then
    raise exception using errcode='23514',message='تعذر مطابقة جميع خطوات المجالس السابقة مع المسار اللائحي';
  end if;
  update qarar_governance.topic_governance_mappings set routing_status='routing_pending',
    snapshot=snapshot||jsonb_build_object('prior_route_request_id',v_request_id,'prior_route_status','draft')
    where topic_id=v_topic_id and organization_id=v_org;
  perform qarar_topics.apply_governance_snapshot(v_topic_id,'regulated','routing_pending',p_policy_id,p_policy_version_id,
    p_policy_item_id,p_scope_assignment_id,v_workflow_template_version_id,
    v_instance_id,null,(select routing_decision_id from qarar_topics.topics where id=v_topic_id));
  perform qarar_audit.append_audit_log(v_org,'governance.prior_route.draft','topic_prior_route_requests',v_request_id,
    jsonb_build_object('topic_id',v_topic_id,'evidence_councils',v_selected,'covered_steps',v_inserted));
  return jsonb_build_object('topic_id',v_topic_id,'request_id',v_request_id,'status','draft',
    'evidence',(select jsonb_agg(jsonb_build_object('id',e.id,'template_step_id',e.template_step_id,'sequence_no',e.sequence_no) order by e.sequence_no)
      from qarar_governance.topic_prior_route_step_evidence e where e.request_id=v_request_id));
end $$;

alter function qarar_governance.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid) owner to qarar_governance_executor;
alter function qarar_governance.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid),
  qarar_governance.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid),
  qarar_governance.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid)
to qarar_api_executor;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname='topic_prior_route_council_groups'
on conflict(function_oid) do update set function_name=excluded.function_name,
  identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,
  owning_schema=excluded.owning_schema,is_rls_predicate=false;

select pg_notify('pgrst','reload schema');

commit;
