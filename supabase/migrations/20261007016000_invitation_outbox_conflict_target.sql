begin;
-- Match the tenant-scoped outbox uniqueness contract.
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
    on conflict(organization_id,deduplication_key) do nothing returning 1
  ) select count(*) into v_count from inserted;
  perform qarar_audit.append_audit_log(v_m.organization_id,'meetings.invitations.request','meetings',v_m.id,jsonb_build_object('queued',v_count));
  return jsonb_build_object('meeting_id',v_m.id,'queued',v_count,'status','queued');
end $$;

notify pgrst,'reload schema';
commit;

