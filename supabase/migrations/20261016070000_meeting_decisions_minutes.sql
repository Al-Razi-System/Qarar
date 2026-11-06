-- A numbered decision for every closed agenda item, the meeting's decisions
-- approved when its minutes are approved and signed, and the session's
-- assignments (assignee, follow-up person, duration, evidence) in the minutes
-- (owner decisions, 2026-10-16).
-- Impact map: docs/engineering/impact/MEETING_DECISIONS_MINUTES_AR.md
begin;

-- 1. What each decision records: the item's outcome. Existing ones are approvals.
alter table qarar_decisions.decisions
  add column outcome_kind text not null default 'approval'
  check (outcome_kind in ('approval', 'rejection', 'undecided', 'postponement', 'referral'));

-- 2. The assignment names its follow-up person and whether evidence is required.
alter table qarar_meetings.meeting_assignments
  add column follow_up_user_id uuid,
  add column requires_evidence boolean not null default false;
alter table qarar_execution.action_items
  add column requires_evidence boolean not null default false;

-- 3. Decisions for the outcomes nobody drafted: written when the session ends.
-- p_outcomes: [{agenda_item_id, topic_id, outcome_kind, decision_text}]
create function qarar_decisions.record_meeting_outcome_decisions(p_meeting_id uuid, p_outcomes jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_outcome jsonb;
  v_no text;
  v_id uuid;
  v_count integer := 0;
begin
  select * into v_m from qarar_meetings.meetings where id = p_meeting_id;
  if v_m.id is null then
    raise exception using errcode = 'P0002', message = 'الاجتماع غير موجود.';
  end if;
  -- The same lock and numbering as create_decision_from_voting_round.
  perform pg_advisory_xact_lock(hashtextextended(v_m.organization_id::text || ':decision', 0));
  for v_outcome in select value from jsonb_array_elements(coalesce(p_outcomes, '[]'::jsonb)) loop
    continue when exists (
      select 1 from qarar_decisions.decisions
      where organization_id = v_m.organization_id and agenda_item_id = (v_outcome->>'agenda_item_id')::uuid
    );
    select 'DEC-' || to_char(current_date, 'YYYY') || '-' || lpad((count(*) + 1)::text, 6, '0')
    into v_no
    from qarar_decisions.decisions
    where organization_id = v_m.organization_id
      and extract(year from created_at) = extract(year from current_date);
    insert into qarar_decisions.decisions(
      organization_id, decision_no, topic_id, meeting_id, agenda_item_id, governance_unit_id,
      decision_text, decision_status, issued_by_user_id, requires_approval, outcome_kind
    ) values (
      v_m.organization_id, v_no, (v_outcome->>'topic_id')::uuid, v_m.id, (v_outcome->>'agenda_item_id')::uuid,
      v_m.governance_unit_id, v_outcome->>'decision_text', 'ready_for_approval',
      coalesce(auth.uid(), v_m.created_by_user_id), true, v_outcome->>'outcome_kind'
    ) returning id into v_id;
    perform qarar_audit.append_audit_log(v_m.organization_id, 'decisions.create_for_outcome', 'decisions', v_id,
      jsonb_build_object('meeting_id', v_m.id, 'agenda_item_id', v_outcome->>'agenda_item_id', 'outcome_kind', v_outcome->>'outcome_kind'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Runs after every session-ending check has passed; a failure undoes the end.
create function qarar_meetings.record_outcome_decisions_on_session_end()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_outcomes jsonb;
begin
  if new.status <> 'waiting_for_minutes' or old.status <> 'in_progress' then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'agenda_item_id', o.id, 'topic_id', o.topic_id, 'outcome_kind', o.kind, 'decision_text', o.text
  ) order by o.agenda_order), '[]'::jsonb)
  into v_outcomes
  from (
    select ai.id, ai.topic_id, ai.agenda_order,
      case
        when r.agenda_item_id is not null then 'referral'
        when ai.agenda_status = 'postponed' then 'postponement'
        when vr.result = 'rejected' then 'rejection'
        when vr.result in ('tied', 'no_votes') then 'undecided'
      end as kind,
      case
        when r.agenda_item_id is not null then
          format('قرر المجلس إحالة «%s» إلى %s، للسبب: %s', t.title_ar, u.name_ar, r.reason)
        when ai.agenda_status = 'postponed' then
          format('قرر المجلس تأجيل «%s»، للسبب: %s', t.title_ar, coalesce(nullif(btrim(ai.discussion_notes), ''), 'لم يُذكر سبب.'))
        when vr.result = 'rejected' then
          format('قرر المجلس عدم الموافقة على «%s».', t.title_ar)
        when vr.result in ('tied', 'no_votes') then
          format('لم يحسم المجلس «%s»، ويبقى الموضوع في مرحلته من مساره.', t.title_ar)
      end as text
    from qarar_meetings.agenda_items ai
    join qarar_topics.topics t on t.id = ai.topic_id and t.organization_id = ai.organization_id
    left join qarar_meetings.agenda_item_referrals r on r.agenda_item_id = ai.id and r.organization_id = ai.organization_id
    left join qarar_core.governance_units u on u.id = r.to_unit_id and u.organization_id = r.organization_id
    left join lateral (
      select round.result from qarar_voting.voting_rounds round
      where round.agenda_item_id = ai.id and round.organization_id = ai.organization_id and round.status = 'closed'
      order by round.closed_at desc nulls last, round.round_number desc
      limit 1
    ) vr on true
    where ai.meeting_id = new.id and ai.organization_id = new.organization_id
      and not exists (
        select 1 from qarar_decisions.decisions d
        where d.organization_id = ai.organization_id and d.agenda_item_id = ai.id
      )
  ) o
  where o.kind is not null;
  perform qarar_decisions.record_meeting_outcome_decisions(new.id, v_outcomes);
  return null;
