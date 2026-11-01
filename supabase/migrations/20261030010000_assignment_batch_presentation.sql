-- Present one logical assignment batch in minutes and follow-up while preserving every target task.
begin;

create or replace function qarar_meetings.minutes_assignment_lines(p_meeting_id uuid,p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$
  with source as(
    select a.id,a.assignment_batch_id,a.agenda_item_id,
      coalesce(b.title_ar,a.title_ar) title_ar,
      coalesce(u.full_name_ar,g.name_ar) assignee_ar,
      f.full_name_ar follow_up_ar,a.due_date,a.requires_evidence,a.created_at,
      t.action_no,t.status task_status,t.progress_percent,
      coalesce(b.target_count,1) declared_target_count
    from qarar_meetings.meeting_assignments a
    join qarar_meetings.meetings m on m.id=a.meeting_id and m.organization_id=a.organization_id
    left join qarar_meetings.meeting_assignment_batches b
      on b.id=a.assignment_batch_id and b.organization_id=a.organization_id
    left join qarar_iam.users u on u.id=a.assigned_user_id and u.organization_id=a.organization_id
    left join qarar_iam.users f on f.id=a.follow_up_user_id and f.organization_id=a.organization_id
    left join qarar_core.governance_units g on g.id=a.assigned_unit_id and g.organization_id=a.organization_id
    left join qarar_execution.action_items t on t.id=a.action_item_id and t.organization_id=a.organization_id
    where a.meeting_id=p_meeting_id and a.organization_id=p_organization_id
      and a.status='active' and coalesce(t.status,'new')<>'cancelled'
  ), grouped as(
    select coalesce(assignment_batch_id,id) group_id,assignment_batch_id,
      min(agenda_item_id::text)::uuid agenda_item_id,min(title_ar) title_ar,
      string_agg(distinct assignee_ar,'، ' order by assignee_ar) assignee_ar,
      min(follow_up_ar) follow_up_ar,min(due_date) due_date,
      bool_or(requires_evidence) requires_evidence,
      string_agg(action_no,'، ' order by action_no) action_no,
      greatest(max(declared_target_count),count(*))::integer target_count,
      count(*) filter(where task_status='completed')::integer completed_count,
      round(avg(coalesce(progress_percent,0)))::integer progress_percent,
      min(created_at) created_at
    from source
    group by coalesce(assignment_batch_id,id),assignment_batch_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_batch_id',grouped.assignment_batch_id,
    'agenda_item_id',grouped.agenda_item_id,
    'title_ar',grouped.title_ar,
    'assignee_ar',grouped.assignee_ar,
    'follow_up_ar',grouped.follow_up_ar,
    'due_date',grouped.due_date,
    'duration_days',grouped.due_date-m.scheduled_date,
    'requires_evidence',grouped.requires_evidence,
    'action_no',grouped.action_no,
    'target_count',grouped.target_count,
    'completed_count',grouped.completed_count,
    'progress_percent',grouped.progress_percent
  ) order by grouped.created_at),'[]'::jsonb)
  from grouped
  join qarar_meetings.meetings m on m.id=p_meeting_id and m.organization_id=p_organization_id
$$;

create or replace function qarar_decisions.list_decision_tasks(p_decision_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare
  d qarar_decisions.decisions%rowtype;
  v_access jsonb;
begin
  select * into d from qarar_decisions.decisions
  where id=p_decision_id and organization_id=qarar_iam.current_organization_id();
  if d.id is null then raise exception using errcode='P0002',message='القرار غير موجود.';end if;
  v_access:=qarar_decisions.follow_up_access(d);
  if not(v_access->>'read')::boolean then
    raise exception using errcode='42501',message='متابعة القرار لرئيس مجلسه ومقرره ومن يحمل صلاحية عرض التكليفات.';
  end if;
  return qarar_decisions.decision_follow_up_row(d)||jsonb_build_object(
    'tasks',coalesce((
      select jsonb_agg(qarar_execution.task_summary(t)||jsonb_build_object(
        'can_manage',(v_access->>'manage')::boolean and t.status in('new','in_progress','overdue','submitted'),
        'assignment_batch_id',ma.assignment_batch_id,
        'assignment_batch_title_ar',b.title_ar,
        'assignment_batch_target_count',b.target_count
      ) order by t.due_date nulls last,t.created_at)
      from qarar_execution.action_items t
      left join qarar_meetings.meeting_assignments ma
        on ma.id=t.meeting_assignment_id and ma.organization_id=t.organization_id
      left join qarar_meetings.meeting_assignment_batches b
        on b.id=ma.assignment_batch_id and b.organization_id=ma.organization_id
      where t.decision_id=d.id and t.organization_id=d.organization_id
    ),'[]'::jsonb),
    'units',case when(v_access->>'manage')::boolean then coalesce((
      select jsonb_agg(jsonb_build_object('id',g.id,'name_ar',g.name_ar) order by g.name_ar)
      from qarar_core.governance_units g where g.organization_id=d.organization_id and g.status='active'
    ),'[]'::jsonb) end
  );
end;
$$;

grant select on qarar_meetings.meeting_assignments,qarar_meetings.meeting_assignment_batches
  to qarar_decisions_executor;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)
values
  ('decisions','qarar_meetings','meeting_assignments','Group decision follow-up tasks by the logical assignment issued in the meeting'),
  ('decisions','qarar_meetings','meeting_assignment_batches','Show logical assignment target counts in decision follow-up')
on conflict do nothing;

notify pgrst,'reload schema';
commit;
