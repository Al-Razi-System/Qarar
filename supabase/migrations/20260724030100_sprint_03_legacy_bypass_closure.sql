-- Close legacy paths that bypass Sprint 03 production contracts.

drop trigger if exists freeze_voting_result on public.agenda_items;
revoke execute on function public.calculate_meeting_quorum(uuid) from public,anon,authenticated;

create or replace function public.transition_meeting(
 p_meeting_id uuid,p_to_status text,p_reason text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;
begin
 select * into v_m from public.meetings where id=p_meeting_id and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found'; end if;
 perform public.assert_permission('meetings.manage',v_m.governance_unit_id);
 if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then
  raise exception 'meeting was modified; refresh before transition' using errcode='40001'; end if;
 if p_to_status='in_progress' then
  raise exception 'use open_meeting_session to start the meeting';
 end if;
 if v_m.status='in_progress' and p_to_status='postponed' then
  raise exception 'use apply_quorum_failure to postpone an in-progress meeting';
 end if;
 if p_to_status='cancelled' and (p_reason is null or char_length(btrim(p_reason))<5) then
  raise exception 'cancellation reason must contain at least 5 characters';
 end if;
 update public.meetings set status=p_to_status where id=v_m.id;
 insert into public.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
 values(v_m.organization_id,v_m.id,v_m.status,p_to_status,auth.uid(),nullif(btrim(coalesce(p_reason,'')),''));
 perform public.append_audit_log(v_m.organization_id,'meetings.transition','meetings',v_m.id,
  jsonb_build_object('from_status',v_m.status,'to_status',p_to_status,'reason',p_reason));
 return jsonb_build_object('id',v_m.id,'meeting_no',v_m.meeting_no,'previous_status',v_m.status,'status',p_to_status);
end $$;

grant execute on function public.transition_meeting(uuid,text,text,timestamptz) to authenticated;
