begin;
create or replace function qarar_governance.admin_get_route_designer_v2() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); inventory jsonb; items jsonb;
begin
 perform qarar_iam.assert_permission('governance.workflows.manage',null);
 inventory:=qarar_governance.admin_list_workflow_templates();
 select coalesce(jsonb_agg(t||jsonb_build_object('revision',md5(t::text),'reference_number',w.reference_number,
  'payload',v.designer_payload,'version_id',v.id,'version_status',v.status,'validation_errors',v.validation_errors,
  'activation_issues',coalesce((select jsonb_agg(distinct case when s.governance_unit_id is not null
   then 'أحد المجالس المحددة غير نشط؛ جهّزه قبل تنشيط المسار.' else 'أحد أنواع المجالس لا يملك مجلسًا نشطًا بعد؛ جهّز المجالس أولًا.' end)
   from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=v.id and
   ((s.governance_unit_id is not null and not exists(select 1 from qarar_core.governance_units u where u.id=s.governance_unit_id and u.status='active'))
    or (s.governance_class_id is not null and not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types ut on ut.id=u.unit_type_id
       where u.organization_id=o and ut.is_council_type and u.status='active' and u.governance_class_id=s.governance_class_id)))),'[]'))
  order by t->>'name_ar'),'[]') into items
 from jsonb_array_elements(inventory->'items') t
 join qarar_governance.workflow_templates w on w.id=(t->>'id')::uuid
 left join lateral (select * from qarar_governance.workflow_template_versions x where x.workflow_template_id=w.id order by version_no desc limit 1) v on true;
 return jsonb_build_object('items',items,'councils',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'status',u.status) order by u.name_ar)
 from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id
 where u.organization_id=o and t.is_council_type and u.status<>'archived'),'[]'),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name_ar',c.name_ar) order by c.governance_level,c.name_ar)
 from qarar_governance.governance_unit_classes c where c.organization_id=o and c.is_active),'[]'));
end $$;
notify pgrst,'reload schema';
commit;
