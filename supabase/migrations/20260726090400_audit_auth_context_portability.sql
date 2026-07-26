begin;

create or replace function qarar_audit.append_audit_log(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, qarar_audit
as $$
declare
  v_id uuid;
  v_actor_user_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  v_actor_user_id := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  insert into qarar_audit.audit_logs(
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_organization_id,
    v_actor_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

alter function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb)
  owner to qarar_audit_executor;
revoke all on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb)
  from public,anon,authenticated,service_role;

do $$
declare dependency record;
begin
  for dependency in
    select source_module
    from qarar_architecture.module_function_execute_allowlist
    where target_schema = 'qarar_audit'
      and function_name = 'append_audit_log'
      and identity_arguments =
        'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb'
  loop
    execute format(
      'grant execute on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb) to %I',
      'qarar_' || dependency.source_module || '_executor'
    );
  end loop;
end;
$$;

comment on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb) is
'Appends an immutable tenant audit event and obtains the actor from the standard JWT claim without requiring module access to the auth schema.';

commit;
