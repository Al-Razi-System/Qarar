-- Topic follow-up: where every topic stands, how long it has waited there, how far along its route it is,
-- what was decided and whether that was executed. Same scope as council follow-up: a topic is shown when it
-- stands at, was listed by, or was decided by a council the caller leads or follows. Read-only.
-- Impact map: docs/engineering/impact/COUNCIL_PERFORMANCE_FOLLOW_UP_20261113_AR.md
begin;

create function qarar_governance.get_my_topics_follow_up_v2(p_academic_year date default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare o uuid := qarar_iam.current_organization_id(); u uuid := auth.uid(); y date; scope uuid[];
  today date := (now() at time zone 'Asia/Riyadh')::date; result jsonb;
begin
  if u is null or o is null then raise exception using errcode='42501', message='يلزم تسجيل الدخول'; end if;
  y := qarar_governance.oversight_academic_year(o, p_academic_year);
  scope := array(select qarar_iam.led_council_ids(o, u) union select c.council_id from qarar_iam.overseen_councils(u) c);
  with base as (
    select t.id, t.topic_no, t.title_ar, t.status, t.created_at, t.updated_at, coalesce(t.governance_source, 'legacy') governance_source,
      cat.name_ar category_name_ar, i.status instance_status, i.completed_at,
      st.assigned_unit_id step_unit_id, st.opened_at step_opened_at, st.sequence_no step_no,
      (select count(*) from qarar_governance.workflow_instance_steps s where s.workflow_instance_id=i.id and s.organization_id=o) steps_total,
      (select count(*) from qarar_governance.workflow_instance_steps s where s.workflow_instance_id=i.id and s.organization_id=o and s.status='completed') steps_done,
      coalesce(st.assigned_unit_id, t.current_unit_id) at_unit_id
    from qarar_topics.topics t
    left join qarar_topics.topic_categories cat on cat.id=t.category_id and cat.organization_id=t.organization_id
    left join qarar_governance.workflow_instances i on i.id=t.workflow_instance_id and i.organization_id=t.organization_id
    left join lateral (select s.* from qarar_governance.workflow_instance_steps s
      where s.workflow_instance_id=i.id and s.organization_id=o and s.status='active' order by s.sequence_no limit 1) st on true
    where t.organization_id=o
  ),
  scoped as (
    select b.*, (b.status in ('approved','rejected','closed') or b.instance_status='completed') finished
    from base b
    where b.at_unit_id=any(scope)
      or exists (select 1 from qarar_meetings.agenda_items ai join qarar_meetings.meetings m on m.id=ai.meeting_id and m.organization_id=ai.organization_id
        where ai.organization_id=o and ai.topic_id=b.id and m.governance_unit_id=any(scope))
      or exists (select 1 from qarar_decisions.decisions d where d.organization_id=o and d.topic_id=b.id and d.governance_unit_id=any(scope))
  ),
  rows as materialized (
    select s.*, g.name_ar at_council_name_ar, d.decision_no, d.outcome_kind, d.issued_at decided_at,
      (select count(*) from qarar_meetings.agenda_items ai join qarar_meetings.meetings m on m.id=ai.meeting_id and m.organization_id=ai.organization_id
        where ai.organization_id=o and ai.topic_id=s.id and m.status<>'cancelled') listed_count,
      (select count(*) from qarar_execution.action_items a where a.organization_id=o and a.topic_id=s.id and a.status<>'cancelled') tasks,
      (select count(*) from qarar_execution.action_items a where a.organization_id=o and a.topic_id=s.id and a.status in ('completed','closed')) tasks_done,
      exists (select 1 from qarar_governance.oversight_violations v where v.organization_id=o and v.status='open' and v.rule_code='topic_stalled' and v.subject_id=s.id) stalled
    from scoped s
    left join qarar_core.governance_units g on g.id=s.at_unit_id and g.organization_id=o
    left join lateral (select x.decision_no, coalesce(x.outcome_kind, 'unspecified') outcome_kind, coalesce(x.issued_at, x.created_at) issued_at
      from qarar_decisions.decisions x where x.organization_id=o and x.topic_id=s.id
        and x.decision_status in ('approved','sent_to_execution','under_follow_up','closed','rejected')
      order by coalesce(x.issued_at, x.created_at) desc limit 1) d on true
    where not s.finished or (s.created_at>=y::timestamptz and s.created_at<(y + interval '1 year'))
  ),
  shaped as (
    select r.*,
      case when r.finished then 'finished' when r.stalled then 'stalled' when r.status='returned' then 'returned' else 'in_progress' end state,
      case when r.finished then greatest((coalesce(r.completed_at, r.decided_at, r.updated_at) at time zone 'Asia/Riyadh')::date - (r.created_at at time zone 'Asia/Riyadh')::date, 0)
           else today - (r.created_at at time zone 'Asia/Riyadh')::date end age_days,
      case when r.finished then null else greatest(today - (coalesce(r.step_opened_at, r.updated_at) at time zone 'Asia/Riyadh')::date, 0) end waiting_days
    from rows r
  )
  select jsonb_build_object('academic_year_start', y,
    'summary', jsonb_build_object('total', count(*), 'in_progress', count(*) filter (where state='in_progress'),
      'stalled', count(*) filter (where state='stalled'), 'returned', count(*) filter (where state='returned'),
      'finished', count(*) filter (where state='finished'), 'ungoverned', count(*) filter (where governance_source<>'regulated'),
      'avg_days_to_finish', round(avg(age_days) filter (where state='finished'), 1),
      'avg_waiting_days', round(avg(waiting_days) filter (where state<>'finished'), 1)),
    'by_council', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name_ar', x.name, 'open', x.n, 'stalled', x.st, 'longest_wait', x.mx) order by x.st desc, x.n desc, x.name)
      from (select at_unit_id id, at_council_name_ar name, count(*) n, count(*) filter (where state='stalled') st, max(waiting_days) mx
        from shaped where state<>'finished' and at_unit_id is not null group by 1, 2) x), '[]'),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('name_ar', x.name, 'total', x.n, 'finished', x.fin, 'avg_days_to_finish', x.av) order by x.n desc, x.name)
      from (select coalesce(category_name_ar, 'بلا تصنيف') name, count(*) n, count(*) filter (where state='finished') fin,
        round(avg(age_days) filter (where state='finished'), 1) av from shaped group by 1) x), '[]'),
    'topics', coalesce((select jsonb_agg(z.item) from (select jsonb_build_object('id', s.id, 'topic_no', s.topic_no, 'title_ar', s.title_ar,
        'category_name_ar', s.category_name_ar, 'governance_source', s.governance_source, 'state', s.state, 'status', s.status,
        'at_council_id', case when s.finished then null else s.at_unit_id end,
        'at_council_name_ar', case when s.finished then null else s.at_council_name_ar end,
        'waiting_days', s.waiting_days, 'age_days', s.age_days, 'created_on', (s.created_at at time zone 'Asia/Riyadh')::date,
        'steps_total', s.steps_total, 'steps_done', case when s.instance_status='completed' then s.steps_total else s.steps_done end,
        'listed_count', s.listed_count, 'decision_no', s.decision_no, 'outcome_kind', s.outcome_kind,
        'tasks', s.tasks, 'tasks_done', s.tasks_done, 'link', '/admin/topics/'||s.id) item
      from shaped s order by array_position(array['stalled','returned','in_progress','finished'], s.state), s.waiting_days desc nulls last, s.created_at desc limit 500) z), '[]'),
    'generated_at', now())
  into result from shaped;
  return result;
end;
$$;
alter function qarar_governance.get_my_topics_follow_up_v2(date) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_my_topics_follow_up_v2(date) from public, anon, authenticated, service_role;
grant execute on function qarar_governance.get_my_topics_follow_up_v2(date) to qarar_api_executor;

create function api_v2.get_my_topics_follow_up_v2(p_academic_year date default null) returns jsonb
language sql security definer set search_path=pg_catalog
as $$ select qarar_governance.get_my_topics_follow_up_v2(p_academic_year) $$;
alter function api_v2.get_my_topics_follow_up_v2(date) owner to qarar_api_executor;
revoke all on function api_v2.get_my_topics_follow_up_v2(date) from public, anon, service_role;
grant execute on function api_v2.get_my_topics_follow_up_v2(date) to authenticated;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values ('v2','get_my_topics_follow_up_v2','qarar_governance','get_my_topics_follow_up_v2','p_academic_year date','governance','authenticated');

notify pgrst, 'reload schema';
commit;
