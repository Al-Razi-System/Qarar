-- The home page from real data: what is waiting for me, the councils I lead, my follow-up scope, and,
-- for administrators, the organisation's indicators. Each module computes its own card from its own
-- tables (and registered reads); governance assembles them into one api_v2 contract.
-- Impact map: docs/engineering/impact/HOME_DASHBOARD_REAL_DATA_20261112_AR.md
begin;

/** Councils a user leads (chair or rapporteur) today. */
create function qarar_iam.led_council_ids(p_org uuid, p_user uuid)
returns setof uuid language sql stable security definer set search_path=pg_catalog
as $$
  select distinct m.governance_unit_id from qarar_iam.memberships m
  join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.is_active
  where m.organization_id=p_org and m.user_id=p_user and r.code in ('council_chair','council_rapporteur')
    and m.membership_status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
$$;

create function qarar_meetings.home_meetings_v2(p_org uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with mine as (
    select m.id, m.title_ar, m.meeting_no, m.scheduled_date, m.start_time, m.status, g.name_ar council_name_ar
    from qarar_meetings.meetings m
    join qarar_core.governance_units g on g.id=m.governance_unit_id and g.organization_id=m.organization_id
    where m.organization_id=p_org
      and exists (select 1 from qarar_iam.memberships ms where ms.organization_id=m.organization_id and ms.user_id=p_user
        and ms.governance_unit_id=m.governance_unit_id and ms.membership_status='active'
        and ms.start_date<=current_date and (ms.end_date is null or ms.end_date>=current_date))
      and (m.status='in_progress' or (m.status in ('scheduled','ready_to_start') and m.scheduled_date between current_date and current_date+14))
  )
  select jsonb_build_object('count', (select count(*) from mine),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title_ar', x.title_ar, 'meeting_no', x.meeting_no,
        'scheduled_date', x.scheduled_date, 'start_time', x.start_time, 'status', x.status, 'council_name_ar', x.council_name_ar,
        'link', '/admin/meetings/'||x.id) order by x.status <> 'in_progress', x.scheduled_date, x.start_time)
      from (select * from mine order by status <> 'in_progress', scheduled_date, start_time limit 5) x), '[]'))
$$;

create function qarar_voting.home_votes_v2(p_org uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with waiting as (
    select r.id, r.meeting_id, m.title_ar meeting_title_ar, t.title_ar topic_title_ar, r.opened_at
    from qarar_voting.voting_rounds r
    join qarar_meetings.meetings m on m.id=r.meeting_id and m.organization_id=r.organization_id
    left join qarar_meetings.agenda_items a on a.id=r.agenda_item_id and a.organization_id=r.organization_id
    left join qarar_topics.topics t on t.id=a.topic_id and t.organization_id=a.organization_id
    where r.organization_id=p_org and r.status='open'
      and exists (select 1 from qarar_iam.memberships ms where ms.organization_id=m.organization_id and ms.user_id=p_user
        and ms.governance_unit_id=m.governance_unit_id and ms.membership_status='active'
        and ms.start_date<=current_date and (ms.end_date is null or ms.end_date>=current_date))
      and not exists (select 1 from qarar_voting.votes v where v.voting_round_id=r.id and v.user_id=p_user)
  )
  select jsonb_build_object('count', (select count(*) from waiting),
    'items', coalesce((select jsonb_agg(jsonb_build_object('round_id', w.id, 'meeting_title_ar', w.meeting_title_ar,
        'topic_title_ar', w.topic_title_ar, 'opened_at', w.opened_at, 'link', '/admin/meetings/'||w.meeting_id) order by w.opened_at)
      from (select * from waiting order by opened_at limit 5) w), '[]'))
$$;

create function qarar_minutes.home_signatures_v2(p_org uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with waiting as (
    select a.id, m.id meeting_id, m.title_ar, m.scheduled_date, a.created_at
    from qarar_minutes.minute_approvals a
    join qarar_minutes.meeting_minutes mm on mm.id=a.minute_id and mm.organization_id=a.organization_id
    join qarar_meetings.meetings m on m.id=mm.meeting_id and m.organization_id=mm.organization_id
    where a.organization_id=p_org and a.user_id=p_user and a.approval_status='pending'
  )
  select jsonb_build_object('count', (select count(*) from waiting),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'meeting_title_ar', w.title_ar, 'scheduled_date', w.scheduled_date,
        'link', '/admin/meetings/'||w.meeting_id) order by w.created_at)
      from (select * from waiting order by created_at limit 5) w), '[]'))
$$;

