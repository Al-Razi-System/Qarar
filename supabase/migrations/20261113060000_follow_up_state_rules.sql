-- Follow-up states said "regular" for a member absent from their only session and for a council whose last
-- session was held 22 days late with 38% attendance. The rules now use the same targets the indicators show:
-- attendance and voting below 75% need attention, and so does a council whose latest due session was late,
-- whose attendance is below 75%, or that has a late task. Attendance is also reported per council.
-- Impact map: docs/engineering/impact/COUNCIL_PERFORMANCE_FOLLOW_UP_20261113_AR.md
begin;

create function qarar_attendance.member_meeting_attendance_v2(p_org uuid, p_meetings uuid[])
returns table(user_id uuid, meeting_id uuid, present integer, recorded integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select a.user_id, a.meeting_id, (a.attendance_status in ('present','late'))::integer, 1
  from qarar_attendance.attendance_records a
  where a.organization_id=p_org and a.meeting_id=any(p_meetings) and a.attendance_status<>'pending'
$$;
alter function qarar_attendance.member_meeting_attendance_v2(uuid,uuid[]) owner to qarar_attendance_executor;
revoke all on function qarar_attendance.member_meeting_attendance_v2(uuid,uuid[]) from public, anon, authenticated, service_role;
grant execute on function qarar_attendance.member_meeting_attendance_v2(uuid,uuid[]) to qarar_governance_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
('governance','qarar_attendance','member_meeting_attendance_v2','p_org uuid, p_meetings uuid[]','People follow-up: attendance per member and meeting, grouped by council.')
on conflict do nothing;

create or replace function qarar_governance.get_my_people_follow_up_v2(p_academic_year date default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare o uuid := qarar_iam.current_organization_id(); u uuid := auth.uid(); y date; scope uuid[]; held uuid[];
  today date := (now() at time zone 'Asia/Riyadh')::date; people jsonb;
begin
  if u is null or o is null then raise exception using errcode='42501', message='يلزم تسجيل الدخول'; end if;
  y := qarar_governance.oversight_academic_year(o, p_academic_year);
  scope := array(select qarar_iam.led_council_ids(o, u) union select c.council_id from qarar_iam.overseen_councils(u) c);
  held := coalesce(array(select s.meeting_id from qarar_meetings.council_sessions_v2(o, scope, y) s where s.held_on is not null), '{}');
  -- Someone who chairs a council and also sits on it as a member is listed once there, by the higher role.
  with att_rows as (
    select a.user_id, s.council_id, sum(a.present)::integer present, sum(a.recorded)::integer recorded
    from qarar_attendance.member_meeting_attendance_v2(o, held) a
    join qarar_meetings.council_sessions_v2(o, scope, y) s on s.meeting_id=a.meeting_id
    group by 1, 2
  ),
  members as (select distinct on (x.user_id, x.council_id) x.* from qarar_iam.council_members_v2(o, scope) x
    order by x.user_id, x.council_id, array_position(array['council_chair','council_rapporteur','council_member'], x.role_code)),
  person as (
    select m.user_id, max(m.full_name_ar) full_name_ar,
      jsonb_agg(jsonb_build_object('id', m.council_id, 'name_ar', g.name_ar, 'role_code', m.role_code, 'role_name_ar', m.role_name_ar,
        'attendance', jsonb_build_object('present', coalesce(ar.present, 0), 'recorded', coalesce(ar.recorded, 0)))
        order by array_position(array['council_chair','council_rapporteur','council_member'], m.role_code), g.name_ar) councils
    from members m join qarar_core.governance_units g on g.id=m.council_id and g.organization_id=o
    left join att_rows ar on ar.user_id=m.user_id and ar.council_id=m.council_id
    group by m.user_id
  ),
  tasks as (
    select a.assigned_user_id user_id, count(*) total, count(*) filter (where a.status in ('completed','closed')) done,
      count(*) filter (where a.status not in ('completed','closed') and a.due_date is not null and a.due_date<today) overdue
    from qarar_execution.action_items a
    join qarar_decisions.decisions d on d.id=a.decision_id and d.organization_id=a.organization_id
    where a.organization_id=o and d.governance_unit_id=any(scope) and a.status<>'cancelled' and a.assigned_user_id is not null
      and (a.status not in ('completed','closed') or (a.created_at>=y::timestamptz and a.created_at<(y + interval '1 year')))
    group by 1
  ),
  submitted as (
    select t.submitted_by_user_id user_id, count(*) n from qarar_topics.topics t
    where t.organization_id=o and t.created_at>=y::timestamptz and t.created_at<(y + interval '1 year') group by 1
  ),
  shaped as (
    select p.user_id, p.full_name_ar, p.councils,
      coalesce(att.present, 0) present, coalesce(att.recorded, 0) recorded, coalesce(v.eligible, 0) eligible, coalesce(v.voted, 0) voted,
      coalesce(ap.total, 0) approvals, coalesce(ap.signed, 0) signed, coalesce(ap.pending, 0) pending,
      coalesce(t.total, 0) tasks, coalesce(t.done, 0) tasks_done, coalesce(t.overdue, 0) tasks_overdue, coalesce(sb.n, 0) submitted
    from person p
    left join (select user_id, sum(present)::integer present, sum(recorded)::integer recorded from att_rows group by 1) att on att.user_id=p.user_id
    left join qarar_voting.member_votes_v2(o, held) v on v.user_id=p.user_id
    left join qarar_minutes.member_approvals_v2(o, held) ap on ap.user_id=p.user_id
    left join tasks t on t.user_id=p.user_id
    left join submitted sb on sb.user_id=p.user_id
  ),
  stated as (
    select s.*, case
      when s.tasks_overdue>0 or s.pending>0 or (s.recorded>0 and s.present*4<s.recorded*3) or (s.eligible>0 and s.voted*4<s.eligible*3) then 'attention'
      when s.recorded=0 and s.eligible=0 and s.approvals=0 and s.tasks=0 then 'no_activity'
      else 'regular' end state
    from shaped s
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'full_name_ar', full_name_ar, 'councils', councils, 'state', state,
      'attendance', jsonb_build_object('present', present, 'recorded', recorded),
      'votes', jsonb_build_object('eligible', eligible, 'voted', voted),
      'minutes', jsonb_build_object('total', approvals, 'signed', signed, 'pending', pending),
      'tasks', jsonb_build_object('total', tasks, 'done', tasks_done, 'overdue', tasks_overdue),
      'topics_submitted', submitted)
    order by array_position(array['attention','regular','no_activity'], state), full_name_ar), '[]')
  into people from stated;
  return jsonb_build_object('academic_year_start', y,
    'summary', jsonb_build_object('total', jsonb_array_length(people),
      'attention', (select count(*) from jsonb_array_elements(people) p where p->>'state'='attention'),
      'regular', (select count(*) from jsonb_array_elements(people) p where p->>'state'='regular'),
      'no_activity', (select count(*) from jsonb_array_elements(people) p where p->>'state'='no_activity'),
      'present', (select coalesce(sum((p->'attendance'->>'present')::int), 0) from jsonb_array_elements(people) p),
      'recorded', (select coalesce(sum((p->'attendance'->>'recorded')::int), 0) from jsonb_array_elements(people) p),
      'voted', (select coalesce(sum((p->'votes'->>'voted')::int), 0) from jsonb_array_elements(people) p),
      'eligible', (select coalesce(sum((p->'votes'->>'eligible')::int), 0) from jsonb_array_elements(people) p),
      'pending_signatures', (select coalesce(sum((p->'minutes'->>'pending')::int), 0) from jsonb_array_elements(people) p),
      'tasks', (select coalesce(sum((p->'tasks'->>'total')::int), 0) from jsonb_array_elements(people) p),
      'tasks_done', (select coalesce(sum((p->'tasks'->>'done')::int), 0) from jsonb_array_elements(people) p),
      'tasks_overdue', (select coalesce(sum((p->'tasks'->>'overdue')::int), 0) from jsonb_array_elements(people) p)),
    'councils', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar) order by g.name_ar)
      from qarar_core.governance_units g where g.organization_id=o and g.id=any(scope)), '[]'),
    'people', people, 'generated_at', now());
end;
$$;


-- The per-user total is replaced by the per-meeting function above.
delete from qarar_architecture.module_function_execute_allowlist where source_module='governance' and target_schema='qarar_attendance' and function_name='member_attendance_v2';
drop function qarar_attendance.member_attendance_v2(uuid,uuid[]);

create or replace function qarar_governance.oversight_council_rows_v2(p_org uuid, p_councils uuid[], p_year date)
returns setof jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select r || jsonb_build_object('decision_stats', e.decision_stats, 'topics', e.topics,
    'state', case when r->>'state'='regular' and (
        r->'marks'->-1->>'outcome'='late'
        or (r->'tasks'->>'overdue')::integer>0
        or ((r->'attendance'->>'recorded')::integer>0 and (r->'attendance'->>'present')::integer*4<(r->'attendance'->>'recorded')::integer*3))
      then 'attention' else r->>'state' end)
  from qarar_governance.oversight_council_core_v2(p_org, p_councils, p_year) r
  join qarar_governance.oversight_council_extras_v2(p_org, p_councils, p_year) e on e.council_id=(r->>'id')::uuid
$$;

notify pgrst, 'reload schema';
commit;