end;
$$;

create trigger meetings_record_outcome_decisions
after update of status on qarar_meetings.meetings
for each row execute function qarar_meetings.record_outcome_decisions_on_session_end();

-- 4. Approving and signing the minutes approves the meeting's decisions.
create function qarar_decisions.approve_meeting_decisions(p_meeting_id uuid, p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    update qarar_decisions.decisions
    set decision_status = 'approved', issued_at = coalesce(issued_at, clock_timestamp())
    where meeting_id = p_meeting_id and organization_id = p_organization_id
      and decision_status in ('draft', 'ready_for_approval')
    returning id
  loop
    perform qarar_audit.append_audit_log(p_organization_id, 'decisions.approve_with_minutes', 'decisions', v_id,
      jsonb_build_object('meeting_id', p_meeting_id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function qarar_minutes.approve_decisions_with_minutes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform qarar_decisions.approve_meeting_decisions(new.meeting_id, new.organization_id);
  end if;
  return null;
end;
$$;

create trigger meeting_minutes_approve_decisions
after update of status on qarar_minutes.meeting_minutes
for each row execute function qarar_minutes.approve_decisions_with_minutes();

-- 5. The assignment contract now names the follow-up person and the evidence rule.
-- Its only consumer is the live room, changed in the same batch.
drop function api_v2.propose_meeting_assignment_v2(uuid, text, text, uuid, uuid, date);
drop function qarar_meetings.propose_meeting_assignment(uuid, text, text, uuid, uuid, date);
drop function qarar_execution.create_meeting_action_item(uuid, uuid, uuid, text, text, uuid, uuid, date);
delete from qarar_architecture.api_contract_registry
where api_version = 'v2' and contract_name = 'propose_meeting_assignment_v2';
delete from qarar_architecture.function_registry
where function_name in ('propose_meeting_assignment', 'create_meeting_action_item');
delete from qarar_architecture.module_function_execute_allowlist
where source_module = 'meetings' and target_schema = 'qarar_execution' and function_name = 'create_meeting_action_item';

create function qarar_execution.create_meeting_action_item(
  p_assignment_id uuid, p_decision_id uuid, p_topic_id uuid, p_title text, p_description text,
  p_assigned_user_id uuid, p_assigned_unit_id uuid, p_due_date date,
  p_follow_up_user_id uuid, p_requires_evidence boolean
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
    organization_id, action_no, decision_id, topic_id, assigned_unit_id, assigned_user_id, follow_up_user_id,
    title_ar, description, due_date, meeting_assignment_id, requires_evidence
  ) values (
    v_org, v_no, p_decision_id, p_topic_id, p_assigned_unit_id, p_assigned_user_id, p_follow_up_user_id,
    p_title, p_description, p_due_date, p_assignment_id, coalesce(p_requires_evidence, false)
  ) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org, 'execution.action_item.create_from_meeting', 'action_items', v_id,
    jsonb_build_object('meeting_assignment_id', p_assignment_id, 'decision_id', p_decision_id, 'action_no', v_no));
  return jsonb_build_object('id', v_id, 'action_no', v_no, 'status', 'new');
end;
$$;

create or replace function qarar_meetings.issue_meeting_assignment(p_assignment_id uuid)
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
    a.assigned_user_id, a.assigned_unit_id, a.due_date, a.follow_up_user_id, a.requires_evidence);
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
  p_assigned_user_id uuid, p_assigned_unit_id uuid, p_due_date date,
  p_follow_up_user_id uuid, p_requires_evidence boolean
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
  if p_follow_up_user_id is null or not exists (
    select 1 from qarar_iam.users where id = p_follow_up_user_id and organization_id = v_item.organization_id and status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'اختر متابع التكليف من المستخدمين النشطين.';
  end if;
  if p_due_date is not null and p_due_date < current_date then
    raise exception using errcode = '22023', message = 'موعد الإنجاز لا يكون في الماضي.';
  end if;

  v_status := case when (v_ctx->>'chair')::boolean then 'active' else 'proposed' end;
  insert into qarar_meetings.meeting_assignments(
    organization_id, meeting_id, agenda_item_id, decision_id, title_ar, description,
    assigned_user_id, assigned_unit_id, due_date, status, proposed_by_user_id, issued_by_user_id, issued_at,
    follow_up_user_id, requires_evidence
  ) values (
    v_item.organization_id, v_item.meeting_id, v_item.id, v_decision.id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    p_assigned_user_id, p_assigned_unit_id, p_due_date, v_status, auth.uid(),
    case when v_status = 'active' then auth.uid() end, case when v_status = 'active' then clock_timestamp() end,
    p_follow_up_user_id, coalesce(p_requires_evidence, false)
  ) returning id into v_id;
  perform qarar_audit.append_audit_log(v_item.organization_id, 'meetings.assignment.propose', 'meeting_assignments', v_id,
    jsonb_build_object('meeting_id', v_item.meeting_id, 'agenda_item_id', v_item.id, 'decision_id', v_decision.id, 'status', v_status));
  if v_status = 'active' then
    v_task := qarar_meetings.issue_meeting_assignment(v_id);
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status, 'revision', 0, 'action_no', v_task->>'action_no');
end;
$$;

create or replace function qarar_meetings.list_meeting_assignments(p_meeting_id uuid)
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
        'follow_up_user_id', a.follow_up_user_id,
        'follow_up_user_name_ar', f.full_name_ar,
        'requires_evidence', a.requires_evidence,
        'due_date', a.due_date,
        'status', a.status,
        'revision', a.revision,
        'proposed_by_me', a.proposed_by_user_id = auth.uid(),
        'action_no', t.action_no,
        'action_status', t.status
      ) order by a.created_at)
      from qarar_meetings.meeting_assignments a
      left join qarar_iam.users u on u.id = a.assigned_user_id and u.organization_id = a.organization_id
      left join qarar_iam.users f on f.id = a.follow_up_user_id and f.organization_id = a.organization_id
      left join qarar_core.governance_units g on g.id = a.assigned_unit_id and g.organization_id = a.organization_id
      left join qarar_execution.action_items t on t.id = a.action_item_id and t.organization_id = a.organization_id
      where a.meeting_id = v_m.id and a.organization_id = v_m.organization_id
    ), '[]'::jsonb),
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

