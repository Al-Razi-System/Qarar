-- An inactive council may prepare the first agenda that is required before
-- activation. Only the origin council receives this exception; downstream
-- councils still have to be active and the meeting-session gate is unchanged.
begin;

create or replace function qarar_governance.resolve_step_unit(
  p_organization_id uuid,
  p_origin_unit_id uuid,
  p_explicit_unit_id uuid,
  p_governance_class_id uuid
) returns uuid
language sql stable
set search_path=pg_catalog,qarar_core as $$
 with recursive origin as (
   select u.id,u.scope_unit_id,t.is_council_type
   from qarar_core.governance_units u
   join qarar_core.governance_unit_types t
     on t.id=u.unit_type_id and t.organization_id=u.organization_id
   where u.id=p_origin_unit_id and u.organization_id=p_organization_id
     and u.status in('active','inactive')
 ), scopes as (
   select u.id,u.parent_unit_id,0 as depth,array[u.id] as visited
   from origin o
   join qarar_core.governance_units u
     on u.id=coalesce(o.scope_unit_id,case when not o.is_council_type then o.id end)
   join qarar_core.governance_unit_types t
     on t.id=u.unit_type_id and t.organization_id=u.organization_id
   where u.organization_id=p_organization_id and u.status='active' and not t.is_council_type
   union all
   select p.id,p.parent_unit_id,s.depth+1,s.visited||p.id
   from scopes s
   join qarar_core.governance_units p on p.id=s.parent_unit_id
   join qarar_core.governance_unit_types t
     on t.id=p.unit_type_id and t.organization_id=p.organization_id
   where p.organization_id=p_organization_id and p.status='active'
     and not t.is_council_type and not p.id=any(s.visited)
 ), legacy as (
   select u.id,u.parent_unit_id,u.governance_class_id,0 as depth,array[u.id] as visited
   from origin o join qarar_core.governance_units u on u.id=o.id
   where o.is_council_type and o.scope_unit_id is null
   union all
   select p.id,p.parent_unit_id,p.governance_class_id,l.depth+1,l.visited||p.id
   from legacy l join qarar_core.governance_units p on p.id=l.parent_unit_id
   where p.organization_id=p_organization_id and p.status='active' and not p.id=any(l.visited)
 ), candidates as (
   select c.id,s.depth
   from scopes s join qarar_core.governance_units c on c.scope_unit_id=s.id
   join qarar_core.governance_unit_types t
     on t.id=c.unit_type_id and t.organization_id=c.organization_id
   where c.organization_id=p_organization_id and c.status='active'
     and t.is_council_type and c.governance_class_id=p_governance_class_id
 ), nearest as (
   select id from candidates where depth=(select min(depth) from candidates)
 ), roots as (
   select u.id
   from qarar_core.governance_units u
   join qarar_core.governance_unit_types t
     on t.id=u.unit_type_id and t.organization_id=u.organization_id
   where u.organization_id=p_organization_id and u.status='active'
     and t.is_council_type and u.governance_class_id=p_governance_class_id
     and (u.scope_unit_id is null or exists(select 1 from legacy))
 )
 select case
   when not exists(select 1 from origin) then null
   when p_explicit_unit_id is not null then (
     select id from qarar_core.governance_units
     where id=p_explicit_unit_id and organization_id=p_organization_id
       and (status='active' or (id=p_origin_unit_id and status='inactive'))
   )
   when exists(select 1 from scopes) then case
     when exists(select 1 from nearest)
       then (select id from nearest where (select count(*) from nearest)=1)
     else (select id from roots where (select count(*) from roots)=1)
   end
   when exists(select 1 from legacy) then coalesce(
     (select id from legacy where governance_class_id=p_governance_class_id order by depth limit 1),
     (select id from roots where (select count(*) from roots)=1)
   )
   else null
 end;
$$;

