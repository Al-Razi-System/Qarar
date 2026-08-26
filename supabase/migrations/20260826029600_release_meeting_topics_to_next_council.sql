begin;

grant usage on schema qarar_minutes, qarar_decisions, qarar_core
  to qarar_meetings_executor;

grant select on qarar_minutes.meeting_minutes,
  qarar_decisions.decisions,
  qarar_core.governance_units
to qarar_meetings_executor;

create or replace function qarar_meetings.release_approved_agenda_topics_after_minutes(
  p_meeting_id uuid,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_meeting qarar_meetings.meetings%rowtype;
  v_minutes qarar_minutes.meeting_minutes%rowtype;
  v_item record;
  v_released integer := 0;
  v_rejected integer := 0;
  v_skipped integer := 0;
  v_reason text;
begin
  select *
    into v_meeting
  from qarar_meetings.meetings
  where id = p_meeting_id
  for update;

  if v_meeting.id is null then
    raise exception 'الاجتماع غير موجود.' using errcode = 'P0002';
  end if;

  select *
    into v_minutes
  from qarar_minutes.meeting_minutes
  where meeting_id = v_meeting.id
    and organization_id = v_meeting.organization_id
    and status = 'approved'
  order by approved_at desc nulls last, updated_at desc
  limit 1;

  if v_minutes.id is null then
    return jsonb_build_object(
      'meeting_id', v_meeting.id,
      'released', 0,
      'rejected', 0,
      'skipped', 0,
      'reason', 'minutes_not_approved'
    );
  end if;

  for v_item in
    select
      ai.id as agenda_item_id,
      ai.agenda_order,
      ai.agenda_status,
      ai.voting_result,
      ai.topic_status_before_listing,
      t.id as topic_id,
      t.status as topic_status,
      t.current_unit_id,
      d.id as decision_id,
      d.decision_no,
      target_unit.name_ar as target_unit_name_ar
    from qarar_meetings.agenda_items ai
    join qarar_topics.topics t on t.id = ai.topic_id
    left join qarar_decisions.decisions d
      on d.organization_id = ai.organization_id
     and d.agenda_item_id = ai.id
    left join qarar_core.governance_units target_unit on target_unit.id = t.current_unit_id
    where ai.meeting_id = v_meeting.id
      and ai.organization_id = v_meeting.organization_id
    order by ai.agenda_order
  loop
    if exists (
      select 1
      from qarar_meetings.agenda_items next_ai
      join qarar_meetings.meetings next_m on next_m.id = next_ai.meeting_id
      where next_ai.topic_id = v_item.topic_id
        and next_ai.meeting_id <> v_meeting.id
        and next_m.status in (
          'draft',
          'scheduled',
          'ready_to_start',
          'in_progress',
          'waiting_for_minutes',
          'waiting_for_approval'
        )
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_item.agenda_status = 'discussed'
       and v_item.voting_result = 'approved'
       and v_item.topic_status = 'listed'
       and v_item.current_unit_id is not null
       and v_item.current_unit_id is distinct from v_meeting.governance_unit_id then
      v_reason := 'إتاحة الموضوع للمجلس التالي بعد اعتماد محضر ' || coalesce(v_meeting.meeting_no, v_meeting.id::text);
      if v_item.decision_no is not null then
        v_reason := v_reason || ' وصدور القرار ' || v_item.decision_no;
      end if;

      update qarar_topics.topics
         set status = 'approved',
             routing_decision_id = coalesce(v_item.decision_id, routing_decision_id),
             updated_at = clock_timestamp()
       where id = v_item.topic_id
         and status = 'listed';

      if found then
        insert into qarar_topics.topic_status_history(
          organization_id,
          topic_id,
          from_status,
          to_status,
          changed_by_user_id,
          change_reason
        ) values (
          v_meeting.organization_id,
          v_item.topic_id,
          'listed',
          'approved',
          p_actor_user_id,
          v_reason
        );
        v_released := v_released + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    elsif v_item.agenda_status = 'discussed'
          and v_item.voting_result = 'rejected'
          and v_item.topic_status = 'listed' then
      v_reason := 'إغلاق الموضوع بالرفض بعد اعتماد محضر ' || coalesce(v_meeting.meeting_no, v_meeting.id::text);

      update qarar_topics.topics
         set status = 'rejected',
             updated_at = clock_timestamp()
       where id = v_item.topic_id
         and status = 'listed';

      if found then
        insert into qarar_topics.topic_status_history(
          organization_id,
          topic_id,
          from_status,
          to_status,
          changed_by_user_id,
          change_reason
        ) values (
          v_meeting.organization_id,
          v_item.topic_id,
          'listed',
          'rejected',
          p_actor_user_id,
          v_reason
        );
        v_rejected := v_rejected + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  if v_released > 0 or v_rejected > 0 then
    perform qarar_audit.append_audit_log(
      v_meeting.organization_id,
      'meeting.topics.release_after_minutes',
      'meetings',
      v_meeting.id,
      jsonb_build_object(
        'minute_id', v_minutes.id,
        'released', v_released,
        'rejected', v_rejected,
        'skipped', v_skipped
      )
    );
  end if;

  return jsonb_build_object(
    'meeting_id', v_meeting.id,
    'minute_id', v_minutes.id,
    'released', v_released,
    'rejected', v_rejected,
    'skipped', v_skipped
  );
end
$function$;

alter function qarar_meetings.release_approved_agenda_topics_after_minutes(uuid, uuid)
  owner to qarar_meetings_executor;
revoke all on function qarar_meetings.release_approved_agenda_topics_after_minutes(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_meetings.release_approved_agenda_topics_after_minutes(uuid, uuid)
  to qarar_meetings_executor, qarar_minutes_executor;

create or replace function qarar_minutes.sign_meeting_minutes_approval(
  p_approval_id uuid,
  p_signature_strokes jsonb,
  p_expected_updated_at timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_a qarar_minutes.minute_approvals%rowtype;
  v_min qarar_minutes.meeting_minutes%rowtype;
  v_pending int;
  v_signature_hash text;
  v_release_result jsonb := null;
begin
  if p_signature_strokes is null or jsonb_typeof(p_signature_strokes) <> 'array' or jsonb_array_length(p_signature_strokes) < 1 then
    raise exception 'ارسم توقيعك داخل المربع قبل المصادقة.' using errcode = '22023';
  end if;
  if length(p_signature_strokes::text) > 150000 then
    raise exception 'بيانات التوقيع أكبر من الحد المسموح.' using errcode = '22023';
  end if;

  select *
    into v_a
  from qarar_minutes.minute_approvals
  where id = p_approval_id
    and organization_id = qarar_iam.current_organization_id()
  for update;

  if v_a.id is null or v_a.user_id <> auth.uid() then
    raise exception 'طلب المصادقة غير متاح لهذا المستخدم.' using errcode = '42501';
  end if;
  if v_a.approval_status <> 'pending' then
    raise exception 'تم حسم طلب المصادقة مسبقًا.' using errcode = '23514';
  end if;
  if p_expected_updated_at is null or p_expected_updated_at <> v_a.updated_at then
    raise exception 'تم تحديث طلب المصادقة؛ أعد التحميل.' using errcode = '40001';
  end if;

  select *
    into v_min
  from qarar_minutes.meeting_minutes
  where id = v_a.minute_id
  for update;

  if v_min.status <> 'ready_for_approval' or v_min.final_content_hash is null then
    raise exception 'نسخة المحضر النهائية غير متاحة للمصادقة.' using errcode = '23514';
  end if;

  v_signature_hash := encode(extensions.digest(convert_to(p_signature_strokes::text || v_min.final_content_hash || auth.uid()::text, 'UTF8'), 'sha256'), 'hex');

  update qarar_minutes.minute_approvals
     set approval_status = 'approved',
         signature_strokes = p_signature_strokes,
         signature_hash = v_signature_hash,
         signed_content_hash = v_min.final_content_hash,
         signed_at = clock_timestamp(),
         resolved_at = clock_timestamp(),
         notes = null
   where id = v_a.id;

  select count(*)
    into v_pending
  from qarar_minutes.minute_approvals
  where minute_id = v_min.id
    and approval_status <> 'approved';

  if v_pending = 0 then
    update qarar_minutes.meeting_minutes
       set status = 'approved',
           approved_at = clock_timestamp()
     where id = v_min.id;

    update qarar_meetings.meetings
       set status = 'closed'
     where id = v_min.meeting_id;

    insert into qarar_meetings.meeting_status_history(
      organization_id,
      meeting_id,
      from_status,
      to_status,
      changed_by_user_id,
      change_reason
    ) values (
      v_a.organization_id,
      v_min.meeting_id,
      'waiting_for_approval',
      'closed',
      auth.uid(),
      'اكتمال توقيعات جميع الحاضرين على المحضر النهائي'
    );

    v_release_result := qarar_meetings.release_approved_agenda_topics_after_minutes(v_min.meeting_id, auth.uid());
  end if;

  perform qarar_audit.append_audit_log(
    v_a.organization_id,
    'minutes.approval.sign',
    'minute_approvals',
    v_a.id,
    jsonb_build_object(
      'minute_id', v_min.id,
      'content_hash', v_min.final_content_hash,
      'signature_hash', v_signature_hash,
      'topic_release', v_release_result
    )
  );

  return jsonb_build_object(
    'approval_id', v_a.id,
    'decision', 'approve',
    'remaining', v_pending,
    'meeting_closed', v_pending = 0,
    'topic_release', v_release_result
  );
end
$function$;

alter function qarar_minutes.sign_meeting_minutes_approval(uuid, jsonb, timestamp with time zone)
  owner to qarar_minutes_executor;
revoke all on function qarar_minutes.sign_meeting_minutes_approval(uuid, jsonb, timestamp with time zone)
  from public, anon, authenticated, service_role;
grant execute on function qarar_minutes.sign_meeting_minutes_approval(uuid, jsonb, timestamp with time zone)
  to qarar_api_executor, qarar_minutes_executor;

create or replace function qarar_meetings.search_eligible_agenda_topics(
  p_meeting_id uuid,
  p_query text default null::text,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'qarar_meetings'
as $function$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  select *
    into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();

  if v_m.id is null then
    raise exception using errcode = 'P0002', message = 'الاجتماع غير موجود.';
  end if;

  perform qarar_iam.assert_permission('agenda.manage', v_m.governance_unit_id);

  if v_m.status not in ('draft', 'scheduled') then
    return jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'locked', true,
      'limit', v_limit,
      'offset', v_offset
    );
  end if;

  return (
    with eligible as (
      select
        t.id,
        t.topic_no,
        t.title_ar,
        t.priority,
        t.status,
        t.updated_at,
        t.created_at,
        s.snapshot->>'name_ar' as step_name,
        s.snapshot->>'responsibility' as responsibility,
        source_context.source_meeting_no,
        source_context.source_meeting_title_ar,
        source_context.source_unit_name_ar,
        source_context.source_decision_no,
        source_context.source_decision_text,
        source_context.source_decision_status,
        source_context.source_minutes_status,
        source_context.source_minutes_approved_at
      from qarar_topics.topics t
      left join qarar_governance.workflow_instance_steps s
        on s.id = t.current_workflow_step_id
       and s.workflow_instance_id = t.workflow_instance_id
       and s.status = 'active'
      left join lateral (
        select
          source_m.meeting_no as source_meeting_no,
          source_m.title_ar as source_meeting_title_ar,
          source_unit.name_ar as source_unit_name_ar,
          d.decision_no as source_decision_no,
          d.decision_text as source_decision_text,
          d.decision_status as source_decision_status,
          source_minutes.status as source_minutes_status,
          source_minutes.approved_at as source_minutes_approved_at
        from qarar_decisions.decisions d
        join qarar_meetings.meetings source_m on source_m.id = d.meeting_id
        left join qarar_core.governance_units source_unit on source_unit.id = source_m.governance_unit_id
        left join lateral (
          select mm.status, mm.approved_at
          from qarar_minutes.meeting_minutes mm
          where mm.meeting_id = source_m.id
            and mm.organization_id = source_m.organization_id
          order by mm.approved_at desc nulls last, mm.updated_at desc
          limit 1
        ) source_minutes on true
        where d.topic_id = t.id
          and d.organization_id = t.organization_id
          and d.meeting_id <> v_m.id
        order by coalesce(source_minutes.approved_at, d.issued_at, d.created_at) desc
        limit 1
      ) source_context on true
      where t.organization_id = v_m.organization_id
        and t.current_unit_id = v_m.governance_unit_id
        and not exists (
          select 1
          from qarar_meetings.agenda_items ai
          where ai.meeting_id = v_m.id
            and ai.topic_id = t.id
        )
        and (
          (t.governance_source = 'legacy' and t.status = 'approved')
          or (
            coalesce(t.governance_source, '') <> 'legacy'
            and t.status in ('new', 'under_review', 'approved')
            and t.routing_status = 'routing_ready'
            and t.workflow_instance_id is not null
            and t.current_workflow_step_id is not null
            and s.assigned_unit_id = v_m.governance_unit_id
            and s.snapshot->>'responsibility' in (
              'present',
              'discuss',
              'recommend',
              'initial_approve',
              'final_approve'
            )
          )
        )
        and (
          nullif(btrim(p_query), '') is null
          or t.topic_no ilike '%' || btrim(p_query) || '%'
          or t.title_ar ilike '%' || btrim(p_query) || '%'
          or source_context.source_decision_no ilike '%' || btrim(p_query) || '%'
          or source_context.source_meeting_no ilike '%' || btrim(p_query) || '%'
        )
    ), paged as (
      select *
      from eligible
      order by created_at desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'topic_no', p.topic_no,
          'title_ar', p.title_ar,
          'priority', p.priority,
          'status', p.status,
          'updated_at', p.updated_at,
          'current_step', p.step_name,
          'responsibility', p.responsibility,
          'source_meeting_no', p.source_meeting_no,
          'source_meeting_title_ar', p.source_meeting_title_ar,
          'source_unit_name_ar', p.source_unit_name_ar,
          'source_decision_no', p.source_decision_no,
          'source_decision_text', p.source_decision_text,
          'source_decision_status', p.source_decision_status,
          'source_minutes_status', p.source_minutes_status,
          'source_minutes_approved_at', p.source_minutes_approved_at
        ) order by p.created_at desc)
        from paged p
      ), '[]'::jsonb),
      'total', (select count(*) from eligible),
      'locked', false,
      'limit', v_limit,
      'offset', v_offset
    )
  );
end;
$function$;

alter function qarar_meetings.search_eligible_agenda_topics(uuid, text, integer, integer)
  owner to qarar_meetings_executor;

revoke all on function qarar_meetings.search_eligible_agenda_topics(uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function qarar_meetings.search_eligible_agenda_topics(uuid, text, integer, integer)
  to qarar_api_executor, qarar_meetings_executor;

do $$
declare
  v_closed_meeting record;
begin
  for v_closed_meeting in
    select distinct m.id
    from qarar_meetings.meetings m
    join qarar_minutes.meeting_minutes mm
      on mm.meeting_id = m.id
     and mm.organization_id = m.organization_id
    where m.status = 'closed'
      and mm.status = 'approved'
  loop
    perform qarar_meetings.release_approved_agenda_topics_after_minutes(v_closed_meeting.id, null);
  end loop;
end
$$;

commit;