create function api_v2.propose_meeting_assignment_v2(
  p_agenda_item_id uuid, p_title text, p_description text, p_assigned_user_id uuid, p_assigned_unit_id uuid,
  p_due_date date, p_follow_up_user_id uuid, p_requires_evidence boolean
)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.propose_meeting_assignment($1, $2, $3, $4, $5, $6, $7, $8) $$;

-- 6. The minutes list each item's assignments.
create function qarar_meetings.minutes_assignment_lines(p_meeting_id uuid, p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'agenda_item_id', a.agenda_item_id,
    'title_ar', a.title_ar,
    'assignee_ar', coalesce(u.full_name_ar, g.name_ar),
    'follow_up_ar', f.full_name_ar,
    'due_date', a.due_date,
    'duration_days', a.due_date - m.scheduled_date,
    'requires_evidence', a.requires_evidence,
    'action_no', t.action_no
  ) order by a.created_at), '[]'::jsonb)
  from qarar_meetings.meeting_assignments a
  join qarar_meetings.meetings m on m.id = a.meeting_id and m.organization_id = a.organization_id
  left join qarar_iam.users u on u.id = a.assigned_user_id and u.organization_id = a.organization_id
  left join qarar_iam.users f on f.id = a.follow_up_user_id and f.organization_id = a.organization_id
  left join qarar_core.governance_units g on g.id = a.assigned_unit_id and g.organization_id = a.organization_id
  left join qarar_execution.action_items t on t.id = a.action_item_id and t.organization_id = a.organization_id
  where a.meeting_id = p_meeting_id and a.organization_id = p_organization_id
    and a.status = 'active' and coalesce(t.status, 'new') <> 'cancelled'
