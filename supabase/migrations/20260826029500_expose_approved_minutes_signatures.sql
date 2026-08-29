create or replace function qarar_minutes.get_meeting_minutes(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_can_view boolean;
  v_can_edit boolean;
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

  return coalesce((
    select to_jsonb(mm) - 'organization_id' || jsonb_build_object(
      'viewer_can_edit', v_can_edit,
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
    'approvals', '[]'::jsonb
  ));
end;
$function$;

comment on function qarar_minutes.get_meeting_minutes(uuid) is
  'Returns meeting minutes and reveals signature strokes only after the final minutes are approved.';
