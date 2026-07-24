-- Complete live-session operational contracts required by administration screens.

create unique index voting_rounds_one_open_per_meeting_uidx
on public.voting_rounds(meeting_id) where status='open';

create or replace function public.get_attendance_history(p_attendance_record_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_a public.attendance_records%rowtype;v_unit uuid;
begin
 select * into v_a from public.attendance_records where id=p_attendance_record_id
 and organization_id=public.current_organization_id();
 if v_a.id is null then raise exception 'attendance record not found' using errcode='P0002'; end if;
 select governance_unit_id into v_unit from public.meetings where id=v_a.meeting_id;
 if not public.is_system_admin() and not public.has_permission('attendance.read',v_unit)
 and not public.has_permission('attendance.manage',v_unit)
 then raise exception 'permission denied: attendance.read' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',h.id,'from_status',h.from_status,'to_status',h.to_status,'remarks',h.remarks,
  'changed_by_user_id',h.changed_by_user_id,'changed_by_name_ar',u.full_name_ar,
  'changed_at',h.changed_at) order by h.changed_at,h.id)
 from public.attendance_history h left join public.users u on u.id=h.changed_by_user_id
 where h.attendance_record_id=v_a.id),'[]'::jsonb);
end $$;

create or replace function public.cancel_voting_round(
 p_voting_round_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_r public.voting_rounds%rowtype;v_unit uuid;
begin
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 2000 then
  raise exception 'reason must contain between 5 and 2000 characters'; end if;
 select * into v_r from public.voting_rounds where id=p_voting_round_id
 and organization_id=public.current_organization_id() for update;
 if v_r.id is null then raise exception 'voting round not found' using errcode='P0002'; end if;
 if v_r.status<>'open' then raise exception 'voting round is not open'; end if;
 select governance_unit_id into v_unit from public.meetings where id=v_r.meeting_id and status='in_progress';
 if v_unit is null then raise exception 'meeting is not in progress'; end if;
 perform public.assert_permission('voting.manage',v_unit);
 update public.voting_rounds set status='cancelled',result='cancelled',
  closed_by_user_id=auth.uid(),closed_at=clock_timestamp(),close_reason=btrim(p_reason)
 where id=v_r.id;
 update public.agenda_items set voting_status='not_started',voting_result='pending'
 where id=v_r.agenda_item_id;
 perform public.append_audit_log(v_r.organization_id,'voting.cancel','voting_rounds',v_r.id,
  jsonb_build_object('meeting_id',v_r.meeting_id,'agenda_item_id',v_r.agenda_item_id,
   'reason',btrim(p_reason)));
 return jsonb_build_object('voting_round_id',v_r.id,'status','cancelled','result','cancelled');
end $$;

create or replace function public.get_voting_round_detail(p_voting_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_r public.voting_rounds%rowtype;v_unit uuid;v_manage boolean;
begin
 select * into v_r from public.voting_rounds where id=p_voting_round_id
 and organization_id=public.current_organization_id();
 if v_r.id is null then raise exception 'voting round not found' using errcode='P0002'; end if;
 select governance_unit_id into v_unit from public.meetings where id=v_r.meeting_id;
 v_manage:=public.is_system_admin() or public.has_permission('voting.manage',v_unit);
 if not v_manage and not exists(select 1 from public.voting_eligible_members
  where voting_round_id=v_r.id and user_id=auth.uid())
 then raise exception 'permission denied: voting.read' using errcode='42501'; end if;
 return to_jsonb(v_r)-'organization_id'||jsonb_build_object(
  'has_voted',exists(select 1 from public.votes where voting_round_id=v_r.id and user_id=auth.uid()),
  'my_vote',(select vote_value from public.votes where voting_round_id=v_r.id and user_id=auth.uid()),
  'eligible_members',case when v_manage then coalesce((select jsonb_agg(jsonb_build_object(
   'user_id',e.user_id,'membership_id',e.membership_id,'full_name_ar',u.full_name_ar,
   'has_voted',v.id is not null,'voted_at',v.voted_at) order by u.full_name_ar,e.user_id)
   from public.voting_eligible_members e join public.users u on u.id=e.user_id
   left join public.votes v on v.voting_round_id=e.voting_round_id and v.user_id=e.user_id
   where e.voting_round_id=v_r.id),'[]'::jsonb) else null end,
  'votes',case when v_manage then coalesce((select jsonb_agg(jsonb_build_object(
   'user_id',v.user_id,'full_name_ar',u.full_name_ar,'vote_value',v.vote_value,
   'vote_note',v.vote_note,'voted_at',v.voted_at) order by v.voted_at)
   from public.votes v join public.users u on u.id=v.user_id where v.voting_round_id=v_r.id),'[]'::jsonb)
   else null end);
end $$;

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
 if p_to_status='in_progress' then raise exception 'use open_meeting_session to start the meeting'; end if;
 if v_m.status='in_progress' and p_to_status='postponed' then
  raise exception 'use apply_quorum_failure to postpone an in-progress meeting'; end if;
 if v_m.status='in_progress' and p_to_status='waiting_for_minutes'
 and exists(select 1 from public.voting_rounds where meeting_id=v_m.id and status='open')
 then raise exception 'close or cancel all voting rounds before completing the meeting'; end if;
 if p_to_status='cancelled' and (p_reason is null or char_length(btrim(p_reason))<5) then
  raise exception 'cancellation reason must contain at least 5 characters'; end if;
 update public.meetings set status=p_to_status where id=v_m.id;
 insert into public.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
 values(v_m.organization_id,v_m.id,v_m.status,p_to_status,auth.uid(),nullif(btrim(coalesce(p_reason,'')),''));
 perform public.append_audit_log(v_m.organization_id,'meetings.transition','meetings',v_m.id,
  jsonb_build_object('from_status',v_m.status,'to_status',p_to_status,'reason',p_reason));
 return jsonb_build_object('id',v_m.id,'meeting_no',v_m.meeting_no,'previous_status',v_m.status,'status',p_to_status);
end $$;

grant execute on function public.get_attendance_history(uuid),
 public.cancel_voting_round(uuid,text),
 public.get_voting_round_detail(uuid),
 public.transition_meeting(uuid,text,text,timestamptz) to authenticated;
