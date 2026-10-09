begin;
create or replace function qarar_core.admin_get_council_detail(p_council_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();r jsonb;
begin
 perform qarar_iam.assert_permission('governance.units.read',p_council_id);
 select to_jsonb(u)||jsonb_build_object(
  'unit_type',jsonb_build_object('id',t.id,'code',t.code,'name_ar',t.name_ar,'name_en',t.name_en),
  'scope_unit',case when s.id is null then null else jsonb_build_object('id',s.id,'code',s.code,'name_ar',s.name_ar)end,
  'parent_unit',case when p.id is null then null else jsonb_build_object('id',p.id,'code',p.code,'name_ar',p.name_ar)end,
  'governance_class',case when c.id is null then null else jsonb_build_object('id',c.id,'code',c.code,'name_ar',c.name_ar)end)
 into r from qarar_core.governance_units u
 join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id and t.is_council_type
 left join qarar_core.governance_units s on s.id=u.scope_unit_id and s.organization_id=u.organization_id
 left join qarar_core.governance_units p on p.id=u.parent_unit_id and p.organization_id=u.organization_id
 left join qarar_governance.governance_unit_classes c on c.id=u.governance_class_id and c.organization_id=u.organization_id
 where u.id=p_council_id and u.organization_id=o;
 if r is null then raise exception using errcode='P0002',message='المجلس غير موجود';end if;
 return r;
end $$;
commit;
