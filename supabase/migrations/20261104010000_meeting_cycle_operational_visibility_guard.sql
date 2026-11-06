-- Keep future plan occurrences in planning views, but out of the operational
-- queue, and never allow their session to be prepared/opened before the cycle.
-- Impact map: docs/engineering/impact/MEETING_CYCLE_EXPIRY_REACTIVATION_20261103_AR.md
begin;

grant select(id,timezone) on qarar_core.organizations to qarar_meetings_executor;

create or replace function qarar_meetings.guard_meeting_status_transitions()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_today date;
begin
  if old.status=new.status then return new; end if;
  if old.status='draft' and new.status not in('scheduled','cancelled','not_held') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='scheduled' and new.status not in('ready_to_start','cancelled','draft','not_held') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='ready_to_start' and new.status not in('in_progress','scheduled','cancelled','not_held') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='in_progress' and new.status not in('waiting_for_minutes','postponed','cancelled') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='waiting_for_minutes' and new.status not in('waiting_for_approval') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='waiting_for_approval' and new.status not in('closed','waiting_for_minutes') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='closed' and new.status not in('archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='cancelled' and new.status not in('draft','scheduled','archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='postponed' and new.status not in('archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='not_held' and new.status not in('archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='archived' then
    raise exception 'Cannot transition from archived status.';
  end if;

  if new.status in('ready_to_start','in_progress') and new.planned_window_start is not null then
    select (clock_timestamp() at time zone coalesce(nullif(o.timezone,''),'Asia/Aden'))::date
      into v_today from qarar_core.organizations o where o.id=new.organization_id;
    if v_today<new.planned_window_start then
      raise exception using errcode='23514',
        message='لا يمكن تجهيز الجلسة قبل بدء دورة الاجتماع في '||new.planned_window_start::text||'.';
    end if;
  end if;

  if new.status='waiting_for_minutes' and new.quorum_status<>'met' and new.quorum_continuation is null then
    raise exception 'Cannot proceed to minutes phase. Quorum is not met.';
  end if;
  return new;
end $$;

create or replace function qarar_meetings.search_meetings(
  p_query text default null,p_status text default null,p_unit_id uuid default null,
  p_from_date date default null,p_to_date date default null,p_limit integer default 25,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_is_system_admin boolean:=coalesce(qarar_iam.is_system_admin(),false);
  v_limit integer:=least(greatest(coalesce(p_limit,25),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_today date;
  v_operational_only boolean:=p_from_date is null and p_to_date is null
    and nullif(btrim(p_query),'') is null and p_status is null;
begin
  if v_org is null then raise exception 'active authenticated account is required' using errcode='42501';end if;
  select (clock_timestamp() at time zone coalesce(nullif(o.timezone,''),'Asia/Aden'))::date
    into v_today from qarar_core.organizations o where o.id=v_org;

  return (
    with authorized_units as materialized(
      select access.governance_unit_id from qarar_iam.current_meeting_access_units() access
    ),agenda_counts as materialized(
      select agenda.meeting_id,count(*)::integer agenda_item_count
      from qarar_meetings.agenda_items agenda where agenda.organization_id=v_org group by agenda.meeting_id
    ),filtered as materialized(
      select meeting.id,meeting.meeting_no,meeting.title_ar,meeting.title_en,meeting.scheduled_date,
        meeting.planned_window_start,meeting.session_sequence_no,meeting.academic_year_start,meeting.title_is_custom,
        meeting.planned_window_end,meeting.schedule_date_confirmed,meeting.start_time,meeting.end_time,
        meeting.location_type,meeting.status,meeting.updated_at,meeting.created_at,
        unit.id governance_unit_id,unit.name_ar governance_unit_name_ar,unit.name_ar unit_name_ar,
        meeting_type.id meeting_type_id,meeting_type.name_ar meeting_type_name_ar,
        coalesce(agenda_count.agenda_item_count,0) agenda_item_count
      from qarar_meetings.meetings meeting
      join qarar_core.governance_units unit on unit.id=meeting.governance_unit_id
      left join qarar_meetings.meeting_types meeting_type on meeting_type.id=meeting.meeting_type_id
      left join agenda_counts agenda_count on agenda_count.meeting_id=meeting.id
      where meeting.organization_id=v_org
        and (v_is_system_admin or meeting.created_by_user_id=v_actor or exists(
          select 1 from authorized_units access where access.governance_unit_id is null
            or access.governance_unit_id=meeting.governance_unit_id))
        and (p_status is null or meeting.status=p_status)
        and (p_unit_id is null or meeting.governance_unit_id=p_unit_id)
        and (p_from_date is null or coalesce(meeting.planned_window_end,meeting.scheduled_date)>=p_from_date)
        and (p_to_date is null or coalesce(meeting.planned_window_start,meeting.scheduled_date)<=p_to_date)
        and (nullif(btrim(p_query),'') is null or meeting.meeting_no ilike '%'||btrim(p_query)||'%'
          or meeting.title_ar ilike '%'||btrim(p_query)||'%')
        and (not v_operational_only or meeting.planned_window_start is null
          or meeting.planned_window_start<=v_today
          or meeting.status not in('draft','scheduled','ready_to_start'))
    ),paged as(
      select * from filtered order by
        case when status in('draft','scheduled','ready_to_start')
          and coalesce(planned_window_end,scheduled_date)<v_today then 0 else 1 end,
        scheduled_date desc,created_at desc limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'items',coalesce((select jsonb_agg(to_jsonb(item) order by
        case when item.status in('draft','scheduled','ready_to_start')
          and coalesce(item.planned_window_end,item.scheduled_date)<v_today then 0 else 1 end,
        item.scheduled_date desc,item.created_at desc) from paged item),'[]'::jsonb),
      'total',(select count(*) from filtered),'limit',v_limit,'offset',v_offset)
  );
end $$;

create or replace function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_detail jsonb;
  v_can_direct boolean;
  v_summary jsonb;
  v_today date;
  v_cycle_available boolean:=true;
  v_window_start date;
begin
  v_detail:=qarar_meetings.get_meeting_detail_before_direct_topics(p_meeting_id);
  v_can_direct:=coalesce(v_detail->>'status','') in('draft','scheduled')
    and qarar_iam.has_unit_role_code((v_detail->>'governance_unit_id')::uuid,array['council_chair']);
  v_detail:=jsonb_set(v_detail,'{capabilities,can_add_direct_topic}',to_jsonb(v_can_direct),true);
  v_detail:=jsonb_set(v_detail,'{agenda_items}',coalesce((
    select jsonb_agg(jsonb_set(item,'{topic}',(item->'topic')||jsonb_build_object('is_direct',t.meeting_scope_id is not null))
      order by (item->>'agenda_order')::integer)
    from jsonb_array_elements(v_detail->'agenda_items') item
    join qarar_topics.topics t on t.id=(item#>>'{topic,id}')::uuid
      and t.organization_id=qarar_iam.current_organization_id()
  ),'[]'::jsonb),true);
  v_summary:=qarar_governance.get_meeting_invitation_summary((v_detail->>'organization_id')::uuid,p_meeting_id);
  v_detail:=jsonb_set(v_detail,'{invitation_summary}',v_summary,true);

  v_window_start:=nullif(v_detail->>'planned_window_start','')::date;
  if v_window_start is not null and coalesce(v_detail->>'status','') in('draft','scheduled','ready_to_start') then
    select (clock_timestamp() at time zone coalesce(nullif(o.timezone,''),'Asia/Aden'))::date
      into v_today from qarar_core.organizations o where o.id=(v_detail->>'organization_id')::uuid;
    v_cycle_available:=v_today>=v_window_start;
  end if;
  v_detail:=jsonb_set(v_detail,'{cycle_available}',to_jsonb(v_cycle_available),true);
  v_detail:=jsonb_set(v_detail,'{cycle_unavailable_reason}',case when v_cycle_available then 'null'::jsonb
    else to_jsonb('تبدأ دورة هذا الاجتماع في '||v_window_start::text||'.'::text) end,true);
  if not v_cycle_available then
    v_detail:=jsonb_set(v_detail,'{capabilities,can_prepare_session}','false'::jsonb,true);
    v_detail:=jsonb_set(v_detail,'{capabilities,can_start_session}','false'::jsonb,true);
  end if;
  return v_detail;
end $$;

comment on function qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer) is
  'Operational default excludes future plan cycles; explicit search/date filters and calendar remain planning views.';
comment on function qarar_meetings.guard_meeting_status_transitions() is
  'Enforces lifecycle transitions and blocks preparing/opening a plan occurrence before its organization-local cycle window.';

notify pgrst,'reload schema';
commit;
