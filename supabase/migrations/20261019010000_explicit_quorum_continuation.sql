-- Explicit product-owner decision, 19 October 2026.
-- Impact: docs/engineering/impact/LIVE_ROOM_QUORUM_FLOW_20261019_AR.md
begin;
alter table qarar_meetings.meetings add column quorum_continuation jsonb;
comment on column qarar_meetings.meetings.quorum_continuation is 'Immutable chair authorization and quorum snapshot; never means that quorum was met.';
alter table qarar_meetings.meetings add constraint quorum_continuation_shape check (
 quorum_continuation is null or (
  jsonb_typeof(quorum_continuation)='object' and quorum_continuation ?& array['authorized_by','authorized_at','reason','quorum']
  and char_length(btrim(quorum_continuation->>'reason')) between 5 and 2000
  and quorum_continuation#>>'{quorum,quorum_status}'='not_met'
 )
);
create function qarar_meetings.guard_quorum_continuation() returns trigger
language plpgsql set search_path=pg_catalog as $guard$
begin
 if new.quorum_continuation is distinct from old.quorum_continuation then
  if old.quorum_continuation is not null then
   raise exception 'لا يمكن محو أو استبدال قرار المتابعة المسجل.' using errcode='23514';
  end if;
  if old.status<>'in_progress' or old.attendance_locked_at is null
     or old.quorum_status<>'not_met'
     or not qarar_iam.has_unit_role_code(old.governance_unit_id,array['council_chair'])
     or new.quorum_continuation->>'authorized_by' is distinct from auth.uid()::text then
   raise exception 'قرار متابعة الاجتماع دون النصاب يتطلب رئيس المجلس وحضورًا مثبتًا.' using errcode='42501';
  end if;
 end if;
 return new;
end $guard$;
revoke all on function qarar_meetings.guard_quorum_continuation() from public,anon,authenticated;
create trigger guard_quorum_continuation before update on qarar_meetings.meetings
for each row execute function qarar_meetings.guard_quorum_continuation();