$$;

create or replace function qarar_minutes.generate_meeting_minutes_draft(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_content text;
  v_result jsonb;
  v_assignments jsonb;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();
  if v_m.id is null then
    raise exception 'الاجتماع غير موجود.' using errcode = 'P0002';
  end if;

  perform qarar_iam.assert_permission('meetings.manage', v_m.governance_unit_id);
  if v_m.status <> 'waiting_for_minutes' then
    raise exception 'لا يمكن توليد مسودة المحضر قبل انتهاء الجلسة.' using errcode = '23514';
  end if;

  v_assignments := qarar_meetings.minutes_assignment_lines(v_m.id, v_m.organization_id);

  v_content := concat_ws(E'\n',
    'محضر ' || v_m.title_ar,
    'رقم الاجتماع: ' || v_m.meeting_no,
    'التاريخ: ' || v_m.scheduled_date::text,
    'الوقت: ' || v_m.start_time::text || ' - ' || v_m.end_time::text,
    'المكان: ' || coalesce(v_m.location_details, v_m.location_type),
    '',
    'الحضور:',
    coalesce((
      select string_agg('- ' || u.full_name_ar || ' (' || ar.attendance_status || ')', E'\n' order by u.full_name_ar)
      from qarar_attendance.attendance_records ar
      join qarar_iam.users u on u.id = ar.user_id
      where ar.meeting_id = v_m.id
        and ar.attendance_status in ('present', 'late', 'remote')
    ), '- لا يوجد حضور موثق.'),
    '',
    'جدول الأعمال والقرارات:',
    coalesce((
      select string_agg(
        ai.agenda_order::text || '. ' || t.title_ar || E'\n' ||
        coalesce(nullif(ai.discussion_notes, ''), 'لم يسجل ملخص للمناقشة.') ||
        coalesce(E'\nالقرار ' || d.decision_no || ': ' || d.decision_text, '') ||
        coalesce((
          select string_agg(
            E'\n- تكليف: ' || (line->>'title_ar') ||
            '. المكلَّف: ' || coalesce(line->>'assignee_ar', 'غير محدد') ||
            '. المتابع: ' || coalesce(line->>'follow_up_ar', 'غير محدد') ||
            case
              when line->>'due_date' is null then '. بلا موعد إنجاز محدد'
              else '. المدة: ' || (line->>'duration_days') || ' يوماً، حتى ' || (line->>'due_date')
            end ||
            case when (line->>'requires_evidence')::boolean then '. يتطلب أدلة إنجاز' else '' end ||
            coalesce(' (' || (line->>'action_no') || ')', '') || '.',
            '' order by ord
          )
          from jsonb_array_elements(v_assignments) with ordinality as lines(line, ord)
          where line->>'agenda_item_id' = ai.id::text
        ), ''),
        E'\n\n' order by ai.agenda_order
      )
      from qarar_meetings.agenda_items ai
      join qarar_topics.topics t on t.id = ai.topic_id
      left join qarar_decisions.decisions d on d.agenda_item_id = ai.id
      where ai.meeting_id = v_m.id
    ), '- لا توجد بنود موثقة.')
  );

  v_result := qarar_minutes.save_meeting_minutes_draft(v_m.id, v_content, null);
  update qarar_minutes.meeting_minutes
     set status = 'generated', generated_by_ai = false, generated_at = clock_timestamp()
   where id = (v_result ->> 'id')::uuid;

  return v_result || jsonb_build_object('status', 'generated', 'content_draft', v_content);
end;
$$;

-- 7. The room reads each decision's kind.
create or replace function qarar_decisions.list_meeting_decisions(p_meeting_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'decision_no', d.decision_no,
    'agenda_item_id', d.agenda_item_id,
    'decision_text', d.decision_text,
    'decision_status', d.decision_status,
    'outcome_kind', d.outcome_kind,
    'requires_approval', d.requires_approval,
    'updated_at', d.updated_at,
    'can_edit_text', editor.allowed
      and m.status in ('in_progress', 'waiting_for_minutes')
      and d.decision_status in ('draft', 'under_review', 'ready_for_approval', 'approved')
  ) order by d.created_at), '[]'::jsonb)
  from qarar_decisions.decisions d
  join qarar_meetings.meetings m on m.id = d.meeting_id
  cross join lateral (
    select qarar_iam.has_unit_role_code(m.governance_unit_id, array['council_chair', 'council_rapporteur']) as allowed
  ) editor
  where d.meeting_id = p_meeting_id
    and d.organization_id = qarar_iam.current_organization_id()
    and (qarar_iam.is_system_admin() or qarar_iam.has_permission('decisions.read', m.governance_unit_id))
