-- Preserve the individual assignment contract while exposing its logical batch and target types.
begin;

create function qarar_meetings.list_meeting_assignments_with_batches(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_result jsonb;
begin
  v_result:=qarar_meetings.list_meeting_assignments(p_meeting_id);
  v_result:=jsonb_set(v_result,'{assignments}',coalesce((
    select jsonb_agg(row_value || jsonb_build_object(
      'assignment_batch_id',ma.assignment_batch_id,
      'revision',coalesce(b.revision,(row_value->>'revision')::integer)
    ) order by ord)
    from jsonb_array_elements(v_result->'assignments') with ordinality source(row_value,ord)
    left join qarar_meetings.meeting_assignments ma
      on ma.id=(row_value->>'id')::uuid and ma.organization_id=v_org
    left join qarar_meetings.meeting_assignment_batches b
      on b.id=ma.assignment_batch_id and b.organization_id=ma.organization_id
  ),'[]'::jsonb));
  if v_result->'options' is not null and jsonb_typeof(v_result->'options')='object' then
    v_result:=jsonb_set(v_result,'{options,unit_types}',coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'name_ar',t.name_ar) order by t.name_ar)
      from qarar_core.governance_unit_types t
      where t.organization_id=v_org and t.is_active and not t.is_council_type
    ),'[]'::jsonb),true);
  end if;
  return v_result;
end;
$$;

create or replace function api_v2.list_meeting_assignments_v2(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_meetings.list_meeting_assignments_with_batches($1)$$;

alter function qarar_meetings.list_meeting_assignments_with_batches(uuid) owner to qarar_meetings_executor;
alter function api_v2.list_meeting_assignments_v2(uuid) owner to qarar_api_executor;
revoke all on function qarar_meetings.list_meeting_assignments_with_batches(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.list_meeting_assignments_with_batches(uuid) to qarar_api_executor;
revoke all on function api_v2.list_meeting_assignments_v2(uuid) from public,anon,service_role;
grant execute on function api_v2.list_meeting_assignments_v2(uuid) to authenticated;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid='qarar_meetings.list_meeting_assignments_with_batches(uuid)'::regprocedure
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

update qarar_architecture.api_contract_registry set implementation_name='list_meeting_assignments_with_batches'
where api_version='v2' and contract_name='list_meeting_assignments_v2';

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)
values('meetings','qarar_core','governance_unit_types','List active organizational unit target types for meeting assignments')
on conflict do nothing;

notify pgrst,'reload schema';
commit;
