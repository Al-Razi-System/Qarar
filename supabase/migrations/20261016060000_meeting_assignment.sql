-- Assignments from the live room (owner review 2026-10-15, batch 5b). The
-- council's chair issues an execution task during the session, before the
-- decision is approved (owner: "immediate execution in the session"); the
-- rapporteur proposes one for the chair to confirm. Every other path to an
-- execution task still requires an approved decision.
-- Impact map: docs/engineering/impact/MEETING_ASSIGNMENT_AR.md
begin;

create table qarar_meetings.meeting_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  meeting_id uuid not null,
  agenda_item_id uuid not null,
  decision_id uuid not null,
  title_ar text not null check (char_length(title_ar) between 5 and 300),
  description text check (char_length(description) <= 2000),
  assigned_user_id uuid,
  assigned_unit_id uuid,
  due_date date,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'withdrawn')),
  proposed_by_user_id uuid not null,
  issued_by_user_id uuid,
  issued_at timestamptz,
  withdrawn_by_user_id uuid,
  withdrawn_at timestamptz,
  action_item_id uuid unique,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (assigned_user_id is not null or assigned_unit_id is not null),
  check (status <> 'active' or (issued_by_user_id is not null and issued_at is not null)),
  foreign key (agenda_item_id, organization_id) references qarar_meetings.agenda_items(id, organization_id) on delete restrict,
  foreign key (meeting_id, organization_id) references qarar_meetings.meetings(id, organization_id) on delete restrict
);
create index meeting_assignments_meeting_idx on qarar_meetings.meeting_assignments(meeting_id);
alter table qarar_meetings.meeting_assignments enable row level security;
alter table qarar_meetings.meeting_assignments force row level security;
revoke all on qarar_meetings.meeting_assignments from public, anon, authenticated, service_role;
grant select, insert, update on qarar_meetings.meeting_assignments to qarar_meetings_executor;
insert into qarar_architecture.entity_registry(entity_name, module_code, legacy_public_view)
values ('meeting_assignments', 'meetings', false)
on conflict do nothing;

-- Which task a session assignment produced. Existing tasks keep null.
alter table qarar_execution.action_items add column meeting_assignment_id uuid unique;

-- True only for an assignment the chair issued, for this very decision, that
-- has no task yet. The execution rule trusts this record, not the caller.
create function qarar_meetings.is_confirmed_meeting_assignment(p_assignment_id uuid, p_decision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from qarar_meetings.meeting_assignments
    where id = p_assignment_id and decision_id = p_decision_id
      and status = 'active' and action_item_id is null
  )
$$;

-- The execution rule: an approved decision, as before, or a task the chair
-- issued in the session for a decision awaiting approval.
create or replace function qarar_execution.check_action_item_creation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_decision_status text;
begin
  select decision_status into v_decision_status
  from qarar_decisions.decisions
  where id = new.decision_id and organization_id = new.organization_id;

  if v_decision_status in ('approved', 'sent_to_execution', 'under_follow_up') then
    return new;
  end if;
  if new.meeting_assignment_id is not null
     and v_decision_status = 'ready_for_approval'
     and qarar_meetings.is_confirmed_meeting_assignment(new.meeting_assignment_id, new.decision_id) then
    return new;
  end if;
  raise exception using errcode = '23514',
    message = 'لا تُنشأ مهمة تنفيذ قبل اعتماد القرار، إلا بتكليف يصدره رئيس المجلس في الجلسة.',
    detail = format('decision_status=%s', coalesce(v_decision_status, 'missing'));
end;
$$;

-- Creates the task of an issued assignment. The trigger above verifies it.
create function qarar_execution.create_meeting_action_item(
  p_assignment_id uuid, p_decision_id uuid, p_topic_id uuid, p_title text, p_description text,
  p_assigned_user_id uuid, p_assigned_unit_id uuid, p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_no text;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':action_item', 0));
  select 'TSK-' || to_char(current_date, 'YYYY') || '-' || lpad((coalesce(max(substring(action_no from '^TSK-[0-9]{4}-([0-9]{6})$')::integer), 0) + 1)::text, 6, '0')
  into v_no
  from qarar_execution.action_items
  where organization_id = v_org and action_no like 'TSK-' || to_char(current_date, 'YYYY') || '-%';
  insert into qarar_execution.action_items(
    organization_id, action_no, decision_id, topic_id, assigned_unit_id, assigned_user_id,
    title_ar, description, due_date, meeting_assignment_id
  ) values (
    v_org, v_no, p_decision_id, p_topic_id, p_assigned_unit_id, p_assigned_user_id,
    p_title, p_description, p_due_date, p_assignment_id
  ) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org, 'execution.action_item.create_from_meeting', 'action_items', v_id,
    jsonb_build_object('meeting_assignment_id', p_assignment_id, 'decision_id', p_decision_id, 'action_no', v_no));
  return jsonb_build_object('id', v_id, 'action_no', v_no, 'status', 'new');
