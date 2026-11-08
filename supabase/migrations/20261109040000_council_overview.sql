-- One read for the councils screen: who chairs each council, how many members it has, whether
-- it has a meeting plan, how many meetings it has held or planned and which is next. The list
-- shows these on every row, so the screen no longer needs a request per council.
-- Impact map: docs/engineering/impact/COUNCILS_DIRECTORY_20261109_AR.md
begin;

create function qarar_meetings.get_council_overview_v2()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('governance.units.read',null);
  return coalesce((
    select jsonb_object_agg(u.id,jsonb_build_object(
      'chair_name_ar',(select usr.full_name_ar from qarar_iam.memberships m
        join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.code='council_chair'
        join qarar_iam.users usr on usr.id=m.user_id
        where m.governance_unit_id=u.id and m.organization_id=v_org and m.membership_status='active'
          and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
        order by m.start_date desc limit 1),
      'member_count',(select count(distinct m.user_id)::integer from qarar_iam.memberships m
        where m.governance_unit_id=u.id and m.organization_id=v_org and m.membership_status='active'
          and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)),
      'has_plan',exists(select 1 from qarar_meetings.council_meeting_plans_v2 p
        where p.governance_unit_id=u.id and p.organization_id=v_org and p.status='active'),
      'meetings_total',(select count(*)::integer from qarar_meetings.meetings mt
        where mt.governance_unit_id=u.id and mt.organization_id=v_org),
      'next_meeting',(select jsonb_build_object('id',mt.id,'meeting_no',mt.meeting_no,'status',mt.status,
          'date',coalesce(mt.scheduled_date,mt.planned_window_start),'date_confirmed',mt.schedule_date_confirmed)
        from qarar_meetings.meetings mt
        where mt.governance_unit_id=u.id and mt.organization_id=v_org
          and mt.status in('in_progress','ready_to_start','scheduled','draft')
          and coalesce(mt.planned_window_end,mt.scheduled_date)>=current_date - 7
        order by (mt.status='in_progress') desc,coalesce(mt.scheduled_date,mt.planned_window_start),mt.created_at limit 1)
    ))
    from qarar_core.governance_units u
    join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id and t.is_council_type
    where u.organization_id=v_org and u.status<>'archived'
  ),'{}'::jsonb);
end;
$$;

create function api_v2.get_council_overview_v2()
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_meetings.get_council_overview_v2()$$;

alter function qarar_meetings.get_council_overview_v2() owner to qarar_meetings_executor;
alter function api_v2.get_council_overview_v2() owner to qarar_api_executor;
revoke all on function qarar_meetings.get_council_overview_v2() from public,anon,authenticated,service_role;
revoke all on function api_v2.get_council_overview_v2() from public,anon,service_role;
grant execute on function qarar_meetings.get_council_overview_v2() to qarar_api_executor;
grant execute on function api_v2.get_council_overview_v2() to authenticated;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid='qarar_meetings.get_council_overview_v2()'::regprocedure
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','get_council_overview_v2','qarar_meetings','get_council_overview_v2','','meetings','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,
  implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

notify pgrst,'reload schema';
commit;
