begin;
alter function qarar_governance.admin_get_regulation_library_v2(uuid) rename to get_regulation_library_compat_v2;
revoke all on function qarar_governance.get_regulation_library_compat_v2(uuid) from public,anon,authenticated,service_role,qarar_api_executor;
create function qarar_governance.admin_get_regulation_library_v2(p_policy_id uuid)
 returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result jsonb; v_ids jsonb;
begin
 v_result:=qarar_governance.get_regulation_library_compat_v2(p_policy_id);
 select coalesce(jsonb_agg(v.id),'[]') into v_ids from qarar_governance.policy_versions v
 where v.policy_id=p_policy_id and v.organization_id=qarar_iam.current_organization_id()
  and v.library_mode and (v_result->'capabilities'->>'can_manage')::boolean
  and v_result->'policy'->>'status'='active'
  and ((v.legal_status in ('draft','under_review','approved') and not exists(
    select 1 from qarar_governance.topic_governance_mappings m where m.policy_version_id=v.id))
   or (v.legal_status='effective' and not exists(select 1 from qarar_governance.policy_versions n
     where n.policy_id=p_policy_id and n.version_no>v.version_no)));
 return v_result||jsonb_build_object('direct_activation_version_ids',v_ids);
end $$;
alter function qarar_governance.admin_get_regulation_library_v2(uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_get_regulation_library_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_get_regulation_library_v2(uuid) to qarar_api_executor;
create or replace function api_v2.admin_get_regulation_library_v2(p_policy_id uuid)
 returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select qarar_governance.admin_get_regulation_library_v2($1)
$$;
notify pgrst,'reload schema';
commit;
