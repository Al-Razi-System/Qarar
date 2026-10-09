begin;

-- Preserve the deployed contract and ACL while accepting the displayed reference.
create or replace function qarar_core.admin_list_organizational_units_v2(p_query text default null,p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_core as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_result jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),100); v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  perform qarar_iam.assert_permission('governance.units.read',null);
  with filtered as (
    select u.id,u.name_ar,u.reference_number,u.code,u.parent_unit_id,t.name_ar as type_name_ar,p.name_ar as parent_name_ar
      from qarar_core.governance_units u
      join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
      left join qarar_core.governance_units p on p.id=u.parent_unit_id and p.organization_id=u.organization_id
      where u.organization_id=v_org and u.status<>'archived' and not t.is_council_type
      and (nullif(btrim(p_query),'') is null
        or u.name_ar ilike '%'||btrim(p_query)||'%'
        or u.code ilike '%'||btrim(p_query)||'%'
        or u.reference_number ilike '%'||btrim(p_query)||'%')
  ), page as (select * from filtered order by name_ar,id limit v_limit offset v_offset)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page) order by name_ar,id) from page),'[]'::jsonb),'total',(select count(*) from filtered),'limit',v_limit,'offset',v_offset) into v_result;
  return v_result||jsonb_build_object(
    'types',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar) order by name_ar,id) from qarar_core.governance_unit_types where organization_id=v_org and is_active and not is_council_type),'[]'::jsonb),
    'parents',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar) order by u.name_ar,u.id) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=v_org and u.status<>'archived' and not t.is_council_type),'[]'::jsonb));
end $$;

notify pgrst,'reload schema';
commit;
