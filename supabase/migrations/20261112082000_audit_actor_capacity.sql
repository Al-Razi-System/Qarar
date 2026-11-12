-- The capacity the actor held where they acted: chair, rapporteur, member, system administrator.
-- Derived for every user event from the council the record belongs to (directly, or through its
-- meeting or agenda item) and the actor's memberships in force that day; declared when a command
-- states it, through declare_actor_capacity (verified against what the actor holds) or an authority
-- it already records in metadata. The council's name is kept as it was at the time.
-- Impact map: docs/engineering/impact/AUDIT_LOG_CONTEXT_AND_INTEGRITY_20261112_AR.md (§ الصفة السياقية)
begin;

alter table qarar_audit.audit_logs add column actor_capacity jsonb;

grant select (governance_unit_id) on qarar_meetings.meetings to qarar_audit_executor;
grant select (governance_unit_id) on qarar_decisions.decisions to qarar_audit_executor;
grant select (role_id, membership_status, start_date, end_date) on qarar_iam.memberships to qarar_audit_executor;

create function qarar_audit.safe_uuid(p_value text)
returns uuid language sql immutable set search_path=pg_catalog
as $$ select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid end $$;

/** The council an event's record belongs to, or null when it is organisation-wide. */
create function qarar_audit.event_governance_unit(p_org uuid, p_entity_type text, p_entity_id uuid, p_previous jsonb, p_new jsonb, p_metadata jsonb)
returns uuid language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_unit uuid; v_meeting uuid;
begin
  if p_entity_type in ('governance_units','governance_unit') then return p_entity_id; end if;
  v_unit := qarar_audit.safe_uuid(coalesce(p_new->>'governance_unit_id', p_previous->>'governance_unit_id', p_metadata->>'governance_unit_id'));
  if v_unit is not null then return v_unit; end if;
  v_meeting := case when p_entity_type = 'meetings' then p_entity_id
    else qarar_audit.safe_uuid(coalesce(p_new->>'meeting_id', p_previous->>'meeting_id', p_metadata->>'meeting_id')) end;
  if v_meeting is null and p_entity_type in ('agenda_items','agenda_item') then
    select a.meeting_id into v_meeting from qarar_meetings.agenda_items a where a.id=p_entity_id and a.organization_id=p_org;
  end if;
  if v_meeting is null and p_entity_type = 'decisions' then
    select d.governance_unit_id into v_unit from qarar_decisions.decisions d where d.id=p_entity_id and d.organization_id=p_org;
    return v_unit;
  end if;
  if v_meeting is not null then
    select m.governance_unit_id into v_unit from qarar_meetings.meetings m where m.id=v_meeting and m.organization_id=p_org;
  end if;
  return v_unit;
end;
$$;

