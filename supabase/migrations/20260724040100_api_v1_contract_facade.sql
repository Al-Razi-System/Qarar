-- Versioned API facade. Only registered contracts are callable by application roles.

create table qarar_architecture.api_contract_registry (
  api_version text not null,
  contract_name name not null,
  implementation_schema name not null,
  implementation_name name not null,
  identity_arguments text not null,
  module_code text not null references qarar_architecture.module_registry(module_code),
  audience text not null check (audience in ('authenticated','service_role','edge_authenticated')),
  deprecated_at timestamptz,
  replacement_contract name,
  primary key(api_version,contract_name,identity_arguments)
);
revoke all on qarar_architecture.api_contract_registry from public,anon,authenticated;
grant select on qarar_architecture.api_contract_registry to service_role;

insert into qarar_architecture.api_contract_registry(
 api_version,contract_name,implementation_schema,implementation_name,
 identity_arguments,module_code,audience
)
select 'v1',p.proname,'public',p.proname,pg_get_function_identity_arguments(p.oid),x.module_code,x.audience
from (values
 ('bootstrap_current_user_profile','iam','authenticated'),
 ('get_current_user_access_context','iam','authenticated'),
 ('get_my_account','iam','authenticated'),
 ('update_my_profile','iam','authenticated'),
 ('update_my_preferences','iam','authenticated'),
 ('admin_create_user_profile','iam','authenticated'),
 ('admin_assign_role','iam','authenticated'),
 ('admin_create_invitation','iam','authenticated'),
 ('admin_finalize_invited_user','iam','edge_authenticated'),
 ('admin_revoke_invitation','iam','authenticated'),
 ('admin_revoke_membership','iam','authenticated'),
 ('admin_search_users','iam','authenticated'),
 ('admin_get_user_detail','iam','authenticated'),
 ('admin_update_user_profile','iam','authenticated'),
 ('admin_list_roles','iam','authenticated'),
 ('admin_get_role_detail','iam','authenticated'),
 ('admin_upsert_role','iam','authenticated'),
 ('admin_deactivate_role','iam','authenticated'),
 ('admin_list_permissions','iam','authenticated'),
 ('admin_upsert_permission','iam','authenticated'),
 ('admin_request_role_permissions_change','iam','authenticated'),
 ('admin_request_permission_matrix_import','iam','authenticated'),
 ('admin_review_iam_change','iam','authenticated'),
 ('admin_export_permission_matrix','iam','authenticated'),
 ('admin_upsert_sso_provider','iam','authenticated'),
 ('admin_upsert_sso_domain','iam','authenticated'),
 ('admin_upsert_sso_group_mapping','iam','authenticated'),
 ('register_current_sso_login','iam','authenticated'),
 ('sync_current_sso_groups','iam','authenticated'),
 ('register_user_session','iam','authenticated'),
 ('list_my_sessions','iam','authenticated'),
 ('request_session_revocation','iam','authenticated'),
 ('admin_create_delegation','iam','authenticated'),
 ('admin_revoke_delegation','iam','authenticated'),
 ('has_permission','iam','edge_authenticated'),
 ('consume_iam_rate_limit','iam','edge_authenticated'),
 ('service_apply_user_status','iam','service_role'),
 ('service_revoke_auth_sessions','iam','service_role'),
 ('service_record_iam_event','iam','service_role'),
 ('create_topic','topics','authenticated'),
 ('get_topic_form_options','topics','authenticated'),
 ('search_my_topics','topics','authenticated'),
 ('search_topic_review_queue','topics','authenticated'),
 ('get_topic_detail','topics','authenticated'),
 ('review_topic','topics','authenticated'),
 ('refer_topic','topics','authenticated'),
 ('respond_topic_referral','topics','authenticated'),
 ('get_topic_route_history','topics','authenticated'),
 ('get_sprint02_form_options','meetings','authenticated'),
 ('create_meeting','meetings','authenticated'),
 ('search_meetings','meetings','authenticated'),
 ('get_meeting_detail','meetings','authenticated'),
 ('update_meeting','meetings','authenticated'),
 ('transition_meeting','meetings','authenticated'),
 ('search_eligible_agenda_topics','meetings','authenticated'),
 ('add_agenda_item','meetings','authenticated'),
 ('reorder_agenda_items','meetings','authenticated'),
 ('remove_agenda_item','meetings','authenticated'),
 ('open_meeting_session','attendance','authenticated'),
 ('get_meeting_session_detail','attendance','authenticated'),
 ('create_checkin_session','attendance','authenticated'),
 ('revoke_checkin_session','attendance','authenticated'),
 ('self_check_in','attendance','authenticated'),
 ('verify_attendance','attendance','authenticated'),
 ('get_attendance_history','attendance','authenticated'),
 ('lock_attendance_roster','attendance','authenticated'),
 ('override_attendance','attendance','authenticated'),
 ('recalculate_meeting_quorum','attendance','authenticated'),
 ('apply_quorum_failure','attendance','authenticated'),
 ('open_voting_round','voting','authenticated'),
 ('get_my_open_votes','voting','authenticated'),
 ('cast_vote','voting','authenticated'),
 ('close_voting_round','voting','authenticated'),
 ('cancel_voting_round','voting','authenticated'),
 ('get_voting_round_detail','voting','authenticated'),
 ('admin_search_audit_logs','audit','authenticated'),
 ('admin_get_audit_log','audit','authenticated'),
 ('admin_export_audit_logs','audit','authenticated')
) x(function_name,module_code,audience)
join pg_proc p on p.proname=x.function_name
join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
where p.prokind='f'
on conflict do nothing;

