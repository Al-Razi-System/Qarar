begin;
-- Preserve the legacy batch capability separately from selected-item capabilities.
create or replace function qarar_governance.admin_get_regulation_library_v2(p_policy_id uuid)
 returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result jsonb; v_ids jsonb; v_legacy_ids jsonb; v_items jsonb; v_current uuid; v_working uuid; v_org uuid:=qarar_iam.current_organization_id();
begin
 v_result:=qarar_governance.get_regulation_library_compat_v2(p_policy_id);
 select id into v_current from qarar_governance.policy_versions where policy_id=p_policy_id and organization_id=v_org and legal_status='effective';
 select id into v_working from qarar_governance.policy_versions v where v.policy_id=p_policy_id and v.organization_id=v_org and v.library_mode
  and v.legal_status in ('draft','under_review','approved') and not exists(select 1 from qarar_governance.topic_governance_mappings m where m.policy_version_id=v.id)
  order by version_no desc limit 1;
 select coalesce(jsonb_object_agg(i.item_code,to_jsonb(i)),'{}') into v_items from qarar_governance.policy_items i where i.policy_version_id=v_current;
 select coalesce(jsonb_agg(v.id),'[]') into v_ids from qarar_governance.policy_versions v where v.policy_id=p_policy_id and v.organization_id=v_org and v.library_mode
  and v.id in (v_current,v_working) and (v_result->'capabilities'->>'can_manage')::boolean and v_result->'policy'->>'status'='active';
 select coalesce(jsonb_agg(v.id),'[]') into v_legacy_ids from qarar_governance.policy_versions v
 where v.policy_id=p_policy_id and v.organization_id=v_org
  and v.library_mode and (v_result->'capabilities'->>'can_manage')::boolean
  and v_result->'policy'->>'status'='active'
  and not exists(select 1 from qarar_governance.policy_versions n where n.policy_id=p_policy_id and n.version_no>v.version_no)
  and ((v.legal_status in ('draft','under_review','approved') and not exists(
    select 1 from qarar_governance.topic_governance_mappings m where m.policy_version_id=v.id))
   or (v.legal_status='effective' and not exists(select 1 from qarar_governance.policy_versions n
     where n.policy_id=p_policy_id and n.id<>v.id and n.library_mode and n.legal_status in ('draft','under_review','approved'))));
 return v_result||jsonb_build_object('item_publications',v_items,'item_action_version_ids',v_ids,
  'working_version_id',v_working,'published_version_id',v_current,'direct_activation_version_ids',v_legacy_ids);
end $$;
notify pgrst,'reload schema';
commit;