$$;

-- Ownership, privileges and registries.
alter function qarar_decisions.record_meeting_outcome_decisions(uuid, jsonb) owner to qarar_decisions_executor;
alter function qarar_meetings.record_outcome_decisions_on_session_end() owner to qarar_meetings_executor;
alter function qarar_decisions.approve_meeting_decisions(uuid, uuid) owner to qarar_decisions_executor;
alter function qarar_minutes.approve_decisions_with_minutes() owner to qarar_minutes_executor;
alter function qarar_execution.create_meeting_action_item(uuid, uuid, uuid, text, text, uuid, uuid, date, uuid, boolean) owner to qarar_execution_executor;
alter function qarar_meetings.propose_meeting_assignment(uuid, text, text, uuid, uuid, date, uuid, boolean) owner to qarar_meetings_executor;
alter function qarar_meetings.minutes_assignment_lines(uuid, uuid) owner to qarar_meetings_executor;
alter function api_v2.propose_meeting_assignment_v2(uuid, text, text, uuid, uuid, date, uuid, boolean) owner to qarar_api_executor;
revoke all on function
  qarar_decisions.record_meeting_outcome_decisions(uuid, jsonb),
  qarar_meetings.record_outcome_decisions_on_session_end(),
  qarar_decisions.approve_meeting_decisions(uuid, uuid),
  qarar_minutes.approve_decisions_with_minutes(),
  qarar_execution.create_meeting_action_item(uuid, uuid, uuid, text, text, uuid, uuid, date, uuid, boolean),
  qarar_meetings.propose_meeting_assignment(uuid, text, text, uuid, uuid, date, uuid, boolean),
  qarar_meetings.minutes_assignment_lines(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function api_v2.propose_meeting_assignment_v2(uuid, text, text, uuid, uuid, date, uuid, boolean) from public, anon, service_role;
grant usage on schema qarar_decisions to qarar_meetings_executor, qarar_minutes_executor;
grant usage on schema qarar_meetings to qarar_minutes_executor;
grant execute on function qarar_decisions.record_meeting_outcome_decisions(uuid, jsonb) to qarar_meetings_executor;
grant execute on function qarar_decisions.approve_meeting_decisions(uuid, uuid) to qarar_minutes_executor;
grant execute on function qarar_meetings.minutes_assignment_lines(uuid, uuid) to qarar_minutes_executor;
grant execute on function qarar_execution.create_meeting_action_item(uuid, uuid, uuid, text, text, uuid, uuid, date, uuid, boolean) to qarar_meetings_executor;
grant execute on function qarar_meetings.propose_meeting_assignment(uuid, text, text, uuid, uuid, date, uuid, boolean) to qarar_api_executor;
grant execute on function api_v2.propose_meeting_assignment_v2(uuid, text, text, uuid, uuid, date, uuid, boolean) to authenticated;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), r.module_code, n.nspname, false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join (values
  ('qarar_decisions', 'record_meeting_outcome_decisions', 'decisions'),
  ('qarar_meetings', 'record_outcome_decisions_on_session_end', 'meetings'),
  ('qarar_decisions', 'approve_meeting_decisions', 'decisions'),
  ('qarar_minutes', 'approve_decisions_with_minutes', 'minutes'),
  ('qarar_execution', 'create_meeting_action_item', 'execution'),
  ('qarar_meetings', 'propose_meeting_assignment', 'meetings'),
  ('qarar_meetings', 'minutes_assignment_lines', 'meetings')
) r(schema_name, function_name, module_code) on r.schema_name = n.nspname and r.function_name = p.proname
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

