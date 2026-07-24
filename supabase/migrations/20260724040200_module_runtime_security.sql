-- Enforce executable module boundaries and remove public write/implementation paths.

create table qarar_architecture.function_registry (
  function_oid oid primary key,
  function_name name not null,
  identity_arguments text not null,
  module_code text not null references qarar_architecture.module_registry(module_code),
  owning_schema name not null,
  is_rls_predicate boolean not null default false,
  unique(function_name,identity_arguments)
);
revoke all on qarar_architecture.function_registry from public,anon,authenticated;
grant select on qarar_architecture.function_registry to service_role;

do $$
declare r record;
begin
  for r in select unnest(array[
    'qarar_api_executor','qarar_core_executor','qarar_iam_executor',
    'qarar_topics_executor','qarar_meetings_executor','qarar_attendance_executor',
    'qarar_voting_executor','qarar_minutes_executor','qarar_decisions_executor',
    'qarar_execution_executor','qarar_audit_executor'
  ]) role_name
  loop
    if not exists(select 1 from pg_roles where rolname=r.role_name) then
      execute format('create role %I nologin noinherit',r.role_name);
    end if;
    if r.role_name<>'qarar_api_executor' then
      execute format('alter role %I bypassrls',r.role_name);
    end if;
    execute format('grant %I to %I',r.role_name,current_user);
  end loop;
end $$;

with assignments(module_code,function_names) as (values
 ('core',array[
   'current_app_user_id','set_updated_at'
 ]::text[]),
 ('iam',array[
   'actor_has_permission','admin_assign_role','admin_create_delegation',
   'admin_create_invitation','admin_create_user_profile','admin_deactivate_role',
   'admin_export_permission_matrix','admin_finalize_invited_user',
   'admin_get_role_detail','admin_get_user_detail','admin_list_permissions',
   'admin_list_roles','admin_request_permission_matrix_import',
   'admin_request_role_permissions_change','admin_review_iam_change',
   'admin_revoke_delegation','admin_revoke_invitation','admin_revoke_membership',
   'admin_search_users','admin_set_role_permissions','admin_update_user_profile',
   'admin_update_user_status','admin_upsert_permission','admin_upsert_role',
   'admin_upsert_sso_domain','admin_upsert_sso_group_mapping',
   'admin_upsert_sso_provider','assert_permission','bootstrap_current_user_profile',
   'consume_iam_rate_limit','current_organization_id','current_sso_provider_id',
   'expire_access_delegations','get_current_user_access_context','get_my_account',
   'has_active_membership','has_permission','has_role_code','has_unit_role_code',
   'is_system_admin','is_topic_category_in_current_organization',
   'is_unit_in_current_organization','is_user_in_current_organization',
   'jwt_claim_text','list_my_sessions','register_current_sso_login',
   'register_user_session','request_session_revocation','service_apply_user_status',
   'service_record_iam_event','service_revoke_auth_sessions',
   'sync_current_sso_groups','update_my_preferences','update_my_profile'
 ]::text[]),
 ('topics',array[
   'create_topic','get_topic_detail','get_topic_form_options',
   'get_topic_route_history','refer_topic','respond_topic_referral',
   'review_topic','search_my_topics','search_topic_review_queue'
 ]::text[]),
 ('meetings',array[
   'add_agenda_item','check_agenda_item_eligibility','create_meeting',
   'get_meeting_detail','get_sprint02_form_options','guard_meeting_status_transitions',
   'remove_agenda_item','reorder_agenda_items','search_eligible_agenda_topics',
   'search_meetings','transition_meeting','update_meeting'
 ]::text[]),
 ('attendance',array[
   'apply_quorum_failure','calculate_meeting_quorum','create_checkin_session',
   'get_attendance_history','get_meeting_session_detail',
   'guard_attendance_override_during_voting','lock_attendance_roster',
   'on_attendance_change','open_meeting_session','override_attendance',
   'recalculate_meeting_quorum','record_attendance','revoke_checkin_session',
   'self_check_in','verify_attendance'
 ]::text[]),
 ('voting',array[
   'cancel_voting_round','cast_vote','close_voting_round','enforce_voting_context',
   'get_my_open_votes','get_voting_round_detail','on_voting_closed',
   'open_voting_round'
 ]::text[]),
 ('minutes',array[
   'on_approval_status_change','on_minute_ready'
 ]::text[]),
 ('decisions',array[
   'audit_decision_status_history','auto_update_decision_follow_up',
   'guard_decision_status_transitions'
 ]::text[]),
 ('execution',array[
   'check_action_item_creation'
 ]::text[]),
 ('audit',array[
   'admin_export_audit_logs','admin_get_audit_log','admin_search_audit_logs',
   'append_audit_log','audit_row_change'
 ]::text[])
)
insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),a.module_code,m.schema_name,
 p.proname=any(array[
  'current_app_user_id','current_organization_id','current_sso_provider_id',
  'has_active_membership','has_permission','has_role_code','has_unit_role_code',
  'is_system_admin','is_topic_category_in_current_organization',
  'is_unit_in_current_organization','is_user_in_current_organization','jwt_claim_text'
 ])
