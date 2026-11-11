begin;

create or replace function qarar_minutes.generate_meeting_minutes_draft(p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_content text;
  v_result jsonb;
  v_assignments jsonb;
  v_opening qarar_attendance.meeting_session_openings%rowtype;
  v_confirmation_label text;
begin
  select * into v_m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002';end if;
  perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
  if v_m.status<>'waiting_for_minutes' then
    raise exception 'لا يمكن توليد مسودة المحضر قبل انتهاء الجلسة.' using errcode='23514';
  end if;
  select * into v_opening from qarar_attendance.meeting_session_openings
  where organization_id=v_m.organization_id and meeting_id=v_m.id;
  select case al.metadata->>'confirmation_authority'
      when 'system_admin' then 'مسؤول النظام'
      when 'council_chair' then 'رئيس المجلس'
    end
  into v_confirmation_label
  from qarar_audit.audit_logs al
  where al.organization_id=v_m.organization_id
    and al.entity_id=v_m.id
    and al.action='meetings.session.open'
  order by al.occurred_at desc
  limit 1;
  v_confirmation_label:=coalesce(v_confirmation_label,'رئيس المجلس');
  v_assignments:=qarar_meetings.minutes_assignment_lines(v_m.id,v_m.organization_id);
  v_content:=concat_ws(E'\n',
    'محضر '||v_m.title_ar,
    case when v_m.quorum_continuation is not null then 'تنبيه: انعقد الاجتماع واتُخذت قراراته بنصاب غير مكتمل. السبب: '||(v_m.quorum_continuation->>'reason') end,
    case v_opening.timing_status
      when 'early' then 'تنبيه: بدأت الجلسة مبكرًا بتأكيد '||v_confirmation_label||'، قبل الموعد بـ '||v_opening.difference_minutes||' دقيقة.'
      when 'late' then 'تنبيه: بدأت الجلسة متأخرًا بتأكيد '||v_confirmation_label||'، بعد نهاية الموعد بـ '||v_opening.difference_minutes||' دقيقة.'
    end,
    'رقم الاجتماع: '||v_m.meeting_no,
    'التاريخ: '||v_m.scheduled_date::text,
    'الوقت: '||v_m.start_time::text||' - '||v_m.end_time::text,
    'المكان: '||coalesce(v_m.location_details,v_m.location_type),
    '',
    'الحضور:',
    coalesce((select string_agg('- '||u.full_name_ar||' ('||ar.attendance_status||')',E'\n' order by u.full_name_ar)
      from qarar_attendance.attendance_records ar join qarar_iam.users u on u.id=ar.user_id
      where ar.meeting_id=v_m.id and ar.attendance_status in ('present','late','remote')),'- لا يوجد حضور موثق.'),
    '',
    'جدول الأعمال والقرارات:',
    coalesce((select string_agg(
      ai.agenda_order::text||'. '||t.title_ar||E'\n'||coalesce(nullif(ai.discussion_notes,''),'لم يسجل ملخص للمناقشة.')||
      coalesce(E'\nالقرار '||d.decision_no||': '||d.decision_text,'')||
      coalesce((select string_agg(E'\n- تكليف: '||(line->>'title_ar')||'. المكلَّف: '||coalesce(line->>'assignee_ar','غير محدد')||
        '. المتابع: '||coalesce(line->>'follow_up_ar','غير محدد')||case when line->>'due_date' is null then '. بلا موعد إنجاز محدد'
        else '. المدة: '||(line->>'duration_days')||' يوماً، حتى '||(line->>'due_date') end||
        case when (line->>'requires_evidence')::boolean then '. يتطلب أدلة إنجاز' else '' end||
        coalesce(' ('||(line->>'action_no')||')','')||'.','' order by ord)
        from jsonb_array_elements(v_assignments) with ordinality as lines(line,ord)
        where line->>'agenda_item_id'=ai.id::text),''),E'\n\n' order by ai.agenda_order)
      from qarar_meetings.agenda_items ai join qarar_topics.topics t on t.id=ai.topic_id
      left join qarar_decisions.decisions d on d.agenda_item_id=ai.id where ai.meeting_id=v_m.id),'- لا توجد بنود موثقة.')
  );
  v_result:=qarar_minutes.save_meeting_minutes_draft(v_m.id,v_content,null);
  update qarar_minutes.meeting_minutes set status='generated',generated_by_ai=false,generated_at=clock_timestamp()
  where id=(v_result->>'id')::uuid;
  return v_result||jsonb_build_object('status','generated','content_draft',v_content);
end $$;
alter function qarar_minutes.generate_meeting_minutes_draft(uuid) owner to qarar_minutes_executor;

commit;
