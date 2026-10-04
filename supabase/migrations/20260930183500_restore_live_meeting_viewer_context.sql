-- Restore the viewer context consumed by the live meeting room.  The schema
-- split retained the attendance payload but accidentally dropped viewer and
-- my_attendance, causing the client to fail after a successful RPC response.
create or replace function qarar_attendance.get_meeting_session_detail(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
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
$$;

