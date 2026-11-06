-- Keep the topic's current governance unit aligned with the active workflow
-- step that owns it. Impact map:
-- docs/engineering/impact/WORKFLOW_CURRENT_UNIT_AGENDA_SUGGESTIONS_20261021_AR.md
begin;

do $migration$
declare
  v_definition text;
  v_marker text := $marker$  perform qarar_topics.apply_governance_snapshot(
    p_topic_id, source, 'routing_ready',
    (select policy_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    (select policy_version_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    (select policy_item_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    (select policy_scope_assignment_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    i.workflow_template_version_id, i.id, n,
    (select routing_decision_id from qarar_topics.topics where id=p_topic_id and organization_id=o)
  );
$marker$;
  v_replacement text := v_marker || $replacement$
  if n is not null then
    update qarar_topics.topics topic
       set current_unit_id = next_step.assigned_unit_id,
           updated_at = now()
      from qarar_governance.workflow_instance_steps next_step
     where topic.id = p_topic_id
       and topic.organization_id = o
       and next_step.id = n
       and next_step.organization_id = o
       and next_step.workflow_instance_id = i.id
       and next_step.status = 'active'
       and next_step.assigned_unit_id is not null;

    if not found then
      raise exception using
        errcode = '55000',
        message = 'تعذر إسناد الموضوع إلى المجلس المسؤول عن الخطوة التالية';
    end if;
  end if;
$replacement$;
begin
  select pg_get_functiondef(
    'qarar_governance.act_topic_workflow_step_core(uuid,text,text,uuid,integer)'::regprocedure
  ) into v_definition;

  if position(v_marker in v_definition) = 0 then
    raise exception 'act_topic_workflow_step_core snapshot marker was not found';
  end if;

  execute replace(v_definition, v_marker, v_replacement);
end
$migration$;

-- Repair only active, internally consistent workflow records whose denormalized
-- current unit was left at the preceding council. Re-running is a no-op.
do $repair$
declare
  v_row record;
begin
  for v_row in
    with mismatches as (
      select
        topic.id,
        topic.organization_id,
        topic.current_unit_id as previous_unit_id,
        step.assigned_unit_id as current_unit_id,
        instance.id as workflow_instance_id,
        step.id as workflow_step_id
      from qarar_topics.topics topic
      join qarar_governance.workflow_instances instance
        on instance.id = topic.workflow_instance_id
       and instance.organization_id = topic.organization_id
       and instance.topic_id = topic.id
       and instance.status = 'active'
       and instance.current_step_id = topic.current_workflow_step_id
      join qarar_governance.workflow_instance_steps step
        on step.id = instance.current_step_id
       and step.organization_id = instance.organization_id
       and step.workflow_instance_id = instance.id
       and step.status = 'active'
      where step.assigned_unit_id is not null
        and topic.current_unit_id is distinct from step.assigned_unit_id
    ), repaired as (
      update qarar_topics.topics topic
         set current_unit_id = mismatch.current_unit_id,
             updated_at = now()
        from mismatches mismatch
       where topic.id = mismatch.id
         and topic.organization_id = mismatch.organization_id
      returning
        topic.id,
        topic.organization_id,
        mismatch.previous_unit_id,
        mismatch.current_unit_id,
        mismatch.workflow_instance_id,
        mismatch.workflow_step_id
    )
    select * from repaired
  loop
    perform qarar_audit.append_audit_log(
      v_row.organization_id,
      'governance.topic.current_unit.repaired',
      'topics',
      v_row.id,
      jsonb_build_object(
        'previous_unit_id', v_row.previous_unit_id,
        'current_unit_id', v_row.current_unit_id,
        'workflow_instance_id', v_row.workflow_instance_id,
        'workflow_step_id', v_row.workflow_step_id,
        'migration', '20261021006000_sync_topic_unit_with_active_workflow_step'
      )
    );
  end loop;
end
$repair$;

commit;
