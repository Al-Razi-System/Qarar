begin;

create table qarar_governance.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text not null,
  name_ar text not null,
  name_en text,
  description text,
  status text not null default 'active',
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(organization_id, code),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_.-]*$'),
  check (status in ('active', 'inactive', 'archived')),
  check (char_length(btrim(name_ar)) between 3 and 300)
);

create table qarar_governance.workflow_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_template_id uuid not null,
  version_no integer not null,
  status text not null default 'draft',
  allow_cycles boolean not null default false,
  validation_status text not null default 'pending',
  validation_errors jsonb not null default '[]'::jsonb,
  activated_by_user_id uuid,
  activated_at timestamptz,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(workflow_template_id, version_no),
  foreign key (workflow_template_id, organization_id)
    references qarar_governance.workflow_templates(id, organization_id) on delete restrict,
  foreign key (activated_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (version_no > 0),
  check (status in ('draft', 'active', 'retired')),
  check (validation_status in ('pending', 'valid', 'invalid')),
  check (jsonb_typeof(validation_errors) = 'array'),
  check (status <> 'active' or (
    validation_status = 'valid' and activated_by_user_id is not null and activated_at is not null
  ))
);

create unique index workflow_template_one_active_version_uidx
on qarar_governance.workflow_template_versions(workflow_template_id)
where status = 'active';

create table qarar_governance.workflow_template_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_template_version_id uuid not null,
  step_code text not null,
  name_ar text not null,
  sequence_no integer not null,
  step_type text not null,
  responsibility text not null,
  governance_unit_id uuid,
  governance_class_id uuid,
  required_permission_code text,
  is_initial boolean not null default false,
  is_terminal boolean not null default false,
  entry_conditions jsonb not null default '{}'::jsonb,
  exit_conditions jsonb not null default '{}'::jsonb,
  allowed_outcomes text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(workflow_template_version_id, step_code),
  unique(workflow_template_version_id, sequence_no),
  foreign key (workflow_template_version_id, organization_id)
    references qarar_governance.workflow_template_versions(id, organization_id) on delete restrict,
  foreign key (governance_unit_id, organization_id)
    references qarar_core.governance_units(id, organization_id) on delete restrict,
  foreign key (governance_class_id, organization_id)
    references qarar_governance.governance_unit_classes(id, organization_id) on delete restrict,
  foreign key (organization_id, required_permission_code)
    references qarar_iam.permissions(organization_id, code) on delete restrict,
  check (step_code ~ '^[a-z][a-z0-9_]*$'),
  check (sequence_no > 0),
  check (step_type in ('review', 'discussion', 'recommendation', 'approval', 'execution', 'follow_up')),
  check (responsibility in (
    'present', 'review', 'discuss', 'recommend', 'initial_approve',
    'final_approve', 'execute', 'follow_up'
  )),
  check ((governance_unit_id is null) <> (governance_class_id is null)),
  check (jsonb_typeof(entry_conditions) = 'object'),
  check (jsonb_typeof(exit_conditions) = 'object'),
  check (cardinality(allowed_outcomes) > 0)
);

create table qarar_governance.workflow_template_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_template_version_id uuid not null,
  from_step_id uuid not null,
  to_step_id uuid,
  outcome_code text not null,
  transition_type text not null default 'forward',
  conditions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(workflow_template_version_id, from_step_id, outcome_code),
  foreign key (workflow_template_version_id, organization_id)
    references qarar_governance.workflow_template_versions(id, organization_id) on delete restrict,
  foreign key (from_step_id, organization_id)
    references qarar_governance.workflow_template_steps(id, organization_id) on delete restrict,
  foreign key (to_step_id, organization_id)
    references qarar_governance.workflow_template_steps(id, organization_id) on delete restrict,
  check (outcome_code in (
    'approved', 'rejected', 'returned', 'tie', 'no_vote', 'cancelled', 'completed'
  )),
  check (transition_type in ('forward', 'return', 'reject', 'complete', 'cancel')),
  check (
    (transition_type in ('complete', 'reject', 'cancel') and to_step_id is null)
    or (transition_type in ('forward', 'return') and to_step_id is not null)
  ),
  check (jsonb_typeof(conditions) = 'object')
);

alter table qarar_governance.policy_items
  add column workflow_template_version_id uuid,
  add constraint policy_items_workflow_version_tenant_fk
    foreign key (workflow_template_version_id, organization_id)
    references qarar_governance.workflow_template_versions(id, organization_id) on delete restrict;

