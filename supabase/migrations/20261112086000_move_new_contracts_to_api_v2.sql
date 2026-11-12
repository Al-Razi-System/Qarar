-- api_v1 is a frozen release (251 contracts, hash in api_release_registry). Three contracts added on
-- 2026-11-12 went to api_v1 by mistake; they move to api_v2 with the _v2 suffix. Their implementations
-- are unchanged. Only devqarar and the dashboard in this change ever called the api_v1 names.
begin;

drop function api_v1.admin_list_sessions(text,text,integer,integer);
drop function api_v1.admin_get_audit_facets();
drop function api_v1.service_record_api_outcome(uuid,text,text,text,text,integer);
delete from qarar_architecture.api_contract_registry
where api_version='v1' and contract_name in ('admin_list_sessions','admin_get_audit_facets','service_record_api_outcome');

create function api_v2.admin_list_sessions_v2(p_status text default 'active', p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_iam.admin_list_sessions($1,$2,$3,$4) $$;
create function api_v2.admin_get_audit_facets_v2()
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_audit.admin_get_audit_facets() $$;
create function api_v2.service_record_api_outcome_v2(
  p_actor_user_id uuid, p_api_version text, p_contract text, p_result text, p_error_code text, p_http_status integer)
returns uuid language sql security definer set search_path=pg_catalog
as $$ select qarar_audit.service_record_api_outcome($1,$2,$3,$4,$5,$6) $$;

alter function api_v2.admin_list_sessions_v2(text,text,integer,integer) owner to qarar_api_executor;
alter function api_v2.admin_get_audit_facets_v2() owner to qarar_api_executor;
alter function api_v2.service_record_api_outcome_v2(uuid,text,text,text,text,integer) owner to qarar_api_executor;
revoke all on function api_v2.admin_list_sessions_v2(text,text,integer,integer), api_v2.admin_get_audit_facets_v2() from public, anon, service_role;
grant execute on function api_v2.admin_list_sessions_v2(text,text,integer,integer), api_v2.admin_get_audit_facets_v2() to authenticated;
revoke all on function api_v2.service_record_api_outcome_v2(uuid,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function api_v2.service_record_api_outcome_v2(uuid,text,text,text,text,integer) to service_role;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v2','admin_list_sessions_v2','qarar_iam','admin_list_sessions','p_status text, p_query text, p_limit integer, p_offset integer','iam','authenticated'),
('v2','admin_get_audit_facets_v2','qarar_audit','admin_get_audit_facets','','audit','authenticated'),
('v2','service_record_api_outcome_v2','qarar_audit','service_record_api_outcome',
  'p_actor_user_id uuid, p_api_version text, p_contract text, p_result text, p_error_code text, p_http_status integer','audit','service_role');

notify pgrst, 'reload schema';
commit;