do $$
declare c record;f record;v_arguments text;v_result text;v_call_arguments text;
v_call text;v_volatility text;v_sql text;
begin
 for c in select * from qarar_architecture.api_contract_registry where api_version='v1'
 loop
  select p.* into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname=c.implementation_schema and p.proname=c.implementation_name
  and pg_get_function_identity_arguments(p.oid)=c.identity_arguments;
  if f.oid is null then raise exception 'registered implementation %.%(%) not found',
   c.implementation_schema,c.implementation_name,c.identity_arguments; end if;
  v_arguments:=pg_get_function_arguments(f.oid);
  v_result:=pg_get_function_result(f.oid);
  select string_agg(format('$%s',i),',' order by i) into v_call_arguments
  from generate_series(1,f.pronargs) i;
  v_call:=format('%I.%I(%s)',c.implementation_schema,c.implementation_name,
   coalesce(v_call_arguments,''));
  v_volatility:=case f.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end;
  if f.proretset then
   v_sql:=format('select * from %s',v_call);
  else
   v_sql:=format('select %s',v_call);
  end if;
  execute format(
   'create or replace function api_v1.%I(%s) returns %s language sql %s security definer set search_path=pg_catalog,public as %L',
   c.contract_name,v_arguments,v_result,v_volatility,v_sql
  );
  execute format('revoke all on function api_v1.%I(%s) from public,anon,authenticated,service_role',
   c.contract_name,c.identity_arguments);
  if c.audience in('authenticated','edge_authenticated') then
   execute format('grant execute on function api_v1.%I(%s) to authenticated,service_role',
    c.contract_name,c.identity_arguments);
  else
   execute format('grant execute on function api_v1.%I(%s) to service_role',
    c.contract_name,c.identity_arguments);
  end if;
  execute format('revoke execute on function %I.%I(%s) from public,anon,authenticated,service_role',
   c.implementation_schema,c.implementation_name,c.identity_arguments);
 end loop;
end $$;

-- RLS policies and implementation functions evaluate this read-only predicate as
-- the caller. Keep the predicate executable while all business RPCs stay behind
-- api_v1.
grant execute on function public.has_permission(text,uuid) to authenticated,service_role;

comment on table qarar_architecture.api_contract_registry is
'Authoritative registry for versioned PostgREST RPC contracts and deprecation metadata.';