end;
$$;

-- Cancels the task of a withdrawn assignment, only before work starts.
create function qarar_execution.cancel_meeting_action_item(p_action_item_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_status text;
begin
  select status into v_status from qarar_execution.action_items
  where id = p_action_item_id and organization_id = v_org and meeting_assignment_id is not null
  for update;
  if v_status is null then
    raise exception using errcode = 'P0002', message = 'مهمة التكليف غير موجودة.';
  end if;
  if v_status <> 'new' then
    raise exception using errcode = '23514', message = 'بدأ تنفيذ هذا التكليف، فلا يُسحب من الغرفة.';
  end if;
  update qarar_execution.action_items set status = 'cancelled'
  where id = p_action_item_id and organization_id = v_org;
  perform qarar_audit.append_audit_log(v_org, 'execution.action_item.cancel_from_meeting', 'action_items', p_action_item_id,
    jsonb_build_object('reason', p_reason));
end;
$$;

-- A decision rejected later takes the session's unfinished tasks with it.
create function qarar_execution.cancel_meeting_tasks_of_rejected_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_task record;
begin
  if new.decision_status <> 'rejected' or old.decision_status = 'rejected' then
    return null;
  end if;
  for v_task in
    update qarar_execution.action_items set status = 'cancelled'
    where decision_id = new.id and organization_id = new.organization_id
      and meeting_assignment_id is not null and status in ('new', 'in_progress', 'overdue')
    returning id
  loop
    perform qarar_audit.append_audit_log(new.organization_id, 'execution.action_item.cancel_on_rejection', 'action_items', v_task.id,
      jsonb_build_object('decision_id', new.id));
  end loop;
  return null;
end;
$$;

create trigger decisions_cancel_meeting_action_items
after update of decision_status on qarar_decisions.decisions
for each row execute function qarar_execution.cancel_meeting_tasks_of_rejected_decision();

-- The council's chair or rapporteur on the meeting, and the open session.
create function qarar_meetings.assignment_context(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
begin
  select * into v_m from qarar_meetings.meetings
  where id = p_meeting_id and organization_id = qarar_iam.current_organization_id();
  return jsonb_build_object(
    'chair', qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']),
    'rapporteur', qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_rapporteur']),
    'live', v_m.status = 'in_progress'
  );
end;
$$;

-- Issues an active assignment's task and links it.
create function qarar_meetings.issue_meeting_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  a qarar_meetings.meeting_assignments%rowtype;
  v_topic uuid;
  v_task jsonb;
begin
  select * into a from qarar_meetings.meeting_assignments
  where id = p_assignment_id and organization_id = qarar_iam.current_organization_id();
  select topic_id into v_topic from qarar_meetings.agenda_items
  where id = a.agenda_item_id and organization_id = a.organization_id;
  v_task := qarar_execution.create_meeting_action_item(a.id, a.decision_id, v_topic, a.title_ar, a.description,
    a.assigned_user_id, a.assigned_unit_id, a.due_date);
  update qarar_meetings.meeting_assignments
  set action_item_id = (v_task->>'id')::uuid, updated_at = clock_timestamp()
  where id = a.id and organization_id = a.organization_id;
  perform qarar_audit.append_audit_log(a.organization_id, 'meetings.assignment.issue', 'meeting_assignments', a.id,
    jsonb_build_object('meeting_id', a.meeting_id, 'decision_id', a.decision_id, 'action_item_id', v_task->>'id', 'action_no', v_task->>'action_no'));
  return v_task;
end;
$$;

create function qarar_meetings.propose_meeting_assignment(
  p_agenda_item_id uuid, p_title text, p_description text,
  p_assigned_user_id uuid, p_assigned_unit_id uuid, p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item qarar_meetings.agenda_items%rowtype;
  v_ctx jsonb;
  v_decision record;
  v_id uuid;
  v_status text;
  v_task jsonb;
begin
  select * into v_item from qarar_meetings.agenda_items
  where id = p_agenda_item_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if v_item.id is null then
    raise exception using errcode = 'P0002', message = 'البند غير موجود.';
  end if;
  v_ctx := qarar_meetings.assignment_context(v_item.meeting_id);
  if not (v_ctx->>'chair')::boolean and not (v_ctx->>'rapporteur')::boolean then
    raise exception using errcode = '42501', message = 'التكليف من اختصاص رئيس المجلس، ويقترحه مقرر المجلس.';
  end if;
  if not (v_ctx->>'live')::boolean then
    raise exception using errcode = '23514', message = 'يُصدر التكليف أثناء انعقاد الجلسة فقط.';
  end if;
  select id, decision_status into v_decision from qarar_decisions.decisions
  where agenda_item_id = v_item.id and organization_id = v_item.organization_id;
  if v_decision.id is null or v_decision.decision_status in ('rejected', 'cancelled', 'closed') then
    raise exception using errcode = '23514', message = 'صغ قرار البند أولاً، ثم أضف تكليفاته.';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 5 and 300 then
    raise exception using errcode = '22023', message = 'اكتب عنوان التكليف من 5 إلى 300 حرف.';
  end if;
  if p_description is not null and char_length(p_description) > 2000 then
    raise exception using errcode = '22023', message = 'تفاصيل التكليف لا تتجاوز 2000 حرف.';
  end if;
  if p_assigned_user_id is null and p_assigned_unit_id is null then
    raise exception using errcode = '22023', message = 'اختر المكلَّف: عضواً أو جهة.';
  end if;
  if p_assigned_user_id is not null and not exists (
    select 1 from qarar_iam.users where id = p_assigned_user_id and organization_id = v_item.organization_id and status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'المكلَّف غير موجود أو غير نشط.';
  end if;
  if p_assigned_unit_id is not null and not exists (
    select 1 from qarar_core.governance_units where id = p_assigned_unit_id and organization_id = v_item.organization_id and status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'الجهة المكلَّفة غير موجودة أو غير نشطة.';
  end if;
  if p_due_date is not null and p_due_date < current_date then
    raise exception using errcode = '22023', message = 'موعد الإنجاز لا يكون في الماضي.';
  end if;

  v_status := case when (v_ctx->>'chair')::boolean then 'active' else 'proposed' end;
  insert into qarar_meetings.meeting_assignments(
    organization_id, meeting_id, agenda_item_id, decision_id, title_ar, description,
    assigned_user_id, assigned_unit_id, due_date, status, proposed_by_user_id, issued_by_user_id, issued_at
  ) values (
    v_item.organization_id, v_item.meeting_id, v_item.id, v_decision.id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    p_assigned_user_id, p_assigned_unit_id, p_due_date, v_status, auth.uid(),
    case when v_status = 'active' then auth.uid() end, case when v_status = 'active' then clock_timestamp() end
  ) returning id into v_id;
  perform qarar_audit.append_audit_log(v_item.organization_id, 'meetings.assignment.propose', 'meeting_assignments', v_id,
    jsonb_build_object('meeting_id', v_item.meeting_id, 'agenda_item_id', v_item.id, 'decision_id', v_decision.id, 'status', v_status));
  if v_status = 'active' then
    v_task := qarar_meetings.issue_meeting_assignment(v_id);
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status, 'revision', 0, 'action_no', v_task->>'action_no');
end;
$$;

create function qarar_meetings.confirm_meeting_assignment(p_assignment_id uuid, p_expected_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  a qarar_meetings.meeting_assignments%rowtype;
  v_ctx jsonb;
  v_task jsonb;
begin
  select * into a from qarar_meetings.meeting_assignments
  where id = p_assignment_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if a.id is null then
    raise exception using errcode = 'P0002', message = 'التكليف غير موجود.';
  end if;
  v_ctx := qarar_meetings.assignment_context(a.meeting_id);
  if not (v_ctx->>'chair')::boolean then
    raise exception using errcode = '42501', message = 'اعتماد التكليف من اختصاص رئيس المجلس.';
  end if;
  if not (v_ctx->>'live')::boolean then
    raise exception using errcode = '23514', message = 'يُعتمد التكليف أثناء انعقاد الجلسة فقط.';
  end if;
  if p_expected_revision is null or p_expected_revision <> a.revision then
    raise exception using errcode = '40001', message = 'تغيّر التكليف من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.';
  end if;
  if a.status <> 'proposed' then
    raise exception using errcode = '23514', message = 'لم يعد هذا التكليف مقترحاً.';
  end if;
  update qarar_meetings.meeting_assignments
  set status = 'active', issued_by_user_id = auth.uid(), issued_at = clock_timestamp(),
      revision = revision + 1, updated_at = clock_timestamp()
  where id = a.id and organization_id = a.organization_id;
  v_task := qarar_meetings.issue_meeting_assignment(a.id);
  return jsonb_build_object('id', a.id, 'status', 'active', 'revision', a.revision + 1, 'action_no', v_task->>'action_no');
end;
$$;

create function qarar_meetings.withdraw_meeting_assignment(p_assignment_id uuid, p_expected_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  a qarar_meetings.meeting_assignments%rowtype;
  v_ctx jsonb;
begin
  select * into a from qarar_meetings.meeting_assignments
  where id = p_assignment_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if a.id is null then
    raise exception using errcode = 'P0002', message = 'التكليف غير موجود.';
  end if;
  v_ctx := qarar_meetings.assignment_context(a.meeting_id);
  if not (v_ctx->>'chair')::boolean
     and not (a.status = 'proposed' and a.proposed_by_user_id = auth.uid() and (v_ctx->>'rapporteur')::boolean) then
    raise exception using errcode = '42501', message = 'يسحب التكليفَ رئيسُ المجلس، ويسحب المقرر مقترحه قبل اعتماده.';
  end if;
  if not (v_ctx->>'live')::boolean then
    raise exception using errcode = '23514', message = 'يُسحب التكليف أثناء انعقاد الجلسة فقط.';
  end if;
  if p_expected_revision is null or p_expected_revision <> a.revision then
    raise exception using errcode = '40001', message = 'تغيّر التكليف من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.';
  end if;
  if a.status = 'withdrawn' then
    raise exception using errcode = '23514', message = 'سُحب هذا التكليف من قبل.';
  end if;
  if a.action_item_id is not null then
    perform qarar_execution.cancel_meeting_action_item(a.action_item_id, 'سحب التكليف في الجلسة');
  end if;
  update qarar_meetings.meeting_assignments
  set status = 'withdrawn', withdrawn_by_user_id = auth.uid(), withdrawn_at = clock_timestamp(),
      revision = revision + 1, updated_at = clock_timestamp()
  where id = a.id and organization_id = a.organization_id;
  perform qarar_audit.append_audit_log(a.organization_id, 'meetings.assignment.withdraw', 'meeting_assignments', a.id,
    jsonb_build_object('meeting_id', a.meeting_id, 'previous_status', a.status, 'action_item_id', a.action_item_id));
  return jsonb_build_object('id', a.id, 'status', 'withdrawn', 'revision', a.revision + 1);
end;
$$;

create function qarar_meetings.list_meeting_assignments(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_ctx jsonb;
begin
  select * into v_m from qarar_meetings.meetings
  where id = p_meeting_id and organization_id = qarar_iam.current_organization_id();
  if v_m.id is null then
    raise exception using errcode = 'P0002', message = 'الاجتماع غير موجود.';
  end if;
  if not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('attendance.read', v_m.governance_unit_id)
     and not qarar_iam.has_permission('attendance.manage', v_m.governance_unit_id) then
    raise exception using errcode = '42501', message = 'متابعة التكليفات متاحة لمن يطّلع على حضور هذا المجلس.';
  end if;
  v_ctx := qarar_meetings.assignment_context(v_m.id);
  return jsonb_build_object(
    'viewer', jsonb_build_object('can_issue', (v_ctx->>'chair')::boolean, 'can_propose', (v_ctx->>'rapporteur')::boolean),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'agenda_item_id', a.agenda_item_id,
        'decision_id', a.decision_id,
        'title_ar', a.title_ar,
        'description', a.description,
        'assigned_user_id', a.assigned_user_id,
        'assigned_user_name_ar', u.full_name_ar,
        'assigned_unit_id', a.assigned_unit_id,
        'assigned_unit_name_ar', g.name_ar,
        'due_date', a.due_date,
        'status', a.status,
        'revision', a.revision,
        'proposed_by_me', a.proposed_by_user_id = auth.uid(),
        'action_no', t.action_no,
        'action_status', t.status
      ) order by a.created_at)
      from qarar_meetings.meeting_assignments a
      left join qarar_iam.users u on u.id = a.assigned_user_id and u.organization_id = a.organization_id
      left join qarar_core.governance_units g on g.id = a.assigned_unit_id and g.organization_id = a.organization_id
      left join qarar_execution.action_items t on t.id = a.action_item_id and t.organization_id = a.organization_id
      where a.meeting_id = v_m.id and a.organization_id = v_m.organization_id
    ), '[]'::jsonb),
    -- Only who issues or proposes needs the choices.
    'options', case when (v_ctx->>'chair')::boolean or (v_ctx->>'rapporteur')::boolean then jsonb_build_object(
      'users', coalesce((
        select jsonb_agg(jsonb_build_object('id', u.id, 'name_ar', u.full_name_ar) order by u.full_name_ar)
        from qarar_iam.users u
        where u.organization_id = v_m.organization_id and u.status = 'active'
          and u.id in (select r.user_id from qarar_attendance.attendance_records r
                       where r.meeting_id = v_m.id and r.organization_id = v_m.organization_id)
      ), '[]'::jsonb),
      'units', coalesce((
        select jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar) order by g.name_ar)
        from qarar_core.governance_units g
        where g.organization_id = v_m.organization_id and g.status = 'active'
      ), '[]'::jsonb)
    ) end
  );
end;
$$;

grant select on qarar_execution.action_items to qarar_meetings_executor;
grant usage on schema qarar_iam, qarar_audit, qarar_meetings to qarar_execution_executor;
grant usage on schema qarar_execution to qarar_meetings_executor;
grant execute on function qarar_iam.current_organization_id() to qarar_execution_executor;
grant execute on function qarar_audit.append_audit_log(uuid, text, text, uuid, jsonb) to qarar_execution_executor;

alter function qarar_meetings.is_confirmed_meeting_assignment(uuid, uuid) owner to qarar_meetings_executor;
alter function qarar_execution.check_action_item_creation() owner to qarar_execution_executor;
alter function qarar_execution.create_meeting_action_item(uuid, uuid, uuid, text, text, uuid, uuid, date) owner to qarar_execution_executor;
alter function qarar_execution.cancel_meeting_action_item(uuid, text) owner to qarar_execution_executor;
alter function qarar_execution.cancel_meeting_tasks_of_rejected_decision() owner to qarar_execution_executor;
alter function qarar_meetings.assignment_context(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.issue_meeting_assignment(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.propose_meeting_assignment(uuid, text, text, uuid, uuid, date) owner to qarar_meetings_executor;
alter function qarar_meetings.confirm_meeting_assignment(uuid, integer) owner to qarar_meetings_executor;
alter function qarar_meetings.withdraw_meeting_assignment(uuid, integer) owner to qarar_meetings_executor;
alter function qarar_meetings.list_meeting_assignments(uuid) owner to qarar_meetings_executor;
revoke all on function
  qarar_meetings.is_confirmed_meeting_assignment(uuid, uuid),
  qarar_execution.check_action_item_creation(),
  qarar_execution.create_meeting_action_item(uuid, uuid, uuid, text, text, uuid, uuid, date),
  qarar_execution.cancel_meeting_action_item(uuid, text),
  qarar_execution.cancel_meeting_tasks_of_rejected_decision(),
  qarar_meetings.assignment_context(uuid),
  qarar_meetings.issue_meeting_assignment(uuid),
  qarar_meetings.propose_meeting_assignment(uuid, text, text, uuid, uuid, date),
  qarar_meetings.confirm_meeting_assignment(uuid, integer),
  qarar_meetings.withdraw_meeting_assignment(uuid, integer),
  qarar_meetings.list_meeting_assignments(uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_meetings.is_confirmed_meeting_assignment(uuid, uuid) to qarar_execution_executor;
grant execute on function
  qarar_execution.create_meeting_action_item(uuid, uuid, uuid, text, text, uuid, uuid, date),
  qarar_execution.cancel_meeting_action_item(uuid, text)
  to qarar_meetings_executor;
grant execute on function
  qarar_meetings.propose_meeting_assignment(uuid, text, text, uuid, uuid, date),
  qarar_meetings.confirm_meeting_assignment(uuid, integer),
  qarar_meetings.withdraw_meeting_assignment(uuid, integer),
  qarar_meetings.list_meeting_assignments(uuid)
  to qarar_api_executor;

create function api_v2.propose_meeting_assignment_v2(p_agenda_item_id uuid, p_title text, p_description text, p_assigned_user_id uuid, p_assigned_unit_id uuid, p_due_date date)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.propose_meeting_assignment($1, $2, $3, $4, $5, $6) $$;
create function api_v2.confirm_meeting_assignment_v2(p_assignment_id uuid, p_expected_revision integer)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.confirm_meeting_assignment($1, $2) $$;
create function api_v2.withdraw_meeting_assignment_v2(p_assignment_id uuid, p_expected_revision integer)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.withdraw_meeting_assignment($1, $2) $$;
create function api_v2.list_meeting_assignments_v2(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_meetings.list_meeting_assignments($1) $$;
alter function api_v2.propose_meeting_assignment_v2(uuid, text, text, uuid, uuid, date) owner to qarar_api_executor;
alter function api_v2.confirm_meeting_assignment_v2(uuid, integer) owner to qarar_api_executor;
alter function api_v2.withdraw_meeting_assignment_v2(uuid, integer) owner to qarar_api_executor;
alter function api_v2.list_meeting_assignments_v2(uuid) owner to qarar_api_executor;
revoke all on function
  api_v2.propose_meeting_assignment_v2(uuid, text, text, uuid, uuid, date),
  api_v2.confirm_meeting_assignment_v2(uuid, integer),
  api_v2.withdraw_meeting_assignment_v2(uuid, integer),
  api_v2.list_meeting_assignments_v2(uuid)
  from public, anon, service_role;
grant execute on function
  api_v2.propose_meeting_assignment_v2(uuid, text, text, uuid, uuid, date),
  api_v2.confirm_meeting_assignment_v2(uuid, integer),
  api_v2.withdraw_meeting_assignment_v2(uuid, integer),
  api_v2.list_meeting_assignments_v2(uuid)
  to authenticated;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), r.module_code, n.nspname, false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join (values
  ('qarar_meetings', 'is_confirmed_meeting_assignment', 'meetings'),
  ('qarar_execution', 'check_action_item_creation', 'execution'),
  ('qarar_execution', 'create_meeting_action_item', 'execution'),
  ('qarar_execution', 'cancel_meeting_action_item', 'execution'),
  ('qarar_execution', 'cancel_meeting_tasks_of_rejected_decision', 'execution'),
  ('qarar_meetings', 'assignment_context', 'meetings'),
  ('qarar_meetings', 'issue_meeting_assignment', 'meetings'),
  ('qarar_meetings', 'propose_meeting_assignment', 'meetings'),
  ('qarar_meetings', 'confirm_meeting_assignment', 'meetings'),
  ('qarar_meetings', 'withdraw_meeting_assignment', 'meetings'),
  ('qarar_meetings', 'list_meeting_assignments', 'meetings')
) r(schema_name, function_name, module_code) on r.schema_name = n.nspname and r.function_name = p.proname
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v2', p.proname, 'qarar_meetings', regexp_replace(p.proname::text, '_v2$', ''),
  pg_get_function_identity_arguments(p.oid), 'meetings', 'authenticated'
from pg_proc p
where p.pronamespace = 'api_v2'::regnamespace
  and p.proname in ('propose_meeting_assignment_v2', 'confirm_meeting_assignment_v2', 'withdraw_meeting_assignment_v2', 'list_meeting_assignments_v2');

insert into qarar_architecture.module_table_read_allowlist(source_module, target_schema, table_name, rationale) values
  ('meetings', 'qarar_execution', 'action_items', 'Show the task number and status of an assignment issued in the live room')
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module, target_schema, function_name, identity_arguments, rationale) values
  ('meetings', 'qarar_execution', 'create_meeting_action_item',
   'p_assignment_id uuid, p_decision_id uuid, p_topic_id uuid, p_title text, p_description text, p_assigned_user_id uuid, p_assigned_unit_id uuid, p_due_date date',
   'The council chair issues an execution task during the session'),
  ('meetings', 'qarar_execution', 'cancel_meeting_action_item', 'p_action_item_id uuid, p_reason text',
   'Withdrawing an assignment in the session cancels its task before work starts'),
  ('execution', 'qarar_meetings', 'is_confirmed_meeting_assignment', 'p_assignment_id uuid, p_decision_id uuid',
   'A task before decision approval is accepted only for an assignment the chair issued in the session'),
  ('execution', 'qarar_iam', 'current_organization_id', '',
   'Scope tasks created or cancelled from the live room to the caller''s tenant'),
  ('execution', 'qarar_audit', 'append_audit_log', 'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb',
   'Audit tasks created, cancelled or cancelled on decision rejection from the live room')
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
