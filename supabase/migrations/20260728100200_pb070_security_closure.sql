begin;

create or replace function qarar_governance.get_topic_regulation_options(
  p_governance_unit_id uuid,
  p_topic_category_id uuid,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_effective_on date default current_date
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_items jsonb;
begin
  if v_org is null or auth.uid() is null then
    raise exception using errcode='42501',message='An active account is required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'selection',jsonb_build_object('policy_id',policy_id,'policy_version_id',policy_version_id,
      'policy_item_id',policy_item_id,'scope_assignment_id',scope_assignment_id),
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
  return jsonb_build_object('governance_unit_id',p_governance_unit_id,
    'topic_category_id',p_topic_category_id,'effective_on',p_effective_on,
    'items',v_items,'total',jsonb_array_length(v_items));
end;
$$;

alter function qarar_governance.get_topic_regulation_options(uuid,uuid,text,text,date) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_regulation_options(uuid,uuid,text,text,date) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_topic_regulation_options(uuid,uuid,text,text,date) to qarar_api_executor;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)
values
 ('topics','qarar_governance','topic_governance_mappings','Return the immutable selected-regulation snapshot for an idempotent topic-create replay'),
 ('topics','qarar_governance','workflow_instances','Return the workflow state for an idempotent topic-create replay')
on conflict do nothing;
grant usage on schema qarar_governance to qarar_topics_executor;
grant select on qarar_governance.topic_governance_mappings,qarar_governance.workflow_instances to qarar_topics_executor;

commit;
