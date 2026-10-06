begin;

revoke all on function qarar_core.admin_create_council_v2(
  text,text,text,uuid,uuid,uuid,uuid,integer,boolean,jsonb,uuid
) from public, anon, authenticated, service_role;

grant execute on function qarar_core.admin_create_council_v2(
  text,text,text,uuid,uuid,uuid,uuid,integer,boolean,jsonb,uuid
) to qarar_api_executor;

commit;
