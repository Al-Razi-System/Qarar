begin;
create or replace function qarar_governance.get_governance_authoring_options_v2() returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; o uuid:=qarar_iam.current_organization_id();
begin
 result:=qarar_governance.get_governance_authoring_route_options_v2();
 return result||jsonb_build_object(
 'councils',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'governance_class_id',u.governance_class_id) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=o and u.status in ('active','inactive') and t.is_council_type),'[]'::jsonb),
 'council_classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar) order by name_ar) from qarar_governance.governance_unit_classes where organization_id=o and is_active),'[]'::jsonb),
 'source_items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name_ar',i.title_ar,'reference_number',i.item_code,'document_name',p.name_ar) order by p.name_ar,i.sort_order) from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id and v.organization_id=i.organization_id join qarar_governance.policies p on p.id=v.policy_id and p.organization_id=v.organization_id where i.organization_id=o and i.is_active and i.item_type not in ('chapter','section') and v.legal_status='effective' and p.status='active' and v.effective_from<=current_date and (v.effective_to is null or v.effective_to>=current_date) and char_length(btrim(coalesce(i.official_text,i.body_text,'')))>=10),'[]'::jsonb));
end $$;
notify pgrst,'reload schema';
commit;
