begin;

create or replace function qarar_governance.admin_list_workflow_templates()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('governance.workflows.manage', null);

  return jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'code', t.code,
          'name_ar', t.name_ar,
          'name_en', t.name_en,
          'description', t.description,
          'status', t.status,
          'versions', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', v.id,
                'version_no', v.version_no,
                'status', v.status,
                'allow_cycles', v.allow_cycles,
                'validation_status', v.validation_status,
                'validation_errors', v.validation_errors,
                'updated_at', v.updated_at,
                'steps', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', s.id,
                      'workflow_template_version_id', s.workflow_template_version_id,
                      'step_code', s.step_code,
                      'name_ar', s.name_ar,
                      'sequence_no', s.sequence_no,
                      'step_type', s.step_type,
                      'responsibility', s.responsibility,
                      'governance_unit_id', s.governance_unit_id,
                      'governance_class_id', s.governance_class_id,
                      'required_permission_code', s.required_permission_code,
                      'is_initial', s.is_initial,
                      'is_terminal', s.is_terminal,
                      'entry_conditions', s.entry_conditions,
                      'exit_conditions', s.exit_conditions,
                      'allowed_outcomes', to_jsonb(s.allowed_outcomes)
                    ) order by s.sequence_no, s.id
                  )
                  from qarar_governance.workflow_template_steps s
                  where s.workflow_template_version_id = v.id
                    and s.organization_id = v_org
                ), '[]'::jsonb),
                'transitions', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', tr.id,
                      'workflow_template_version_id', tr.workflow_template_version_id,
                      'from_step_id', tr.from_step_id,
                      'to_step_id', tr.to_step_id,
                      'outcome_code', tr.outcome_code,
                      'transition_type', tr.transition_type,
                      'conditions', tr.conditions
                    ) order by tr.created_at, tr.id
                  )
                  from qarar_governance.workflow_template_transitions tr
                  where tr.workflow_template_version_id = v.id
                    and tr.organization_id = v_org
                ), '[]'::jsonb)
              ) order by v.version_no desc
            )
            from qarar_governance.workflow_template_versions v
            where v.workflow_template_id = t.id
              and v.organization_id = v_org
          ), '[]'::jsonb)
        ) order by t.name_ar, t.code
      )
      from qarar_governance.workflow_templates t
      where t.organization_id = v_org
    ), '[]'::jsonb)
  );
end
$$;

comment on function qarar_governance.admin_list_workflow_templates() is
  'Returns workflow templates with complete versions, steps, and transitions for the governance designer.';

commit;
