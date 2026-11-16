-- A decision's type is the classification of its topic's type (أكاديمي، طلابي، مؤسسي، جودة…), as the owner's
-- stakeholders defined it: nothing is chosen when a decision is issued. A decision whose topic has no typed
-- classification falls back to its own decision type, else counts as unclassified. Read-only.
-- Impact map: docs/engineering/impact/COUNCIL_PERFORMANCE_FOLLOW_UP_20261113_AR.md
begin;

create or replace function qarar_governance.oversight_council_extras_v2(p_org uuid, p_councils uuid[], p_year date)
returns table(council_id uuid, decision_stats jsonb, topics jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  with today as (select (now() at time zone 'Asia/Riyadh')::date d),
  dec as (
    select c.decision_id, c.council_id, c.meeting_id, c.issued_at, c.outcome_kind, c.decision_status, coalesce(cl.name_ar, c.type_name_ar) type_name_ar from qarar_decisions.council_decisions_v2(p_org, p_councils) c
    left join qarar_meetings.meetings m on m.id=c.meeting_id and m.organization_id=p_org
    left join qarar_decisions.decisions dd on dd.id=c.decision_id and dd.organization_id=p_org
    left join qarar_topics.topics tt on tt.id=dd.topic_id and tt.organization_id=p_org
    left join qarar_governance.topic_type_versions_v2 tv on tv.id=tt.topic_type_version_id and tv.organization_id=p_org
    left join qarar_governance.topic_classifications_v2 cl on cl.id=tv.classification_id and cl.organization_id=p_org
    where coalesce(m.academic_year_start=p_year, c.issued_at>=p_year::timestamptz and c.issued_at<(p_year + interval '1 year'))
  ),
  items as (
    select d.council_id, a.decision_id, a.status, a.due_date, a.assigned_user_id, a.assigned_unit_id
    from qarar_execution.action_items a join dec d on d.decision_id=a.decision_id
    where a.organization_id=p_org and a.status<>'cancelled'
  ),
  exec as (
    select i.council_id, i.decision_id, bool_and(i.status in ('completed','closed')) done,
      bool_or(i.status not in ('completed','closed') and i.due_date is not null and i.due_date<(select d from today)) late
    from items i group by 1, 2
  ),
  tp as (
    select m.governance_unit_id council_id, t.id, coalesce(t.governance_source, 'legacy') src, bool_or(ai.agenda_status='discussed') discussed
    from qarar_meetings.agenda_items ai
    join qarar_meetings.meetings m on m.id=ai.meeting_id and m.organization_id=ai.organization_id
    join qarar_topics.topics t on t.id=ai.topic_id and t.organization_id=ai.organization_id
    where ai.organization_id=p_org and m.governance_unit_id=any(p_councils) and m.academic_year_start=p_year and m.status<>'cancelled'
    group by 1, 2, 3
  )
  select c.id,
    jsonb_build_object(
      'total', (select count(*) from dec where dec.council_id=c.id),
      'by_outcome', coalesce((select jsonb_agg(jsonb_build_object('kind', x.k, 'count', x.n) order by x.n desc, x.k)
        from (select outcome_kind k, count(*) n from dec where dec.council_id=c.id group by 1) x), '[]'),
      'by_type', coalesce((select jsonb_agg(jsonb_build_object('name_ar', x.k, 'count', x.n) order by x.n desc, x.k)
        from (select type_name_ar k, count(*) n from dec where dec.council_id=c.id and type_name_ar is not null group by 1) x), '[]'),
      'untyped', (select count(*) from dec where dec.council_id=c.id and type_name_ar is null),
      'needs_execution', (select count(*) from exec where exec.council_id=c.id),
      'executed', (select count(*) from exec where exec.council_id=c.id and done),
      'overdue_execution', (select count(*) from exec where exec.council_id=c.id and late),
      'executors', jsonb_build_object(
        'people', (select count(distinct assigned_user_id) from items where items.council_id=c.id),
        'units', (select count(distinct assigned_unit_id) from items where items.council_id=c.id))),
    jsonb_build_object(
      'total', (select count(*) from tp where tp.council_id=c.id),
      'regulated', (select count(*) from tp where tp.council_id=c.id and src='regulated'),
      'direct', (select count(*) from tp where tp.council_id=c.id and src='custom'),
      'exception', (select count(*) from tp where tp.council_id=c.id and src='exception'),
      'legacy', (select count(*) from tp where tp.council_id=c.id and src='legacy'),
      'ungoverned', (select count(*) from tp where tp.council_id=c.id and src<>'regulated'),
      'discussed', (select count(*) from tp where tp.council_id=c.id and discussed))
  from unnest(p_councils) c(id)
$$;


create or replace function qarar_governance.get_council_activity_v2(p_council_id uuid, p_academic_year date default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare o uuid := qarar_iam.current_organization_id(); u uuid := auth.uid(); y date; today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if u is null or o is null then raise exception using errcode='42501', message='يلزم تسجيل الدخول'; end if;
  if p_council_id is null or not (
    p_council_id in (select qarar_iam.led_council_ids(o, u)) or
    exists (select 1 from qarar_iam.overseen_councils(u) c where c.council_id=p_council_id)) then
    raise exception using errcode='42501', message='هذا المجلس خارج المجالس التي تقودها أو تتابعها';
  end if;
  y := qarar_governance.oversight_academic_year(o, p_academic_year);
  return (
    with dec as (
      select c.decision_id, c.council_id, c.meeting_id, c.issued_at, c.outcome_kind, c.decision_status, coalesce(cl.name_ar, c.type_name_ar) type_name_ar, dd.decision_no, dd.decision_text, dd.topic_id, m.title_ar meeting_title_ar
      from qarar_decisions.council_decisions_v2(o, array[p_council_id]) c
      join qarar_decisions.decisions dd on dd.id=c.decision_id and dd.organization_id=o
      left join qarar_meetings.meetings m on m.id=c.meeting_id and m.organization_id=o
      left join qarar_topics.topics tt on tt.id=dd.topic_id and tt.organization_id=o
      left join qarar_governance.topic_type_versions_v2 tv on tv.id=tt.topic_type_version_id and tv.organization_id=o
      left join qarar_governance.topic_classifications_v2 cl on cl.id=tv.classification_id and cl.organization_id=o
      where coalesce(m.academic_year_start=y, c.issued_at>=y::timestamptz and c.issued_at<(y + interval '1 year'))
    ),
    items as (
      select a.id, a.action_no, a.title_ar, a.status, a.due_date, a.completed_at, a.decision_id, d.decision_no, d.meeting_id,
        us.full_name_ar assignee_name_ar, g.name_ar assignee_unit_ar
      from qarar_execution.action_items a join dec d on d.decision_id=a.decision_id
      left join qarar_iam.users us on us.id=a.assigned_user_id and us.organization_id=o
      left join qarar_core.governance_units g on g.id=a.assigned_unit_id and g.organization_id=o
      where a.organization_id=o and a.status<>'cancelled'
    )
    select jsonb_build_object('academic_year_start', y,
      'topics', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'topic_no', t.topic_no, 'title_ar', t.title_ar,
          'governance_source', coalesce(t.governance_source, 'legacy'), 'agenda_status', ai.agenda_status,
          'meeting_id', m.id, 'meeting_title_ar', m.title_ar, 'meeting_date', m.scheduled_date,
          'decision_no', (select d.decision_no from dec d where d.topic_id=t.id and d.meeting_id=m.id order by d.issued_at desc limit 1),
          'outcome_kind', (select d.outcome_kind from dec d where d.topic_id=t.id and d.meeting_id=m.id order by d.issued_at desc limit 1),
          'link', '/admin/topics/'||t.id) order by m.scheduled_date desc, ai.agenda_order)
        from qarar_meetings.agenda_items ai
        join qarar_meetings.meetings m on m.id=ai.meeting_id and m.organization_id=ai.organization_id
        join qarar_topics.topics t on t.id=ai.topic_id and t.organization_id=ai.organization_id
        where ai.organization_id=o and m.governance_unit_id=p_council_id and m.academic_year_start=y and m.status<>'cancelled'), '[]'),
      'decisions', coalesce((select jsonb_agg(jsonb_build_object('id', d.decision_id, 'decision_no', d.decision_no, 'decision_text', d.decision_text,
          'outcome_kind', d.outcome_kind, 'type_name_ar', d.type_name_ar, 'issued_at', d.issued_at,
          'meeting_id', d.meeting_id, 'meeting_title_ar', d.meeting_title_ar,
          'topic_title_ar', (select t.title_ar from qarar_topics.topics t where t.id=d.topic_id and t.organization_id=o),
          'tasks', (select count(*) from items i where i.decision_id=d.decision_id),
          'tasks_done', (select count(*) from items i where i.decision_id=d.decision_id and i.status in ('completed','closed')),
          'link', case when d.meeting_id is not null then '/admin/meetings/'||d.meeting_id end) order by d.issued_at desc)
        from dec d), '[]'),
      'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'action_no', i.action_no, 'title_ar', i.title_ar, 'status', i.status,
          'due_date', i.due_date, 'overdue', i.status not in ('completed','closed') and i.due_date is not null and i.due_date<today,
          'assignee_name_ar', i.assignee_name_ar, 'assignee_unit_ar', i.assignee_unit_ar, 'decision_no', i.decision_no,
          'meeting_id', i.meeting_id, 'link', '/admin/tasks?task='||i.id) order by i.status in ('completed','closed'), i.due_date nulls last)
        from items i), '[]'))
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
