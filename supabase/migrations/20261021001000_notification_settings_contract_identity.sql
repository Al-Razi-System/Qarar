-- Preserve named HTTP argument identity for PostgREST and the contract registry.
begin;
drop function api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer);
create function api_v1.admin_save_notification_settings(p_whatsapp_enabled boolean,p_meeting_reminder_days integer,p_task_due_soon_days integer,p_templates jsonb,p_expected_version integer)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_save_notification_settings(p_whatsapp_enabled,p_meeting_reminder_days,p_task_due_soon_days,p_templates,p_expected_version)$$;
alter function api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer) owner to qarar_api_executor;
revoke all on function api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer) from public,anon;
grant execute on function api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer) to authenticated;
update qarar_architecture.api_release_registry r set contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid)) where r.api_version='v1';
notify pgrst,'reload schema';
commit;