create or replace function qarar_governance.assert_workflow_version_editable(
  p_workflow_template_version_id uuid
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, qarar_governance
as $$
declare v_status text;
begin
  select status into v_status
  from qarar_governance.workflow_template_versions
  where id = p_workflow_template_version_id;
  if v_status is null then
    raise exception using errcode='P0002', message='إصدار قالب المسار غير موجود';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode='55000', message='لا يمكن تعديل إصدار قالب غير مسودة';
  end if;
end;
$$;

create or replace function qarar_governance.guard_workflow_draft_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, qarar_governance
as $$
begin
  perform qarar_governance.assert_workflow_version_editable(
    coalesce(new.workflow_template_version_id, old.workflow_template_version_id)
  );
  return coalesce(new, old);
end;
$$;

create trigger workflow_steps_draft_guard
before insert or update or delete on qarar_governance.workflow_template_steps
for each row execute function qarar_governance.guard_workflow_draft_mutation();
create trigger workflow_transitions_draft_guard
before insert or update or delete on qarar_governance.workflow_template_transitions
for each row execute function qarar_governance.guard_workflow_draft_mutation();

create or replace function qarar_governance.validate_workflow_template_version(
  p_workflow_template_version_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, qarar_governance
as $$
declare v_errors jsonb := '[]'::jsonb; v_allow_cycles boolean;
begin
  select allow_cycles into v_allow_cycles
  from qarar_governance.workflow_template_versions
  where id = p_workflow_template_version_id;
  if v_allow_cycles is null then
    raise exception using errcode='P0002', message='إصدار قالب المسار غير موجود';
  end if;
  if (select count(*) from qarar_governance.workflow_template_steps
      where workflow_template_version_id=p_workflow_template_version_id and is_initial) <> 1 then
    v_errors := v_errors || jsonb_build_array('يجب تحديد خطوة بداية واحدة');
  end if;
  if not exists(select 1 from qarar_governance.workflow_template_steps
                where workflow_template_version_id=p_workflow_template_version_id and is_terminal) then
    v_errors := v_errors || jsonb_build_array('يجب تحديد خطوة نهائية واحدة على الأقل');
  end if;
  if exists(
    select 1 from qarar_governance.workflow_template_steps s
    where s.workflow_template_version_id=p_workflow_template_version_id
      and not s.is_terminal
      and exists(select 1 from unnest(s.allowed_outcomes) o
        where not exists(
          select 1 from qarar_governance.workflow_template_transitions t
          where t.from_step_id=s.id and t.outcome_code=o
        ))
  ) then
    v_errors := v_errors || jsonb_build_array('توجد نتيجة دون انتقال معرف');
  end if;
  if exists(
    select 1 from qarar_governance.workflow_template_transitions t
    join qarar_governance.workflow_template_steps f on f.id=t.from_step_id
    left join qarar_governance.workflow_template_steps d on d.id=t.to_step_id
    where t.workflow_template_version_id=p_workflow_template_version_id
      and (f.workflow_template_version_id<>t.workflow_template_version_id
        or (d.id is not null and d.workflow_template_version_id<>t.workflow_template_version_id))
  ) then
    v_errors := v_errors || jsonb_build_array('انتقال يشير إلى خطوة خارج الإصدار');
  end if;
  if not v_allow_cycles and exists(
    with recursive walk(start_id,current_id,path,cycle) as (
      select t.from_step_id,t.to_step_id,array[t.from_step_id,t.to_step_id],false
      from qarar_governance.workflow_template_transitions t
      where t.workflow_template_version_id=p_workflow_template_version_id and t.to_step_id is not null
      union all
      select w.start_id,t.to_step_id,w.path||t.to_step_id,t.to_step_id=any(w.path)
      from walk w join qarar_governance.workflow_template_transitions t on t.from_step_id=w.current_id
      where not w.cycle and t.to_step_id is not null
    ) select 1 from walk where cycle
  ) then
    v_errors := v_errors || jsonb_build_array('المسار يحتوي دورة غير مصرح بها');
  end if;
  update qarar_governance.workflow_template_versions
  set validation_status=case when jsonb_array_length(v_errors)=0 then 'valid' else 'invalid' end,
      validation_errors=v_errors, updated_at=now()
  where id=p_workflow_template_version_id;
  return jsonb_build_object('valid',jsonb_array_length(v_errors)=0,'errors',v_errors);
end;
$$;

do $$
declare current_entity_name text;
begin
  foreach current_entity_name in array array[
    'workflow_templates','workflow_template_versions',
    'workflow_template_steps','workflow_template_transitions'
  ] loop
    insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
    values(current_entity_name,'governance',false)
    on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;
    execute format('alter table qarar_governance.%I enable row level security',current_entity_name);
    execute format('revoke all on qarar_governance.%I from public,anon,authenticated,service_role',current_entity_name);
    execute format('alter table qarar_governance.%I owner to qarar_governance_executor',current_entity_name);
  end loop;
end;
$$;

alter function qarar_governance.assert_workflow_version_editable(uuid) owner to qarar_governance_executor;
alter function qarar_governance.guard_workflow_draft_mutation() owner to qarar_governance_executor;
alter function qarar_governance.validate_workflow_template_version(uuid) owner to qarar_governance_executor;
revoke all on all functions in schema qarar_governance from public,anon,authenticated,service_role;
grant select,insert,update,delete on all tables in schema qarar_governance to qarar_governance_executor;
grant execute on all functions in schema qarar_governance to qarar_governance_executor;

do $$
declare current_table text;
begin
  foreach current_table in array array[
    'workflow_templates','workflow_template_versions',
    'workflow_template_steps','workflow_template_transitions'
  ] loop
    execute format(
      'create trigger %I_updated_at before update on qarar_governance.%I
       for each row execute function qarar_core.set_updated_at()',
      current_table,current_table
    );
  end loop;
end;
$$;

comment on function qarar_governance.validate_workflow_template_version(uuid) is
'Validates completeness, outcome coverage, tenant-safe edges, and forbidden cycles before activation.';

commit;
