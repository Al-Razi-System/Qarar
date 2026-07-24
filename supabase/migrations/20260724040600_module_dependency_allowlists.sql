-- Replace broad cross-module privileges with explicit, reviewable dependencies.

create table qarar_architecture.module_table_read_allowlist (
  source_module text not null references qarar_architecture.module_registry(module_code),
  target_schema name not null,
  table_name name not null,
  rationale text not null,
  primary key (source_module, target_schema, table_name)
);

create table qarar_architecture.module_function_execute_allowlist (
  source_module text not null references qarar_architecture.module_registry(module_code),
  target_schema name not null,
  function_name name not null,
  identity_arguments text not null,
  rationale text not null,
  primary key (source_module, target_schema, function_name, identity_arguments)
);

revoke all on qarar_architecture.module_table_read_allowlist,
 qarar_architecture.module_function_execute_allowlist
from public, anon, authenticated;
grant select on qarar_architecture.module_table_read_allowlist,
 qarar_architecture.module_function_execute_allowlist
to service_role;

insert into qarar_architecture.module_table_read_allowlist
 (source_module, target_schema, table_name, rationale)
values
 ('attendance','qarar_core','governance_units','Validate meeting unit tenancy'),
 ('attendance','qarar_iam','memberships','Resolve governed attendance eligibility'),
 ('attendance','qarar_iam','users','Resolve attendance actors'),
 ('attendance','qarar_meetings','meeting_status_history','Read meeting lifecycle'),
 ('attendance','qarar_meetings','meetings','Operate attendance for a meeting'),
 ('attendance','qarar_voting','voting_rounds','Prevent attendance changes during voting'),
 ('audit','qarar_iam','users','Render actor information for administrators'),
 ('execution','qarar_decisions','decisions','Link action items to decisions'),
 ('iam','qarar_audit','audit_logs','Serve IAM audit history'),
 ('iam','qarar_core','governance_units','Scope memberships and roles'),
 ('iam','qarar_core','organizations','Resolve tenant identity'),
 ('iam','qarar_topics','topic_categories','Protect referenced IAM records'),
 ('meetings','qarar_core','governance_units','Scope meetings to governance units'),
 ('meetings','qarar_topics','topics','Build governed agendas'),
 ('meetings','qarar_voting','voting_rounds','Protect active voting lifecycle'),
 ('minutes','qarar_attendance','attendance_records','Render attendance in minutes'),
 ('minutes','qarar_core','governance_units','Render governing unit in minutes'),
 ('minutes','qarar_iam','memberships','Resolve minute approvers'),
 ('minutes','qarar_iam','roles','Resolve minute approver roles'),
 ('minutes','qarar_meetings','meetings','Generate minutes for a meeting'),
 ('topics','qarar_core','governance_units','Scope topic routing'),
 ('topics','qarar_iam','memberships','Resolve topic reviewers'),
 ('topics','qarar_iam','permissions','Resolve route authorization'),
 ('topics','qarar_iam','role_permissions','Resolve route authorization'),
 ('topics','qarar_iam','users','Resolve submitters and reviewers'),
 ('voting','qarar_attendance','attendance_records','Build eligible voter snapshot'),
 ('voting','qarar_iam','memberships','Resolve voter memberships'),
 ('voting','qarar_iam','users','Resolve voter identity'),
 ('voting','qarar_meetings','agenda_items','Bind voting rounds to agenda'),
 ('voting','qarar_meetings','meetings','Enforce meeting voting lifecycle'),
 ('voting','qarar_topics','topics','Render voted topic context');

insert into qarar_architecture.module_function_execute_allowlist
 (source_module, target_schema, function_name, identity_arguments, rationale)
values
 ('attendance','qarar_audit','append_audit_log',
  'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb','Append governed audit events'),
 ('attendance','qarar_iam','assert_permission','permission_code text, target_unit_id uuid','Enforce attendance permissions'),
 ('attendance','qarar_iam','current_organization_id','','Resolve caller tenant'),
 ('attendance','qarar_iam','has_permission','permission_code text, target_unit_id uuid','Evaluate attendance permissions'),
 ('attendance','qarar_iam','is_system_admin','','Evaluate administrative scope'),
 ('audit','qarar_iam','assert_permission','permission_code text, target_unit_id uuid','Enforce audit permissions'),
 ('audit','qarar_iam','current_organization_id','','Resolve caller tenant'),
 ('iam','qarar_audit','append_audit_log',
  'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb','Append IAM audit events'),
 ('meetings','qarar_audit','append_audit_log',
  'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb','Append meeting audit events'),
 ('meetings','qarar_iam','assert_permission','permission_code text, target_unit_id uuid','Enforce meeting permissions'),
 ('meetings','qarar_iam','consume_iam_rate_limit','p_operation text, p_limit integer, p_window_seconds integer','Rate-limit meeting commands'),
 ('meetings','qarar_iam','current_organization_id','','Resolve caller tenant'),
 ('meetings','qarar_iam','has_permission','permission_code text, target_unit_id uuid','Evaluate meeting permissions'),
 ('meetings','qarar_iam','is_system_admin','','Evaluate administrative scope'),
 ('topics','qarar_audit','append_audit_log',
  'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb','Append topic audit events'),
 ('topics','qarar_iam','assert_permission','permission_code text, target_unit_id uuid','Enforce topic permissions'),
 ('topics','qarar_iam','consume_iam_rate_limit','p_operation text, p_limit integer, p_window_seconds integer','Rate-limit topic commands'),
 ('topics','qarar_iam','current_organization_id','','Resolve caller tenant'),
 ('topics','qarar_iam','has_permission','permission_code text, target_unit_id uuid','Evaluate topic permissions'),
 ('topics','qarar_iam','is_system_admin','','Evaluate administrative scope'),
 ('voting','qarar_audit','append_audit_log',
  'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb','Append voting audit events'),
 ('voting','qarar_iam','assert_permission','permission_code text, target_unit_id uuid','Enforce voting permissions'),
 ('voting','qarar_iam','current_organization_id','','Resolve caller tenant'),
 ('voting','qarar_iam','has_permission','permission_code text, target_unit_id uuid','Evaluate voting permissions'),
 ('voting','qarar_iam','is_system_admin','','Evaluate administrative scope');

