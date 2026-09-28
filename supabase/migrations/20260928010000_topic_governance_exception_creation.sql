begin;

-- Creates an exception request without first starting the regulatory workflow.
-- The matched regulation is retained on the topic as the route being departed
-- from, while the alternative workflow remains blocked until independent review.
create or replace function qarar_governance.create_topic_governance_exception_request(
  p_title_ar text,
  p_description text,
  p_category_id uuid,
  p_current_unit_id uuid,
  p_workflow_template_version_id uuid,
  p_reason text,
  p_valid_until timestamptz,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_title_en text default null,
  p_client_request_id uuid default null,
  p_effective_on date default current_date
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_actor uuid := auth.uid();
  v_topic jsonb;
  v_topic_id uuid;
  v_match jsonb;
  v_exception_id uuid;
  v_existing_exception qarar_governance.governance_exceptions%rowtype;
begin
  if v_org is null or v_actor is null then
    raise exception using errcode = '42501', message = 'يلزم حساب نشط';
  end if;

  perform qarar_iam.assert_permission('topics.create', p_current_unit_id);
  perform qarar_iam.assert_permission('governance.exceptions.request', p_current_unit_id);

  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception using errcode = '22023', message = 'سبب الاستثناء مطلوب وبحد أدنى عشرة أحرف';
  end if;
  if p_valid_until is null or p_valid_until <= now() then
    raise exception using errcode = '22023', message = 'حدد تاريخ انتهاء مستقبليًا للاستثناء';
  end if;
  if not exists (
    select 1
    from qarar_governance.workflow_template_versions v
    where v.id = p_workflow_template_version_id
      and v.organization_id = v_org
      and v.status = 'active'
      and v.validation_status = 'valid'
  ) then
    raise exception using errcode = '23514', message = 'المسار البديل غير نشط أو غير مكتمل';
  end if;

  v_topic := qarar_topics.create_topic_unrouted(
    p_title_ar, p_description, p_category_id, p_current_unit_id,
    p_priority, p_source_type, p_title_en, p_client_request_id
  );
  v_topic_id := (v_topic ->> 'id')::uuid;

  if coalesce((v_topic ->> 'idempotent_replay')::boolean, false) then
    select * into v_existing_exception
    from qarar_governance.governance_exceptions
    where topic_id = v_topic_id and organization_id = v_org
    order by requested_at desc
    limit 1;
    return v_topic || jsonb_build_object(
      'topic_id', v_topic_id,
      'exception_id', v_existing_exception.id,
      'status', v_existing_exception.status,
      'routing_status', (select routing_status from qarar_topics.topics where id = v_topic_id)
    );
  end if;

  v_match := qarar_governance.resolve_topic_governance(
    p_current_unit_id, p_category_id, coalesce(p_effective_on, current_date), v_topic_id
  );

  perform qarar_topics.apply_governance_snapshot(
    v_topic_id,
    'exception',
    'routing_exception_pending',
    nullif(v_match ->> 'policy_id', '')::uuid,
    nullif(v_match ->> 'policy_version_id', '')::uuid,
    nullif(v_match ->> 'policy_item_id', '')::uuid,
    nullif(v_match ->> 'scope_assignment_id', '')::uuid,
    p_workflow_template_version_id,
    null,
    null,
    (v_match ->> 'decision_id')::uuid
  );

  insert into qarar_governance.governance_exceptions(
    organization_id, topic_id, requested_source, requested_route, reason,
    status, requested_by_user_id, valid_until
  ) values (
    v_org, v_topic_id, 'exception',
    jsonb_build_object(
      'workflow_template_version_id', p_workflow_template_version_id,
      'departed_from', jsonb_build_object(
        'policy_id', v_match ->> 'policy_id',
        'policy_version_id', v_match ->> 'policy_version_id',
        'policy_item_id', v_match ->> 'policy_item_id',
        'matching_outcome', v_match ->> 'outcome'
      )
    ),
    btrim(p_reason), 'pending', v_actor, p_valid_until
  ) returning id into v_exception_id;

  perform qarar_audit.append_audit_log(
    v_org, 'governance.exception.request', 'governance_exceptions', v_exception_id,
    jsonb_build_object(
      'topic_id', v_topic_id,
      'matching_outcome', v_match ->> 'outcome',
      'alternative_workflow_template_version_id', p_workflow_template_version_id
    )
  );

  return v_topic || v_match || jsonb_build_object(
    'topic_id', v_topic_id,
    'exception_id', v_exception_id,
    'status', 'pending',
    'governance_source', 'exception',
    'routing_status', 'routing_exception_pending'
  );
end;
$$;

alter function qarar_governance.create_topic_governance_exception_request(
  text,text,uuid,uuid,uuid,text,timestamptz,text,text,text,uuid,date
) owner to qarar_governance_executor;
revoke all on function qarar_governance.create_topic_governance_exception_request(
  text,text,uuid,uuid,uuid,text,timestamptz,text,text,text,uuid,date
) from public, anon, authenticated, service_role;
grant execute on function qarar_governance.create_topic_governance_exception_request(
  text,text,uuid,uuid,uuid,text,timestamptz,text,text,text,uuid,date
) to qarar_api_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid),
  'governance', n.nspname, false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_governance'
  and p.proname = 'create_topic_governance_exception_request'
on conflict (function_oid) do update set
  function_name = excluded.function_name,
  identity_arguments = excluded.identity_arguments,
  module_code = excluded.module_code,
  owning_schema = excluded.owning_schema,
  is_rls_predicate = false;

create or replace function api_v1.create_topic_governance_exception_request(
  p_title_ar text,
  p_description text,
  p_category_id uuid,
  p_current_unit_id uuid,
  p_workflow_template_version_id uuid,
  p_reason text,
  p_valid_until timestamptz,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_title_en text default null,
  p_client_request_id uuid default null,
  p_effective_on date default current_date
) returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select qarar_governance.create_topic_governance_exception_request(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
  )
$$;

alter function api_v1.create_topic_governance_exception_request(
  text,text,uuid,uuid,uuid,text,timestamptz,text,text,text,uuid,date
) owner to qarar_api_executor;
revoke all on function api_v1.create_topic_governance_exception_request(
  text,text,uuid,uuid,uuid,text,timestamptz,text,text,text,uuid,date
) from public, anon;
grant execute on function api_v1.create_topic_governance_exception_request(
  text,text,uuid,uuid,uuid,text,timestamptz,text,text,text,uuid,date
) to authenticated, service_role;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
) values (
  'v1', 'create_topic_governance_exception_request',
  'qarar_governance', 'create_topic_governance_exception_request',
  'p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_workflow_template_version_id uuid, p_reason text, p_valid_until timestamptz, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid, p_effective_on date',
  'governance', 'authenticated'
) on conflict (api_version, contract_name, identity_arguments) do update set
  implementation_schema = excluded.implementation_schema,
  implementation_name = excluded.implementation_name,
  module_code = excluded.module_code,
  audience = excluded.audience,
  deprecated_at = null,
  replacement_contract = null;

commit;