create function qarar_execution.home_tasks_v2(p_org uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with open_tasks as (
    select a.id, a.action_no, a.title_ar, a.due_date, a.due_date < current_date overdue
    from qarar_execution.action_items a
    where a.organization_id=p_org and a.assigned_user_id=p_user and a.status in ('new','in_progress','overdue')
  )
  select jsonb_build_object(
    'open', (select count(*) from open_tasks),
    'overdue', (select count(*) from open_tasks where overdue),
    'to_verify', (select count(*) from qarar_execution.action_items a where a.organization_id=p_org and a.follow_up_user_id=p_user and a.status='submitted'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'action_no', t.action_no, 'title_ar', t.title_ar,
        'due_date', t.due_date, 'overdue', coalesce(t.overdue, false), 'link', '/admin/tasks?task='||t.id) order by t.due_date nulls last)
      from (select * from open_tasks order by due_date nulls last limit 5) t), '[]'))
$$;

create function qarar_topics.home_topics_v2(p_org uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with returned as (
    select t.id, t.topic_no, t.title_ar, t.updated_at from qarar_topics.topics t
    where t.organization_id=p_org and t.submitted_by_user_id=p_user and t.status='returned'
  ), to_review as (
    select t.id, t.topic_no, t.title_ar, t.updated_at from qarar_topics.topics t
    where t.organization_id=p_org and t.status='under_review'
      and t.current_unit_id in (select qarar_iam.led_council_ids(p_org, p_user))
  )
  select jsonb_build_object(
    'returned', (select count(*) from returned),
    'to_review', (select count(*) from to_review),
    'items', coalesce((select jsonb_agg(x.item order by x.kind, x.updated_at) from (
      select 'returned' kind, r.updated_at, jsonb_build_object('id', r.id, 'topic_no', r.topic_no, 'title_ar', r.title_ar, 'kind', 'returned', 'link', '/admin/topics/'||r.id) item
      from returned r
      union all
      select 'to_review', v.updated_at, jsonb_build_object('id', v.id, 'topic_no', v.topic_no, 'title_ar', v.title_ar, 'kind', 'to_review', 'link', '/admin/topics/'||v.id)
      from to_review v
      order by 1, 2 limit 5) x), '[]'))
$$;

create function qarar_governance.home_oversight_v2(p_org uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  with led as (select qarar_iam.led_council_ids(p_org, p_user) council_id),
  followed as (select distinct council_id from qarar_iam.overseen_councils(p_user)),
  open_followed as (
    select v.*, g.name_ar council_name_ar, r.name_ar rule_name_ar
    from qarar_governance.oversight_violations v
    join qarar_core.governance_units g on g.id=v.council_id
    join qarar_governance.effective_oversight_rules(p_org) r on r.rule_code=v.rule_code
    where v.organization_id=p_org and v.status='open' and v.council_id in (select council_id from followed)
  )
  select jsonb_build_object(
    'leadership', jsonb_build_object('councils', (select count(*) from led),
      'open', (select count(*) from qarar_governance.oversight_violations v where v.organization_id=p_org and v.status='open' and v.council_id in (select council_id from led))),
    'oversight', case when exists (select 1 from followed) then jsonb_build_object(
      'councils', (select count(*) from followed),
      'open', (select count(*) from open_followed),
      'escalated', (select count(*) from open_followed where escalation_level > 0),
      'by_rule', coalesce((select jsonb_agg(jsonb_build_object('name_ar', x.rule_name_ar, 'count', x.c) order by x.c desc)
        from (select rule_name_ar, count(*) c from open_followed group by 1) x), '[]'),
      'oldest', coalesce((select jsonb_agg(jsonb_build_object('council_name_ar', o.council_name_ar, 'rule_name_ar', o.rule_name_ar,
          'subject_label', o.subject_label, 'days_open', greatest(0, current_date - o.due_since::date), 'link', o.subject_link) order by o.due_since)
        from (select * from open_followed order by due_since limit 3) o), '[]')) end)
$$;

create function qarar_governance.home_organization_v2(p_org uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'active_councils', (select count(*) from qarar_core.governance_units g join qarar_core.governance_unit_types t on t.id=g.unit_type_id and t.is_council_type
      where g.organization_id=p_org and g.status='active'),
    'meetings_next_14_days', (select count(*) from qarar_meetings.meetings m where m.organization_id=p_org
      and m.status in ('scheduled','ready_to_start') and m.scheduled_date between current_date and current_date+14),
    'meetings_held_30_days', (select count(*) from qarar_meetings.meetings m where m.organization_id=p_org
      and m.status in ('waiting_for_minutes','waiting_for_approval','closed') and m.scheduled_date between current_date-30 and current_date),
    'topics_in_process', (select count(*) from qarar_topics.topics t where t.organization_id=p_org and t.status in ('under_review','listed','in_process')),
    'decisions_30_days', (select count(*) from qarar_decisions.decisions d where d.organization_id=p_org and d.issued_at >= now()-interval '30 days'),
    'open_tasks', (select count(*) from qarar_execution.action_items a where a.organization_id=p_org and a.status in ('new','in_progress','overdue','submitted')),
    'overdue_tasks', (select count(*) from qarar_execution.action_items a where a.organization_id=p_org and a.status in ('new','in_progress','overdue') and a.due_date < current_date),
    'open_violations', (select count(*) from qarar_governance.oversight_violations v where v.organization_id=p_org and v.status='open'))
$$;

create function qarar_governance.get_my_home_v2()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid := qarar_iam.current_organization_id(); v_user uuid := auth.uid(); v_oversight jsonb; v_admin boolean;
begin
  if v_user is null or v_org is null then raise exception 'authentication required' using errcode='42501'; end if;
  v_oversight := qarar_governance.home_oversight_v2(v_org, v_user);
  -- Organisation-wide indicators for whoever governs follow-up: the system and governance administrators.
  v_admin := coalesce(qarar_iam.has_permission('governance.oversight.manage', null), false);
  return jsonb_build_object(
    'user', (select jsonb_build_object('name_ar', u.full_name_ar) from qarar_iam.users u where u.id=v_user and u.organization_id=v_org),
    'meetings', qarar_meetings.home_meetings_v2(v_org, v_user),
    'votes', qarar_voting.home_votes_v2(v_org, v_user),
    'signatures', qarar_minutes.home_signatures_v2(v_org, v_user),
    'tasks', qarar_execution.home_tasks_v2(v_org, v_user),
    'topics', qarar_topics.home_topics_v2(v_org, v_user),
    'leadership', v_oversight->'leadership',
    'oversight', v_oversight->'oversight',
    'organization', case when v_admin then qarar_governance.home_organization_v2(v_org) end,
    'generated_at', now());
end;
$$;

do $owners$
begin
  alter function qarar_iam.led_council_ids(uuid,uuid) owner to qarar_iam_executor;
  alter function qarar_meetings.home_meetings_v2(uuid,uuid) owner to qarar_meetings_executor;
  alter function qarar_voting.home_votes_v2(uuid,uuid) owner to qarar_voting_executor;
  alter function qarar_minutes.home_signatures_v2(uuid,uuid) owner to qarar_minutes_executor;
  alter function qarar_execution.home_tasks_v2(uuid,uuid) owner to qarar_execution_executor;
  alter function qarar_topics.home_topics_v2(uuid,uuid) owner to qarar_topics_executor;
  alter function qarar_governance.home_oversight_v2(uuid,uuid) owner to qarar_governance_executor;
  alter function qarar_governance.home_organization_v2(uuid) owner to qarar_governance_executor;
  alter function qarar_governance.get_my_home_v2() owner to qarar_governance_executor;
end
$owners$;
revoke all on function qarar_iam.led_council_ids(uuid,uuid), qarar_meetings.home_meetings_v2(uuid,uuid), qarar_voting.home_votes_v2(uuid,uuid),
  qarar_minutes.home_signatures_v2(uuid,uuid), qarar_execution.home_tasks_v2(uuid,uuid), qarar_topics.home_topics_v2(uuid,uuid),
  qarar_governance.home_oversight_v2(uuid,uuid), qarar_governance.home_organization_v2(uuid), qarar_governance.get_my_home_v2()
  from public, anon, authenticated, service_role;
grant execute on function qarar_iam.led_council_ids(uuid,uuid) to qarar_topics_executor, qarar_governance_executor;
grant execute on function qarar_meetings.home_meetings_v2(uuid,uuid), qarar_voting.home_votes_v2(uuid,uuid), qarar_minutes.home_signatures_v2(uuid,uuid),
  qarar_execution.home_tasks_v2(uuid,uuid), qarar_topics.home_topics_v2(uuid,uuid) to qarar_governance_executor;
grant execute on function qarar_governance.get_my_home_v2() to qarar_api_executor;
-- The only missing schema usage for the assembly; execution rights stay per function.
grant usage on schema qarar_minutes to qarar_governance_executor;

insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
('topics','qarar_iam','led_council_ids','p_org uuid, p_user uuid','Home page: topics waiting for review in councils the user leads.'),
('governance','qarar_iam','led_council_ids','p_org uuid, p_user uuid','Home page: councils the user leads and their open violations.'),
('governance','qarar_meetings','home_meetings_v2','p_org uuid, p_user uuid','Home page assembly: upcoming meetings card.'),
('governance','qarar_voting','home_votes_v2','p_org uuid, p_user uuid','Home page assembly: open votes card.'),
('governance','qarar_minutes','home_signatures_v2','p_org uuid, p_user uuid','Home page assembly: minutes awaiting signature card.'),
('governance','qarar_execution','home_tasks_v2','p_org uuid, p_user uuid','Home page assembly: tasks card.'),
('governance','qarar_topics','home_topics_v2','p_org uuid, p_user uuid','Home page assembly: topics card.')
on conflict do nothing;

create function api_v2.get_my_home_v2() returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_governance.get_my_home_v2() $$;
alter function api_v2.get_my_home_v2() owner to qarar_api_executor;
revoke all on function api_v2.get_my_home_v2() from public, anon, service_role;
grant execute on function api_v2.get_my_home_v2() to authenticated;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values ('v2','get_my_home_v2','qarar_governance','get_my_home_v2','','governance','authenticated');

notify pgrst, 'reload schema';
commit;
