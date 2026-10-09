begin;
alter function qarar_governance.get_governance_bundle_v2(uuid) rename to get_governance_bundle_before_readable_v2;
update qarar_architecture.function_registry set function_name='get_governance_bundle_before_readable_v2' where function_oid='qarar_governance.get_governance_bundle_before_readable_v2(uuid)'::regprocedure;
create function qarar_governance.get_governance_bundle_v2(p_bundle_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb; vid uuid; workflow uuid; route jsonb; scopes jsonb;
begin
 result:=qarar_governance.get_governance_bundle_before_readable_v2(p_bundle_id);
 vid:=(result#>>'{version,id}')::uuid;
 workflow:=(result#>>'{workflow_binding,workflow_template_version_id}')::uuid;
 select jsonb_build_object('name_ar',t.name_ar,'steps',coalesce((select jsonb_agg(jsonb_build_object('name_ar',s.name_ar,'sequence_no',s.sequence_no,'work',s.step_type) order by s.sequence_no) from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=v.id and s.organization_id=o),'[]'::jsonb)) into route
 from qarar_governance.workflow_template_versions v join qarar_governance.workflow_templates t on t.id=v.workflow_template_id and t.organization_id=v.organization_id where v.id=workflow and v.organization_id=o;
 select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(s.council_id,s.governance_class_id),'name_ar',coalesce(u.name_ar,c.name_ar)) order by coalesce(u.name_ar,c.name_ar)),'[]'::jsonb) into scopes
 from qarar_governance.topic_type_origin_scopes_v2 s left join qarar_core.governance_units u on u.id=s.council_id and u.organization_id=o left join qarar_governance.governance_unit_classes c on c.id=s.governance_class_id and c.organization_id=o where s.topic_type_version_id=vid and s.organization_id=o;
 return result||jsonb_build_object('route_summary',route,'scope_summary',scopes);
end $$;
alter function qarar_governance.get_governance_bundle_v2(uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_governance_bundle_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_governance_bundle_v2(uuid) to qarar_api_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate) values('qarar_governance.get_governance_bundle_v2(uuid)'::regprocedure,'get_governance_bundle_v2','p_bundle_id uuid','governance','qarar_governance',false);
notify pgrst,'reload schema';
commit;