from assignments a
join lateral unnest(a.function_names) f(function_name) on true
join pg_proc p on p.proname=f.function_name
join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
join qarar_architecture.module_registry m on m.module_code=a.module_code;

do $$
declare v_unregistered text;
begin
 select string_agg(p.proname::text,', ' order by p.proname) into v_unregistered
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 left join qarar_architecture.function_registry r on r.function_oid=p.oid
 where n.nspname='public' and p.prokind='f'
   and not exists(
    select 1 from pg_depend d
    where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
   )
   and r.function_oid is null;
 if v_unregistered is not null then
   raise exception 'unregistered public application functions: %',v_unregistered;
 end if;
end $$;

do $$
declare r record;
begin
 for r in select * from qarar_architecture.function_registry order by function_name,identity_arguments
 loop
  execute format('alter function public.%I(%s) set schema %I',
   r.function_name,r.identity_arguments,r.owning_schema);
 end loop;
end $$;

-- Rebind qualified calls left in PL/pgSQL source after all implementations moved.
do $$
declare f record;r record;v_definition text;
begin
 for f in
  select p.oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname like 'qarar\_%' escape '\'
    and n.nspname not in('qarar_architecture','qarar_internal')
    and p.prokind='f'
 loop
  v_definition:=pg_get_functiondef(f.oid);
  for r in select function_name,owning_schema from qarar_architecture.function_registry
  loop
   v_definition:=replace(v_definition,
    format('public.%I',r.function_name),
    format('%I.%I',r.owning_schema,r.function_name));
  end loop;
  v_definition:=replace(v_definition,'gen_random_bytes(','extensions.gen_random_bytes(');
  v_definition:=replace(v_definition,'digest(','extensions.digest(');
  execute v_definition;
 end loop;
end $$;

update qarar_architecture.api_contract_registry c
set implementation_schema=r.owning_schema
from qarar_architecture.function_registry r
where c.implementation_name=r.function_name
 and c.identity_arguments=r.identity_arguments;

do $$
declare c record;v_definition text;
begin
 for c in
  select p.oid,r.implementation_schema,r.implementation_name
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  join qarar_architecture.api_contract_registry r
   on r.contract_name=p.proname
   and r.identity_arguments=pg_get_function_identity_arguments(p.oid)
 loop
  v_definition:=replace(
   pg_get_functiondef(c.oid),
   format('public.%I',c.implementation_name),
   format('%I.%I',c.implementation_schema,c.implementation_name)
  );
  execute v_definition;
 end loop;
end $$;

-- Default-deny every implementation. RLS predicates are the only application-role exception.
do $$
declare r record;
begin
 for r in select * from qarar_architecture.function_registry
 loop
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',
   r.owning_schema,r.function_name,r.identity_arguments);
  execute format('alter function %I.%I(%s) owner to %I',
   r.owning_schema,r.function_name,r.identity_arguments,
   'qarar_'||r.module_code||'_executor');
 end loop;
end $$;

grant usage on schema qarar_iam to authenticated,service_role;
do $$
declare r record;
begin
 for r in select * from qarar_architecture.function_registry where is_rls_predicate
 loop
  execute format('grant execute on function %I.%I(%s) to authenticated,service_role',
   r.owning_schema,r.function_name,r.identity_arguments);
 end loop;
end $$;

