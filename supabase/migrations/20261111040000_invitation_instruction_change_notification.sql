begin;

create or replace function qarar_meetings.save_agenda_topic_instructions(
  p_meeting_id uuid,
  p_topic_id uuid,
  p_instructions text,
  p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  m qarar_meetings.meetings%rowtype;
  a qarar_meetings.agenda_items%rowtype;
  previous text;
begin
 select * into m from qarar_meetings.meetings
 where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
 if m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.'; end if;
 if not qarar_iam.has_unit_role_code(m.governance_unit_id,array['council_chair','council_rapporteur']) then
   raise exception using errcode='42501',message='تخصيص تعليمات الموضوع متاح لرئيس هذا المجلس أو مقرره فقط.';
 end if;
 perform qarar_iam.assert_permission('agenda.manage',m.governance_unit_id);
 if m.status not in ('draft','scheduled') then
   raise exception using errcode='55000',message='تعليمات المناقشة مقفلة بعد انتهاء تحضير الاجتماع.';
 end if;
 if p_instructions is null or char_length(p_instructions)>10000 then
   raise exception using errcode='22023',message='تعليمات المناقشة يجب ألا تتجاوز الحد المتاح.';
 end if;
 select * into a from qarar_meetings.agenda_items
 where meeting_id=m.id and topic_id=p_topic_id and organization_id=m.organization_id for update;
 if a.id is null then
  if p_expected_updated_at is not null then
    raise exception using errcode='40001',message='تغير جدول الأعمال. حدّث المقترحات ثم أعد المحاولة.';
  end if;
  perform qarar_meetings.add_agenda_item(m.id,p_topic_id,false,null);
  select * into a from qarar_meetings.agenda_items
  where meeting_id=m.id and topic_id=p_topic_id and organization_id=m.organization_id for update;
 elsif p_expected_updated_at is null or a.updated_at<>p_expected_updated_at then
  raise exception using errcode='40001',message='تغير الموضوع المدرج. حدّث الاجتماع قبل إعادة الحفظ.';
 end if;
 previous:=a.discussion_instructions_override;
 update qarar_meetings.agenda_items set discussion_instructions_override=p_instructions
 where id=a.id and organization_id=m.organization_id returning * into a;
 perform qarar_audit.append_audit_log(m.organization_id,'agenda.instructions.update','agenda_item',a.id,
   jsonb_build_object('meeting_id',m.id,'topic_id',p_topic_id,'previous',previous,'current',p_instructions));
 return jsonb_build_object('id',a.id,'updated_at',a.updated_at);
end $$;

create or replace function qarar_meetings.enqueue_agenda_change_notifications()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_meeting_id uuid:=coalesce(new.meeting_id,old.meeting_id);
  v_organization_id uuid:=coalesce(new.organization_id,old.organization_id);
begin
  if tg_op='UPDATE'
    and (new.meeting_id,new.topic_id,new.agenda_order,new.discussion_instructions_override)
      is not distinct from
        (old.meeting_id,old.topic_id,old.agenda_order,old.discussion_instructions_override) then
    return coalesce(new,old);
  end if;
  perform qarar_meetings.enqueue_invitee_change_notifications(
    v_meeting_id,v_organization_id,'meeting.invitation.updated',txid_current()::text
  );
  return coalesce(new,old);
end $$;

drop trigger if exists meeting_agenda_change_notification_events on qarar_meetings.agenda_items;
create trigger meeting_agenda_change_notification_events
after insert or delete or update of meeting_id,topic_id,agenda_order,discussion_instructions_override
on qarar_meetings.agenda_items
for each row execute function qarar_meetings.enqueue_agenda_change_notifications();

alter function qarar_meetings.save_agenda_topic_instructions(uuid,uuid,text,timestamptz) owner to qarar_meetings_executor;
alter function qarar_meetings.enqueue_agenda_change_notifications() owner to qarar_meetings_executor;
revoke all on function qarar_meetings.save_agenda_topic_instructions(uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_meetings.enqueue_agenda_change_notifications() from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.save_agenda_topic_instructions(uuid,uuid,text,timestamptz) to qarar_api_executor;

commit;
