begin;

create or replace function qarar_governance.get_governance_authoring_options_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('governance.model.edit',null);
  return jsonb_build_object(
    'classifications',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'code',c.code,'name_ar',c.name_ar,'reference_number',c.reference_number
      ) order by c.name_ar,c.code)
      from qarar_governance.topic_classifications_v2 c
      where c.organization_id=v_org and c.status in ('draft','under_review','approved','effective')
    ),'[]'::jsonb),
    'workflow_versions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',v.id,'template_id',t.id,'code',t.code,'name_ar',t.name_ar,
        'version_no',v.version_no,'reference_label',t.code||':v'||v.version_no,
        'steps',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',s.id,'name_ar',s.name_ar,'sequence_no',s.sequence_no,
            'governance_unit_id',s.governance_unit_id,'governance_class_id',s.governance_class_id,
            'is_initial',s.is_initial,'is_terminal',s.is_terminal
          ) order by s.sequence_no,s.id)
          from qarar_governance.workflow_template_steps s
          where s.organization_id=v_org and s.workflow_template_version_id=v.id
        ),'[]'::jsonb)
      ) order by t.name_ar,t.code,v.version_no desc)
      from qarar_governance.workflow_templates t
      join qarar_governance.workflow_template_versions v
        on v.workflow_template_id=t.id and v.organization_id=t.organization_id
      where t.organization_id=v_org and t.status='active'
        and v.status='active' and v.validation_status='valid'
    ),'[]'::jsonb)
  );
end;
$$;

alter function qarar_governance.get_governance_authoring_options_v2() owner to qarar_governance_executor;
revoke all on function qarar_governance.get_governance_authoring_options_v2()
from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_governance_authoring_options_v2()
to qarar_governance_executor;

create or replace function api_v2.get_governance_authoring_options_v2()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin
  v_data:=qarar_governance.get_governance_authoring_options_v2();
  return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then
  get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
  return api_v2.governance_error_envelope(v_state,v_message,v_trace);
end;
$$;

alter function api_v2.get_governance_authoring_options_v2() owner to qarar_api_executor;
revoke all on function api_v2.get_governance_authoring_options_v2()
from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_governance_authoring_options_v2()
to qarar_api_executor;
grant execute on function api_v2.get_governance_authoring_options_v2()
to qarar_api_executor;

commit;
