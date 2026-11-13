-- The follow-up and performance centre: every council a person leads or follows, with the sessions it
-- held on time, late or not at all, attendance, minutes, tasks and its state. Read-only: no new tables.
-- Meetings and attendance classify their own records; governance assembles the two api_v2 contracts.
-- Impact map: docs/engineering/impact/COUNCIL_PERFORMANCE_FOLLOW_UP_20261113_AR.md
begin;

/** One row per session of the councils in an academic year, classified against its due day. */
create function qarar_meetings.council_sessions_v2(p_org uuid, p_councils uuid[], p_year date)
returns table(meeting_id uuid, council_id uuid, title_ar text, meeting_no text, sequence_no integer,
  planned_on date, due_on date, scheduled_on date, held_on date, status text, outcome text, late_days integer)
language sql stable security definer set search_path=pg_catalog
as $$
  with today as (select (now() at time zone 'Asia/Riyadh')::date d),
  base as (
    select m.id, m.governance_unit_id, m.title_ar, m.meeting_no, m.session_sequence_no, m.status, m.scheduled_date,
      coalesce(m.planned_date, m.scheduled_date) planned_on,
      coalesce(m.planned_window_end, m.scheduled_date) due_on,
      coalesce(
        (select (min(h.changed_at) at time zone 'Asia/Riyadh')::date from qarar_meetings.meeting_status_history h
          where h.meeting_id=m.id and h.organization_id=m.organization_id and h.to_status='in_progress'),
        case when m.status in ('in_progress','waiting_for_minutes','waiting_for_approval','closed','archived') then m.scheduled_date end
      ) held_on
    from qarar_meetings.meetings m
    where m.organization_id=p_org and m.governance_unit_id=any(p_councils) and m.academic_year_start=p_year
  )
  select b.id, b.governance_unit_id, b.title_ar, b.meeting_no, b.session_sequence_no, b.planned_on, b.due_on, b.scheduled_date,
    case when b.status in ('not_held','cancelled','postponed') then null else b.held_on end,
    b.status,
    case when b.status='not_held' then 'missed'
         when b.status in ('cancelled','postponed') then 'cancelled'
         when b.held_on is not null then case when b.held_on<=b.due_on then 'on_time' else 'late' end
         when b.due_on<t.d then 'overdue'
         else 'upcoming' end,
    case when b.status in ('not_held','cancelled','postponed') then 0
         when b.held_on is not null then greatest(b.held_on-b.due_on, 0)
         when b.due_on<t.d then t.d-b.due_on
         else 0 end
  from base b cross join today t
$$;