-- Module executors can read shared state, mutate their own state, append audit, and
-- call other module commands. They are NOLOGIN and never granted to API clients.
do $$
declare m record;x record;
begin
 for m in select module_code,schema_name from qarar_architecture.module_registry
  where module_code not in('architecture')
 loop
  execute format('grant usage on schema %I to %I',m.schema_name,'qarar_'||m.module_code||'_executor');
  execute format('grant usage on schema auth to %I','qarar_'||m.module_code||'_executor');
  execute format('grant usage on schema extensions to %I','qarar_'||m.module_code||'_executor');
  execute format('grant execute on function auth.uid() to %I','qarar_'||m.module_code||'_executor');
  execute format('grant execute on function auth.role() to %I','qarar_'||m.module_code||'_executor');
  execute format('grant execute on function auth.jwt() to %I','qarar_'||m.module_code||'_executor');
  execute format('grant select on all tables in schema %I to %I',m.schema_name,'qarar_'||m.module_code||'_executor');
  execute format('grant select,insert,update,delete on all tables in schema %I to %I',
   m.schema_name,'qarar_'||m.module_code||'_executor');
  execute format('grant usage,select,update on all sequences in schema %I to %I',
   m.schema_name,'qarar_'||m.module_code||'_executor');
  for x in select schema_name from qarar_architecture.module_registry
   where schema_name<>m.schema_name
  loop
   execute format('grant usage on schema %I to %I',x.schema_name,'qarar_'||m.module_code||'_executor');
   execute format('grant select on all tables in schema %I to %I',x.schema_name,'qarar_'||m.module_code||'_executor');
  end loop;
  execute format('grant insert on qarar_audit.audit_logs to %I','qarar_'||m.module_code||'_executor');
 end loop;
end $$;

grant update on qarar_meetings.meetings
 to qarar_attendance_executor,qarar_minutes_executor,qarar_voting_executor;
grant insert on qarar_meetings.meeting_status_history to qarar_attendance_executor,qarar_minutes_executor;
grant update on qarar_topics.topics to qarar_meetings_executor;
grant update on qarar_meetings.agenda_items to qarar_voting_executor;
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

do $$
declare source_role record;f record;
begin
 for source_role in
  select rolname from pg_roles where rolname like 'qarar\_%\_executor' escape '\'
   and rolname<>'qarar_api_executor'
 loop
  for f in select * from qarar_architecture.function_registry
  loop
   execute format('grant execute on function %I.%I(%s) to %I',
    f.owning_schema,f.function_name,f.identity_arguments,source_role.rolname);
  end loop;
 end loop;
end $$;

-- The API owner can only execute registered implementations; it owns no tables.
grant usage on schema api_v1 to qarar_api_executor;
do $$
declare c record;
begin
 for c in select * from qarar_architecture.api_contract_registry
 loop
  execute format('grant usage on schema %I to qarar_api_executor',c.implementation_schema);
  execute format('grant execute on function %I.%I(%s) to qarar_api_executor',
   c.implementation_schema,c.implementation_name,c.identity_arguments);
  execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',
   c.contract_name,c.identity_arguments);
 end loop;
end $$;

-- Compatibility views are read-only for clients. Trusted service fixtures retain DML.
do $$
declare r record;
begin
 for r in
  select c.relname as entity_name
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v'
 loop
  execute format('revoke insert,update,delete,truncate on public.%I from public,anon,authenticated',
   r.entity_name);
 end loop;
 for r in
  select n.nspname,c.relname
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname like 'qarar\_%' escape '\'
   and n.nspname not in('qarar_architecture','qarar_internal')
   and c.relkind in('r','p')
 loop
  execute format('revoke all on %I.%I from public,anon',
   r.nspname,r.relname);
  execute format('revoke insert,update,delete,truncate on %I.%I from authenticated',
   r.nspname,r.relname);
 end loop;
end $$;

do $$
declare r record;
begin
 for r in
  select n.nspname,c.relname
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname like 'qarar\_%' escape '\' and c.relkind in('r','p')
 loop
  execute format('revoke all on %I.%I from qarar_api_executor',r.nspname,r.relname);
 end loop;
end $$;

revoke all on all functions in schema public from public,anon,authenticated,service_role;

comment on table qarar_architecture.function_registry is
'Authoritative physical ownership and RLS predicate allowlist for internal functions.';
