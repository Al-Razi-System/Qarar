begin;

create or replace function qarar_core.admin_search_council_types(
  p_query text default null,
  p_is_active boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, qarar_core
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform qarar_iam.assert_permission('governance.policies.manage', null);

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.code)
      from (
        select
          t.id, t.code, t.name_ar, t.name_en, t.description,
          t.is_active, t.is_system, t.created_at, t.updated_at,
          count(u.id)::integer as council_count
        from qarar_core.governance_unit_types t
        left join qarar_core.governance_units u
          on u.organization_id = t.organization_id
         and u.unit_type_id = t.id
        where t.organization_id = v_org
          and t.is_council_type
          and (p_is_active is null or t.is_active = p_is_active)
          and (
            nullif(btrim(p_query), '') is null
            or t.code ilike '%' || btrim(p_query) || '%'
            or t.name_ar ilike '%' || btrim(p_query) || '%'
            or coalesce(t.name_en, '') ilike '%' || btrim(p_query) || '%'
          )
        group by t.id
        order by t.code, t.id
        limit v_limit offset v_offset
      ) item
    ), '[]'::jsonb),
    'total', (
      select count(*)::integer
      from qarar_core.governance_unit_types t
      where t.organization_id = v_org
        and t.is_council_type
        and (p_is_active is null or t.is_active = p_is_active)
        and (
          nullif(btrim(p_query), '') is null
          or t.code ilike '%' || btrim(p_query) || '%'
          or t.name_ar ilike '%' || btrim(p_query) || '%'
          or coalesce(t.name_en, '') ilike '%' || btrim(p_query) || '%'
        )
    ),
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