/** Who was present and how many were recorded, per meeting. */
create function qarar_attendance.meeting_attendance_v2(p_org uuid, p_meetings uuid[])
returns table(meeting_id uuid, present integer, recorded integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select a.meeting_id, (count(*) filter (where a.attendance_status in ('present','late')))::integer,
    (count(*) filter (where a.attendance_status<>'pending'))::integer
  from qarar_attendance.attendance_records a
  where a.organization_id=p_org and a.meeting_id=any(p_meetings)
  group by a.meeting_id
$$;

/** The chair's name and the number of active members of a council. */
create function qarar_iam.council_profile_v2(p_org uuid, p_council uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with active as (
    select m.user_id, r.code from qarar_iam.memberships m
    join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.is_active
    where m.organization_id=p_org and m.governance_unit_id=p_council and m.membership_status='active'
      and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
  )
  select jsonb_build_object(
    'chair_name_ar', (select u.full_name_ar from active a join qarar_iam.users u on u.id=a.user_id and u.organization_id=p_org
      where a.code='council_chair' order by u.full_name_ar limit 1),
    'member_count', (select count(distinct user_id) from active))
$$;

/** The session ledger of the councils with attendance, minutes and decisions joined in. */
create function qarar_governance.oversight_session_ledger_v2(p_org uuid, p_councils uuid[], p_year date)
returns table(meeting_id uuid, council_id uuid, title_ar text, meeting_no text, sequence_no integer, planned_on date, due_on date,
  scheduled_on date, held_on date, status text, outcome text, late_days integer, present integer, recorded integer,
  minutes_approved_on date, decisions integer)
language sql stable security definer set search_path=pg_catalog
as $$
  with s as (select * from qarar_meetings.council_sessions_v2(p_org, p_councils, p_year)),
  att as (select * from qarar_attendance.meeting_attendance_v2(p_org,
    coalesce((select array_agg(s.meeting_id) from s where s.held_on is not null), '{}'::uuid[])))
  select s.meeting_id, s.council_id, s.title_ar, s.meeting_no, s.sequence_no, s.planned_on, s.due_on, s.scheduled_on, s.held_on,
    s.status, s.outcome, s.late_days, att.present, att.recorded,
    (select (max(mm.approved_at) at time zone 'Asia/Riyadh')::date from qarar_minutes.meeting_minutes mm
      where mm.organization_id=p_org and mm.meeting_id=s.meeting_id and mm.status='approved'),
    (select count(*)::integer from qarar_decisions.decisions d where d.organization_id=p_org and d.meeting_id=s.meeting_id)
  from s left join att on att.meeting_id=s.meeting_id
$$;

/** One summary object per council: rhythm, ratios and state. */
create function qarar_governance.oversight_council_rows_v2(p_org uuid, p_councils uuid[], p_year date)
returns setof jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with today as (select (now() at time zone 'Asia/Riyadh')::date d),
  l as (select * from qarar_governance.oversight_session_ledger_v2(p_org, p_councils, p_year)),
  sess as (
    select l.council_id,
      count(*) filter (where l.outcome='on_time') on_time, count(*) filter (where l.outcome='late') late,
      count(*) filter (where l.outcome='missed') missed, count(*) filter (where l.outcome='overdue') overdue,
      count(*) filter (where l.outcome='upcoming') upcoming, count(*) filter (where l.outcome='cancelled') cancelled,
      coalesce(jsonb_agg(jsonb_build_object('meeting_id', l.meeting_id, 'outcome', l.outcome, 'late_days', l.late_days, 'due_on', l.due_on)
        order by l.due_on, l.sequence_no) filter (where l.outcome not in ('upcoming','cancelled')), '[]') marks,
      min(l.due_on) filter (where l.outcome='upcoming') next_due,
      coalesce(sum(l.present) filter (where l.held_on is not null), 0) present,
      coalesce(sum(l.recorded) filter (where l.held_on is not null), 0) recorded,
      round(avg(l.minutes_approved_on-l.held_on) filter (where l.held_on is not null and l.minutes_approved_on is not null), 1) minutes_avg_days,
      count(*) filter (where l.held_on is not null and l.minutes_approved_on is null and l.status<>'in_progress') minutes_pending,
      coalesce(sum(l.decisions), 0) decisions
    from l group by l.council_id
  ),
  tasks as (
    select d.governance_unit_id council_id, count(*) total, count(*) filter (where a.status='completed') done,
      count(*) filter (where a.status<>'completed' and a.due_date is not null and a.due_date<(select d from today)) overdue
    from qarar_execution.action_items a
    join qarar_decisions.decisions d on d.id=a.decision_id and d.organization_id=a.organization_id
    where a.organization_id=p_org and d.governance_unit_id=any(p_councils) and a.status<>'cancelled'
      and a.created_at>=p_year::timestamptz and a.created_at<(p_year + interval '1 year')
    group by d.governance_unit_id
  ),
  viol as (
    select v.council_id, count(*) open, count(*) filter (where v.escalation_level>0) escalated
    from qarar_governance.oversight_violations v
    where v.organization_id=p_org and v.status='open' and v.council_id=any(p_councils)
    group by v.council_id
  )
  select jsonb_build_object(
    'id', g.id, 'name_ar', g.name_ar, 'parent_name_ar', p.name_ar, 'unit_status', g.status,
    'state', case
      when g.status<>'active' then 'inactive'
      when coalesce(v.escalated, 0)>0 or coalesce((
        select count(*)=2 and bool_and(x.outcome in ('missed','overdue')) from (
          select l.outcome from l where l.council_id=g.id and l.outcome in ('on_time','late','missed','overdue')
          order by l.due_on desc, l.sequence_no desc limit 2) x), false) then 'stalled'
      when coalesce(v.open, 0)>0 or coalesce(s.overdue, 0)>0 then 'attention'
      else 'regular' end,
    'sessions', jsonb_build_object('on_time', coalesce(s.on_time, 0), 'late', coalesce(s.late, 0), 'missed', coalesce(s.missed, 0),
      'overdue', coalesce(s.overdue, 0), 'upcoming', coalesce(s.upcoming, 0), 'cancelled', coalesce(s.cancelled, 0),
      'due', coalesce(s.on_time + s.late + s.missed + s.overdue, 0)),
    'marks', coalesce(s.marks, '[]'::jsonb), 'next_due', s.next_due,
    'attendance', jsonb_build_object('present', coalesce(s.present, 0), 'recorded', coalesce(s.recorded, 0)),
    'minutes', jsonb_build_object('avg_days', s.minutes_avg_days, 'pending', coalesce(s.minutes_pending, 0)),
    'tasks', jsonb_build_object('total', coalesce(t.total, 0), 'done', coalesce(t.done, 0), 'overdue', coalesce(t.overdue, 0)),
    'decisions', coalesce(s.decisions, 0),
    'violations', jsonb_build_object('open', coalesce(v.open, 0), 'escalated', coalesce(v.escalated, 0)))
  from qarar_core.governance_units g
  left join qarar_core.governance_units p on p.id=g.parent_unit_id and p.organization_id=g.organization_id
  left join sess s on s.council_id=g.id
  left join tasks t on t.council_id=g.id
  left join viol v on v.council_id=g.id
  where g.organization_id=p_org and g.id=any(p_councils)
$$;

/** The academic year to show: the one asked for, else the latest that has started. */
create function qarar_governance.oversight_academic_year(p_org uuid, p_year date)
returns date language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(p_year,
    (select max(m.academic_year_start) from qarar_meetings.meetings m
      where m.organization_id=p_org and m.academic_year_start<=(now() at time zone 'Asia/Riyadh')::date),
    make_date(extract(year from now())::integer - case when extract(month from now())<9 then 1 else 0 end, 9, 1))
$$;

/** Everything I lead or follow, one row per council. */
create function qarar_governance.get_my_oversight_overview_v2(p_academic_year date default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare o uuid := qarar_iam.current_organization_id(); u uuid := auth.uid(); y date; led uuid[]; followed uuid[]; scope uuid[]; rows jsonb;
begin
  if u is null or o is null then raise exception using errcode='42501', message='يلزم تسجيل الدخول'; end if;
  y := qarar_governance.oversight_academic_year(o, p_academic_year);
  led := coalesce(array(select qarar_iam.led_council_ids(o, u)), '{}');
  followed := coalesce(array(select distinct c.council_id from qarar_iam.overseen_councils(u) c), '{}');
  scope := array(select distinct x from unnest(led || followed) x);
  select coalesce(jsonb_agg(r || jsonb_build_object('leads', (r->>'id')::uuid=any(led), 'follows', (r->>'id')::uuid=any(followed))
      order by array_position(array['stalled','attention','regular','inactive'], r->>'state'), r->>'name_ar'), '[]')
    into rows from qarar_governance.oversight_council_rows_v2(o, scope, y) r;
  return jsonb_build_object('academic_year_start', y,
    'academic_years', coalesce((select jsonb_agg(d order by d desc) from (select distinct m.academic_year_start d
      from qarar_meetings.meetings m where m.organization_id=o and m.academic_year_start is not null) q), '[]'),
    'summary', jsonb_build_object('total', jsonb_array_length(rows),
      'regular', (select count(*) from jsonb_array_elements(rows) r where r->>'state'='regular'),
      'attention', (select count(*) from jsonb_array_elements(rows) r where r->>'state'='attention'),
      'stalled', (select count(*) from jsonb_array_elements(rows) r where r->>'state'='stalled'),
      'inactive', (select count(*) from jsonb_array_elements(rows) r where r->>'state'='inactive')),
    'councils', rows, 'generated_at', now());
end;
$$;

/** One council in full: profile, summary, every session, and what needs follow-up now. */
create function qarar_governance.get_council_performance_v2(p_council_id uuid, p_academic_year date default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare o uuid := qarar_iam.current_organization_id(); u uuid := auth.uid(); y date; summary jsonb;
begin
  if u is null or o is null then raise exception using errcode='42501', message='يلزم تسجيل الدخول'; end if;
  if p_council_id is null or not (
    p_council_id in (select qarar_iam.led_council_ids(o, u)) or
    exists (select 1 from qarar_iam.overseen_councils(u) c where c.council_id=p_council_id)) then
    raise exception using errcode='42501', message='هذا المجلس خارج المجالس التي تقودها أو تتابعها';
  end if;
  y := qarar_governance.oversight_academic_year(o, p_academic_year);
  select r into summary from qarar_governance.oversight_council_rows_v2(o, array[p_council_id], y) r;
  if summary is null then raise exception using errcode='P0002', message='المجلس غير موجود'; end if;
  return jsonb_build_object('academic_year_start', y,
    'council', summary || qarar_iam.council_profile_v2(o, p_council_id),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('meeting_id', l.meeting_id, 'title_ar', l.title_ar, 'meeting_no', l.meeting_no,
        'sequence_no', l.sequence_no, 'planned_on', l.planned_on, 'due_on', l.due_on, 'scheduled_on', l.scheduled_on, 'held_on', l.held_on,
        'status', l.status, 'outcome', l.outcome, 'late_days', l.late_days, 'present', l.present, 'recorded', l.recorded,
        'minutes_approved_on', l.minutes_approved_on, 'decisions', l.decisions, 'link', '/admin/meetings/'||l.meeting_id)
        order by l.due_on, l.sequence_no)
      from qarar_governance.oversight_session_ledger_v2(o, array[p_council_id], y) l), '[]'),
    'violations', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'rule_code', v.rule_code, 'rule_name_ar', r.name_ar,
        'subject_label', v.subject_label, 'link', v.subject_link, 'due_since', v.due_since, 'escalation_level', v.escalation_level)
        order by v.escalation_level desc, v.due_since)
      from qarar_governance.oversight_violations v
      join qarar_governance.effective_oversight_rules(o) r on r.rule_code=v.rule_code
      where v.organization_id=o and v.council_id=p_council_id and v.status='open'), '[]'),
    'generated_at', now());
