-- Complete governed meeting lifecycle contracts for agenda discussion, minutes and approvals.

-- Retire the prototype direct-table automations. The governed RPCs below perform the
-- same transitions atomically with authorization, concurrency and audit evidence.
drop trigger if exists trigger_on_minute_ready on qarar_minutes.meeting_minutes;
drop trigger if exists trigger_on_approval_status_change on qarar_minutes.minute_approvals;

create or replace function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_m qarar_meetings.meetings%rowtype;
begin
  select * into v_m from qarar_meetings.meetings
   where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002'; end if;
  if v_m.created_by_user_id<>auth.uid() and not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('meetings.read',v_m.governance_unit_id)
     and not qarar_iam.has_permission('meetings.manage',v_m.governance_unit_id) then
    raise exception 'غير مصرح بعرض الاجتماع.' using errcode='42501';
  end if;
  return (select to_jsonb(m)||jsonb_build_object(
    'governance_unit',jsonb_build_object('id',gu.id,'name_ar',gu.name_ar),
    'meeting_type',jsonb_build_object('id',mt.id,'name_ar',mt.name_ar),
    'agenda_items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',ai.id,'agenda_order',ai.agenda_order,'agenda_status',ai.agenda_status,
      'discussion_notes',ai.discussion_notes,'is_exception',ai.is_exception,
      'exception_reason',ai.exception_reason,'voting_status',ai.voting_status,
      'voting_result',ai.voting_result,'updated_at',ai.updated_at,
      'topic',jsonb_build_object('id',t.id,'topic_no',t.topic_no,'title_ar',t.title_ar,'status',t.status)
    ) order by ai.agenda_order) from qarar_meetings.agenda_items ai
      join qarar_topics.topics t on t.id=ai.topic_id where ai.meeting_id=m.id),'[]'::jsonb),
    'status_history',coalesce((select jsonb_agg(jsonb_build_object(
      'id',h.id,'from_status',h.from_status,'to_status',h.to_status,
      'reason',h.change_reason,'changed_at',h.changed_at
    ) order by h.changed_at,h.id) from qarar_meetings.meeting_status_history h where h.meeting_id=m.id),'[]'::jsonb)
  ) from qarar_meetings.meetings m join qarar_core.governance_units gu on gu.id=m.governance_unit_id
    left join qarar_meetings.meeting_types mt on mt.id=m.meeting_type_id where m.id=v_m.id);
end $$;

