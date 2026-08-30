begin;

-- A topic creator may inspect an eligible regulation without receiving the
-- administration-only legislative model or its technical identifiers.  The
-- selection is revalidated against the same matcher used by the creation
-- command, so a client cannot use this preview to discover unrelated policy
-- content.
create or replace function qarar_governance.get_topic_regulation_preview(
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
  v_item record;
  v_unit_name text;
  v_workflow_name text;
  v_rules jsonb;
  v_requirements jsonb;
  v_attachments jsonb;
  v_route_text text;
  v_approval_effect text;
  v_voting_effect text;
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

  select title_ar, coalesce(nullif(btrim(official_text), ''), nullif(btrim(body_text), '')) as official_text,
         nullif(btrim(interpretation_text), '') as interpretation_text
  into v_item
  from qarar_governance.policy_items
  where id = p_policy_item_id
    and policy_version_id = p_policy_version_id
    and organization_id = v_org;

  select name_ar into v_unit_name
  from qarar_core.governance_units
  where id = p_governance_unit_id and organization_id = v_org;

  select wt.name_ar into v_workflow_name
  from qarar_governance.workflow_template_versions wv
  join qarar_governance.workflow_templates wt
    on wt.id = wv.workflow_template_id and wt.organization_id = wv.organization_id
  where wv.id = v_option.workflow_template_version_id
    and wv.organization_id = v_org;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', r.name_ar,
    'description', coalesce(nullif(btrim(r.description), ''), 'تطبق هذه القاعدة عند استيفاء بيانات الموضوع.'),
    'requires_workflow', r.requires_workflow
  ) order by r.priority desc, r.name_ar), '[]'::jsonb)
  into v_rules
  from qarar_governance.policy_rules r
  where r.policy_item_id = p_policy_item_id
    and r.organization_id = v_org
    and r.status = 'active'
    and (r.valid_from is null or p_effective_on >= r.valid_from)
    and (r.valid_to is null or p_effective_on <= r.valid_to);

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', q.name_ar,
    'type', q.requirement_type,
    'mandatory', q.is_mandatory,
    'timing', q.timing
  ) order by r.priority desc, q.sequence_no), '[]'::jsonb)
  into v_requirements
  from qarar_governance.policy_rules r
  join qarar_governance.rule_requirements q
    on q.policy_rule_id = r.id and q.organization_id = r.organization_id
  where r.policy_item_id = p_policy_item_id
    and r.organization_id = v_org
    and r.status = 'active'
    and (r.valid_from is null or p_effective_on >= r.valid_from)
    and (r.valid_to is null or p_effective_on <= r.valid_to);

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', a.file_name,
    'description', nullif(btrim(a.description), '')
  ) order by a.created_at), '[]'::jsonb)
  into v_attachments
  from qarar_governance.policy_attachments a
  where a.organization_id = v_org
    and (a.policy_id = p_policy_id or a.policy_version_id = p_policy_version_id or a.policy_item_id = p_policy_item_id);

  if v_option.routing_outcome = 'resolved' then
    v_route_text := coalesce(v_workflow_name, 'مسار الاعتماد المعتمد') || '؛ يبدأ تلقائيًا بعد إنشاء الموضوع.';
    v_approval_effect := 'سيُنشأ مسار الاعتماد تلقائيًا وتُفتح أول خطوة للمسؤول عنها. لا يُعتمد الموضوع خارج هذا المسار.';
    v_voting_effect := 'إذا تضمّن المسار خطوة تصويت، فسيطبق النظام نصاب وأغلبية قالب المجلس المعتمد تلقائيًا.';
  elsif v_option.routing_outcome = 'custom_route_required' then
    v_route_text := 'يتطلب مسارًا مخصصًا أو استثناءً معتمدًا قبل البدء.';
    v_approval_effect := 'لن يبدأ الاعتماد تلقائيًا قبل اعتماد مسار بديل أو استثناء.';
    v_voting_effect := 'لا يتاح التصويت قبل اعتماد المسار البديل وربطه بالموضوع.';
  else
    v_route_text := 'المسار غير مكتمل الجاهزية حاليًا.';
    v_approval_effect := 'لا يمكن بدء الاعتماد قبل استكمال إعدادات اللائحة أو مسارها.';
    v_voting_effect := 'لا يفتح أي تصويت حتى تصبح اللائحة والمسار جاهزين.';
  end if;

  return jsonb_build_object(
    'article', jsonb_build_object(
      'title', coalesce(v_item.title_ar, v_option.item_title_ar),
      'official_text', coalesce(v_item.official_text, 'لم يُسجل نص المادة في النسخة النافذة بعد.'),
      'interpretation', v_item.interpretation_text
    ),
    'rule_summary', v_rules,
    'scope', jsonb_build_object(
      'target_name', coalesce(v_unit_name, 'الجهة المختارة'),
      'description', case v_option.scope_type
        when 'organization' then 'تنطبق على الجهة المختارة ضمن نطاق المنظمة كاملة.'
        when 'governance_unit' then 'تنطبق مباشرة على الجهة المختارة.'
        when 'unit_subtree' then 'تنطبق على الجهة المختارة ووحداتها التابعة.'
        when 'governance_class' then 'تنطبق على الجهة المختارة بحسب تصنيفها المؤسسي.'
        when 'governance_level' then 'تنطبق على الجهة المختارة بحسب مستواها التنظيمي.'
        when 'governance_unit_type' then 'تنطبق على الجهة المختارة بحسب نوعها التنظيمي.'
        else 'تنطبق على الجهة المختارة ضمن نطاق اللائحة المحدد.'
      end
    ),
    'workflow', jsonb_build_object('name', v_workflow_name, 'description', v_route_text),
    'requirements', v_requirements,
    'attachments', v_attachments,
    'approval_effect', v_approval_effect,
    'voting_effect', v_voting_effect
  );
end;
$$;

alter function qarar_governance.get_topic_regulation_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_regulation_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.get_topic_regulation_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  to qarar_api_executor;
grant usage on schema qarar_governance to qarar_api_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'governance', n.nspname, false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_governance'
  and p.proname = 'get_topic_regulation_preview'
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
  'v1', 'get_topic_regulation_preview', 'qarar_governance', 'get_topic_regulation_preview',
  'p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid',
  'governance', 'authenticated'
) on conflict (api_version, contract_name, identity_arguments) do update set
  implementation_schema = excluded.implementation_schema,
  implementation_name = excluded.implementation_name,
  identity_arguments = excluded.identity_arguments,
  module_code = excluded.module_code,
  audience = excluded.audience;

create or replace function api_v1.get_topic_regulation_preview(
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
  select qarar_governance.get_topic_regulation_preview($1,$2,$3,$4,$5,$6,$7,$8,$9)
$$;

alter function api_v1.get_topic_regulation_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  owner to qarar_api_executor;
revoke all on function api_v1.get_topic_regulation_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  from public, anon;
grant execute on function api_v1.get_topic_regulation_preview(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)
  to authenticated, service_role;

commit;
