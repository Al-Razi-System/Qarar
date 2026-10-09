begin;
create function qarar_core.admin_create_organizational_unit_type_v2(p_name_ar text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_core as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_row qarar_core.governance_unit_types%rowtype; v_ref text;
begin
  perform qarar_iam.assert_permission('governance.unit_types.manage',null);
  if char_length(btrim(coalesce(p_name_ar,''))) not between 2 and 100 then raise exception using errcode='22023',message='أدخل اسم نوع الوحدة من حرفين إلى مئة حرف'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':out:'||btrim(p_name_ar),0));
  select * into v_row from qarar_core.governance_unit_types where organization_id=v_org and name_ar=btrim(p_name_ar) and not is_council_type and is_active order by id limit 1;
  if found then return jsonb_build_object('id',v_row.id,'code',v_row.code,'name_ar',v_row.name_ar); end if;
  v_ref:=qarar_governance.next_v2_reference('OUT');
  insert into qarar_core.governance_unit_types(organization_id,code,name_ar,is_active,is_council_type,is_system)
  values(v_org,lower(replace(v_ref,'-','_')),btrim(p_name_ar),true,false,false) returning * into v_row;
  perform qarar_audit.append_audit_log(v_org,'organizational.unit_type.created','governance_unit_types',v_row.id,jsonb_build_object('code',v_row.code));
  return jsonb_build_object('id',v_row.id,'code',v_row.code,'name_ar',v_row.name_ar);
end $$;
alter function qarar_core.admin_create_organizational_unit_type_v2(text) owner to qarar_core_executor;
revoke all on function qarar_core.admin_create_organizational_unit_type_v2(text) from public,anon,authenticated,service_role;
grant execute on function qarar_core.admin_create_organizational_unit_type_v2(text) to qarar_api_executor;
create function api_v2.admin_create_organizational_unit_type_v2(p_name_ar text)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_create_organizational_unit_type_v2($1)$$;
alter function api_v2.admin_create_organizational_unit_type_v2(text) owner to qarar_api_executor;
revoke all on function api_v2.admin_create_organizational_unit_type_v2(text) from public,anon,authenticated,service_role;
grant execute on function api_v2.admin_create_organizational_unit_type_v2(text) to authenticated,service_role;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','admin_create_organizational_unit_type_v2','qarar_core','admin_create_organizational_unit_type_v2','p_name_ar text','core','authenticated');
notify pgrst,'reload schema';
commit;
