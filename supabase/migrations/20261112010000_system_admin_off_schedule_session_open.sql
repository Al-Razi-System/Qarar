begin;

create or replace function qarar_attendance.get_meeting_session_start_timing_v2(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_timezone text;
  v_timing jsonb;
begin
  select * into v_m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.';end if;
  perform qarar_iam.assert_permission('attendance.manage',v_m.governance_unit_id);
  if v_m.status<>'ready_to_start' then
    raise exception using errcode='23514',message='الجلسة ليست جاهزة للبدء. حدّث بيانات الاجتماع ثم أعد المحاولة.';
  end if;
  select timezone into v_timezone from qarar_core.organizations where id=v_m.organization_id;
  v_timing:=qarar_attendance.calculate_meeting_start_timing(
    v_m.scheduled_date,v_m.start_time,v_m.end_time,v_timezone,clock_timestamp());
  return v_timing||jsonb_build_object(
    'meeting_id',v_m.id,'meeting_no',v_m.meeting_no,'title_ar',v_m.title_ar,
    'scheduled_date',v_m.scheduled_date,'start_time',v_m.start_time,'end_time',v_m.end_time,
    'can_confirm_off_schedule',(
      qarar_iam.is_system_admin()
      or qarar_iam.has_unit_role_code(v_m.governance_unit_id,array['council_chair'])
    )
  );
end $$;
alter function qarar_attendance.get_meeting_session_start_timing_v2(uuid) owner to qarar_attendance_executor;
revoke all on function qarar_attendance.get_meeting_session_start_timing_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_attendance.get_meeting_session_start_timing_v2(uuid) to qarar_api_executor;

create or replace function qarar_attendance.open_meeting_session(
  p_meeting_id uuid,
  p_expected_updated_at timestamptz,
  p_confirmed_off_schedule boolean default false
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_count integer;
  v_timezone text;
  v_timing jsonb;
  v_opened_at timestamptz:=clock_timestamp();
  v_status text;
  v_difference integer;
  v_confirmation_authority text;
  v_confirmation_label text;
begin
  select * into v_m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.';end if;
  perform qarar_iam.assert_permission('attendance.manage',v_m.governance_unit_id);
  if v_m.status<>'ready_to_start' then
    raise exception using errcode='23514',message='الجلسة ليست جاهزة للبدء. حدّث بيانات الاجتماع ثم أعد المحاولة.';
  end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then
    raise exception using errcode='40001',message='تم تحديث الاجتماع؛ حدّث بياناته ثم أعد المحاولة.';
  end if;
  select timezone into v_timezone from qarar_core.organizations where id=v_m.organization_id;
  v_timing:=qarar_attendance.calculate_meeting_start_timing(
    v_m.scheduled_date,v_m.start_time,v_m.end_time,v_timezone,v_opened_at);
  v_status:=v_timing->>'timing_status';
  v_difference:=coalesce((v_timing->>'difference_minutes')::integer,0);
  if coalesce((v_timing->>'requires_confirmation')::boolean,false) then
    if not coalesce(p_confirmed_off_schedule,false) then
      raise exception using errcode='P0001',message='بدء الجلسة خارج الموعد المحدد يحتاج تأكيد رئيس المجلس أو مسؤول النظام. راجع الموعد ثم أكد بدء الجلسة الآن.';
    end if;
    v_confirmation_authority:=case
      when qarar_iam.is_system_admin() then 'system_admin'
      when qarar_iam.has_unit_role_code(v_m.governance_unit_id,array['council_chair']) then 'council_chair'
      else null
    end;
    if v_confirmation_authority is null then
      raise exception using errcode='42501',message='تأكيد بدء الجلسة خارج الموعد متاح لرئيس المجلس أو مسؤول النظام فقط.';
    end if;
    v_confirmation_label:=case v_confirmation_authority
      when 'system_admin' then 'مسؤول النظام'
      else 'رئيس المجلس'
    end;
  end if;

  insert into qarar_attendance.attendance_records(
    organization_id,meeting_id,user_id,membership_id,attendance_status,verification_status,recorded_by_user_id)
  select v_m.organization_id,v_m.id,ms.user_id,ms.id,'pending','unclaimed',auth.uid()
  from qarar_iam.memberships ms join qarar_iam.users u on u.id=ms.user_id
  where ms.organization_id=v_m.organization_id and ms.governance_unit_id=v_m.governance_unit_id
    and ms.membership_status='active' and u.status='active'
  on conflict(meeting_id,user_id) do nothing;
  get diagnostics v_count=row_count;
  insert into qarar_attendance.attendance_history(
    organization_id,attendance_record_id,meeting_id,user_id,from_status,to_status,changed_by_user_id,remarks)
  select organization_id,id,meeting_id,user_id,null,'pending',auth.uid(),'session roster initialized'
  from qarar_attendance.attendance_records a where meeting_id=v_m.id
    and not exists(select 1 from qarar_attendance.attendance_history h where h.attendance_record_id=a.id);
  insert into qarar_attendance.attendance_events(
    organization_id,meeting_id,attendance_record_id,subject_user_id,actor_user_id,event_type,new_state,reason)
  select a.organization_id,a.meeting_id,a.id,a.user_id,auth.uid(),'roster_initialized',
    jsonb_build_object('attendance_status','pending','verification_status','unclaimed'),'session roster initialized'
  from qarar_attendance.attendance_records a where a.meeting_id=v_m.id
    and not exists(select 1 from qarar_attendance.attendance_events e
      where e.attendance_record_id=a.id and e.event_type='roster_initialized');

  insert into qarar_attendance.meeting_session_openings(
    organization_id,meeting_id,opened_by_user_id,opened_at,organization_timezone,
    scheduled_start_at,scheduled_end_at,timing_status,difference_minutes,confirmed_off_schedule)
  values(
    v_m.organization_id,v_m.id,auth.uid(),v_opened_at,v_timezone,
    (v_timing->>'scheduled_start_at')::timestamptz,(v_timing->>'scheduled_end_at')::timestamptz,
    v_status,v_difference,v_status in ('early','late'));

  update qarar_meetings.meetings set status='in_progress',attendance_locked_at=null,
    attendance_locked_by_user_id=null where id=v_m.id;
  insert into qarar_meetings.meeting_status_history(
    organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
  values(v_m.organization_id,v_m.id,v_m.status,'in_progress',auth.uid(),case v_status
    when 'early' then 'بدء الجلسة مبكرًا بتأكيد '||v_confirmation_label||'؛ متبقٍ على الموعد '||v_difference||' دقيقة.'
    when 'late' then 'بدء الجلسة متأخرًا بتأكيد '||v_confirmation_label||'؛ مضى على نهاية الموعد '||v_difference||' دقيقة.'
    when 'schedule_unavailable' then 'فتح الجلسة لسجل قديم لا يحتوي وقت بداية ونهاية.'
    else 'فتح الجلسة ضمن الموعد المحدد.' end);
  perform qarar_attendance.recalculate_meeting_quorum(v_m.id,true);
  perform qarar_audit.append_audit_log(v_m.organization_id,'meetings.session.open','meetings',v_m.id,
    jsonb_build_object(
      'roster_count',v_count,'timing_status',v_status,'difference_minutes',v_difference,
      'confirmed_off_schedule',v_status in ('early','late'),'confirmation_authority',v_confirmation_authority,
      'opened_at',v_opened_at,'organization_timezone',v_timezone,
      'scheduled_start_at',v_timing->>'scheduled_start_at','scheduled_end_at',v_timing->>'scheduled_end_at'));
  return qarar_attendance.get_meeting_session_detail(v_m.id);
end $$;
alter function qarar_attendance.open_meeting_session(uuid,timestamptz,boolean) owner to qarar_attendance_executor;
revoke all on function qarar_attendance.open_meeting_session(uuid,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function qarar_attendance.open_meeting_session(uuid,timestamptz,boolean) to qarar_api_executor;

commit;