create function qarar_audit.held_council_roles(p_org uuid, p_user uuid, p_unit uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(jsonb_agg(distinct r.code order by r.code), '[]'::jsonb)
  from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id
  where p_unit is not null and m.organization_id=p_org and m.user_id=p_user and m.governance_unit_id=p_unit
    and m.membership_status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
$$;

/**
 * A command states the capacity it acts in. Verified: the actor must hold it in that council (or be a
 * system administrator for 'system_admin'). Transaction-local, and only applied to this actor's events.
 */
create function qarar_audit.declare_actor_capacity(p_capacity text, p_governance_unit_id uuid default null)
returns void language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor uuid := auth.uid(); v_org uuid; v_admin boolean;
begin
  if v_actor is null then raise exception 'an authenticated actor is required' using errcode='42501'; end if;
  select u.organization_id, coalesce(u.is_system_admin,false) into v_org, v_admin from qarar_iam.users u where u.id=v_actor;
  if p_capacity = 'system_admin' then
    if not v_admin then raise exception 'actor is not a system administrator' using errcode='42501'; end if;
  elsif not (qarar_audit.held_council_roles(v_org, v_actor, p_governance_unit_id) ? p_capacity) then
    raise exception 'actor does not hold capacity %', p_capacity using errcode='42501';
  end if;
  perform set_config('qarar.audit_capacity', jsonb_build_object('actor', v_actor, 'capacity', p_capacity, 'governance_unit_id', p_governance_unit_id)::text, true);
end;
$$;

create function qarar_audit.stamp_actor_capacity()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_declared jsonb; v_capacity text; v_unit uuid; v_admin boolean;
begin
  if NEW.actor_user_id is null or NEW.actor_capacity is not null then return NEW; end if;
  begin
    v_declared := nullif(current_setting('qarar.audit_capacity', true),'')::jsonb;
  exception when others then v_declared := null;
  end;
  if v_declared is not null and qarar_audit.safe_uuid(v_declared->>'actor') = NEW.actor_user_id then
    v_capacity := v_declared->>'capacity';
    v_unit := qarar_audit.safe_uuid(v_declared->>'governance_unit_id');
  elsif coalesce(NEW.metadata->>'confirmation_authority', NEW.metadata->>'actor_capacity') in ('system_admin','council_chair','council_rapporteur','council_member') then
    v_capacity := coalesce(NEW.metadata->>'confirmation_authority', NEW.metadata->>'actor_capacity');
  end if;
  v_unit := coalesce(v_unit, qarar_audit.event_governance_unit(NEW.organization_id, NEW.entity_type, NEW.entity_id, NEW.previous_data, NEW.new_data, NEW.metadata));
  select coalesce(u.is_system_admin,false) into v_admin from qarar_iam.users u where u.id=NEW.actor_user_id;
  NEW.actor_capacity := jsonb_build_object(
    'source', case when v_capacity is not null then 'declared' else 'derived' end,
    'declared', v_capacity,
    'roles', qarar_audit.held_council_roles(NEW.organization_id, NEW.actor_user_id, v_unit),
    'system_admin', coalesce(v_admin,false),
    'governance_unit_id', v_unit,
    'governance_unit_name', (select g.name_ar from qarar_core.governance_units g where g.id=v_unit and g.organization_id=NEW.organization_id));
  return NEW;
end;
$$;

-- Runs after enrich_audit_log (alphabetical order), so before/after data is already in place.
create trigger stamp_actor_capacity before insert on qarar_audit.audit_logs
  for each row execute function qarar_audit.stamp_actor_capacity();

create or replace function qarar_audit.admin_search_audit_logs(
  p_query text default null, p_action text default null, p_entity_type text default null, p_actor_user_id uuid default null,
  p_result text default null, p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_query text := nullif(btrim(p_query),'');
begin
  perform qarar_iam.assert_permission('audit.logs.read');
  if p_result is not null and p_result not in ('success','failure','denied') then raise exception 'invalid audit result' using errcode='22023'; end if;
  return (
    with matched as (
      select a.*, u.full_name_ar as actor_name_ar, u.email as actor_email
      from qarar_audit.audit_logs a
      left join qarar_iam.users u on u.id=a.actor_user_id and u.organization_id=a.organization_id
      where a.organization_id=v_org
        and (p_action is null or a.action=p_action)
        and (p_entity_type is null or a.entity_type=p_entity_type)
        and (p_actor_user_id is null or a.actor_user_id=p_actor_user_id)
        and (p_result is null or a.result=p_result)
        and (p_from is null or a.occurred_at>=p_from)
        and (p_to is null or a.occurred_at<p_to)
        and (v_query is null or a.action ilike '%'||v_query||'%' or a.entity_type ilike '%'||v_query||'%'
             or u.full_name_ar ilike '%'||v_query||'%' or u.email ilike '%'||v_query||'%'
             or a.request_id = v_query or a.entity_id::text = v_query or a.metadata::text ilike '%'||v_query||'%')
    ), page as (
      select * from matched order by occurred_at desc limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'organization_id', p.organization_id, 'action', p.action, 'entity_type', p.entity_type, 'entity_id', p.entity_id,
          'result', p.result, 'occurred_at', p.occurred_at,
          'actor_user_id', p.actor_user_id, 'actor_name_ar', p.actor_name_ar, 'actor_email', p.actor_email,
          'actor_kind', coalesce(p.actor_kind, case when p.actor_user_id is not null then 'user' else 'system' end),
          'request_id', p.request_id, 'client_ip', host(p.client_ip), 'actor_capacity', p.actor_capacity,
          'changed_fields', coalesce(p.changed_fields, qarar_audit.changed_keys(p.metadata->'old', p.metadata->'new')),
          'entity_label', qarar_audit.entity_label(p.organization_id, p.entity_type, p.entity_id, coalesce(p.new_data, p.previous_data, p.metadata->'new', p.metadata->'old')),
          'metadata', p.metadata - 'old' - 'new')
        order by p.occurred_at desc) from page p), '[]'::jsonb),
      'total', (select count(*) from matched),
      'limit', v_limit, 'offset', v_offset)
  );
