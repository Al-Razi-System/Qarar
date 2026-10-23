-- Hardens the decision text edit of 20261010020000 (docs/engineering/impact/DECISION_TEXT_EDIT_AR.md):
-- 1. Only the council's chair or rapporteur, by an active membership in that
--    council, may edit. A system administrator or an organization-wide
--    permission alone is not enough.
-- 2. Editing a decision and submitting the minutes take the same per-meeting
--    advisory lock, so a text cannot change while the minutes leave for approval.
-- 3. The minutes cannot be submitted unless they carry the current text of every
--    decision of the meeting; get_meeting_minutes returns those texts so the
--    screen can say so before the attempt.
begin;

create or replace function qarar_decisions.update_meeting_decision_text(
  p_decision_id uuid,
  p_decision_text text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_decision qarar_decisions.decisions%rowtype;
  v_meeting qarar_meetings.meetings%rowtype;
  v_meeting_id uuid;
  v_text text := btrim(coalesce(p_decision_text, ''));
begin
  if char_length(v_text) < 10 then
    raise exception 'يجب ألا يقل نص القرار عن 10 أحرف.' using errcode = '22023';
  end if;

  select meeting_id into v_meeting_id
  from qarar_decisions.decisions
  where id = p_decision_id
    and organization_id = qarar_iam.current_organization_id();

  if not found then
    raise exception 'القرار غير موجود.' using errcode = 'P0002';
  end if;
  if v_meeting_id is null then
    raise exception 'هذا القرار لم يصدر من اجتماع، فلا يُعدَّل من هنا.' using errcode = '23514';
  end if;

  -- Same key as the minutes submission command. Taken before any check so the
  -- meeting status read below cannot go stale before the write.
  perform pg_advisory_xact_lock(hashtextextended('meeting-minutes-sync:' || v_meeting_id::text, 0));

  select * into v_decision
  from qarar_decisions.decisions
  where id = p_decision_id
    and organization_id = qarar_iam.current_organization_id()
  for update;

  select * into v_meeting
  from qarar_meetings.meetings
  where id = v_decision.meeting_id
    and organization_id = v_decision.organization_id;

  if not qarar_iam.has_unit_role_code(v_meeting.governance_unit_id, array['council_chair', 'council_rapporteur']) then
    raise exception 'تعديل نص القرار من اختصاص رئيس المجلس أو مقرره.' using errcode = '42501';
  end if;

  if v_meeting.status = 'waiting_for_approval' then
    raise exception 'المحضر معروض للمصادقة، فلا يُعدَّل القرار إلا بعد إعادة المحضر للتعديل.' using errcode = '23514';
  elsif v_meeting.status in ('closed', 'archived') then
    raise exception 'اعتُمد محضر الاجتماع، فأصبح نص القرار نهائياً.' using errcode = '23514';
  elsif v_meeting.status not in ('in_progress', 'waiting_for_minutes') then
    raise exception 'لا يُعدَّل القرار في هذه المرحلة من الاجتماع.' using errcode = '23514';
  end if;

  if v_decision.decision_status not in ('draft', 'under_review', 'ready_for_approval', 'approved') then
    raise exception 'دخل القرار مرحلة التنفيذ، فلا يُعدَّل نصه.' using errcode = '23514';
  end if;

  if p_expected_updated_at is null or p_expected_updated_at <> v_decision.updated_at then
    raise exception 'عُدِّل القرار من مستخدم آخر؛ أعد التحميل ثم أعد المحاولة.' using errcode = '40001';
  end if;

  if v_text = v_decision.decision_text then
    return jsonb_build_object(
      'id', v_decision.id,
      'decision_no', v_decision.decision_no,
      'decision_status', v_decision.decision_status,
      'decision_text', v_decision.decision_text,
      'updated_at', v_decision.updated_at,
      'changed', false,
      'meeting_status', v_meeting.status
    );
  end if;

  update qarar_decisions.decisions
  set decision_text = v_text
  where id = v_decision.id
  returning updated_at into v_decision.updated_at;

  perform qarar_audit.append_audit_log(
    v_decision.organization_id,
    'decision.text_update',
    'decisions',
    v_decision.id,
    jsonb_build_object(
      'meeting_id', v_meeting.id,
      'agenda_item_id', v_decision.agenda_item_id,
      'meeting_status', v_meeting.status,
      'previous_text', v_decision.decision_text
    )
  );

  return jsonb_build_object(
    'id', v_decision.id,
    'decision_no', v_decision.decision_no,
    'decision_status', v_decision.decision_status,
    'decision_text', v_text,
    'updated_at', v_decision.updated_at,
    'changed', true,
    'meeting_status', v_meeting.status
  );
end
$function$;

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

grant execute on function qarar_iam.has_unit_role_code(uuid, text[]) to qarar_decisions_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module, target_schema, function_name, identity_arguments, rationale)
values ('decisions', 'qarar_iam', 'has_unit_role_code', 'target_unit_id uuid, role_codes text[]',
  'Only the council chair or rapporteur may edit a decision text')