-- Council status is part of every meeting-selection/read surface so an
-- inactive council is never presented as if it were operational.
create or replace function qarar_meetings.get_sprint02_form_options()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin
  if v_org is null then
    raise exception using errcode='42501',message='يلزم حساب مؤسسي نشط';
  end if;
  return jsonb_build_object(
    'meeting_types',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'code',code,'name_ar',name_ar,'name_en',name_en
      ) order by name_ar)
      from qarar_meetings.meeting_types
      where organization_id=v_org and is_active
    ),'[]'::jsonb),
    'meeting_units',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',u.id,'code',u.code,'name_ar',u.name_ar,'name_en',u.name_en,'status',u.status
      ) order by u.name_ar)
      from qarar_core.governance_units u
      where u.organization_id=v_org and u.status in('active','inactive')
        and (qarar_iam.is_system_admin() or qarar_iam.has_permission('meetings.create',u.id))
    ),'[]'::jsonb),
    'referral_units',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'code',code,'name_ar',name_ar,'name_en',name_en,'status',status
      ) order by name_ar)
      from qarar_core.governance_units
      where organization_id=v_org and status='active'
    ),'[]'::jsonb),
    'location_types','["onsite","online","hybrid"]'::jsonb
  );
end;
$$;

create or replace function qarar_meetings.list_meetings_calendar_v2(
  p_from_date date,p_to_date date,p_unit_ids uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_admin boolean:=coalesce(qarar_iam.is_system_admin(),false);
begin
  if p_from_date is null or p_to_date is null or p_to_date<p_from_date or p_to_date-p_from_date>370 then
    raise exception using errcode='22023',message='اختر نطاق تقويم صحيحاً لا يتجاوز سنة.';
  end if;
  return coalesce((
    with authorized_units as materialized(
      select governance_unit_id from qarar_iam.current_meeting_access_units()
    )
    select jsonb_agg(jsonb_build_object(
      'id',m.id,'meeting_no',m.meeting_no,'title_ar',m.title_ar,'status',m.status,
      'scheduled_date',m.scheduled_date,'planned_window_start',m.planned_window_start,
      'planned_window_end',m.planned_window_end,'schedule_date_confirmed',m.schedule_date_confirmed,
      'start_time',m.start_time,'end_time',m.end_time,'governance_unit_id',m.governance_unit_id,
      'unit_name_ar',u.name_ar,'session_sequence_no',m.session_sequence_no,
      'academic_year_start',m.academic_year_start,'title_is_custom',m.title_is_custom,
      'governance_unit_status',u.status,
      'agenda_item_count',(select count(*) from qarar_meetings.agenda_items ai where ai.meeting_id=m.id)
    ) order by coalesce(m.planned_window_start,m.scheduled_date),m.start_time nulls last)
    from qarar_meetings.meetings m
    join qarar_core.governance_units u
      on u.id=m.governance_unit_id and u.organization_id=m.organization_id
    where m.organization_id=v_org
      and coalesce(m.planned_window_end,m.scheduled_date)>=p_from_date
      and coalesce(m.planned_window_start,m.scheduled_date)<=p_to_date
      and (p_unit_ids is null or cardinality(p_unit_ids)=0 or m.governance_unit_id=any(p_unit_ids))
      and (v_admin or m.created_by_user_id=v_actor or exists(
        select 1 from authorized_units a
        where a.governance_unit_id is null or a.governance_unit_id=m.governance_unit_id
      ))
  ),'[]'::jsonb);
end;
$$;

alter function qarar_governance.resolve_step_unit(uuid,uuid,uuid,uuid) owner to qarar_governance_executor;
alter function qarar_meetings.get_sprint02_form_options() owner to qarar_meetings_executor;
alter function qarar_meetings.list_meetings_calendar_v2(date,date,uuid[]) owner to qarar_meetings_executor;

revoke all on function qarar_meetings.get_sprint02_form_options(),
  qarar_meetings.list_meetings_calendar_v2(date,date,uuid[]) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.get_sprint02_form_options(),
  qarar_meetings.list_meetings_calendar_v2(date,date,uuid[]) to qarar_api_executor;

comment on function qarar_governance.resolve_step_unit(uuid,uuid,uuid,uuid) is
  'Resolves active route councils and permits only the inactive origin council to resolve as its own first preparation step.';
comment on function qarar_meetings.get_sprint02_form_options() is
  'Meeting form references include council lifecycle status; archived councils remain excluded.';
comment on function qarar_meetings.list_meetings_calendar_v2(date,date,uuid[]) is
  'Calendar meeting read model including governance_unit_status for explicit inactive-council presentation.';

commit;