-- create or replace keeps an oid, but refresh the rows of every redefined function.
update qarar_architecture.function_registry r
set function_oid = p.oid
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where r.function_name = p.proname and r.owning_schema = n.nspname
  and r.identity_arguments = pg_get_function_identity_arguments(p.oid)
  and p.proname in ('issue_meeting_assignment', 'list_meeting_assignments', 'generate_meeting_minutes_draft', 'list_meeting_decisions');

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v2', p.proname, 'qarar_meetings', 'propose_meeting_assignment', pg_get_function_identity_arguments(p.oid), 'meetings', 'authenticated'
from pg_proc p
where p.pronamespace = 'api_v2'::regnamespace and p.proname = 'propose_meeting_assignment_v2';

insert into qarar_architecture.module_function_execute_allowlist(source_module, target_schema, function_name, identity_arguments, rationale) values
  ('meetings', 'qarar_decisions', 'record_meeting_outcome_decisions', 'p_meeting_id uuid, p_outcomes jsonb',
   'Ending the session records a numbered decision for every closed agenda item'),
  ('minutes', 'qarar_decisions', 'approve_meeting_decisions', 'p_meeting_id uuid, p_organization_id uuid',
   'Approving and signing the minutes approves the meeting''s decisions'),
  ('minutes', 'qarar_meetings', 'minutes_assignment_lines', 'p_meeting_id uuid, p_organization_id uuid',
   'The minutes list the assignments issued in the session'),
  ('meetings', 'qarar_execution', 'create_meeting_action_item',
   'p_assignment_id uuid, p_decision_id uuid, p_topic_id uuid, p_title text, p_description text, p_assigned_user_id uuid, p_assigned_unit_id uuid, p_due_date date, p_follow_up_user_id uuid, p_requires_evidence boolean',
   'The council chair issues an execution task during the session')
on conflict do nothing;

-- 8. Repair: meetings whose minutes were already approved and signed have their
-- decisions approved once (idempotent; only decisions still awaiting approval).
do $$
declare
  v_minutes record;
begin
  for v_minutes in
    select distinct mm.meeting_id, mm.organization_id
    from qarar_minutes.meeting_minutes mm
    join qarar_decisions.decisions d on d.meeting_id = mm.meeting_id and d.organization_id = mm.organization_id
    where mm.status = 'approved' and d.decision_status in ('draft', 'ready_for_approval')
  loop
    perform qarar_decisions.approve_meeting_decisions(v_minutes.meeting_id, v_minutes.organization_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
