begin;

drop function if exists api_v1.admin_update_policy(uuid,text,text,text,uuid,text,uuid,text,text);
drop function if exists api_v1.admin_add_policy_attachment(uuid,uuid,uuid,text,text,text,bigint,text);
drop function if exists api_v1.admin_remove_policy_attachment(uuid);
drop function if exists api_v1.preview_policy_conditions(jsonb,jsonb);
drop function if exists api_v1.admin_get_policy_detail(uuid);

create function api_v1.admin_update_policy(p_policy_id uuid,p_name_ar text,p_name_en text,p_description text,p_owner_user_id uuid,p_status text,p_owner_governance_unit_id uuid,p_legal_reference text,p_decision_number text)
returns jsonb language sql security definer set search_path=pg_catalog,api_v1
as $$select qarar_governance.admin_update_policy($1,$2,$3,$4,$5,$6,$7,$8,$9)$$;
create function api_v1.admin_add_policy_attachment(p_policy_id uuid,p_policy_version_id uuid,p_policy_item_id uuid,p_file_name text,p_file_url text,p_mime_type text,p_file_size_bytes bigint,p_description text)
returns jsonb language sql security definer set search_path=pg_catalog,api_v1
as $$select qarar_governance.admin_add_policy_attachment($1,$2,$3,$4,$5,$6,$7,$8)$$;
create function api_v1.admin_remove_policy_attachment(p_attachment_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,api_v1
as $$select qarar_governance.admin_remove_policy_attachment($1)$$;
create function api_v1.preview_policy_conditions(p_conditions jsonb,p_context jsonb)
returns jsonb language sql security definer set search_path=pg_catalog,api_v1
as $$select qarar_governance.preview_policy_conditions($1,$2)$$;
create function api_v1.admin_get_policy_detail(p_policy_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,api_v1
as $$select qarar_governance.admin_get_policy_detail($1)$$;

do $$ declare f regprocedure; begin
  foreach f in array array[
    'api_v1.admin_update_policy(uuid,text,text,text,uuid,text,uuid,text,text)'::regprocedure,
    'api_v1.admin_add_policy_attachment(uuid,uuid,uuid,text,text,text,bigint,text)'::regprocedure,
    'api_v1.admin_remove_policy_attachment(uuid)'::regprocedure,
    'api_v1.preview_policy_conditions(jsonb,jsonb)'::regprocedure,
    'api_v1.admin_get_policy_detail(uuid)'::regprocedure
  ] loop
    execute format('alter function %s owner to qarar_api_executor',f);
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;

delete from qarar_architecture.api_contract_registry r
where r.api_version='v1' and r.contract_name in(
    'admin_update_policy','admin_add_policy_attachment','admin_remove_policy_attachment',
    'preview_policy_conditions','admin_get_policy_detail'
  ) and not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='qarar_governance' and p.proname=r.implementation_name
      and pg_get_function_identity_arguments(p.oid)=r.identity_arguments
  );

commit;
notify pgrst,'reload schema';
