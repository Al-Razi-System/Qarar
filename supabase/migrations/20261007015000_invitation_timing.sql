begin;

create or replace function qarar_meetings.send_meeting_invitations(
  p_meeting_id uuid,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_m qarar_meetings.meetings%rowtype; v_count int;
begin
  select * into v_m from qarar_meetings.meetings where id=p_meeting_id
    and organization_id=qarar_iam.current_organization_id() for update;
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002'; end if;
  perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
  if v_m.status <> 'scheduled' then raise exception 'تُرسل الدعوات للاجتماع المجدول فقط.' using errcode='23514'; end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then raise exception 'تم تحديث الاجتماع؛ أعد تحميله.' using errcode='40001'; end if;
  if not exists(select 1 from qarar_meetings.agenda_items where meeting_id=v_m.id) then
    raise exception 'أضف بندًا واحدًا على الأقل قبل إرسال الدعوات.' using errcode='23514';
  end if;
  if v_m.start_time is null or v_m.end_time is null or v_m.end_time<=v_m.start_time then
    raise exception using errcode='22023',message='حدد وقت بداية الاجتماع ونهايته قبل تجهيز الدعوات';
  end if;
  with recipients as (
    select ms.user_id from qarar_iam.memberships ms where ms.governance_unit_id=v_m.governance_unit_id
      and ms.membership_status='active' and ms.start_date<=v_m.scheduled_date
      and (ms.end_date is null or ms.end_date>=v_m.scheduled_date)
  ), inserted as (
    insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
    select v_m.organization_id,'meeting',v_m.id,'meeting.invitation.requested',jsonb_build_object(
      'meeting_id',v_m.id,'recipient_user_id',r.user_id,'title_ar',v_m.title_ar,'scheduled_date',v_m.scheduled_date,
      'start_time',v_m.start_time,'end_time',v_m.end_time,'location_type',v_m.location_type,'location_details',v_m.location_details
    ),'meeting-invitation:'||v_m.id||':'||r.user_id from recipients r
    on conflict(deduplication_key) do nothing returning 1
  ) select count(*) into v_count from inserted;
  perform qarar_audit.append_audit_log(v_m.organization_id,'meetings.invitations.request','meetings',v_m.id,jsonb_build_object('queued',v_count));
  return jsonb_build_object('meeting_id',v_m.id,'queued',v_count,'status','queued');
end $$;

-- Narrow cross-module query; do not grant meetings broad outbox read access.
create function qarar_governance.has_meeting_invitation_requests(p_organization_id uuid,p_meeting_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select p_organization_id=qarar_iam.current_organization_id() and exists(
    select 1 from qarar_governance.notification_outbox where organization_id=p_organization_id
      and aggregate_type='meeting' and aggregate_id=p_meeting_id and event_type='meeting.invitation.requested');
$$;
alter function qarar_governance.has_meeting_invitation_requests(uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.has_meeting_invitation_requests(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.has_meeting_invitation_requests(uuid,uuid) to qarar_meetings_executor;

create function qarar_meetings.send_meeting_invitations_v2(
  p_meeting_id uuid,p_start_time time,p_end_time time,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_m qarar_meetings.meetings%rowtype; v_updated timestamptz;
begin
  select * into v_m from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود'; end if;
  perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
  if v_m.status<>'scheduled' then raise exception using errcode='23514',message='تُجهز الدعوات للاجتماع المجدول فقط'; end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then
    raise exception using errcode='40001',message='تم تحديث الاجتماع؛ حدّث بياناته ثم أعد المحاولة'; end if;
  if p_start_time is null or p_end_time is null or p_end_time<=p_start_time then
    raise exception using errcode='22023',message='أدخل وقت البداية والنهاية؛ يجب أن تكون النهاية بعد البداية'; end if;
  if (v_m.start_time is distinct from p_start_time or v_m.end_time is distinct from p_end_time)
    and qarar_governance.has_meeting_invitation_requests(v_m.organization_id,v_m.id) then
    raise exception using errcode='23514',message='سبق تجهيز الدعوات؛ لا يمكن تغيير وقتها بهذه العملية'; end if;
  update qarar_meetings.meetings set start_time=p_start_time,end_time=p_end_time where id=v_m.id returning updated_at into v_updated;
  perform qarar_audit.append_audit_log(v_m.organization_id,'meetings.invitation_timing.set','meetings',v_m.id,
    jsonb_build_object('start_time',p_start_time,'end_time',p_end_time));
  return qarar_meetings.send_meeting_invitations(v_m.id,v_updated);
end $$;
alter function qarar_meetings.send_meeting_invitations_v2(uuid,time,time,timestamptz) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.send_meeting_invitations_v2(uuid,time,time,timestamptz) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.send_meeting_invitations_v2(uuid,time,time,timestamptz) to qarar_api_executor;
create function api_v2.send_meeting_invitations_v2(p_meeting_id uuid,p_start_time time,p_end_time time,p_expected_updated_at timestamptz)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_meetings.send_meeting_invitations_v2($1,$2,$3,$4)$$;
alter function api_v2.send_meeting_invitations_v2(uuid,time,time,timestamptz) owner to qarar_api_executor;
revoke all on function api_v2.send_meeting_invitations_v2(uuid,time,time,timestamptz) from public,anon,authenticated,service_role;
grant execute on function api_v2.send_meeting_invitations_v2(uuid,time,time,timestamptz) to authenticated,service_role;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_meetings',p.proname,pg_get_function_identity_arguments(p.oid),'meetings','authenticated' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v2' and p.proname='send_meeting_invitations_v2';
notify pgrst,'reload schema';
commit;