create or replace function qarar_core.admin_create_council_type(
  p_code text,
  p_name_ar text,
  p_name_en text default null,
  p_description text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, qarar_core
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_id uuid;
  v_updated_at timestamptz;
begin
  perform qarar_iam.assert_permission('governance.policies.manage', null);
  if nullif(btrim(p_code), '') is null or nullif(btrim(p_name_ar), '') is null then
    raise exception using errcode = '22023',
      message = 'رمز نوع المجلس واسمه العربي مطلوبان';
  end if;

  insert into qarar_core.governance_unit_types(
    organization_id, code, name_ar, name_en, description,
    is_active, is_council_type, is_system
  ) values (
    v_org, lower(btrim(p_code)), btrim(p_name_ar),
    nullif(btrim(p_name_en), ''), nullif(btrim(p_description), ''),
    true, true, false
  )
  returning id, updated_at into v_id, v_updated_at;

  perform qarar_audit.append_audit_log(
    v_org, 'council.type.created', 'governance_unit_type', v_id,
    jsonb_build_object('code', lower(btrim(p_code)))
  );

  return jsonb_build_object(
    'id', v_id, 'code', lower(btrim(p_code)),
    'is_active', true, 'updated_at', v_updated_at
  );
exception
  when unique_violation then
    raise exception using errcode = '23505',
      message = 'رمز نوع المجلس مستخدم داخل المؤسسة';
end;
$$;

create or replace function qarar_core.admin_update_council_type(
  p_council_type_id uuid,
  p_name_ar text,
  p_name_en text,
  p_description text,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, qarar_core
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_updated_at timestamptz;
begin
  perform qarar_iam.assert_permission('governance.policies.manage', null);
  if nullif(btrim(p_name_ar), '') is null then
    raise exception using errcode = '22023', message = 'الاسم العربي مطلوب';
  end if;
  if exists (
    select 1 from qarar_core.governance_unit_types
    where id = p_council_type_id and organization_id = v_org and is_system
  ) then
    raise exception using errcode = '42501', message = 'لا يمكن تعديل نوع مجلس نظامي';
  end if;

  update qarar_core.governance_unit_types
  set name_ar = btrim(p_name_ar),
      name_en = nullif(btrim(p_name_en), ''),
      description = nullif(btrim(p_description), '')
  where id = p_council_type_id
    and organization_id = v_org
    and is_council_type
    and updated_at = p_expected_updated_at
  returning updated_at into v_updated_at;

  if v_updated_at is null then
    if exists (
      select 1 from qarar_core.governance_unit_types
      where id = p_council_type_id and organization_id = v_org and is_council_type
    ) then
      raise exception using errcode = '40001',
        message = 'تم تعديل نوع المجلس؛ حدّث البيانات وحاول مجددًا';
    end if;
    raise exception using errcode = 'P0002', message = 'نوع المجلس غير موجود';
  end if;

  perform qarar_audit.append_audit_log(
    v_org, 'council.type.updated', 'governance_unit_type', p_council_type_id,
    jsonb_build_object('updated_at', v_updated_at)
  );
  return jsonb_build_object('id', p_council_type_id, 'updated_at', v_updated_at);
end;
$$;

create or replace function qarar_core.admin_deactivate_council_type(
  p_council_type_id uuid,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, qarar_core
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_updated_at timestamptz;
begin
  perform qarar_iam.assert_permission('governance.policies.manage', null);
  if exists (
    select 1 from qarar_core.governance_unit_types
    where id = p_council_type_id and organization_id = v_org and is_system
  ) then
    raise exception using errcode = '42501', message = 'لا يمكن تعطيل نوع مجلس نظامي';
  end if;
  if exists (
    select 1 from qarar_core.governance_units
    where organization_id = v_org and unit_type_id = p_council_type_id
  ) then
    raise exception using errcode = '23503',
      message = 'لا يمكن تعطيل نوع مستخدم في مجلس';
  end if;

  update qarar_core.governance_unit_types
  set is_active = false
  where id = p_council_type_id
    and organization_id = v_org
    and is_council_type
    and is_active
    and updated_at = p_expected_updated_at
  returning updated_at into v_updated_at;

  if v_updated_at is null then
    if exists (
      select 1 from qarar_core.governance_unit_types
      where id = p_council_type_id and organization_id = v_org and is_council_type
    ) then
      raise exception using errcode = '40001',
        message = 'تم تعديل نوع المجلس أو تعطيله؛ حدّث البيانات';
    end if;
    raise exception using errcode = 'P0002', message = 'نوع المجلس غير موجود';
  end if;

  perform qarar_audit.append_audit_log(
    v_org, 'council.type.deactivated', 'governance_unit_type',
    p_council_type_id, '{}'::jsonb
  );
  return jsonb_build_object(
    'id', p_council_type_id, 'is_active', false, 'updated_at', v_updated_at
  );
end;
$$;

alter function qarar_core.admin_search_council_types(text,boolean,integer,integer)
  owner to qarar_core_executor;
alter function qarar_core.admin_create_council_type(text,text,text,text)
  owner to qarar_core_executor;
alter function qarar_core.admin_update_council_type(uuid,text,text,text,timestamptz)
  owner to qarar_core_executor;
alter function qarar_core.admin_deactivate_council_type(uuid,timestamptz)
  owner to qarar_core_executor;

revoke all on function qarar_core.admin_search_council_types(text,boolean,integer,integer)
  from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_create_council_type(text,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_update_council_type(uuid,text,text,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_deactivate_council_type(uuid,timestamptz)
  from public,anon,authenticated,service_role;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values
  ('core','qarar_iam','current_organization_id','',
   'Bind council management commands to the authenticated tenant'),
  ('core','qarar_iam','assert_permission',
   'permission_code text, target_unit_id uuid',
   'Authorize council management commands'),
  ('core','qarar_audit','append_audit_log',
   'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb',
   'Record immutable council management audit events')
on conflict do nothing;

grant usage on schema qarar_iam,qarar_audit to qarar_core_executor;
grant execute on function qarar_iam.current_organization_id()
  to qarar_core_executor;
grant execute on function qarar_iam.assert_permission(text,uuid)
  to qarar_core_executor;
grant execute on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb)
  to qarar_core_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code,
  owning_schema, is_rls_predicate
)
select
  p.oid, p.proname, pg_get_function_identity_arguments(p.oid),
  'core', 'qarar_core', false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_core'
  and p.proname in (
    'admin_search_council_types',
    'admin_create_council_type',
    'admin_update_council_type',
    'admin_deactivate_council_type'
  )
on conflict(function_name, identity_arguments) do update
set function_oid = excluded.function_oid,
    module_code = excluded.module_code,
    owning_schema = excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
) values
  ('v1','admin_search_council_types','qarar_core','admin_search_council_types',
   'p_query text, p_is_active boolean, p_limit integer, p_offset integer',
   'core','authenticated'),
  ('v1','admin_create_council_type','qarar_core','admin_create_council_type',
   'p_code text, p_name_ar text, p_name_en text, p_description text',
   'core','authenticated'),
  ('v1','admin_update_council_type','qarar_core','admin_update_council_type',
   'p_council_type_id uuid, p_name_ar text, p_name_en text, p_description text, p_expected_updated_at timestamp with time zone',
   'core','authenticated'),
  ('v1','admin_deactivate_council_type','qarar_core','admin_deactivate_council_type',
   'p_council_type_id uuid, p_expected_updated_at timestamp with time zone',
   'core','authenticated')
on conflict do nothing;

do $$
declare
  c record;
  p record;
  call_args text;
  sql text;
begin
  for c in
    select * from qarar_architecture.api_contract_registry
    where api_version = 'v1'
      and contract_name in (
        'admin_search_council_types',
        'admin_create_council_type',
        'admin_update_council_type',
        'admin_deactivate_council_type'
      )
  loop
    select x.oid, pg_get_function_arguments(x.oid) args,
           pg_get_function_result(x.oid) result
    into p
    from pg_proc x
    join pg_namespace n on n.oid = x.pronamespace
    where n.nspname = c.implementation_schema
      and x.proname = c.implementation_name
      and pg_get_function_identity_arguments(x.oid) = c.identity_arguments;

    select string_agg(split_part(btrim(a), ' ', 1), ',' order by ord)
    into call_args
    from unnest(string_to_array(c.identity_arguments, ',')) with ordinality z(a, ord);

    sql := format(
      'create or replace function api_v1.%I(%s) returns %s language sql volatile security definer set search_path=pg_catalog as $f$ select %I.%I(%s) $f$',
      c.contract_name, p.args, p.result,
      c.implementation_schema, c.implementation_name, call_args
    );
    execute sql;
    execute format(
      'alter function api_v1.%I(%s) owner to qarar_api_executor',
      c.contract_name, c.identity_arguments
    );
    execute format(
      'revoke all on function api_v1.%I(%s) from public,anon,service_role',
      c.contract_name, c.identity_arguments
    );
    execute format(
      'grant execute on function api_v1.%I(%s) to authenticated',
      c.contract_name, c.identity_arguments
    );
    execute 'grant usage on schema qarar_core to qarar_api_executor';
    execute format(
      'grant execute on function qarar_core.%I(%s) to qarar_api_executor',
      c.implementation_name, c.identity_arguments
    );
  end loop;
end;
$$;

update qarar_architecture.api_release_registry
set contract_count = 122,
    contract_hash = '4053da4cfef59fa4e1c943a3a654ec80',
    released_at = '2026-07-29 00:00:00+00',
    notes = 'Sprint 03.6 PB-073 adds tenant-safe council type management contracts.'
where api_version = 'v1';

comment on function qarar_core.admin_search_council_types(text,boolean,integer,integer)
  is 'Searches tenant council types with stable pagination and usage counts.';
comment on function qarar_core.admin_deactivate_council_type(uuid,timestamptz)
  is 'Deactivates an unused non-system council type with optimistic concurrency.';

commit;