end;
$$;

do $owners$
begin
  alter function qarar_meetings.council_sessions_v2(uuid,uuid[],date) owner to qarar_meetings_executor;
  alter function qarar_attendance.meeting_attendance_v2(uuid,uuid[]) owner to qarar_attendance_executor;
  alter function qarar_iam.council_profile_v2(uuid,uuid) owner to qarar_iam_executor;
  alter function qarar_governance.oversight_session_ledger_v2(uuid,uuid[],date) owner to qarar_governance_executor;
  alter function qarar_governance.oversight_council_rows_v2(uuid,uuid[],date) owner to qarar_governance_executor;
  alter function qarar_governance.oversight_academic_year(uuid,date) owner to qarar_governance_executor;
  alter function qarar_governance.get_my_oversight_overview_v2(date) owner to qarar_governance_executor;
  alter function qarar_governance.get_council_performance_v2(uuid,date) owner to qarar_governance_executor;
end
$owners$;
revoke all on function qarar_meetings.council_sessions_v2(uuid,uuid[],date), qarar_attendance.meeting_attendance_v2(uuid,uuid[]),
  qarar_iam.council_profile_v2(uuid,uuid), qarar_governance.oversight_session_ledger_v2(uuid,uuid[],date),
  qarar_governance.oversight_council_rows_v2(uuid,uuid[],date), qarar_governance.oversight_academic_year(uuid,date),
  qarar_governance.get_my_oversight_overview_v2(date), qarar_governance.get_council_performance_v2(uuid,date)
  from public, anon, authenticated, service_role;