alter function qarar_meetings.get_meeting_detail(uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.get_meeting_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.get_meeting_detail(uuid) to qarar_api_executor;

create or replace function qarar_meetings.update_agenda_discussion(
  p_agenda_item_id uuid,
  p_status text,
  p_discussion_notes text,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_item qarar_meetings.agenda_items%rowtype;
  v_meeting qarar_meetings.meetings%rowtype;
begin
  if p_status not in ('under_discussion','discussed','postponed') then
    raise exception 'حالة مناقشة البند غير صحيحة.' using errcode='22023';
  end if;
  if p_status in ('discussed','postponed') and char_length(btrim(coalesce(p_discussion_notes,''))) < 5 then
    raise exception 'أدخل ملخص المناقشة أو سبب التأجيل بما لا يقل عن 5 أحرف.' using errcode='22023';
  end if;

  select * into v_item from qarar_meetings.agenda_items
   where id=p_agenda_item_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_item.id is null then raise exception 'بند جدول الأعمال غير موجود.' using errcode='P0002'; end if;

  select * into v_meeting from qarar_meetings.meetings
   where id=v_item.meeting_id and organization_id=v_item.organization_id;
  if v_meeting.status <> 'in_progress' then
    raise exception 'يمكن تسجيل المناقشة أثناء انعقاد الاجتماع فقط.' using errcode='23514';
  end if;
  perform qarar_iam.assert_permission('agenda.manage',v_meeting.governance_unit_id);
  if p_expected_updated_at is null or p_expected_updated_at <> v_item.updated_at then
    raise exception 'تم تعديل البند؛ حدّث الجلسة ثم أعد المحاولة.' using errcode='40001';
  end if;

  update qarar_meetings.agenda_items
     set agenda_status=p_status,
         discussion_notes=nullif(btrim(coalesce(p_discussion_notes,'')),'')
   where id=v_item.id;

  perform qarar_audit.append_audit_log(v_item.organization_id,'agenda.discussion.update','agenda_items',v_item.id,
    jsonb_build_object('previous_status',v_item.agenda_status,'status',p_status,'notes',p_discussion_notes));
  return jsonb_build_object('id',v_item.id,'status',p_status);
end $$;

create or replace function qarar_meetings.complete_meeting_session(
  p_meeting_id uuid,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_m qarar_meetings.meetings%rowtype;
begin
  select * into v_m from qarar_meetings.meetings
   where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002'; end if;
  perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
  if v_m.status <> 'in_progress' then raise exception 'الاجتماع ليس قيد الانعقاد.' using errcode='23514'; end if;
  if p_expected_updated_at is null or p_expected_updated_at <> v_m.updated_at then
    raise exception 'تم تحديث الاجتماع؛ أعد تحميل الجلسة.' using errcode='40001';
  end if;
  if v_m.attendance_locked_at is null then raise exception 'ثبّت سجل الحضور قبل إنهاء الجلسة.' using errcode='23514'; end if;
  if v_m.quorum_status <> 'met' then raise exception 'لا يمكن إنهاء جلسة نظامية دون تحقق النصاب.' using errcode='23514'; end if;
  if exists(select 1 from qarar_voting.voting_rounds where meeting_id=v_m.id and status='open') then
    raise exception 'أغلق أو ألغِ جميع جولات التصويت أولًا.' using errcode='23514';
  end if;
  if exists(select 1 from qarar_meetings.agenda_items where meeting_id=v_m.id and agenda_status not in ('discussed','postponed')) then
    raise exception 'احسم جميع بنود جدول الأعمال كمناقشة أو مؤجلة قبل إنهاء الجلسة.' using errcode='23514';
  end if;

  update qarar_meetings.meetings set status='waiting_for_minutes' where id=v_m.id;
  insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
  values(v_m.organization_id,v_m.id,v_m.status,'waiting_for_minutes',auth.uid(),'انتهاء الجلسة واستكمال مناقشة البنود');
  perform qarar_audit.append_audit_log(v_m.organization_id,'meetings.session.complete','meetings',v_m.id,'{}'::jsonb);
  return jsonb_build_object('id',v_m.id,'status','waiting_for_minutes');
end $$;

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
  with recipients as (
    select ms.user_id from qarar_iam.memberships ms where ms.governance_unit_id=v_m.governance_unit_id
      and ms.membership_status='active' and ms.start_date<=v_m.scheduled_date
      and (ms.end_date is null or ms.end_date>=v_m.scheduled_date)
  ), inserted as (
    insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
    select v_m.organization_id,'meeting',v_m.id,'meeting.invitation.requested',jsonb_build_object(
      'meeting_id',v_m.id,'recipient_user_id',r.user_id,'title_ar',v_m.title_ar,'scheduled_date',v_m.scheduled_date,
      'start_time',v_m.start_time,'location_type',v_m.location_type,'location_details',v_m.location_details
    ),'meeting-invitation:'||v_m.id||':'||r.user_id from recipients r
    on conflict(deduplication_key) do nothing returning 1
  ) select count(*) into v_count from inserted;
  perform qarar_audit.append_audit_log(v_m.organization_id,'meetings.invitations.request','meetings',v_m.id,jsonb_build_object('queued',v_count));
  return jsonb_build_object('meeting_id',v_m.id,'queued',v_count,'status','queued');
end $$;

create or replace function qarar_meetings.get_meeting_readiness(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_m qarar_meetings.meetings%rowtype; v_agenda int; v_members int; v_chair int; v_rapporteur int;
begin
  select * into v_m from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002'; end if;
  if not qarar_iam.is_system_admin() and not qarar_iam.has_permission('meetings.read',v_m.governance_unit_id)
     and not qarar_iam.has_permission('meetings.manage',v_m.governance_unit_id) then raise exception 'غير مصرح بعرض جاهزية الاجتماع.' using errcode='42501'; end if;
  select count(*) into v_agenda from qarar_meetings.agenda_items where meeting_id=v_m.id;
  select count(*),count(*) filter(where r.code='council_chair'),count(*) filter(where r.code='council_rapporteur')
    into v_members,v_chair,v_rapporteur from qarar_iam.memberships ms join qarar_iam.roles r on r.id=ms.role_id
   where ms.governance_unit_id=v_m.governance_unit_id and ms.membership_status='active'
     and ms.start_date<=v_m.scheduled_date and (ms.end_date is null or ms.end_date>=v_m.scheduled_date);
  return jsonb_build_object('ready',v_agenda>0 and v_members>0 and v_chair>0 and v_rapporteur>0,
    'checks',jsonb_build_array(
      jsonb_build_object('code','agenda','label','يوجد بند واحد على الأقل','complete',v_agenda>0,'count',v_agenda),
      jsonb_build_object('code','members','label','يوجد أعضاء فعّالون في تاريخ الاجتماع','complete',v_members>0,'count',v_members),
      jsonb_build_object('code','chair','label','رئيس المجلس فعّال','complete',v_chair>0),
      jsonb_build_object('code','rapporteur','label','مقرر المجلس فعّال','complete',v_rapporteur>0)
    ));
end $$;

create or replace function qarar_minutes.get_meeting_minutes(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_m qarar_meetings.meetings%rowtype;
begin
  select * into v_m from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002'; end if;
  if not qarar_iam.is_system_admin() and not qarar_iam.has_permission('meetings.read',v_m.governance_unit_id)
     and not qarar_iam.has_permission('meetings.manage',v_m.governance_unit_id) then
    raise exception 'غير مصرح بعرض المحضر.' using errcode='42501';
  end if;
  return coalesce((select to_jsonb(mm)-'organization_id' || jsonb_build_object(
      'approvals',coalesce((select jsonb_agg(jsonb_build_object(
        'id',ma.id,'user_id',ma.user_id,'name_ar',u.full_name_ar,'approval_status',ma.approval_status,
        'notes',ma.notes,'resolved_at',ma.resolved_at,'updated_at',ma.updated_at
      ) order by ma.created_at) from qarar_minutes.minute_approvals ma join qarar_iam.users u on u.id=ma.user_id where ma.minute_id=mm.id),'[]'::jsonb)
    ) from qarar_minutes.meeting_minutes mm where mm.meeting_id=v_m.id),'null'::jsonb);
end $$;

create or replace function qarar_minutes.save_meeting_minutes_draft(
  p_meeting_id uuid,
  p_content text,
  p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m qarar_meetings.meetings%rowtype; v_min qarar_minutes.meeting_minutes%rowtype;
begin
  if char_length(btrim(coalesce(p_content,''))) < 20 then raise exception 'يجب ألا يقل نص المحضر عن 20 حرفًا.' using errcode='22023'; end if;
  select * into v_m from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002'; end if;
  perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
  if v_m.status <> 'waiting_for_minutes' then raise exception 'لا يحرر المحضر قبل انتهاء الجلسة.' using errcode='23514'; end if;
  select * into v_min from qarar_minutes.meeting_minutes where meeting_id=v_m.id for update;
  if v_min.id is not null and v_min.status not in ('draft','generated') then raise exception 'المحضر مرسل للمصادقة ولا يمكن تعديله.' using errcode='23514'; end if;
  if v_min.id is not null and p_expected_updated_at is not null and p_expected_updated_at<>v_min.updated_at then
    raise exception 'تم تحديث المحضر؛ أعد تحميله.' using errcode='40001';
  end if;
  if v_min.id is null then
    insert into qarar_minutes.meeting_minutes(organization_id,meeting_id,content_draft,status,created_by_user_id)
    values(v_m.organization_id,v_m.id,btrim(p_content),'draft',auth.uid()) returning * into v_min;
  else
    update qarar_minutes.meeting_minutes set content_draft=btrim(p_content) where id=v_min.id returning * into v_min;
  end if;
  perform qarar_audit.append_audit_log(v_m.organization_id,'minutes.draft.save','meeting_minutes',v_min.id,jsonb_build_object('meeting_id',v_m.id));
  return jsonb_build_object('id',v_min.id,'status',v_min.status,'updated_at',v_min.updated_at);
end $$;

create or replace function qarar_minutes.submit_meeting_minutes(
  p_meeting_id uuid,
  p_content_final text,
  p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m qarar_meetings.meetings%rowtype; v_min qarar_minutes.meeting_minutes%rowtype; v_rule text; v_count int;
begin
  if char_length(btrim(coalesce(p_content_final,''))) < 20 then raise exception 'يجب ألا يقل النص النهائي للمحضر عن 20 حرفًا.' using errcode='22023'; end if;
  select * into v_m from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002'; end if;
  perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
  if v_m.status <> 'waiting_for_minutes' then raise exception 'الاجتماع ليس في مرحلة إعداد المحضر.' using errcode='23514'; end if;
  select * into v_min from qarar_minutes.meeting_minutes where meeting_id=v_m.id for update;
  if v_min.id is null then raise exception 'احفظ مسودة المحضر أولًا.' using errcode='23514'; end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_min.updated_at then raise exception 'تم تحديث المحضر؛ أعد تحميله.' using errcode='40001'; end if;

  update qarar_minutes.meeting_minutes set content_final=btrim(p_content_final),status='ready_for_approval',
    reviewed_by_user_id=auth.uid(),reviewed_at=clock_timestamp() where id=v_min.id returning * into v_min;

  select minute_approval_rule into v_rule from qarar_core.governance_units where id=v_m.governance_unit_id;
  if v_rule='all_present_members' then
    insert into qarar_minutes.minute_approvals(organization_id,minute_id,user_id,membership_id)
    select v_m.organization_id,v_min.id,a.user_id,a.membership_id from qarar_attendance.attendance_records a
    where a.meeting_id=v_m.id and a.attendance_status in('present','late')
    on conflict(minute_id,user_id) do nothing;
  else
    insert into qarar_minutes.minute_approvals(organization_id,minute_id,user_id,membership_id)
    select v_m.organization_id,v_min.id,ms.user_id,ms.id from qarar_iam.memberships ms join qarar_iam.roles r on r.id=ms.role_id
    where ms.governance_unit_id=v_m.governance_unit_id and ms.membership_status='active'
      and ms.start_date<=current_date and (ms.end_date is null or ms.end_date>=current_date)
      and r.code in('council_chair','council_rapporteur')
    on conflict(minute_id,user_id) do nothing;
  end if;
  select count(*) into v_count from qarar_minutes.minute_approvals where minute_id=v_min.id;
  if v_count=0 then raise exception 'لا يوجد مصادقون فعّالون للمحضر؛ تحقق من قيادة المجلس أو قاعدة المصادقة.' using errcode='23514'; end if;
  update qarar_meetings.meetings set status='waiting_for_approval' where id=v_m.id;
  insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
  values(v_m.organization_id,v_m.id,v_m.status,'waiting_for_approval',auth.uid(),'إحالة المحضر للمصادقة');
  perform qarar_audit.append_audit_log(v_m.organization_id,'minutes.submit','meeting_minutes',v_min.id,jsonb_build_object('approvers',v_count));
  return jsonb_build_object('id',v_min.id,'status','ready_for_approval','approvers',v_count);
end $$;

create or replace function qarar_minutes.respond_meeting_minutes_approval(
  p_approval_id uuid,
  p_decision text,
  p_notes text,
  p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a qarar_minutes.minute_approvals%rowtype; v_min qarar_minutes.meeting_minutes%rowtype; v_pending int;
begin
  if p_decision not in('approve','return') then raise exception 'قرار المصادقة غير صحيح.' using errcode='22023'; end if;
  if p_decision='return' and char_length(btrim(coalesce(p_notes,'')))<5 then raise exception 'أدخل سبب الإعادة بما لا يقل عن 5 أحرف.' using errcode='22023'; end if;
  select * into v_a from qarar_minutes.minute_approvals where id=p_approval_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_a.id is null or v_a.user_id<>auth.uid() then raise exception 'طلب المصادقة غير متاح لهذا المستخدم.' using errcode='42501'; end if;
  if v_a.approval_status<>'pending' then raise exception 'تم حسم طلب المصادقة مسبقًا.' using errcode='23514'; end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_a.updated_at then raise exception 'تم تحديث طلب المصادقة؛ أعد التحميل.' using errcode='40001'; end if;
  select * into v_min from qarar_minutes.meeting_minutes where id=v_a.minute_id for update;
  update qarar_minutes.minute_approvals set approval_status=case when p_decision='approve' then 'approved' else 'rejected' end,
    notes=nullif(btrim(coalesce(p_notes,'')),''),resolved_at=clock_timestamp() where id=v_a.id;
  if p_decision='return' then
    update qarar_minutes.meeting_minutes set status='draft' where id=v_min.id;
    delete from qarar_minutes.minute_approvals where minute_id=v_min.id;
    update qarar_meetings.meetings set status='waiting_for_minutes' where id=v_min.meeting_id;
    insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
    values(v_a.organization_id,v_min.meeting_id,'waiting_for_approval','waiting_for_minutes',auth.uid(),p_notes);
  else
    select count(*) into v_pending from qarar_minutes.minute_approvals where minute_id=v_min.id and approval_status<>'approved';
    if v_pending=0 then
      update qarar_minutes.meeting_minutes set status='approved',approved_at=clock_timestamp() where id=v_min.id;
      update qarar_meetings.meetings set status='closed' where id=v_min.meeting_id;
      insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
      values(v_a.organization_id,v_min.meeting_id,'waiting_for_approval','closed',auth.uid(),'اكتمال مصادقات المحضر');
    end if;
  end if;
  perform qarar_audit.append_audit_log(v_a.organization_id,'minutes.approval.respond','minute_approvals',v_a.id,jsonb_build_object('decision',p_decision,'notes',p_notes));
  return jsonb_build_object('approval_id',v_a.id,'decision',p_decision);
end $$;

alter function qarar_meetings.update_agenda_discussion(uuid,text,text,timestamptz) owner to qarar_meetings_executor;
alter function qarar_meetings.complete_meeting_session(uuid,timestamptz) owner to qarar_meetings_executor;
alter function qarar_meetings.send_meeting_invitations(uuid,timestamptz) owner to qarar_meetings_executor;
alter function qarar_meetings.get_meeting_readiness(uuid) owner to qarar_meetings_executor;
grant insert on qarar_governance.notification_outbox to qarar_meetings_executor;
alter function qarar_minutes.get_meeting_minutes(uuid) owner to qarar_minutes_executor;
alter function qarar_minutes.save_meeting_minutes_draft(uuid,text,timestamptz) owner to qarar_minutes_executor;
alter function qarar_minutes.submit_meeting_minutes(uuid,text,timestamptz) owner to qarar_minutes_executor;
alter function qarar_minutes.respond_meeting_minutes_approval(uuid,text,text,timestamptz) owner to qarar_minutes_executor;

revoke all on function qarar_meetings.update_agenda_discussion(uuid,text,text,timestamptz),qarar_meetings.complete_meeting_session(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_meetings.send_meeting_invitations(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_meetings.get_meeting_readiness(uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_minutes.get_meeting_minutes(uuid),qarar_minutes.save_meeting_minutes_draft(uuid,text,timestamptz),
 qarar_minutes.submit_meeting_minutes(uuid,text,timestamptz),qarar_minutes.respond_meeting_minutes_approval(uuid,text,text,timestamptz) from public,anon,authenticated,service_role;

create or replace function api_v1.update_agenda_discussion(p_agenda_item_id uuid,p_status text,p_discussion_notes text,p_expected_updated_at timestamptz)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_meetings.update_agenda_discussion($1,$2,$3,$4)$$;
create or replace function api_v1.complete_meeting_session(p_meeting_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_meetings.complete_meeting_session($1,$2)$$;
create or replace function api_v1.send_meeting_invitations(p_meeting_id uuid,p_expected_updated_at timestamptz)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_meetings.send_meeting_invitations($1,$2)$$;
create or replace function api_v1.get_meeting_readiness(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_meetings.get_meeting_readiness($1)$$;
create or replace function api_v1.get_meeting_minutes(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_minutes.get_meeting_minutes($1)$$;
create or replace function api_v1.save_meeting_minutes_draft(p_meeting_id uuid,p_content text,p_expected_updated_at timestamptz default null)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_minutes.save_meeting_minutes_draft($1,$2,$3)$$;
create or replace function api_v1.submit_meeting_minutes(p_meeting_id uuid,p_content_final text,p_expected_updated_at timestamptz)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_minutes.submit_meeting_minutes($1,$2,$3)$$;
create or replace function api_v1.respond_meeting_minutes_approval(p_approval_id uuid,p_decision text,p_notes text,p_expected_updated_at timestamptz)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_minutes.respond_meeting_minutes_approval($1,$2,$3,$4)$$;

alter function api_v1.update_agenda_discussion(uuid,text,text,timestamptz) owner to qarar_api_executor;
alter function api_v1.complete_meeting_session(uuid,timestamptz) owner to qarar_api_executor;
alter function api_v1.send_meeting_invitations(uuid,timestamptz) owner to qarar_api_executor;
alter function api_v1.get_meeting_readiness(uuid) owner to qarar_api_executor;
alter function api_v1.get_meeting_minutes(uuid) owner to qarar_api_executor;
alter function api_v1.save_meeting_minutes_draft(uuid,text,timestamptz) owner to qarar_api_executor;
alter function api_v1.submit_meeting_minutes(uuid,text,timestamptz) owner to qarar_api_executor;
alter function api_v1.respond_meeting_minutes_approval(uuid,text,text,timestamptz) owner to qarar_api_executor;

grant execute on function api_v1.update_agenda_discussion(uuid,text,text,timestamptz),api_v1.complete_meeting_session(uuid,timestamptz),
 api_v1.send_meeting_invitations(uuid,timestamptz),
 api_v1.get_meeting_readiness(uuid),
 api_v1.get_meeting_minutes(uuid),api_v1.save_meeting_minutes_draft(uuid,text,timestamptz),api_v1.submit_meeting_minutes(uuid,text,timestamptz),
 api_v1.respond_meeting_minutes_approval(uuid,text,text,timestamptz) to authenticated,service_role;
revoke execute on function api_v1.update_agenda_discussion(uuid,text,text,timestamptz),api_v1.complete_meeting_session(uuid,timestamptz),
 api_v1.send_meeting_invitations(uuid,timestamptz),
 api_v1.get_meeting_readiness(uuid),
 api_v1.get_meeting_minutes(uuid),api_v1.save_meeting_minutes_draft(uuid,text,timestamptz),api_v1.submit_meeting_minutes(uuid,text,timestamptz),
 api_v1.respond_meeting_minutes_approval(uuid,text,text,timestamptz) from public,anon;

grant execute on function qarar_meetings.update_agenda_discussion(uuid,text,text,timestamptz),qarar_meetings.complete_meeting_session(uuid,timestamptz) to qarar_api_executor;
grant execute on function qarar_meetings.send_meeting_invitations(uuid,timestamptz) to qarar_api_executor;
grant execute on function qarar_meetings.get_meeting_readiness(uuid) to qarar_api_executor;
grant execute on function qarar_minutes.get_meeting_minutes(uuid),qarar_minutes.save_meeting_minutes_draft(uuid,text,timestamptz),
 qarar_minutes.submit_meeting_minutes(uuid,text,timestamptz),qarar_minutes.respond_meeting_minutes_approval(uuid,text,text,timestamptz) to qarar_api_executor;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
 ('v1','update_agenda_discussion','qarar_meetings','update_agenda_discussion','p_agenda_item_id uuid, p_status text, p_discussion_notes text, p_expected_updated_at timestamp with time zone','meetings','authenticated'),
 ('v1','complete_meeting_session','qarar_meetings','complete_meeting_session','p_meeting_id uuid, p_expected_updated_at timestamp with time zone','meetings','authenticated'),
 ('v1','send_meeting_invitations','qarar_meetings','send_meeting_invitations','p_meeting_id uuid, p_expected_updated_at timestamp with time zone','meetings','authenticated'),
 ('v1','get_meeting_readiness','qarar_meetings','get_meeting_readiness','p_meeting_id uuid','meetings','authenticated'),
 ('v1','get_meeting_minutes','qarar_minutes','get_meeting_minutes','p_meeting_id uuid','minutes','authenticated'),
 ('v1','save_meeting_minutes_draft','qarar_minutes','save_meeting_minutes_draft','p_meeting_id uuid, p_content text, p_expected_updated_at timestamp with time zone','minutes','authenticated'),
 ('v1','submit_meeting_minutes','qarar_minutes','submit_meeting_minutes','p_meeting_id uuid, p_content_final text, p_expected_updated_at timestamp with time zone','minutes','authenticated'),
 ('v1','respond_meeting_minutes_approval','qarar_minutes','respond_meeting_minutes_approval','p_approval_id uuid, p_decision text, p_notes text, p_expected_updated_at timestamp with time zone','minutes','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,
 implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

notify pgrst,'reload schema';
