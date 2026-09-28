begin;

-- Some reusable templates point to a governance class and resolve the concrete
-- unit only when the workflow starts. Keep that class as the council identity
-- instead of hiding the stage when early concrete resolution is unavailable.
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
      coalesce(resolved_unit_id,governance_unit_id,governance_class_id) as council_key,
      resolved_unit_id,governance_unit_id,governance_class_id,
      min(sequence_no) as first_sequence,
      array_agg(id order by sequence_no) as step_ids,
      (array_agg(id order by case when step_type='voting' then 0 else 1 end,sequence_no desc))[1] as primary_step_id,
      (array_agg(name_ar order by case when step_type='voting' then 0 else 1 end,sequence_no desc))[1] as group_title,
      (array_agg(step_type order by case when step_type='voting' then 0 else 1 end,sequence_no desc))[1] as primary_step_type,
      (array_agg(responsibility order by case when step_type='voting' then 0 else 1 end,sequence_no desc))[1] as primary_responsibility,
      array_agg(name_ar order by sequence_no) as step_titles
    from resolved_steps
    where coalesce(resolved_unit_id,governance_unit_id,governance_class_id) is not null
    group by coalesce(resolved_unit_id,governance_unit_id,governance_class_id),
      resolved_unit_id,governance_unit_id,governance_class_id
    having bool_or(step_type='voting')
  )
  select row_number() over(order by g.first_sequence),g.council_key,g.step_ids,g.primary_step_id,
    g.first_sequence,g.group_title,g.primary_step_type,g.primary_responsibility,g.resolved_unit_id,
    coalesce(resolved_unit.name_ar,explicit_unit.name_ar,unit_class.name_ar,'المجلس المحدد في المسار'),
    g.step_titles
  from council_groups g
  left join qarar_core.governance_units resolved_unit
    on resolved_unit.id=g.resolved_unit_id and resolved_unit.organization_id=qarar_iam.current_organization_id()
  left join qarar_core.governance_units explicit_unit
    on explicit_unit.id=g.governance_unit_id and explicit_unit.organization_id=qarar_iam.current_organization_id()
  left join qarar_governance.governance_unit_classes unit_class
    on unit_class.id=g.governance_class_id and unit_class.organization_id=qarar_iam.current_organization_id()
  order by g.first_sequence
$$;

alter function qarar_governance.topic_prior_route_council_groups(uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.topic_prior_route_council_groups(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.topic_prior_route_council_groups(uuid,uuid) to qarar_governance_executor;

select pg_notify('pgrst','reload schema');

commit;