do $$
declare source_module record;
declare target_module record;
declare dependency record;
declare implementation record;
begin
  for source_module in
    select module_code, schema_name
    from qarar_architecture.module_registry
    where module_code not in ('architecture', 'api')
  loop
    for target_module in
      select module_code, schema_name
      from qarar_architecture.module_registry
      where module_code not in ('architecture', 'api')
    loop
      execute format(
        'revoke select on all tables in schema %I from %I',
        target_module.schema_name,
        'qarar_' || source_module.module_code || '_executor'
      );
      if target_module.module_code <> source_module.module_code then
        execute format(
          'revoke usage on schema %I from %I',
          target_module.schema_name,
          'qarar_' || source_module.module_code || '_executor'
        );
      end if;
    end loop;

    for implementation in
      select r.owning_schema, r.function_name, r.identity_arguments
      from qarar_architecture.function_registry r
    loop
      execute format(
        'revoke execute on function %I.%I(%s) from %I',
        implementation.owning_schema,
        implementation.function_name,
        implementation.identity_arguments,
        'qarar_' || source_module.module_code || '_executor'
      );
    end loop;

    execute format(
      'grant usage on schema %I to %I',
      source_module.schema_name,
      'qarar_' || source_module.module_code || '_executor'
    );
    execute format(
      'grant select on all tables in schema %I to %I',
      source_module.schema_name,
      'qarar_' || source_module.module_code || '_executor'
    );

    for implementation in
      select r.owning_schema, r.function_name, r.identity_arguments
      from qarar_architecture.function_registry r
      where r.module_code = source_module.module_code
    loop
      execute format(
        'grant execute on function %I.%I(%s) to %I',
        implementation.owning_schema,
        implementation.function_name,
        implementation.identity_arguments,
        'qarar_' || source_module.module_code || '_executor'
      );
    end loop;
  end loop;

  for dependency in
    select *
    from qarar_architecture.module_table_read_allowlist
  loop
    execute format(
      'grant usage on schema %I to %I',
      dependency.target_schema,
      'qarar_' || dependency.source_module || '_executor'
    );
    execute format(
      'grant select on table %I.%I to %I',
      dependency.target_schema,
      dependency.table_name,
      'qarar_' || dependency.source_module || '_executor'
    );
  end loop;

  for dependency in
    select *
    from qarar_architecture.module_function_execute_allowlist
  loop
    execute format(
      'grant usage on schema %I to %I',
      dependency.target_schema,
      'qarar_' || dependency.source_module || '_executor'
    );
    execute format(
      'grant execute on function %I.%I(%s) to %I',
      dependency.target_schema,
      dependency.function_name,
      dependency.identity_arguments,
      'qarar_' || dependency.source_module || '_executor'
    );
  end loop;
end;
$$;

comment on table qarar_architecture.module_table_read_allowlist is
'Reviewed cross-module table reads. New dependencies require an explicit migration and architecture review.';
comment on table qarar_architecture.module_function_execute_allowlist is
'Reviewed cross-module function calls. New dependencies require an explicit migration and architecture review.';

-- Reassert the Auth lifecycle hook for databases upgraded from an earlier
-- architecture candidate where auth.sessions already existed.
create or replace function qarar_architecture.grant_iam_auth_session_access()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if to_regclass('auth.sessions') is not null
     and (
       not has_table_privilege('qarar_iam_executor','auth.sessions','select')
       or not has_table_privilege('qarar_iam_executor','auth.sessions','delete')
     ) then
    grant select, delete on auth.sessions to qarar_iam_executor;
  end if;
end;
$$;
revoke all on function qarar_architecture.grant_iam_auth_session_access() from public;

do $$
begin
  if to_regclass('auth.sessions') is not null then
    grant select, delete on auth.sessions to qarar_iam_executor;
  end if;
end;
$$;

drop event trigger if exists grant_iam_auth_session_access;
create event trigger grant_iam_auth_session_access
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function qarar_architecture.grant_iam_auth_session_access();
