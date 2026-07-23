-- Expose governed attendance state without ever returning stored token hashes.

create or replace function public.get_meeting_session_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_m public.meetings%rowtype;v_manage boolean;
begin
 select * into v_m from public.meetings
 where id=p_meeting_id and organization_id=public.current_organization_id();
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 if not public.is_system_admin() and not public.has_permission('attendance.read',v_m.governance_unit_id)
 and not public.has_permission('attendance.manage',v_m.governance_unit_id)
 then raise exception 'permission denied: attendance.read' using errcode='42501'; end if;
 v_manage:=public.is_system_admin() or public.has_permission('attendance.verify',v_m.governance_unit_id)
  or public.has_permission('attendance.lock',v_m.governance_unit_id);
 return jsonb_build_object(
  'meeting',jsonb_build_object('id',v_m.id,'meeting_no',v_m.meeting_no,'title_ar',v_m.title_ar,
   'status',v_m.status,'quorum_status',v_m.quorum_status,'updated_at',v_m.updated_at,
   'attendance_locked',v_m.attendance_locked_at is not null,
   'attendance_locked_at',v_m.attendance_locked_at,
   'attendance_locked_by_user_id',v_m.attendance_locked_by_user_id),
  'attendance',coalesce((select jsonb_agg(jsonb_build_object(
   'id',a.id,'user_id',a.user_id,'membership_id',a.membership_id,'full_name_ar',u.full_name_ar,
   'status',a.attendance_status,'verification_status',a.verification_status,
   'check_in_method',a.check_in_method,'self_checked_in_at',a.self_checked_in_at,
   'check_in_at',a.check_in_at,'check_out_at',a.check_out_at,'remarks',a.remarks,
   'verified_by_user_id',a.verified_by_user_id,'verified_at',a.verified_at,
   'verification_note',a.verification_note,'updated_at',a.updated_at) order by u.full_name_ar,a.id)
   from public.attendance_records a join public.users u on u.id=a.user_id
   where a.meeting_id=v_m.id),'[]'::jsonb),
  'quorum',(select to_jsonb(q)-'organization_id' from public.quorum_snapshots q
   where q.meeting_id=v_m.id order by q.calculated_at desc,q.id desc limit 1),
  'checkin_session',case when v_manage then (select jsonb_build_object(
   'id',s.id,'status',case when s.status='active' and s.expires_at<=clock_timestamp()
    then 'expired' else s.status end,'starts_at',s.starts_at,'expires_at',s.expires_at,
   'created_by_user_id',s.created_by_user_id,'created_at',s.created_at)
   from public.meeting_checkin_sessions s where s.meeting_id=v_m.id
   order by s.created_at desc,s.id desc limit 1) else null end,
  'open_voting_rounds',coalesce((select jsonb_agg(to_jsonb(vr)-'organization_id' order by vr.opened_at)
   from public.voting_rounds vr where vr.meeting_id=v_m.id and vr.status='open'),'[]'::jsonb));
end $$;

revoke execute on function public.get_meeting_session_detail(uuid) from public,anon;
grant execute on function public.get_meeting_session_detail(uuid) to authenticated,service_role;
