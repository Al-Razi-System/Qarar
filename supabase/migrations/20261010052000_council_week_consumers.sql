begin;
create function qarar_core.admin_create_council_with_plan_v2(p_values jsonb,p_meeting_plan jsonb,p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r jsonb; updated jsonb; changed timestamptz;
begin
 perform qarar_iam.assert_permission('governance.units.manage',null);
 if jsonb_typeof(p_values) is distinct from 'object' then raise exception using errcode='22023',message='بيانات المجلس غير صالحة';end if;
 r:=qarar_core.admin_create_council_v2(p_values->>'name_ar',p_values->>'name_en',p_values->>'description',
  (p_values->>'unit_type_id')::uuid,nullif(p_values->>'scope_unit_id','')::uuid,nullif(p_values->>'parent_council_id','')::uuid,
  nullif(p_values->>'governance_class_id','')::uuid,(p_values->>'minimum_active_members')::integer,
  (p_values->>'allow_dual_leadership')::boolean,null,p_client_request_id);
 if coalesce((r->>'idempotent_replay')::boolean,false) then return r;end if;
 if p_meeting_plan is not null then
  select updated_at into changed from qarar_core.governance_units where id=(r->>'id')::uuid and organization_id=qarar_iam.current_organization_id();
  updated:=qarar_core.admin_update_council_v2((r->>'id')::uuid,p_values,changed,p_meeting_plan);
  r:=r||jsonb_build_object('meeting_plan_id',updated->'meeting_plan_id');
 end if;
 return r;
end $$;
alter function qarar_core.admin_create_council_with_plan_v2(jsonb,jsonb,uuid) owner to qarar_core_executor;
revoke all on function qarar_core.admin_create_council_with_plan_v2(jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_core.admin_create_council_with_plan_v2(jsonb,jsonb,uuid) to qarar_api_executor;
create function api_v2.admin_create_council_with_plan_v2(p_values jsonb,p_meeting_plan jsonb,p_client_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_core.admin_create_council_with_plan_v2(p_values,p_meeting_plan,p_client_request_id)$$;
alter function api_v2.admin_create_council_with_plan_v2(jsonb,jsonb,uuid) owner to qarar_api_executor;
revoke all on function api_v2.admin_create_council_with_plan_v2(jsonb,jsonb,uuid) from public,anon,service_role;
grant execute on function api_v2.admin_create_council_with_plan_v2(jsonb,jsonb,uuid) to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'core','qarar_core',false from pg_proc p where p.pronamespace='qarar_core'::regnamespace and p.proname='admin_create_council_with_plan_v2';
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','admin_create_council_with_plan_v2','qarar_core','admin_create_council_with_plan_v2','p_values jsonb, p_meeting_plan jsonb, p_client_request_id uuid','core','authenticated');
notify pgrst,'reload schema';
commit;
