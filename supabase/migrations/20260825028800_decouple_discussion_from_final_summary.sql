begin;

create or replace function qarar_meetings.update_agenda_discussion(
  p_agenda_item_id uuid,
  p_status text,
  p_discussion_notes text,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_item qarar_meetings.agenda_items%rowtype;
  v_meeting qarar_meetings.meetings%rowtype;
  v_is_manager boolean;
  v_is_operator boolean;
begin
  if p_status not in ('under_discussion','discussed','postponed') then
    raise exception 'حالة مناقشة البند غير صحيحة.' using errcode='22023';
  end if;
  if p_status='postponed' and char_length(btrim(coalesce(p_discussion_notes,'')))<5 then
    raise exception 'أدخل سبب التأجيل بما لا يقل عن 5 أحرف.' using errcode='22023';
  end if;

  select * into v_item
  from qarar_meetings.agenda_items
  where id=p_agenda_item_id
    and organization_id=qarar_iam.current_organization_id()
  for update;
  if v_item.id is null then
    raise exception 'بند جدول الأعمال غير موجود.' using errcode='P0002';
  end if;

  select * into v_meeting from qarar_meetings.meetings where id=v_item.meeting_id;
  if v_meeting.status<>'in_progress' then
    raise exception 'يمكن توثيق المناقشة أثناء انعقاد الاجتماع فقط.' using errcode='23514';
  end if;

  v_is_manager:=qarar_attendance.can_manage_live_meeting(v_meeting.id);
  v_is_operator:=qarar_attendance.can_operate_live_meeting(v_meeting.id);
  if not v_is_operator then
    raise exception 'توثيق الجلسة متاح لرئيس المجلس أو مقرره فقط.' using errcode='42501';
  end if;
  if p_status<>v_item.agenda_status and not v_is_manager then
    raise exception 'بدء المناقشة أو حسمها من اختصاص رئيس المجلس.' using errcode='42501';
  end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_item.updated_at then
    raise exception 'تم تعديل البند؛ حدّث الجلسة ثم أعد المحاولة.' using errcode='40001';
  end if;

  if v_is_manager and p_status<>v_item.agenda_status and p_status in ('under_discussion','discussed') then
    perform qarar_governance.advance_topic_from_agenda_review(
      v_item.topic_id,
      v_meeting.governance_unit_id,
      'أُدرج الموضوع في جدول الأعمال وانتقل من المناقشة إلى الإجراء الحاكم التالي.'
    );
  end if;

  update qarar_meetings.agenda_items
     set agenda_status=p_status,
         discussion_notes=nullif(btrim(coalesce(p_discussion_notes,'')),'')
   where id=v_item.id;

  perform qarar_audit.append_audit_log(
    v_item.organization_id,'agenda.discussion.update','agenda_items',v_item.id,
    jsonb_build_object('previous_status',v_item.agenda_status,'status',p_status,'notes',p_discussion_notes)
  );
  return jsonb_build_object('id',v_item.id,'status',p_status);
end;
$$;

alter function qarar_meetings.update_agenda_discussion(uuid,text,text,timestamptz)
  owner to qarar_meetings_executor;
revoke all on function qarar_meetings.update_agenda_discussion(uuid,text,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.update_agenda_discussion(uuid,text,text,timestamptz)
  to qarar_api_executor;

commit;
