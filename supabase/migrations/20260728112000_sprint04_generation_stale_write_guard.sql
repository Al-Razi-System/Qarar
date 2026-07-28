begin;

create or replace function qarar_minutes.service_complete_minute_generation(
  p_request_id uuid,p_generated_content text,p_provider text,p_model text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_minutes,qarar_meetings,qarar_audit
as $$
declare v_request qarar_minutes.minute_generation_requests%rowtype;
  v_meeting qarar_meetings.meetings%rowtype; v_minute qarar_minutes.meeting_minutes%rowtype;
  v_revision_id uuid; v_revision_no integer; v_changed timestamptz;
begin
 if nullif(btrim(p_generated_content),'') is null then raise exception 'generated content is required' using errcode='22023'; end if;
 select * into v_request from qarar_minutes.minute_generation_requests where id=p_request_id for update;
 if v_request.id is null then raise exception 'generation request not found' using errcode='P0002'; end if;
 if v_request.status<>'queued' then return jsonb_build_object('request_id',v_request.id,'status',v_request.status,'idempotent_replay',v_request.status='succeeded'); end if;
 if v_request.expires_at<=clock_timestamp() then
  update qarar_minutes.minute_generation_requests set status='expired',completed_at=clock_timestamp(),error_code='request_expired' where id=v_request.id;
  return jsonb_build_object('request_id',v_request.id,'status','expired');
 end if;
 select * into v_meeting from qarar_meetings.meetings where id=v_request.meeting_id and organization_id=v_request.organization_id for update;
 if v_meeting.status<>'waiting_for_minutes' then
  update qarar_minutes.minute_generation_requests set status='failed',completed_at=clock_timestamp(),error_code='meeting_not_awaiting_minutes' where id=v_request.id;
  return jsonb_build_object('request_id',v_request.id,'status','failed','error_code','meeting_not_awaiting_minutes');
 end if;
 select * into v_minute from qarar_minutes.meeting_minutes where meeting_id=v_meeting.id for update;
 if v_minute.id is not null and v_minute.updated_at>v_request.requested_at then
  update qarar_minutes.minute_generation_requests set status='failed',completed_at=clock_timestamp(),error_code='draft_changed_during_generation' where id=v_request.id;
  return jsonb_build_object('request_id',v_request.id,'status','failed','error_code','draft_changed_during_generation');
 end if;
 if v_minute.id is null then
  insert into qarar_minutes.meeting_minutes(organization_id,meeting_id,content_draft,status,generated_by_ai,generated_at,created_by_user_id,current_revision_no)
  values(v_request.organization_id,v_meeting.id,btrim(p_generated_content),'generated',true,clock_timestamp(),v_request.requested_by_user_id,1) returning * into v_minute;
  v_revision_no:=1;
  insert into qarar_minutes.minute_status_history(organization_id,minute_id,to_status,changed_by_user_id,reason)
  values(v_request.organization_id,v_minute.id,'generated',v_request.requested_by_user_id,'ai_draft_generated');
 elsif v_minute.status in ('draft','generated') then
  update qarar_minutes.meeting_minutes set content_draft=btrim(p_generated_content),status='generated',generated_by_ai=true,generated_at=clock_timestamp(),current_revision_no=current_revision_no+1
  where id=v_minute.id returning updated_at,current_revision_no into v_changed,v_revision_no;
  if v_minute.status<>'generated' then insert into qarar_minutes.minute_status_history(organization_id,minute_id,from_status,to_status,changed_by_user_id,reason)
   values(v_request.organization_id,v_minute.id,v_minute.status,'generated',v_request.requested_by_user_id,'ai_draft_generated'); end if;
 else
  update qarar_minutes.minute_generation_requests set status='failed',completed_at=clock_timestamp(),error_code='minute_not_editable' where id=v_request.id;
  return jsonb_build_object('request_id',v_request.id,'status','failed','error_code','minute_not_editable');
 end if;
 insert into qarar_minutes.minute_revisions(organization_id,minute_id,revision_no,content,source,created_by_user_id,generation_metadata)
 values(v_request.organization_id,v_minute.id,v_revision_no,btrim(p_generated_content),'ai_generated',v_request.requested_by_user_id,jsonb_build_object('provider',nullif(btrim(p_provider),''),'model',nullif(btrim(p_model),''),'request_id',v_request.id)) returning id into v_revision_id;
 update qarar_minutes.minute_generation_requests set status='succeeded',provider=nullif(btrim(p_provider),''),model=nullif(btrim(p_model),''),output_revision_id=v_revision_id,completed_at=clock_timestamp() where id=v_request.id;
 perform qarar_audit.append_audit_log(v_request.organization_id,'minutes.generation_completed','meeting_minutes',v_minute.id,jsonb_build_object('request_id',v_request.id,'revision_id',v_revision_id));
 return jsonb_build_object('request_id',v_request.id,'status','succeeded','minute_id',v_minute.id,'revision_id',v_revision_id,'revision_no',v_revision_no,'minute_status','generated');
end;
$$;
alter function qarar_minutes.service_complete_minute_generation(uuid,text,text,text) owner to qarar_minutes_executor;
revoke all on function qarar_minutes.service_complete_minute_generation(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function qarar_minutes.service_complete_minute_generation(uuid,text,text,text) to qarar_api_executor;

commit;
