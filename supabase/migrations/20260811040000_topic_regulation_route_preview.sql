begin;

-- Gives topic creators a human-readable route forecast.  It deliberately
-- exposes only responsible parties and transition expectations, never the
-- workflow IDs, permission codes, or raw condition JSON used by the engine.
create or replace function qarar_governance.get_topic_regulation_route_preview(
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
language plpgsql
stable
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_option record;
  v_workflow_name text;
  v_steps jsonb;
begin
  if v_org is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'An active account is required';
  end if;

  perform qarar_iam.assert_permission('topics.create', p_governance_unit_id);

  select * into v_option
  from qarar_governance.eligible_topic_regulation_options(
    p_governance_unit_id, p_topic_category_id, p_priority, p_source_type, p_effective_on
  )
  where policy_id = p_policy_id
    and policy_version_id = p_policy_version_id
    and policy_item_id = p_policy_item_id
    and scope_assignment_id = p_scope_assignment_id;

  if v_option.policy_id is null then
    raise exception using errcode = '23514', message = 'The selected regulation is no longer eligible for this topic';
  end if;

  if v_option.routing_outcome <> 'resolved' or v_option.workflow_template_version_id is null then
    return jsonb_build_object(
      'status', v_option.routing_outcome,
      'workflow_name', null,
      'steps', '[]'::jsonb,
      'message', case v_option.routing_outcome
        when 'custom_route_required' then 'يلزم اعتماد مسار بديل أو استثناء قبل عرض خطوات الموضوع.'
        else 'لا يمكن عرض المسار قبل استكمال جاهزية اللائحة ومسارها.'
      end
    );
  end if;

  select wt.name_ar into v_workflow_name
  from qarar_governance.workflow_template_versions wv
  join qarar_governance.workflow_templates wt
    on wt.id = wv.workflow_template_id and wt.organization_id = wv.organization_id
  where wv.id = v_option.workflow_template_version_id
    and wv.organization_id = v_org;

  select coalesce(jsonb_agg(jsonb_build_object(
    'title', s.name_ar,
    'responsible_entity', coalesce(u.name_ar, c.name_ar, 'الجهة المحددة في المسار'),
    'responsible_role', case s.responsibility
      when 'present' then 'مقدّم الموضوع'
      when 'review' then 'مراجع مختص'
      when 'discuss' then 'أعضاء المجلس'
      when 'recommend' then 'الجهة الموصية'
      when 'initial_approve' then 'صاحب الاعتماد الأولي'
      when 'final_approve' then 'صاحب الاعتماد النهائي'
      when 'execute' then 'الجهة المنفذة'
      when 'follow_up' then 'جهة المتابعة'
      else 'المسؤول في المسار'
    end,
    'transition_requirement', case s.step_type
      when 'review' then 'اكتمال المتطلبات والمستندات المطلوبة.'
      when 'discussion' then 'إدراج الموضوع في جدول الأعمال وانعقاد الجلسة.'
      when 'recommendation' then 'تسجيل التوصية في محضر الجلسة.'
      when 'approval' then 'اتخاذ قرار الاعتماد ضمن الصلاحية المحددة.'
      when 'execution' then 'صدور القرار وإحالته للتنفيذ.'
      when 'follow_up' then 'توثيق نتيجة المتابعة وإقفال الإجراء.'
      else 'استيفاء شروط الخطوة السابقة.'
    end,
    'expected_duration', case
      when coalesce(s.entry_conditions->>'estimated_days', '') ~ '^[1-9][0-9]*$'
        then 'خلال ' || (s.entry_conditions->>'estimated_days') || ' يومًا'
      else null
    end
  ) order by s.sequence_no), '[]'::jsonb)
  into v_steps
  from qarar_governance.workflow_template_steps s
  left join qarar_core.governance_units u
    on u.id = s.governance_unit_id and u.organization_id = s.organization_id
  left join qarar_governance.governance_unit_classes c
    on c.id = s.governance_class_id and c.organization_id = s.organization_id
  where s.workflow_template_version_id = v_option.workflow_template_version_id
    and s.organization_id = v_org;

  return jsonb_build_object(
    'status', 'ready',
    'workflow_name', coalesce(v_workflow_name, 'مسار الاعتماد'),
    'steps', v_steps,
    'message', 'هذه معاينة للمسار الذي سيبدأ بعد إنشاء الموضوع.'
  );
end;
$$;

alter function qarar_governance.get_topic_regulation_route_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_regulation_route_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.get_topic_regulation_route_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  to qarar_api_executor;
grant usage on schema qarar_governance to qarar_api_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'governance', n.nspname, false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_governance'
  and p.proname = 'get_topic_regulation_route_preview'
on conflict(function_oid) do update set
  function_name = excluded.function_name,
  identity_arguments = excluded.identity_arguments,
  module_code = excluded.module_code,
  owning_schema = excluded.owning_schema,
  is_rls_predicate = false;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
) values (
  'v1', 'get_topic_regulation_route_preview', 'qarar_governance', 'get_topic_regulation_route_preview',
  'p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid',
  'governance', 'authenticated'
) on conflict (api_version, contract_name, identity_arguments) do update set
  implementation_schema = excluded.implementation_schema,
  implementation_name = excluded.implementation_name,
  identity_arguments = excluded.identity_arguments,
  module_code = excluded.module_code,
  audience = excluded.audience;

create or replace function api_v1.get_topic_regulation_route_preview(
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
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select qarar_governance.get_topic_regulation_route_preview($1,$2,$3,$4,$5,$6,$7,$8,$9)
$$;

alter function api_v1.get_topic_regulation_route_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  owner to qarar_api_executor;
revoke all on function api_v1.get_topic_regulation_route_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  from public, anon;
grant execute on function api_v1.get_topic_regulation_route_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  to authenticated, service_role;

commit;
