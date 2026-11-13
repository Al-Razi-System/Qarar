-- Council statistics, completed: decisions issued by outcome and type, how many needed execution and were
-- executed, who executes them, and the topics the council handled split into governed and ungoverned.
-- Read-only. The decisions module names its own types; governance adds the result to each council row.
-- Impact map: docs/engineering/impact/COUNCIL_PERFORMANCE_FOLLOW_UP_20261113_AR.md
begin;

/** Decisions a council has issued (drafts, reviews and cancelled ones are not issued). */
create function qarar_decisions.council_decisions_v2(p_org uuid, p_councils uuid[])
returns table(decision_id uuid, council_id uuid, meeting_id uuid, issued_at timestamptz, outcome_kind text, type_name_ar text, decision_status text)
language sql stable security definer set search_path=pg_catalog
as $$
  select d.id, d.governance_unit_id, d.meeting_id, coalesce(d.issued_at, d.created_at), coalesce(d.outcome_kind, 'unspecified'), t.name_ar, d.decision_status
  from qarar_decisions.decisions d
  left join qarar_decisions.decision_types t on t.id=d.decision_type_id and t.organization_id=d.organization_id
  where d.organization_id=p_org and d.governance_unit_id=any(p_councils)
    and d.decision_status in ('approved','sent_to_execution','under_follow_up','closed','rejected')
$$;

/** Per council: decision statistics and the topics it handled in the academic year. */
create function qarar_governance.oversight_council_extras_v2(p_org uuid, p_councils uuid[], p_year date)
returns table(council_id uuid, decision_stats jsonb, topics jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  with today as (select (now() at time zone 'Asia/Riyadh')::date d),
  dec as (
    select c.* from qarar_decisions.council_decisions_v2(p_org, p_councils) c
    left join qarar_meetings.meetings m on m.id=c.meeting_id and m.organization_id=p_org
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

-- The row builder keeps its name for its callers; the original becomes the core it extends.
alter function qarar_governance.oversight_council_rows_v2(uuid,uuid[],date) rename to oversight_council_core_v2;
create function qarar_governance.oversight_council_rows_v2(p_org uuid, p_councils uuid[], p_year date)
returns setof jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select r || jsonb_build_object('decision_stats', e.decision_stats, 'topics', e.topics)
  from qarar_governance.oversight_council_core_v2(p_org, p_councils, p_year) r
  join qarar_governance.oversight_council_extras_v2(p_org, p_councils, p_year) e on e.council_id=(r->>'id')::uuid
$$;

do $owners$
begin
  alter function qarar_decisions.council_decisions_v2(uuid,uuid[]) owner to qarar_decisions_executor;
  alter function qarar_governance.oversight_council_extras_v2(uuid,uuid[],date) owner to qarar_governance_executor;
  alter function qarar_governance.oversight_council_rows_v2(uuid,uuid[],date) owner to qarar_governance_executor;
end
$owners$;
revoke all on function qarar_decisions.council_decisions_v2(uuid,uuid[]), qarar_governance.oversight_council_extras_v2(uuid,uuid[],date),
  qarar_governance.oversight_council_rows_v2(uuid,uuid[],date) from public, anon, authenticated, service_role;
grant execute on function qarar_decisions.council_decisions_v2(uuid,uuid[]) to qarar_governance_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
('governance','qarar_decisions','council_decisions_v2','p_org uuid, p_councils uuid[]','Follow-up centre: decisions a council issued, with outcome and type name.')
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