end;
$$;

create or replace function qarar_audit.admin_get_audit_log(p_audit_log_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_result jsonb;
begin
  perform qarar_iam.assert_permission('audit.logs.read');
  select jsonb_build_object(
      'id', a.id, 'organization_id', a.organization_id, 'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id,
      'result', a.result, 'occurred_at', a.occurred_at,
      'actor_user_id', a.actor_user_id, 'actor_name_ar', u.full_name_ar, 'actor_email', u.email,
      'actor_kind', coalesce(a.actor_kind, case when a.actor_user_id is not null then 'user' else 'system' end),
      'request_id', a.request_id, 'client_ip', host(a.client_ip), 'user_agent', a.user_agent, 'actor_capacity', a.actor_capacity,
      'previous_data', coalesce(a.previous_data, nullif(a.metadata->'old','null'::jsonb)),
      'new_data', coalesce(a.new_data, nullif(a.metadata->'new','null'::jsonb)),
      'changed_fields', coalesce(a.changed_fields, qarar_audit.changed_keys(a.metadata->'old', a.metadata->'new')),
      'entity_label', qarar_audit.entity_label(a.organization_id, a.entity_type, a.entity_id, coalesce(a.new_data, a.previous_data, a.metadata->'new', a.metadata->'old')),
      'metadata', a.metadata - 'old' - 'new')
    into v_result
  from qarar_audit.audit_logs a
  left join qarar_iam.users u on u.id=a.actor_user_id and u.organization_id=a.organization_id
  where a.id=p_audit_log_id and a.organization_id=qarar_iam.current_organization_id();
  if v_result is null then raise exception 'audit log not found'; end if;
  return v_result;
end;
$$;

alter function qarar_audit.safe_uuid(text) owner to qarar_audit_executor;
alter function qarar_audit.event_governance_unit(uuid,text,uuid,jsonb,jsonb,jsonb) owner to qarar_audit_executor;
alter function qarar_audit.held_council_roles(uuid,uuid,uuid) owner to qarar_audit_executor;
alter function qarar_audit.declare_actor_capacity(text,uuid) owner to qarar_audit_executor;
alter function qarar_audit.stamp_actor_capacity() owner to qarar_audit_executor;
revoke all on function qarar_audit.safe_uuid(text), qarar_audit.event_governance_unit(uuid,text,uuid,jsonb,jsonb,jsonb),
  qarar_audit.held_council_roles(uuid,uuid,uuid), qarar_audit.declare_actor_capacity(text,uuid), qarar_audit.stamp_actor_capacity()
  from public, anon, authenticated, service_role;
-- Commands run as their module executor; any of them may declare the capacity it acts in.
grant execute on function qarar_audit.declare_actor_capacity(text,uuid) to
  qarar_attendance_executor, qarar_core_executor, qarar_decisions_executor, qarar_execution_executor, qarar_governance_executor,
  qarar_iam_executor, qarar_meetings_executor, qarar_minutes_executor, qarar_topics_executor, qarar_voting_executor;

notify pgrst, 'reload schema';
commit;