grant execute on function qarar_meetings.council_sessions_v2(uuid,uuid[],date), qarar_attendance.meeting_attendance_v2(uuid,uuid[]),
  qarar_iam.council_profile_v2(uuid,uuid) to qarar_governance_executor;
grant execute on function qarar_governance.get_my_oversight_overview_v2(date), qarar_governance.get_council_performance_v2(uuid,date)
  to qarar_api_executor;
-- The only missing schema usage for the assembly; execution rights stay per function.
grant usage on schema qarar_attendance to qarar_governance_executor;

insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
('governance','qarar_meetings','council_sessions_v2','p_org uuid, p_councils uuid[], p_year date','Follow-up centre: sessions of the councils, classified against their due day.'),
('governance','qarar_attendance','meeting_attendance_v2','p_org uuid, p_meetings uuid[]','Follow-up centre: attendance ratio of held sessions.'),
('governance','qarar_iam','council_profile_v2','p_org uuid, p_council uuid','Follow-up centre: chair name and member count of one council.')
on conflict do nothing;

create function api_v2.get_my_oversight_overview_v2(p_academic_year date default null) returns jsonb
language sql security definer set search_path=pg_catalog
as $$ select qarar_governance.get_my_oversight_overview_v2(p_academic_year) $$;
create function api_v2.get_council_performance_v2(p_council_id uuid, p_academic_year date default null) returns jsonb
language sql security definer set search_path=pg_catalog
as $$ select qarar_governance.get_council_performance_v2(p_council_id, p_academic_year) $$;
alter function api_v2.get_my_oversight_overview_v2(date) owner to qarar_api_executor;
alter function api_v2.get_council_performance_v2(uuid,date) owner to qarar_api_executor;
revoke all on function api_v2.get_my_oversight_overview_v2(date), api_v2.get_council_performance_v2(uuid,date) from public, anon, service_role;
grant execute on function api_v2.get_my_oversight_overview_v2(date), api_v2.get_council_performance_v2(uuid,date) to authenticated;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values ('v2','get_my_oversight_overview_v2','qarar_governance','get_my_oversight_overview_v2','p_academic_year date','governance','authenticated'),
       ('v2','get_council_performance_v2','qarar_governance','get_council_performance_v2','p_council_id uuid, p_academic_year date','governance','authenticated');

notify pgrst, 'reload schema';
commit;
