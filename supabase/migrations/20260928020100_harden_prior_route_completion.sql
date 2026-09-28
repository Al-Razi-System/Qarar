begin;

-- Bind every submitted proof to the exact workflow selected by the regulation.
-- The request may only complete a contiguous prefix and must leave at least one
-- system-managed step. This prevents crafted clients from proving steps that
-- belong to another template or from skipping a gap in the route.
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
  v_workflow_template_version_id uuid;v_inserted integer;
begin
  if v_org is null or v_actor is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
  perform qarar_iam.assert_permission('topics.create',p_current_unit_id);
  perform qarar_iam.assert_permission('governance.prior_route.request',p_current_unit_id);
  if jsonb_typeof(p_evidence)<>'array' then raise exception using errcode='22023',message='بيانات المراحل السابقة غير صالحة';end if;
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
  select count(*) into v_total
  from qarar_governance.workflow_template_steps step_row
  where step_row.organization_id=v_org
    and step_row.workflow_template_version_id=v_workflow_template_version_id;
  if v_selected<1 or v_selected>=v_total then
    raise exception using errcode='22023',message='اختر مرحلة سابقة واحدة على الأقل واترك مرحلة متبقية للنظام';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_evidence) with ordinality evidence(value,position)
    left join qarar_governance.workflow_template_steps step_row
      on step_row.organization_id=v_org
      and step_row.workflow_template_version_id=v_workflow_template_version_id
      and step_row.id=case when coalesce(evidence.value->>'template_step_id','')
        ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        then (evidence.value->>'template_step_id')::uuid end
      and step_row.sequence_no=evidence.position
    where step_row.id is null
      or coalesce(evidence.value->>'meeting_date','')!~'^\d{4}-\d{2}-\d{2}$'
      or (evidence.value->>'meeting_date')::date>current_date
      or coalesce(evidence.value->>'decision_type','') not in ('approved','recommended','referred','completed')
      or char_length(btrim(coalesce(evidence.value->>'decision_text','')))<3
      or char_length(btrim(coalesce(evidence.value->>'bypass_reason','')))<10
  ) then raise exception using errcode='22023',message='أكمل تاريخ وقرار وسبب كل مرحلة سابقة بالترتيب';end if;

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
  join qarar_governance.workflow_template_steps template_step
    on template_step.organization_id=v_org
    and template_step.workflow_template_version_id=v_workflow_template_version_id
    and template_step.id=(evidence.value->>'template_step_id')::uuid
    and template_step.sequence_no=evidence.position
  join qarar_governance.workflow_instance_steps instance_step
    on instance_step.organization_id=v_org and instance_step.workflow_instance_id=v_instance_id
    and instance_step.template_step_id=template_step.id;
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_selected then
    raise exception using errcode='23514',message='تعذر مطابقة جميع المراحل السابقة مع المسار اللائحي';
  end if;
  update qarar_governance.topic_governance_mappings set routing_status='routing_pending',
    snapshot=snapshot||jsonb_build_object('prior_route_request_id',v_request_id,'prior_route_status','draft')
    where topic_id=v_topic_id and organization_id=v_org;
  perform qarar_topics.apply_governance_snapshot(v_topic_id,'regulated','routing_pending',p_policy_id,p_policy_version_id,
    p_policy_item_id,p_scope_assignment_id,v_workflow_template_version_id,
    v_instance_id,null,(select routing_decision_id from qarar_topics.topics where id=v_topic_id));
  perform qarar_audit.append_audit_log(v_org,'governance.prior_route.draft','topic_prior_route_requests',v_request_id,
    jsonb_build_object('topic_id',v_topic_id,'evidence_steps',v_selected));
  return jsonb_build_object('topic_id',v_topic_id,'request_id',v_request_id,'status','draft',
    'evidence',(select jsonb_agg(jsonb_build_object('id',e.id,'template_step_id',e.template_step_id,'sequence_no',e.sequence_no) order by e.sequence_no)
      from qarar_governance.topic_prior_route_step_evidence e where e.request_id=v_request_id));
end $$;

alter function qarar_governance.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function qarar_governance.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid)
  to qarar_api_executor;

commit;
