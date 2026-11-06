-- Preserve one authoritative invitation snapshot for text, artwork and PDF.
-- Impact map: docs/engineering/impact/MEETING_INVITATION_DOCUMENT_20261029_AR.md
begin;

create function qarar_meetings.meeting_invitation_snapshot(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'meeting_id',m.id,
    'meeting_no',m.meeting_no,
    'title_ar',m.title_ar,
    'governance_unit_name_ar',gu.name_ar,
    'scheduled_date',m.scheduled_date,
    'start_time',m.start_time,
    'end_time',m.end_time,
    'location_type',m.location_type,
    'location_details',m.location_details,
    'invitation_version',extract(epoch from m.updated_at)::bigint,
    'agenda_titles',coalesce((
      select jsonb_agg(jsonb_build_object('title_ar',t.title_ar) order by ai.agenda_order)
      from qarar_meetings.agenda_items ai
      join qarar_topics.topics t on t.id=ai.topic_id and t.organization_id=ai.organization_id
      where ai.meeting_id=m.id and ai.organization_id=m.organization_id
    ),'[]'::jsonb)
  ))
  from qarar_meetings.meetings m
  join qarar_core.governance_units gu on gu.id=m.governance_unit_id and gu.organization_id=m.organization_id
  where m.id=p_meeting_id
$$;

create or replace function qarar_meetings.send_meeting_invitations(p_meeting_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_m qarar_meetings.meetings%rowtype;v_count integer;v_snapshot jsonb;
begin
 select * into v_m from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
 if v_m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود';end if;
 perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
 if v_m.status<>'scheduled' then raise exception using errcode='23514',message='تُرسل الدعوات للاجتماع المجدول فقط';end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then raise exception using errcode='40001',message='تم تحديث الاجتماع؛ أعد تحميله';end if;
 if not exists(select 1 from qarar_meetings.agenda_items where meeting_id=v_m.id) then raise exception using errcode='23514',message='أضف بندًا واحدًا على الأقل قبل إرسال الدعوات';end if;
 if v_m.start_time is null or v_m.end_time is null or v_m.end_time<=v_m.start_time then raise exception using errcode='22023',message='حدد وقت بداية الاجتماع ونهايته قبل تجهيز الدعوات';end if;
 v_snapshot:=qarar_meetings.meeting_invitation_snapshot(v_m.id);
 with recipients as(
  select ms.user_id from qarar_iam.memberships ms where ms.governance_unit_id=v_m.governance_unit_id and ms.membership_status='active' and ms.start_date<=v_m.scheduled_date and(ms.end_date is null or ms.end_date>=v_m.scheduled_date)
 ),inserted as(
  insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
  select v_m.organization_id,'meeting',v_m.id,'meeting.invitation.requested',v_snapshot||jsonb_build_object('recipient_user_id',r.user_id,'recipient_role','member'),'meeting-invitation:'||v_m.id||':'||r.user_id from recipients r
  on conflict(organization_id,deduplication_key) do nothing returning 1
 )select count(*) into v_count from inserted;
 perform qarar_audit.append_audit_log(v_m.organization_id,'meetings.invitations.request','meetings',v_m.id,jsonb_build_object('queued',v_count,'invitation_version',v_snapshot->'invitation_version'));
 return jsonb_build_object('meeting_id',v_m.id,'queued',v_count,'status','queued');
end$$;

create or replace function qarar_meetings.enqueue_invitee_change_notifications(p_meeting_id uuid,p_organization_id uuid,p_event_type text,p_change_key text)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare r record;v_count integer:=0;v_snapshot jsonb;
begin
 if p_event_type not in('meeting.postponed','meeting.cancelled','meeting.invitation.updated') then raise exception using errcode='22023',message='unsupported meeting notification event';end if;
 v_snapshot:=qarar_meetings.meeting_invitation_snapshot(p_meeting_id)||jsonb_build_object('invitation_version',p_change_key);
 for r in select distinct payload->>'recipient_user_id' recipient_user_id from qarar_governance.notification_outbox where organization_id=p_organization_id and aggregate_type='meeting' and aggregate_id=p_meeting_id and event_type='meeting.invitation.requested' and nullif(payload->>'recipient_user_id','') is not null loop
  insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
  values(p_organization_id,'meeting',p_meeting_id,p_event_type,v_snapshot||jsonb_build_object('recipient_user_id',r.recipient_user_id,'recipient_role','member'),p_event_type||':'||p_meeting_id||':'||r.recipient_user_id||':'||p_change_key)
  on conflict(organization_id,deduplication_key) do nothing;
  if found then v_count:=v_count+1;end if;
 end loop;
 return v_count;
end$$;

alter function qarar_meetings.meeting_invitation_snapshot(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.send_meeting_invitations(uuid,timestamptz) owner to qarar_meetings_executor;
alter function qarar_meetings.enqueue_invitee_change_notifications(uuid,uuid,text,text) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.meeting_invitation_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.meeting_invitation_snapshot(uuid) to qarar_meetings_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false from pg_proc p where p.oid='qarar_meetings.meeting_invitation_snapshot(uuid)'::regprocedure
on conflict(function_oid)do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments;

notify pgrst,'reload schema';
commit;