CREATE OR REPLACE FUNCTION qarar_voting.open_voting_round(p_agenda_item_id uuid, p_expected_meeting_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ai qarar_meetings.agenda_items%rowtype;v_m qarar_meetings.meetings%rowtype;v_round uuid;v_no int;v_count int;
begin
 select * into v_ai from qarar_meetings.agenda_items where id=p_agenda_item_id
 and organization_id=qarar_iam.current_organization_id() for update;
 if v_ai.id is null then raise exception 'agenda item not found' using errcode='P0002'; end if;
 select * into v_m from qarar_meetings.meetings where id=v_ai.meeting_id for update;
 perform qarar_iam.assert_permission('voting.manage',v_m.governance_unit_id);
 if v_m.status<>'in_progress' then raise exception 'meeting must be in_progress'; end if;
 if v_m.attendance_locked_at is null then raise exception 'attendance roster must be locked before voting'; end if;
 if v_m.quorum_status<>'met' and v_m.quorum_continuation is null then raise exception 'quorum must be met before voting'; end if;
 if p_expected_meeting_updated_at is null or p_expected_meeting_updated_at<>v_m.updated_at then
  raise exception 'meeting was modified; refresh before opening vote' using errcode='40001'; end if;
 if exists(select 1 from qarar_voting.voting_rounds where meeting_id=v_m.id and status='open')
 then raise exception 'a voting round is already open for this meeting'; end if;
 select coalesce(max(round_number),0)+1 into v_no from qarar_voting.voting_rounds where agenda_item_id=v_ai.id;
 select count(*) into v_count from qarar_attendance.attendance_records a
 join qarar_iam.memberships ms on ms.id=a.membership_id and ms.membership_status='active'
 where a.meeting_id=v_m.id and a.attendance_status in('present','late')
 and a.verification_status='verified';
 if v_count=0 then raise exception 'no eligible verified members for voting'; end if;
 insert into qarar_voting.voting_rounds(organization_id,meeting_id,agenda_item_id,round_number,
  eligible_voter_count,opened_by_user_id)
 values(v_m.organization_id,v_m.id,v_ai.id,v_no,v_count,auth.uid()) returning id into v_round;
 insert into qarar_voting.voting_eligible_members(organization_id,voting_round_id,user_id,membership_id)
 select v_m.organization_id,v_round,a.user_id,a.membership_id from qarar_attendance.attendance_records a
 join qarar_iam.memberships ms on ms.id=a.membership_id and ms.membership_status='active'
 where a.meeting_id=v_m.id and a.attendance_status in('present','late')
 and a.verification_status='verified';
 update qarar_meetings.agenda_items set voting_status='open',voting_result='pending' where id=v_ai.id;
 perform qarar_audit.append_audit_log(v_m.organization_id,'voting.open','voting_rounds',v_round,
  jsonb_build_object('meeting_id',v_m.id,'agenda_item_id',v_ai.id,'eligible_voter_count',v_count));
 return jsonb_build_object('voting_round_id',v_round,'meeting_id',v_m.id,
  'agenda_item_id',v_ai.id,'round_number',v_no,'status','open','eligible_voter_count',v_count);
end $function$;

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
  if v_m.quorum_continuation is not null and strpos(p_content_final,'تنبيه: انعقد الاجتماع واتُخذت قراراته بنصاب غير مكتمل.')=0 then
    raise exception 'يجب أن يتضمن المحضر تنبيه انعقاد الاجتماع واتخاذ قراراته بنصاب غير مكتمل؛ أعد توليد المسودة.' using errcode='23514';
  end if;
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

CREATE OR REPLACE FUNCTION qarar_attendance.apply_quorum_failure(p_meeting_id uuid, p_action text, p_reason text, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_m qarar_meetings.meetings%rowtype;v_q jsonb;v_to text;
begin
 if p_action not in('postpone','cancel','continue') then raise exception 'action must be postpone or cancel'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 2000 then
  raise exception 'reason must contain between 5 and 2000 characters'; end if;
 select * into v_m from qarar_meetings.meetings where id=p_meeting_id
 and organization_id=qarar_iam.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 if p_action='continue' and not qarar_iam.has_unit_role_code(v_m.governance_unit_id,array['council_chair']) then
  raise exception 'قرار المتابعة دون النصاب من اختصاص رئيس المجلس نفسه.' using errcode='42501';
 end if;
 perform qarar_iam.assert_permission('quorum.manage',v_m.governance_unit_id);
 if v_m.status<>'in_progress' then raise exception 'meeting must be in_progress'; end if;
 if v_m.attendance_locked_at is null then raise exception 'attendance roster must be locked first'; end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then
  raise exception 'meeting was modified; refresh before applying quorum action' using errcode='40001'; end if;
 v_q:=qarar_attendance.recalculate_meeting_quorum(v_m.id,true);
 if v_q->>'quorum_status'<>'not_met' then raise exception 'quorum is met; failure action is not allowed'; end if;
 if p_action='continue' and v_m.quorum_continuation is not null then
  raise exception 'سُجل قرار المتابعة مسبقًا؛ حدّث الجلسة.' using errcode='23514';
 end if;
 if p_action='continue' then
  update qarar_meetings.meetings set quorum_continuation=jsonb_build_object(
   'authorized_by',auth.uid(),'authorized_at',clock_timestamp(),'reason',btrim(p_reason),'quorum',v_q)
  where id=v_m.id;
  perform qarar_audit.append_audit_log(v_m.organization_id,'quorum.failure.continue','meetings',v_m.id,
   jsonb_build_object('reason',btrim(p_reason),'quorum',v_q));
  return jsonb_build_object('meeting_id',v_m.id,'status',v_m.status,'quorum',v_q,'continued_without_quorum',true);
 end if;
 v_to:=case p_action when 'postpone' then 'postponed' else 'cancelled' end;
 update qarar_meetings.meetings set status=v_to where id=v_m.id;
 insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,
  changed_by_user_id,change_reason)
 values(v_m.organization_id,v_m.id,v_m.status,v_to,auth.uid(),btrim(p_reason));
 perform qarar_audit.append_audit_log(v_m.organization_id,'quorum.failure.'||p_action,'meetings',v_m.id,
  jsonb_build_object('reason',btrim(p_reason),'quorum',v_q));
 return jsonb_build_object('meeting_id',v_m.id,'status',v_to,'quorum',v_q);
end $function$;

CREATE OR REPLACE FUNCTION qarar_decisions.list_meeting_decisions(p_meeting_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'decision_no', d.decision_no,
    'agenda_item_id', d.agenda_item_id,
    'decision_text', d.decision_text,
    'decision_status', d.decision_status,
    'quorum_continuation', m.quorum_continuation,
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
$function$;

CREATE OR REPLACE FUNCTION qarar_meetings.complete_meeting_session(p_meeting_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_m qarar_meetings.meetings%rowtype;
begin
  select * into v_m from qarar_meetings.meetings
   where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002'; end if;
  perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
  if v_m.status <> 'in_progress' then raise exception 'الاجتماع ليس قيد الانعقاد.' using errcode='23514'; end if;
  if p_expected_updated_at is null or p_expected_updated_at <> v_m.updated_at then
    raise exception 'تم تحديث الاجتماع؛ أعد تحميل الجلسة.' using errcode='40001';
  end if;
  if v_m.attendance_locked_at is null then raise exception 'ثبّت سجل الحضور قبل إنهاء الجلسة.' using errcode='23514'; end if;
  if v_m.quorum_status <> 'met' and v_m.quorum_continuation is null then raise exception 'لا يمكن إنهاء جلسة نظامية دون تحقق النصاب.' using errcode='23514'; end if;
  if exists(select 1 from qarar_voting.voting_rounds where meeting_id=v_m.id and status='open') then
    raise exception 'أغلق أو ألغِ جميع جولات التصويت أولًا.' using errcode='23514';
  end if;
  if exists(select 1 from qarar_meetings.agenda_items where meeting_id=v_m.id and agenda_status not in ('discussed','postponed')) then
    raise exception 'احسم جميع بنود جدول الأعمال كمناقشة أو مؤجلة قبل إنهاء الجلسة.' using errcode='23514';
  end if;

  update qarar_meetings.meetings set status='waiting_for_minutes' where id=v_m.id;
  insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
  values(v_m.organization_id,v_m.id,v_m.status,'waiting_for_minutes',auth.uid(),'انتهاء الجلسة واستكمال مناقشة البنود');
  perform qarar_audit.append_audit_log(v_m.organization_id,'meetings.session.complete','meetings',v_m.id,'{}'::jsonb);
  return jsonb_build_object('id',v_m.id,'status','waiting_for_minutes');
end $function$;

CREATE OR REPLACE FUNCTION qarar_meetings.update_agenda_discussion(p_agenda_item_id uuid, p_status text, p_discussion_notes text, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_item qarar_meetings.agenda_items%rowtype;
  v_meeting qarar_meetings.meetings%rowtype;
begin
  if p_status not in ('under_discussion', 'discussed', 'postponed') then
    raise exception 'حالة مناقشة البند غير صحيحة.' using errcode = '22023';
  end if;

  if p_status = 'postponed'
     and char_length(btrim(coalesce(p_discussion_notes, ''))) < 5 then
    raise exception 'أدخل سبب التأجيل بما لا يقل عن 5 أحرف.' using errcode = '22023';
  end if;

  select * into v_item
  from qarar_meetings.agenda_items
  where id = p_agenda_item_id
    and organization_id = qarar_iam.current_organization_id()
  for update;

  if v_item.id is null then
    raise exception 'بند جدول الأعمال غير موجود.' using errcode = 'P0002';
  end if;

  select * into v_meeting
  from qarar_meetings.meetings
  where id = v_item.meeting_id
    and organization_id = v_item.organization_id for update;

  if v_meeting.status <> 'in_progress' then
    raise exception 'يمكن تسجيل المناقشة أثناء انعقاد الاجتماع فقط.' using errcode = '23514';
  end if;

  perform qarar_iam.assert_permission('agenda.manage', v_meeting.governance_unit_id);
  if v_meeting.attendance_locked_at is null then
    raise exception 'ثبّت سجل الحضور قبل بدء مناقشة البنود.' using errcode='23514';
  end if;
  if v_meeting.quorum_status<>'met' and v_meeting.quorum_continuation is null then
    raise exception 'النصاب غير مكتمل؛ يختار رئيس المجلس التأجيل أو المتابعة أولًا.' using errcode='23514';
  end if;

  if p_expected_updated_at is null or p_expected_updated_at <> v_item.updated_at then
    raise exception 'تم تعديل البند؛ حدّث الجلسة ثم أعد المحاولة.' using errcode = '40001';
  end if;

  update qarar_meetings.agenda_items
  set agenda_status = p_status,
      discussion_notes = nullif(btrim(coalesce(p_discussion_notes, '')), '')
  where id = v_item.id;

  perform qarar_audit.append_audit_log(
    v_item.organization_id,
    'agenda.discussion.update',
    'agenda_items',
    v_item.id,
    jsonb_build_object(
      'previous_status', v_item.agenda_status,
      'status', p_status,
      'notes', p_discussion_notes
    )
  );

  return jsonb_build_object('id', v_item.id, 'status', p_status);
end;
$function$;

CREATE OR REPLACE FUNCTION qarar_attendance.get_meeting_session_detail(p_meeting_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_user_id uuid := auth.uid();
  v_full_name_ar text;
  v_mode text := 'member';
  v_is_roster_member boolean;
  v_is_admin boolean;
  v_is_chair boolean;
  v_is_rapporteur boolean;
  v_can_manage boolean;
  v_can_verify boolean;
  v_can_lock boolean;
  v_can_vote boolean;
  v_can_record boolean;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();

  if v_m.id is null then
    raise exception 'meeting not found' using errcode = 'P0002';
  end if;

  if not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('attendance.read', v_m.governance_unit_id)
     and not qarar_iam.has_permission('attendance.manage', v_m.governance_unit_id) then
    raise exception 'permission denied: attendance.read' using errcode = '42501';
  end if;

  select u.full_name_ar into v_full_name_ar
  from qarar_iam.users u
  where u.id = v_user_id;

  v_is_admin := qarar_iam.is_system_admin();
  v_is_chair := qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']);
  v_is_rapporteur := qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_rapporteur']);
  v_is_roster_member := exists (
    select 1 from qarar_attendance.attendance_records a
    where a.meeting_id = v_m.id and a.user_id = v_user_id
  );
  -- Chair/rapporteur are meeting assignments, not permission aliases. Both
  -- roles intentionally share several operating permissions, so deriving the
  -- display role from `meetings.manage` incorrectly promoted rapporteurs to
  -- chairs and hid their minute-taking controls.
  v_can_manage := v_is_admin or v_is_chair or (
    not v_is_rapporteur
    and qarar_iam.has_permission('meetings.manage', v_m.governance_unit_id)
  );
  v_can_verify := v_is_admin or qarar_iam.has_permission('attendance.verify', v_m.governance_unit_id);
  v_can_lock := v_is_admin or qarar_iam.has_permission('attendance.lock', v_m.governance_unit_id);
  v_can_vote := v_is_admin or qarar_iam.has_permission('voting.cast', v_m.governance_unit_id);
  v_can_record := v_can_manage or qarar_iam.has_permission('agenda.manage', v_m.governance_unit_id);
  -- Keep attendance independent from IAM's role catalogue. Capabilities are
  -- authoritative and also cover delegated operators correctly.
  v_mode := case
    when v_is_admin or v_is_chair then 'chair'
    when v_is_rapporteur then 'rapporteur'
    when v_can_manage then 'chair'
    when v_can_record or v_can_verify then 'rapporteur'
    else 'member'
  end;

  return jsonb_build_object(
    'viewer', jsonb_build_object(
      'user_id', v_user_id,
      'full_name_ar', coalesce(v_full_name_ar, ''),
      'mode', v_mode,
      'is_roster_member', v_is_roster_member,
      'can_manage_session', v_can_manage,
      'can_decide_quorum', v_is_chair and qarar_iam.has_permission('quorum.manage',v_m.governance_unit_id),
      'can_operate_attendance', v_can_verify or v_can_lock,
      'can_create_checkin', v_can_verify,
      'can_verify_attendance', v_can_verify,
      'can_lock_attendance', v_can_lock,
      'can_record_proceedings', v_can_record,
      'can_manage_voting', v_is_admin or qarar_iam.has_permission('voting.manage', v_m.governance_unit_id),
      'can_complete_session', v_can_manage,
      'can_self_check_in', v_is_roster_member and v_m.status = 'in_progress' and v_m.attendance_locked_at is null,
      'can_vote', v_is_roster_member and v_can_vote
    ),
    'meeting', jsonb_build_object(
      'id', v_m.id, 'meeting_no', v_m.meeting_no, 'title_ar', v_m.title_ar,
      'status', v_m.status, 'quorum_status', v_m.quorum_status, 'updated_at', v_m.updated_at,
      'quorum_continuation', v_m.quorum_continuation,
      'attendance_locked', v_m.attendance_locked_at is not null,
      'attendance_locked_at', v_m.attendance_locked_at,
      'attendance_locked_by_user_id', v_m.attendance_locked_by_user_id
    ),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'user_id', a.user_id, 'membership_id', a.membership_id,
        'full_name_ar', u.full_name_ar, 'status', a.attendance_status,
        'verification_status', a.verification_status, 'check_in_method', a.check_in_method,
        'self_checked_in_at', a.self_checked_in_at, 'check_in_at', a.check_in_at,
        'check_out_at', a.check_out_at, 'remarks', a.remarks,
        'verified_by_user_id', a.verified_by_user_id, 'verified_at', a.verified_at,
        'verification_note', a.verification_note, 'updated_at', a.updated_at
      ) order by u.full_name_ar, a.id)
      from qarar_attendance.attendance_records a
      join qarar_iam.users u on u.id = a.user_id
      where a.meeting_id = v_m.id
    ), '[]'::jsonb),
    'my_attendance', (
      select jsonb_build_object(
        'id', a.id, 'user_id', a.user_id, 'membership_id', a.membership_id,
        'full_name_ar', u.full_name_ar, 'status', a.attendance_status,
        'verification_status', a.verification_status, 'check_in_method', a.check_in_method,
        'self_checked_in_at', a.self_checked_in_at, 'check_in_at', a.check_in_at,
        'check_out_at', a.check_out_at, 'remarks', a.remarks, 'updated_at', a.updated_at
      )
      from qarar_attendance.attendance_records a
      join qarar_iam.users u on u.id = a.user_id
      where a.meeting_id = v_m.id and a.user_id = v_user_id
      limit 1
    ),
    'quorum', (
      select to_jsonb(q) - 'organization_id'
      from qarar_attendance.quorum_snapshots q
      where q.meeting_id = v_m.id
      order by q.calculated_at desc, q.id desc limit 1
    ),
    'checkin_session', case when v_can_verify or v_can_lock then (
      select jsonb_build_object(
        'id', s.id,
        'status', case when s.status = 'active' and s.expires_at <= clock_timestamp() then 'expired' else s.status end,
        'starts_at', s.starts_at, 'expires_at', s.expires_at,
        'created_by_user_id', s.created_by_user_id, 'created_at', s.created_at
      )
      from qarar_attendance.meeting_checkin_sessions s
      where s.meeting_id = v_m.id
      order by s.created_at desc, s.id desc limit 1
    ) else null end,
    'open_voting_rounds', coalesce((
      select jsonb_agg(to_jsonb(vr) - 'organization_id' order by vr.opened_at)
      from qarar_voting.voting_rounds vr
      where vr.meeting_id = v_m.id and vr.status = 'open'
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION qarar_minutes.generate_meeting_minutes_draft(p_meeting_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    case when v_m.quorum_continuation is not null then 'تنبيه: انعقد الاجتماع واتُخذت قراراته بنصاب غير مكتمل. السبب: ' || (v_m.quorum_continuation->>'reason') end,
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
$function$;

CREATE OR REPLACE FUNCTION qarar_meetings.guard_meeting_status_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if OLD.status = NEW.status then
    return NEW;
  end if;

  if OLD.status = 'draft' and NEW.status not in ('scheduled', 'cancelled') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'scheduled' and NEW.status not in ('ready_to_start', 'cancelled', 'draft') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'ready_to_start' and NEW.status not in ('in_progress', 'scheduled', 'cancelled') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'in_progress' and NEW.status not in ('waiting_for_minutes', 'postponed', 'cancelled') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'waiting_for_minutes' and NEW.status not in ('waiting_for_approval') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  -- An approver may return the minutes for correction (respond_meeting_minutes_approval).
  elsif OLD.status = 'waiting_for_approval' and NEW.status not in ('closed', 'waiting_for_minutes') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'closed' and NEW.status not in ('archived') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'cancelled' and NEW.status not in ('archived') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'postponed' and NEW.status not in ('archived') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'archived' then
    raise exception 'Cannot transition from archived status.';
  end if;

  -- Check Quorum before moving to waiting_for_minutes
  if NEW.status = 'waiting_for_minutes' and NEW.quorum_status != 'met' and NEW.quorum_continuation is null then
    raise exception 'Cannot proceed to minutes phase. Quorum is not met.';
  end if;

  return NEW;
end;
$function$;
notify pgrst,'reload schema';
commit;
