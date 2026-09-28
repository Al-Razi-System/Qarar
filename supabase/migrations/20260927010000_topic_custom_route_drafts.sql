begin;

create table qarar_governance.topic_custom_route_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid not null,
  name_ar text not null,
  rationale text not null,
  status text not null default 'submitted',
  submitted_by_user_id uuid not null,
  submitted_at timestamptz not null default now(),
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(topic_id),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (topic_id, organization_id)
    references qarar_topics.topics(id, organization_id) on delete restrict,
  foreign key (submitted_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (reviewed_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (char_length(btrim(name_ar)) between 3 and 200),
  check (char_length(btrim(rationale)) between 10 and 4000),
  check (status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  check (reviewed_by_user_id is null or reviewed_by_user_id <> submitted_by_user_id),
  check ((status in ('draft', 'submitted') and reviewed_by_user_id is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by_user_id is not null and reviewed_at is not null)
    or status = 'cancelled')
);

create table qarar_governance.topic_custom_route_draft_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  custom_route_draft_id uuid not null,
  sequence_no integer not null,
  name_ar text not null,
  step_type text not null,
  responsibility text not null,
  governance_unit_id uuid not null,
  allowed_outcomes text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(custom_route_draft_id, sequence_no),
  foreign key (custom_route_draft_id, organization_id)
    references qarar_governance.topic_custom_route_drafts(id, organization_id) on delete restrict,
  foreign key (governance_unit_id, organization_id)
    references qarar_core.governance_units(id, organization_id) on delete restrict,
  check (sequence_no > 0),
  check (char_length(btrim(name_ar)) between 3 and 200),
  check (step_type in ('review', 'discussion', 'recommendation', 'approval', 'execution', 'follow_up')),
  check (responsibility in (
    'present', 'review', 'discuss', 'recommend', 'initial_approve',
    'final_approve', 'execute', 'follow_up'
  )),
  check (cardinality(allowed_outcomes) > 0),
  check (allowed_outcomes <@ array['approved','rejected','returned','completed','cancelled']::text[])
);

create index topic_custom_route_drafts_review_idx
  on qarar_governance.topic_custom_route_drafts(organization_id, status, submitted_at desc);

alter table qarar_governance.topic_custom_route_drafts enable row level security;
alter table qarar_governance.topic_custom_route_drafts force row level security;
alter table qarar_governance.topic_custom_route_draft_steps enable row level security;
alter table qarar_governance.topic_custom_route_draft_steps force row level security;

create or replace function qarar_governance.create_topic_custom_route_draft(
  p_title_ar text,
  p_description text,
  p_category_id uuid,
  p_current_unit_id uuid,
  p_route_name_ar text,
  p_rationale text,
  p_steps jsonb,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_title_en text default null,
  p_client_request_id uuid default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_actor uuid := auth.uid();
  v_topic jsonb;
  v_topic_id uuid;
  v_draft_id uuid;
  v_mapping_id uuid;
  v_step_count integer;
begin
  if v_org is null or v_actor is null then
    raise exception using errcode = '42501', message = 'يلزم حساب نشط ومصادق عليه';
  end if;
  perform qarar_iam.assert_permission('topics.create', p_current_unit_id);

  if char_length(btrim(coalesce(p_route_name_ar, ''))) < 3 then
    raise exception using errcode = '22023', message = 'أدخل اسمًا واضحًا للمسار المخصص';
  end if;
  if char_length(btrim(coalesce(p_rationale, ''))) < 10 then
    raise exception using errcode = '22023', message = 'اكتب سبب الحاجة إلى المسار المخصص';
  end if;
  if jsonb_typeof(p_steps) <> 'array' then
    raise exception using errcode = '22023', message = 'مراحل المسار غير صالحة';
  end if;
  v_step_count := jsonb_array_length(p_steps);
  if v_step_count < 2 or v_step_count > 12 then
    raise exception using errcode = '22023', message = 'يجب أن يحتوي المسار على مرحلتين إلى 12 مرحلة';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_steps) with ordinality as step(value, sequence_no)
    where char_length(btrim(coalesce(step.value->>'name_ar', ''))) < 3
      or coalesce(step.value->>'step_type', '') not in ('review', 'discussion', 'recommendation', 'approval', 'execution', 'follow_up')
      or coalesce(step.value->>'responsibility', '') not in (
        'present', 'review', 'discuss', 'recommend', 'initial_approve', 'final_approve', 'execute', 'follow_up'
      )
      or coalesce(step.value->>'governance_unit_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception using errcode = '22023', message = 'أكمل اسم ونوع ومسؤول كل مرحلة';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_steps) as step(value)
    left join qarar_core.governance_units unit
      on unit.id = (step.value->>'governance_unit_id')::uuid
      and unit.organization_id = v_org
      and unit.status = 'active'
    where unit.id is null
  ) then
    raise exception using errcode = '23514', message = 'توجد مرحلة مرتبطة بجهة غير نشطة أو خارج المؤسسة';
  end if;

  v_topic := qarar_topics.create_topic_with_workflow(
    p_title_ar, p_description, p_category_id, p_current_unit_id,
    p_priority, p_source_type, p_title_en, p_client_request_id
  );
  v_topic_id := (v_topic->>'id')::uuid;

  select id into v_draft_id
  from qarar_governance.topic_custom_route_drafts
  where topic_id = v_topic_id and organization_id = v_org;
  if v_draft_id is not null then
    return jsonb_build_object(
      'topic_id', v_topic_id,
      'custom_route_draft_id', v_draft_id,
      'status', 'submitted',
      'idempotent_replay', true
    );
  end if;

  if exists (
    select 1 from qarar_governance.workflow_instances
    where topic_id = v_topic_id and organization_id = v_org
  ) then
    raise exception using errcode = '55000',
      message = 'يوجد مسار لائحي جاهز لهذا الموضوع؛ استخدم طلب الاستثناء إذا أردت تغييره';
  end if;

  select id into v_mapping_id
  from qarar_governance.topic_governance_mappings
  where topic_id = v_topic_id and organization_id = v_org
  for update;
  if v_mapping_id is null then
    raise exception using errcode = '55000', message = 'تعذر تثبيت نتيجة فحص الحوكمة للموضوع';
  end if;

  insert into qarar_governance.topic_custom_route_drafts(
    organization_id, topic_id, name_ar, rationale, status, submitted_by_user_id
  ) values (
    v_org, v_topic_id, btrim(p_route_name_ar), btrim(p_rationale), 'submitted', v_actor
  ) returning id into v_draft_id;

  insert into qarar_governance.topic_custom_route_draft_steps(
    organization_id, custom_route_draft_id, sequence_no, name_ar,
    step_type, responsibility, governance_unit_id, allowed_outcomes
  )
  select
    v_org,
    v_draft_id,
    step.sequence_no::integer,
    btrim(step.value->>'name_ar'),
    step.value->>'step_type',
    step.value->>'responsibility',
    (step.value->>'governance_unit_id')::uuid,
    case
      when step.sequence_no = v_step_count then array['completed']::text[]
      when step.sequence_no = 1 then array['approved', 'rejected']::text[]
      else array['approved', 'returned', 'rejected']::text[]
    end
  from jsonb_array_elements(p_steps) with ordinality as step(value, sequence_no);

  update qarar_governance.topic_governance_mappings
  set governance_source = 'custom',
      routing_status = 'routing_pending',
      workflow_template_version_id = null,
      snapshot = snapshot || jsonb_build_object(
        'custom_route_draft_id', v_draft_id,
        'custom_route_status', 'submitted',
        'custom_route_submitted_at', now()
      ),
      mapped_by_user_id = v_actor,
      mapped_at = now()
  where id = v_mapping_id and organization_id = v_org;

  update qarar_topics.topics
  set governance_source = 'custom',
      routing_status = 'routing_pending',
      workflow_template_version_id = null,
      workflow_instance_id = null,
      current_workflow_step_id = null,
      updated_at = now()
  where id = v_topic_id and organization_id = v_org;

  perform qarar_audit.append_audit_log(
    v_org,
    'governance.custom_route.submit',
    'topic_custom_route_drafts',
    v_draft_id,
    jsonb_build_object('topic_id', v_topic_id, 'step_count', v_step_count)
  );

  return jsonb_build_object(
    'topic_id', v_topic_id,
    'custom_route_draft_id', v_draft_id,
    'status', 'submitted',
    'routing_status', 'routing_pending',
    'governance_source', 'custom',
    'step_count', v_step_count
  );
end;
$$;

alter function qarar_governance.create_topic_custom_route_draft(
  text, text, uuid, uuid, text, text, jsonb, text, text, text, uuid
) owner to qarar_governance_executor;
revoke all on function qarar_governance.create_topic_custom_route_draft(
  text, text, uuid, uuid, text, text, jsonb, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function qarar_governance.create_topic_custom_route_draft(
  text, text, uuid, uuid, text, text, jsonb, text, text, text, uuid
) to qarar_api_executor;

grant select, insert, update on qarar_governance.topic_custom_route_drafts to qarar_governance_executor;
grant select, insert on qarar_governance.topic_custom_route_draft_steps to qarar_governance_executor;
grant execute on function qarar_topics.create_topic_with_workflow(text,text,uuid,uuid,text,text,text,uuid)
  to qarar_governance_executor;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module, target_schema, function_name, identity_arguments, rationale
) values (
  'governance', 'qarar_topics', 'create_topic_with_workflow',
  'p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid',
  'Create a topic atomically before attaching its independently governed custom route draft.'
) on conflict do nothing;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'governance', n.nspname, false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_governance'
  and p.proname = 'create_topic_custom_route_draft'
on conflict(function_oid) do update set
  function_name = excluded.function_name,
  identity_arguments = excluded.identity_arguments,
  module_code = excluded.module_code,
  owning_schema = excluded.owning_schema,
  is_rls_predicate = false;

create or replace function qarar_governance.admin_list_topic_custom_route_drafts(
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform qarar_iam.assert_permission('governance.exceptions.approve', null);
  if p_status is not null and p_status not in ('draft','submitted','approved','rejected','cancelled') then
    raise exception using errcode = '22023', message = 'حالة مسودة المسار غير صالحة';
  end if;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.submitted_at desc)
      from (
        select
          draft.id,
          draft.topic_id,
          topic.title_ar as topic_title_ar,
          draft.name_ar,
          draft.rationale,
          draft.status,
          draft.submitted_by_user_id,
          draft.submitted_at,
          draft.reviewed_at,
          draft.review_comment,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', step.id,
              'sequence_no', step.sequence_no,
              'name_ar', step.name_ar,
              'step_type', step.step_type,
              'responsibility', step.responsibility,
              'governance_unit_id', step.governance_unit_id,
              'governance_unit_name_ar', unit.name_ar
            ) order by step.sequence_no)
            from qarar_governance.topic_custom_route_draft_steps step
            join qarar_core.governance_units unit
              on unit.id = step.governance_unit_id and unit.organization_id = step.organization_id
            where step.custom_route_draft_id = draft.id
              and step.organization_id = draft.organization_id
          ), '[]'::jsonb) as steps
        from qarar_governance.topic_custom_route_drafts draft
        join qarar_topics.topics topic
          on topic.id = draft.topic_id and topic.organization_id = draft.organization_id
        where draft.organization_id = v_org
          and (p_status is null or draft.status = p_status)
        order by draft.submitted_at desc
        limit v_limit offset v_offset
      ) item
    ), '[]'::jsonb),
    'total', (
      select count(*)
      from qarar_governance.topic_custom_route_drafts draft
      where draft.organization_id = v_org
        and (p_status is null or draft.status = p_status)
    )
  );
