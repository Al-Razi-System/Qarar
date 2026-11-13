-- People follow-up: for every member of the councils a person leads or follows, attendance, whether they
-- voted when eligible (never how), minutes signed, tasks done and late, and topics submitted. Read-only.
-- Each module counts its own records; governance assembles them.
-- Impact map: docs/engineering/impact/COUNCIL_PERFORMANCE_FOLLOW_UP_20261113_AR.md
begin;

create function qarar_iam.council_members_v2(p_org uuid, p_councils uuid[])
returns table(user_id uuid, full_name_ar text, council_id uuid, role_code text, role_name_ar text)
language sql stable security definer set search_path=pg_catalog
as $$
  select m.user_id, u.full_name_ar, m.governance_unit_id, r.code, coalesce(nullif(btrim(m.membership_title), ''), r.name_ar)
  from qarar_iam.memberships m
  join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.is_active
  join qarar_iam.users u on u.id=m.user_id and u.organization_id=m.organization_id
  where m.organization_id=p_org and m.governance_unit_id=any(p_councils) and r.code in ('council_chair','council_rapporteur','council_member')
    and m.membership_status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
$$;

create function qarar_attendance.member_attendance_v2(p_org uuid, p_meetings uuid[])
returns table(user_id uuid, present integer, recorded integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select a.user_id, (count(*) filter (where a.attendance_status in ('present','late')))::integer, (count(*) filter (where a.attendance_status<>'pending'))::integer
  from qarar_attendance.attendance_records a
  where a.organization_id=p_org and a.meeting_id=any(p_meetings) group by a.user_id
$$;

/** How many closed rounds a member could vote in and how many they voted in. Never the direction of a vote. */
create function qarar_voting.member_votes_v2(p_org uuid, p_meetings uuid[])
returns table(user_id uuid, eligible integer, voted integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select e.user_id, count(*)::integer,
    (count(*) filter (where exists (select 1 from qarar_voting.votes v where v.voting_round_id=r.id and v.user_id=e.user_id and v.organization_id=p_org)))::integer
  from qarar_voting.voting_rounds r
  join qarar_voting.voting_eligible_members e on e.voting_round_id=r.id and e.organization_id=r.organization_id
  where r.organization_id=p_org and r.meeting_id=any(p_meetings) and r.status='closed' group by e.user_id
$$;

create function qarar_minutes.member_approvals_v2(p_org uuid, p_meetings uuid[])
returns table(user_id uuid, total integer, signed integer, pending integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select a.user_id, count(*)::integer, (count(*) filter (where a.approval_status='approved'))::integer, (count(*) filter (where a.approval_status='pending'))::integer
  from qarar_minutes.minute_approvals a
  join qarar_minutes.meeting_minutes mm on mm.id=a.minute_id and mm.organization_id=a.organization_id
  where a.organization_id=p_org and mm.meeting_id=any(p_meetings) group by a.user_id
$$;

create function qarar_governance.get_my_people_follow_up_v2(p_academic_year date default null)
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
  with members as (select distinct on (x.user_id, x.council_id) x.* from qarar_iam.council_members_v2(o, scope) x
    order by x.user_id, x.council_id, array_position(array['council_chair','council_rapporteur','council_member'], x.role_code)),
  person as (
    select m.user_id, max(m.full_name_ar) full_name_ar,
      jsonb_agg(jsonb_build_object('id', m.council_id, 'name_ar', g.name_ar, 'role_code', m.role_code, 'role_name_ar', m.role_name_ar)
        order by array_position(array['council_chair','council_rapporteur','council_member'], m.role_code), g.name_ar) councils
    from members m join qarar_core.governance_units g on g.id=m.council_id and g.organization_id=o
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
    left join qarar_attendance.member_attendance_v2(o, held) att on att.user_id=p.user_id
    left join qarar_voting.member_votes_v2(o, held) v on v.user_id=p.user_id
    left join qarar_minutes.member_approvals_v2(o, held) ap on ap.user_id=p.user_id
    left join tasks t on t.user_id=p.user_id
    left join submitted sb on sb.user_id=p.user_id
  ),
  stated as (
    select s.*, case
      when s.tasks_overdue>0 or s.pending>0 or (s.recorded>=2 and s.present*2<s.recorded) or (s.eligible>=2 and s.voted*2<s.eligible) then 'attention'
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

do $owners$
begin
  alter function qarar_iam.council_members_v2(uuid,uuid[]) owner to qarar_iam_executor;
  alter function qarar_attendance.member_attendance_v2(uuid,uuid[]) owner to qarar_attendance_executor;
  alter function qarar_voting.member_votes_v2(uuid,uuid[]) owner to qarar_voting_executor;
  alter function qarar_minutes.member_approvals_v2(uuid,uuid[]) owner to qarar_minutes_executor;
  alter function qarar_governance.get_my_people_follow_up_v2(date) owner to qarar_governance_executor;
end
$owners$;
revoke all on function qarar_iam.council_members_v2(uuid,uuid[]), qarar_attendance.member_attendance_v2(uuid,uuid[]), qarar_voting.member_votes_v2(uuid,uuid[]),
  qarar_minutes.member_approvals_v2(uuid,uuid[]), qarar_governance.get_my_people_follow_up_v2(date) from public, anon, authenticated, service_role;
grant execute on function qarar_iam.council_members_v2(uuid,uuid[]), qarar_attendance.member_attendance_v2(uuid,uuid[]), qarar_voting.member_votes_v2(uuid,uuid[]),
  qarar_minutes.member_approvals_v2(uuid,uuid[]) to qarar_governance_executor;
grant execute on function qarar_governance.get_my_people_follow_up_v2(date) to qarar_api_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
('governance','qarar_iam','council_members_v2','p_org uuid, p_councils uuid[]','People follow-up: active members of the councils in scope.'),
('governance','qarar_attendance','member_attendance_v2','p_org uuid, p_meetings uuid[]','People follow-up: attendance per member.'),
('governance','qarar_voting','member_votes_v2','p_org uuid, p_meetings uuid[]','People follow-up: participation in closed voting rounds, without vote direction.'),
('governance','qarar_minutes','member_approvals_v2','p_org uuid, p_meetings uuid[]','People follow-up: minutes signed and pending per member.')
on conflict do nothing;

create function api_v2.get_my_people_follow_up_v2(p_academic_year date default null) returns jsonb
language sql security definer set search_path=pg_catalog
as $$ select qarar_governance.get_my_people_follow_up_v2(p_academic_year) $$;
alter function api_v2.get_my_people_follow_up_v2(date) owner to qarar_api_executor;
revoke all on function api_v2.get_my_people_follow_up_v2(date) from public, anon, service_role;
grant execute on function api_v2.get_my_people_follow_up_v2(date) to authenticated;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values ('v2','get_my_people_follow_up_v2','qarar_governance','get_my_people_follow_up_v2','p_academic_year date','governance','authenticated');

notify pgrst, 'reload schema';
commit;
