-- Distinguish a rejected QR claim from a manually verified absence.

create or replace function public.verify_attendance(
 p_attendance_record_id uuid,p_status text,p_note text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a public.attendance_records%rowtype;v_m public.meetings%rowtype;
v_method text;v_event text;v_verification text;
begin
 if p_status not in('present','late','absent','excused') then raise exception 'invalid verified attendance status'; end if;
 select * into v_a from public.attendance_records where id=p_attendance_record_id
 and organization_id=public.current_organization_id() for update;
 if v_a.id is null then raise exception 'attendance record not found' using errcode='P0002'; end if;
 select * into v_m from public.meetings where id=v_a.meeting_id;
 perform public.assert_permission('attendance.verify',v_m.governance_unit_id);
 if v_m.status<>'in_progress' or v_m.attendance_locked_at is not null then
  raise exception 'attendance verification is closed'; end if;
 if v_a.user_id=auth.uid() and not public.has_permission('attendance.override',v_m.governance_unit_id) then
  raise exception 'users cannot verify their own attendance' using errcode='42501'; end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_a.updated_at then
  raise exception 'attendance was modified; refresh before verification' using errcode='40001'; end if;
 if p_status in('present','late') and v_a.verification_status<>'pending_verification'
 and (p_note is null or char_length(btrim(p_note))<5) then
  raise exception 'manual presence requires a reason of at least 5 characters'; end if;
 v_method:=case when v_a.verification_status='pending_verification'
  then coalesce(v_a.check_in_method,'self_qr') else 'manual' end;
 v_event:=case when p_status in('absent','excused') and v_a.verification_status='pending_verification'
  then 'attendance_rejected' else 'attendance_verified' end;
 v_verification:=case when v_event='attendance_rejected' then 'rejected' else 'verified' end;
 update public.attendance_records set attendance_status=p_status,verification_status=v_verification,
  check_in_method=v_method,check_in_at=case when p_status in('present','late')
   then coalesce(self_checked_in_at,check_in_at,clock_timestamp()) else null end,
  check_out_at=null,verified_by_user_id=auth.uid(),verified_at=clock_timestamp(),
  verification_note=nullif(btrim(coalesce(p_note,'')),''),recorded_by_user_id=auth.uid()
 where id=v_a.id;
 insert into public.attendance_history(organization_id,attendance_record_id,meeting_id,user_id,
  from_status,to_status,changed_by_user_id,remarks)
 values(v_a.organization_id,v_a.id,v_a.meeting_id,v_a.user_id,v_a.attendance_status,p_status,
  auth.uid(),nullif(btrim(coalesce(p_note,'')),''));
 insert into public.attendance_events(organization_id,meeting_id,attendance_record_id,subject_user_id,
  actor_user_id,event_type,previous_state,new_state,reason)
 values(v_a.organization_id,v_a.meeting_id,v_a.id,v_a.user_id,auth.uid(),v_event,
  jsonb_build_object('attendance_status',v_a.attendance_status,'verification_status',v_a.verification_status),
  jsonb_build_object('attendance_status',p_status,'verification_status',v_verification,'method',v_method),
  nullif(btrim(coalesce(p_note,'')),''));
 perform public.append_audit_log(v_a.organization_id,'attendance.verify','attendance_records',v_a.id,
  jsonb_build_object('meeting_id',v_a.meeting_id,'user_id',v_a.user_id,'status',p_status,
   'verification_status',v_verification,'method',v_method));
 return (select to_jsonb(a) from public.attendance_records a where a.id=v_a.id);
end $$;

revoke execute on function public.verify_attendance(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.verify_attendance(uuid,text,text,timestamptz)
to authenticated,service_role;