end;
$$;

create or replace function qarar_governance.approve_topic_custom_route_draft(
  p_custom_route_draft_id uuid,
  p_approve boolean,
  p_review_comment text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_actor uuid := auth.uid();
  v_draft qarar_governance.topic_custom_route_drafts%rowtype;
  v_mapping qarar_governance.topic_governance_mappings%rowtype;
  v_template_id uuid;
  v_version_id uuid;
  v_instance_id uuid;
  v_current_step_id uuid;
  v_validation jsonb;
begin
  perform qarar_iam.assert_permission('governance.exceptions.approve', null);
  if char_length(btrim(coalesce(p_review_comment, ''))) < 3 then
    raise exception using errcode = '22023', message = 'اكتب ملاحظة المراجعة';
  end if;

  select * into v_draft
  from qarar_governance.topic_custom_route_drafts
  where id = p_custom_route_draft_id
    and organization_id = v_org
    and status = 'submitted'
  for update;
  if v_draft.id is null then
    raise exception using errcode = 'P0002', message = 'مسودة المسار غير موجودة أو تمت مراجعتها';
  end if;
  if v_draft.submitted_by_user_id = v_actor then
    raise exception using errcode = '42501', message = 'لا يجوز لمقدم المسار اعتماده';
  end if;

  select * into v_mapping
  from qarar_governance.topic_governance_mappings
  where topic_id = v_draft.topic_id and organization_id = v_org
  for update;
  if v_mapping.id is null then
    raise exception using errcode = '55000', message = 'ارتباط حوكمة الموضوع غير موجود';
  end if;

  if not p_approve then
    update qarar_governance.topic_custom_route_drafts
    set status = 'rejected', reviewed_by_user_id = v_actor, reviewed_at = now(),
        review_comment = btrim(p_review_comment), updated_at = now()
    where id = v_draft.id;
    update qarar_governance.topic_governance_mappings
    set routing_status = 'routing_blocked',
        snapshot = snapshot || jsonb_build_object('custom_route_status','rejected','custom_route_reviewed_at',now())
    where id = v_mapping.id;
    update qarar_topics.topics
    set routing_status = 'routing_blocked', updated_at = now()
    where id = v_draft.topic_id and organization_id = v_org;
    perform qarar_audit.append_audit_log(
      v_org, 'governance.custom_route.reject', 'topic_custom_route_drafts', v_draft.id,
      jsonb_build_object('topic_id', v_draft.topic_id, 'comment', btrim(p_review_comment))
    );
    return jsonb_build_object('id', v_draft.id, 'topic_id', v_draft.topic_id, 'status', 'rejected');
  end if;

  insert into qarar_governance.workflow_templates(
    organization_id, code, name_ar, description, status, created_by_user_id
  ) values (
    v_org,
    'topic_route_' || replace(v_draft.topic_id::text, '-', ''),
    v_draft.name_ar,
    v_draft.rationale,
    'active',
    v_draft.submitted_by_user_id
  ) returning id into v_template_id;

  insert into qarar_governance.workflow_template_versions(
    organization_id, workflow_template_id, version_no, status, allow_cycles,
    validation_status, created_by_user_id
  ) values (
    v_org, v_template_id, 1, 'draft', false, 'pending', v_draft.submitted_by_user_id
  ) returning id into v_version_id;

  insert into qarar_governance.workflow_template_steps(
    organization_id, workflow_template_version_id, step_code, name_ar, sequence_no,
    step_type, responsibility, governance_unit_id, is_initial, is_terminal, allowed_outcomes
  )
  select
    v_org, v_version_id, 'step_' || step.sequence_no, step.name_ar, step.sequence_no,
    step.step_type, step.responsibility, step.governance_unit_id,
    step.sequence_no = 1,
    step.sequence_no = (select max(last_step.sequence_no)
      from qarar_governance.topic_custom_route_draft_steps last_step
      where last_step.custom_route_draft_id = v_draft.id),
    step.allowed_outcomes
  from qarar_governance.topic_custom_route_draft_steps step
  where step.custom_route_draft_id = v_draft.id and step.organization_id = v_org
  order by step.sequence_no;

  insert into qarar_governance.workflow_template_transitions(
    organization_id, workflow_template_version_id, from_step_id, to_step_id,
    outcome_code, transition_type, conditions
  )
  select v_org, v_version_id, current_step.id, next_step.id, 'approved', 'forward', '{}'::jsonb
  from qarar_governance.workflow_template_steps current_step
  join qarar_governance.workflow_template_steps next_step
    on next_step.workflow_template_version_id = current_step.workflow_template_version_id
    and next_step.sequence_no = current_step.sequence_no + 1
  where current_step.workflow_template_version_id = v_version_id;

  insert into qarar_governance.workflow_template_transitions(
    organization_id, workflow_template_version_id, from_step_id, to_step_id,
    outcome_code, transition_type, conditions
  )
  select v_org, v_version_id, current_step.id, previous_step.id, 'returned', 'return', '{}'::jsonb
  from qarar_governance.workflow_template_steps current_step
  join qarar_governance.workflow_template_steps previous_step
    on previous_step.workflow_template_version_id = current_step.workflow_template_version_id
    and previous_step.sequence_no = current_step.sequence_no - 1
  where current_step.workflow_template_version_id = v_version_id
    and 'returned' = any(current_step.allowed_outcomes);

  insert into qarar_governance.workflow_template_transitions(
    organization_id, workflow_template_version_id, from_step_id, to_step_id,
    outcome_code, transition_type, conditions
  )
  select v_org, v_version_id, step.id, null, 'rejected', 'reject', '{}'::jsonb
  from qarar_governance.workflow_template_steps step
  where step.workflow_template_version_id = v_version_id
    and 'rejected' = any(step.allowed_outcomes);

  v_validation := qarar_governance.validate_workflow_template_version(v_version_id);
  if not coalesce((v_validation->>'valid')::boolean, false) then
    raise exception using errcode = '23514', message = 'المسار المخصص غير مكتمل', detail = v_validation::text;
  end if;
  update qarar_governance.workflow_template_versions
  set status = 'active', activated_by_user_id = v_actor, activated_at = now(), updated_at = now()
  where id = v_version_id and organization_id = v_org;

  update qarar_governance.topic_governance_mappings
  set governance_source = 'custom', routing_status = 'routing_resolved',
      workflow_template_version_id = v_version_id,
      snapshot = snapshot || jsonb_build_object(
        'custom_route_draft_id', v_draft.id,
        'custom_route_status', 'approved',
        'workflow_template_version_id', v_version_id,
        'custom_route_reviewed_at', now()
      ), mapped_by_user_id = v_actor, mapped_at = now()
  where id = v_mapping.id;

  insert into qarar_governance.workflow_instances(
    organization_id, topic_id, topic_governance_mapping_id,
    workflow_template_version_id, started_by_user_id, snapshot
  ) values (
    v_org, v_draft.topic_id, v_mapping.id, v_version_id, v_actor,
    jsonb_build_object('template_version_id',v_version_id,'custom_route_draft_id',v_draft.id)
  ) returning id into v_instance_id;

  insert into qarar_governance.workflow_instance_steps(
    organization_id, workflow_instance_id, template_step_id, sequence_no,
    status, assigned_unit_id, required_permission_code, opened_at, snapshot
  )
  select
    v_org, v_instance_id, step.id, step.sequence_no,
    case when step.is_initial then 'active' else 'pending' end,
    step.governance_unit_id, step.required_permission_code,
    case when step.is_initial then now() end,
    jsonb_build_object(
      'step_code',step.step_code,'name_ar',step.name_ar,'responsibility',step.responsibility,
      'governance_unit_id',step.governance_unit_id,'allowed_outcomes',step.allowed_outcomes
    )
  from qarar_governance.workflow_template_steps step
  where step.workflow_template_version_id = v_version_id
  order by step.sequence_no;

  select instance_step.id into v_current_step_id
  from qarar_governance.workflow_instance_steps instance_step
  join qarar_governance.workflow_template_steps template_step on template_step.id = instance_step.template_step_id
  where instance_step.workflow_instance_id = v_instance_id and template_step.is_initial;
  update qarar_governance.workflow_instances
  set current_step_id = v_current_step_id
  where id = v_instance_id and organization_id = v_org;

  perform qarar_topics.apply_governance_snapshot(
    v_draft.topic_id, 'custom', 'routing_ready',
    null, null, null, null, v_version_id, v_instance_id, v_current_step_id, v_mapping.routing_decision_id
  );
  update qarar_governance.topic_custom_route_drafts
  set status = 'approved', reviewed_by_user_id = v_actor, reviewed_at = now(),
      review_comment = btrim(p_review_comment), updated_at = now()
  where id = v_draft.id;
  perform qarar_audit.append_audit_log(
    v_org, 'governance.custom_route.approve', 'topic_custom_route_drafts', v_draft.id,
    jsonb_build_object('topic_id',v_draft.topic_id,'workflow_template_version_id',v_version_id,'workflow_instance_id',v_instance_id)
  );
  return jsonb_build_object(
    'id', v_draft.id, 'topic_id', v_draft.topic_id, 'status', 'approved',
    'workflow_template_version_id', v_version_id, 'workflow_instance_id', v_instance_id
  );
end;
$$;

alter function qarar_governance.admin_list_topic_custom_route_drafts(text,integer,integer)
  owner to qarar_governance_executor;
alter function qarar_governance.approve_topic_custom_route_draft(uuid,boolean,text)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_list_topic_custom_route_drafts(text,integer,integer)
  from public, anon, authenticated, service_role;
revoke all on function qarar_governance.approve_topic_custom_route_draft(uuid,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.admin_list_topic_custom_route_drafts(text,integer,integer)
  to qarar_api_executor;
grant execute on function qarar_governance.approve_topic_custom_route_draft(uuid,boolean,text)
  to qarar_api_executor;
grant execute on function qarar_topics.apply_governance_snapshot(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
  to qarar_governance_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'governance', n.nspname, false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_governance'
  and p.proname in ('admin_list_topic_custom_route_drafts','approve_topic_custom_route_draft')
on conflict(function_oid) do update set
  function_name = excluded.function_name,
  identity_arguments = excluded.identity_arguments,
  module_code = excluded.module_code,
  owning_schema = excluded.owning_schema,
  is_rls_predicate = false;

create or replace function api_v1.create_topic_custom_route_draft(
  p_title_ar text,
  p_description text,
  p_category_id uuid,
  p_current_unit_id uuid,
  p_route_name_ar text,
  p_rationale text,
  p_steps jsonb,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_title_en text default null,
  p_client_request_id uuid default null
) returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select qarar_governance.create_topic_custom_route_draft(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
  )
$$;

create or replace function api_v1.admin_list_topic_custom_route_drafts(
  p_status text default null, p_limit integer default 100, p_offset integer default 0
) returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select qarar_governance.admin_list_topic_custom_route_drafts($1,$2,$3)
$$;

create or replace function api_v1.approve_topic_custom_route_draft(
  p_custom_route_draft_id uuid, p_approve boolean, p_review_comment text
) returns jsonb language sql volatile security definer set search_path = pg_catalog as $$
  select qarar_governance.approve_topic_custom_route_draft($1,$2,$3)
$$;

alter function api_v1.create_topic_custom_route_draft(
  text, text, uuid, uuid, text, text, jsonb, text, text, text, uuid
) owner to qarar_api_executor;
revoke all on function api_v1.create_topic_custom_route_draft(
  text, text, uuid, uuid, text, text, jsonb, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function api_v1.create_topic_custom_route_draft(
  text, text, uuid, uuid, text, text, jsonb, text, text, text, uuid
) to authenticated, service_role;
alter function api_v1.admin_list_topic_custom_route_drafts(text,integer,integer) owner to qarar_api_executor;
alter function api_v1.approve_topic_custom_route_draft(uuid,boolean,text) owner to qarar_api_executor;
revoke all on function api_v1.admin_list_topic_custom_route_drafts(text,integer,integer)
  from public, anon, authenticated, service_role;
revoke all on function api_v1.approve_topic_custom_route_draft(uuid,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.admin_list_topic_custom_route_drafts(text,integer,integer)
  to authenticated, service_role;
grant execute on function api_v1.approve_topic_custom_route_draft(uuid,boolean,text)
  to authenticated, service_role;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
) values (
  'v1', 'create_topic_custom_route_draft', 'qarar_governance', 'create_topic_custom_route_draft',
  'p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_route_name_ar text, p_rationale text, p_steps jsonb, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid',
  'governance', 'authenticated'
) on conflict (api_version, contract_name, identity_arguments) do update set
  implementation_schema = excluded.implementation_schema,
  implementation_name = excluded.implementation_name,
  module_code = excluded.module_code,
  audience = excluded.audience;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
) values
  ('v1','admin_list_topic_custom_route_drafts','qarar_governance','admin_list_topic_custom_route_drafts',
   'p_status text, p_limit integer, p_offset integer','governance','authenticated'),
  ('v1','approve_topic_custom_route_draft','qarar_governance','approve_topic_custom_route_draft',
   'p_custom_route_draft_id uuid, p_approve boolean, p_review_comment text','governance','authenticated')
on conflict (api_version, contract_name, identity_arguments) do update set
  implementation_schema = excluded.implementation_schema,
  implementation_name = excluded.implementation_name,
  module_code = excluded.module_code,
  audience = excluded.audience;

commit;