on conflict do nothing;

CREATE OR REPLACE FUNCTION qarar_minutes.submit_meeting_minutes(p_meeting_id uuid, p_content_final text, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_m qarar_meetings.meetings%rowtype; v_min qarar_minutes.meeting_minutes%rowtype; v_rule text; v_count int; v_stale text;
begin
  if char_length(btrim(coalesce(p_content_final,''))) < 20 then raise exception 'يجب ألا يقل النص النهائي للمحضر عن 20 حرفًا.' using errcode='22023'; end if;
  select * into v_m from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002'; end if;
  perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
  -- Same key as the decision text edit command: a decision text cannot change
  -- between the check below and the minutes leaving for approval.
  perform pg_advisory_xact_lock(hashtextextended('meeting-minutes-sync:' || v_m.id::text, 0));
  if v_m.status <> 'waiting_for_minutes' then raise exception 'الاجتماع ليس في مرحلة إعداد المحضر.' using errcode='23514'; end if;
  select * into v_min from qarar_minutes.meeting_minutes where meeting_id=v_m.id for update;
  if v_min.id is null then raise exception 'احفظ مسودة المحضر أولًا.' using errcode='23514'; end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_min.updated_at then raise exception 'تم تحديث المحضر؛ أعد تحميله.' using errcode='40001'; end if;
  -- The attendees certify this text, so it must carry every decision as it stands now.
  select string_agg(d.decision_no, '، ' order by d.decision_no) into v_stale
  from qarar_decisions.decisions d
  where d.meeting_id=v_m.id and d.organization_id=v_m.organization_id
    and strpos(btrim(p_content_final), d.decision_text)=0;
  if v_stale is not null then
    raise exception 'نص القرار % في المحضر لا يطابق نصه الحالي؛ أعد توليد المسودة أو حدّث النص قبل الإرسال للمصادقة.', v_stale using errcode='23514';
  end if;

  update qarar_minutes.meeting_minutes set content_final=btrim(p_content_final),status='ready_for_approval',
    reviewed_by_user_id=auth.uid(),reviewed_at=clock_timestamp() where id=v_min.id returning * into v_min;

  select minute_approval_rule into v_rule from qarar_core.governance_units where id=v_m.governance_unit_id;
  if v_rule='all_present_members' then
    insert into qarar_minutes.minute_approvals(organization_id,minute_id,user_id,membership_id)
    select v_m.organization_id,v_min.id,a.user_id,a.membership_id from qarar_attendance.attendance_records a
    where a.meeting_id=v_m.id and a.attendance_status in('present','late')
    on conflict(minute_id,user_id) do nothing;
  else
    insert into qarar_minutes.minute_approvals(organization_id,minute_id,user_id,membership_id)
    select v_m.organization_id,v_min.id,ms.user_id,ms.id from qarar_iam.memberships ms join qarar_iam.roles r on r.id=ms.role_id
    where ms.governance_unit_id=v_m.governance_unit_id and ms.membership_status='active'
      and ms.start_date<=current_date and (ms.end_date is null or ms.end_date>=current_date)
      and r.code in('council_chair','council_rapporteur')
    on conflict(minute_id,user_id) do nothing;
  end if;
  select count(*) into v_count from qarar_minutes.minute_approvals where minute_id=v_min.id;
  if v_count=0 then raise exception 'لا يوجد مصادقون فعّالون للمحضر؛ تحقق من قيادة المجلس أو قاعدة المصادقة.' using errcode='23514'; end if;
  update qarar_meetings.meetings set status='waiting_for_approval' where id=v_m.id;
  insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
  values(v_m.organization_id,v_m.id,v_m.status,'waiting_for_approval',auth.uid(),'إحالة المحضر للمصادقة');
  perform qarar_audit.append_audit_log(v_m.organization_id,'minutes.submit','meeting_minutes',v_min.id,jsonb_build_object('approvers',v_count));
  return jsonb_build_object('id',v_min.id,'status','ready_for_approval','approvers',v_count);
end $function$;

CREATE OR REPLACE FUNCTION qarar_minutes.get_meeting_minutes(p_meeting_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_can_view boolean;
  v_can_edit boolean;
  v_decisions jsonb;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();

  if v_m.id is null then
    raise exception 'الاجتماع غير موجود.' using errcode = 'P0002';
  end if;

  v_can_edit := qarar_attendance.can_operate_live_meeting(v_m.id);
  v_can_view := v_can_edit
    or qarar_iam.is_system_admin()
    or exists (
      select 1
      from qarar_attendance.attendance_records a
      where a.meeting_id = v_m.id
        and a.user_id = auth.uid()
    );

  if not v_can_view then
    raise exception 'المحضر متاح لأعضاء الاجتماع فقط.' using errcode = '42501';
  end if;

  -- The current text of each decision, so the minutes screen can tell when the
  -- draft no longer carries it and block submission with the reason.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'decision_no', d.decision_no,
    'agenda_item_id', d.agenda_item_id,
    'decision_text', d.decision_text
  ) order by d.created_at), '[]'::jsonb) into v_decisions
  from qarar_decisions.decisions d
  where d.meeting_id = v_m.id
    and d.organization_id = v_m.organization_id;

  return coalesce((
    select to_jsonb(mm) - 'organization_id' || jsonb_build_object(
      'viewer_can_edit', v_can_edit,
      'decisions', v_decisions,
      'approvals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ma.id,
          'user_id', ma.user_id,
          'name_ar', u.full_name_ar,
          'approval_status', ma.approval_status,
          'notes', ma.notes,
          'resolved_at', ma.resolved_at,
          'updated_at', ma.updated_at,
          'signed_at', ma.signed_at,
          'has_signature', ma.signature_hash is not null,
          'signature_strokes', case
            when mm.status = 'approved' and ma.approval_status = 'approved' then ma.signature_strokes
            else null
          end,
          'can_respond', ma.user_id = auth.uid() and ma.approval_status = 'pending'
        ) order by u.full_name_ar, ma.created_at)
        from qarar_minutes.minute_approvals ma
        join qarar_iam.users u on u.id = ma.user_id
        where ma.minute_id = mm.id
      ), '[]'::jsonb)
    )
    from qarar_minutes.meeting_minutes mm
    where mm.meeting_id = v_m.id
  ), jsonb_build_object(
    'meeting_id', v_m.id,
    'status', 'draft',
    'viewer_can_edit', v_can_edit,
    'decisions', v_decisions,
    'approvals', '[]'::jsonb
  ));
end;
$function$;

select pg_notify('pgrst', 'reload schema');

commit;
