begin;

create or replace function qarar_governance.get_topic_agenda_context(p_topic_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'workflow_step_type',current_ts.step_type,
    'workflow_responsibility',current_ts.responsibility,
    'workflow_step_name_ar',current_ts.name_ar,
    'voting_available_now',coalesce(current_step.status='active' and current_ts.step_type='voting',false),
    'requires_voting',exists(
      select 1
      from qarar_governance.workflow_instance_steps future_step
      join qarar_governance.workflow_template_steps future_ts on future_ts.id=future_step.template_step_id
      where future_step.workflow_instance_id=t.workflow_instance_id
        and future_step.sequence_no>=coalesce(current_step.sequence_no,0)
        and future_ts.step_type='voting'
        and future_step.status in ('pending','active')
    )
  )
  from qarar_topics.topics t
  left join qarar_governance.workflow_instance_steps current_step
    on current_step.id=t.current_workflow_step_id
   and current_step.workflow_instance_id=t.workflow_instance_id
  left join qarar_governance.workflow_template_steps current_ts on current_ts.id=current_step.template_step_id
  where t.id=p_topic_id
    and t.organization_id=qarar_iam.current_organization_id()
$$;

create or replace function qarar_governance.advance_topic_from_agenda_review(
  p_topic_id uuid,
  p_governance_unit_id uuid,
  p_comment text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_topic qarar_topics.topics%rowtype;
  v_instance qarar_governance.workflow_instances%rowtype;
  v_step record;
  v_transition qarar_governance.workflow_template_transitions%rowtype;
  v_next_step_id uuid;
begin
  select * into v_topic
  from qarar_topics.topics
  where id=p_topic_id
    and organization_id=qarar_iam.current_organization_id()
  for update;
  if v_topic.id is null then
    raise exception 'الموضوع غير موجود.' using errcode='P0002';
  end if;

  select s.id,s.action_version,s.assigned_unit_id,ts.step_type,ts.responsibility
    into v_step
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=v_topic.current_workflow_step_id
    and s.workflow_instance_id=v_topic.workflow_instance_id
    and s.status='active';

  if v_step.id is null
     or v_step.step_type<>'review'
     or v_step.responsibility<>'present' then
    return jsonb_build_object('advanced',false,'reason','not_an_agenda_review_step');
  end if;
  if v_step.assigned_unit_id<>p_governance_unit_id then
    raise exception 'لا يطابق الاجتماع الجهة المسؤولة عن خطوة إدراج الموضوع.' using errcode='23514';
  end if;

  select * into v_instance
  from qarar_governance.workflow_instances
  where id=v_topic.workflow_instance_id and status='active'
  for update;
  if v_instance.id is null or v_instance.current_step_id<>v_step.id then
    raise exception 'تغيرت خطوة حوكمة الموضوع؛ حدّث الاجتماع ثم أعد المحاولة.' using errcode='40001';
  end if;

  select * into v_transition
  from qarar_governance.workflow_template_transitions
  where workflow_template_version_id=v_instance.workflow_template_version_id
    and from_step_id=(select template_step_id from qarar_governance.workflow_instance_steps where id=v_step.id)
    and outcome_code='approved';
  if v_transition.id is null or v_transition.to_step_id is null then
    raise exception 'لا يوجد انتقال معتمد بعد خطوة إدراج الموضوع.' using errcode='23514';
  end if;

  select id into v_next_step_id
  from qarar_governance.workflow_instance_steps
  where workflow_instance_id=v_instance.id
    and template_step_id=v_transition.to_step_id;
  if v_next_step_id is null then
    raise exception 'خطوة الحوكمة التالية غير مهيأة.' using errcode='23514';
  end if;

  update qarar_governance.workflow_instance_steps
     set status='completed',acted_by_user_id=auth.uid(),acted_at=now(),
         outcome_code='approved',comment=p_comment,
         action_idempotency_key=gen_random_uuid(),action_version=action_version+1
   where id=v_step.id;
  update qarar_governance.workflow_instance_steps
     set status='active',opened_at=coalesce(opened_at,now())
   where id=v_next_step_id;
  update qarar_governance.workflow_instances
     set current_step_id=v_next_step_id
   where id=v_instance.id;

  perform qarar_topics.apply_governance_snapshot(
    v_topic.id,v_topic.governance_source,'routing_ready',v_topic.policy_id,
    v_topic.policy_version_id,v_topic.policy_item_id,v_topic.policy_scope_assignment_id,
    v_instance.workflow_template_version_id,v_instance.id,v_next_step_id,v_topic.routing_decision_id
  );

  return jsonb_build_object('advanced',true,'completed_step_id',v_step.id,'next_step_id',v_next_step_id);
end;
$$;

alter function qarar_governance.get_topic_agenda_context(uuid) owner to qarar_governance_executor;
alter function qarar_governance.advance_topic_from_agenda_review(uuid,uuid,text) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_agenda_context(uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_governance.advance_topic_from_agenda_review(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_topic_agenda_context(uuid) to qarar_meetings_executor;
grant execute on function qarar_governance.advance_topic_from_agenda_review(uuid,uuid,text) to qarar_meetings_executor;

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
  if p_status in ('discussed','postponed') and char_length(btrim(coalesce(p_discussion_notes,''))) < 5 then
    raise exception 'أدخل ملخص النتائج أو سبب التأجيل بما لا يقل عن 5 أحرف.' using errcode='22023';
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

  -- Listing the topic and starting its discussion completes the preceding
  -- presentation/review gate. Voting remains governed by the next active step.
  if v_is_manager and p_status<>v_item.agenda_status and p_status in ('under_discussion','discussed') then
    perform qarar_governance.advance_topic_from_agenda_review(
      v_item.topic_id,
      v_meeting.governance_unit_id,
      'أُدرج الموضوع في جدول الأعمال وبدأت مناقشته في الاجتماع.'
    );
  end if;

  update qarar_meetings.agenda_items
     set agenda_status=p_status,
         discussion_notes=nullif(btrim(coalesce(p_discussion_notes,'')),'')
   where id=v_item.id;

  perform qarar_audit.append_audit_log(
    v_item.organization_id,
    'agenda.discussion.update',
    'agenda_items',
    v_item.id,
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

create or replace function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_can_manage boolean;
  v_can_agenda boolean;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id=p_meeting_id
    and organization_id=qarar_iam.current_organization_id();

  if v_m.id is null then
    raise exception using errcode='P0002',message='الاجتماع غير موجود.';
  end if;
  if v_m.created_by_user_id<>auth.uid()
     and not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('meetings.read',v_m.governance_unit_id)
     and not qarar_iam.has_permission('meetings.manage',v_m.governance_unit_id) then
    raise exception using errcode='42501',message='لا تملك صلاحية عرض هذا الاجتماع.';
  end if;

  v_can_manage:=qarar_iam.is_system_admin()
    or qarar_iam.has_permission('meetings.manage',v_m.governance_unit_id);
  v_can_agenda:=qarar_iam.is_system_admin()
    or qarar_iam.has_permission('agenda.manage',v_m.governance_unit_id);

  return (
    select to_jsonb(m) || jsonb_build_object(
      'unit_name_ar',gu.name_ar,
      'governance_unit_name_ar',gu.name_ar,
      'meeting_type_name_ar',mt.name_ar,
      'agenda_count',(select count(*) from qarar_meetings.agenda_items where meeting_id=m.id),
      'governance_unit',jsonb_build_object('id',gu.id,'code',gu.code,'name_ar',gu.name_ar),
      'meeting_type',jsonb_build_object('id',mt.id,'code',mt.code,'name_ar',mt.name_ar),
      'capabilities',jsonb_build_object(
        'can_manage',v_can_manage,
        'can_manage_agenda',v_can_agenda and m.status in ('draft','scheduled'),
        'can_schedule',v_can_manage and m.status='draft',
        'can_send_invitations',v_can_manage and m.status='scheduled',
        'can_prepare_session',v_can_manage and m.status='scheduled',
        'can_start_session',v_can_manage and m.status='ready_to_start',
        'can_cancel',v_can_manage and m.status in ('draft','scheduled','ready_to_start'),
        'can_archive',v_can_manage and m.status='closed'
      ),
      'agenda_items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',ai.id,
          'agenda_order',ai.agenda_order,
          'agenda_status',ai.agenda_status,
          'discussion_notes',ai.discussion_notes,
          'is_exception',ai.is_exception,
          'exception_reason',ai.exception_reason,
          'voting_status',ai.voting_status,
          'voting_result',ai.voting_result,
          'updated_at',ai.updated_at,
          'workflow_step_type',governance_context->>'workflow_step_type',
          'workflow_responsibility',governance_context->>'workflow_responsibility',
          'workflow_step_name_ar',governance_context->>'workflow_step_name_ar',
          'voting_available_now',coalesce((governance_context->>'voting_available_now')::boolean,false),
          'requires_voting',coalesce((governance_context->>'requires_voting')::boolean,false),
          'topic',jsonb_build_object(
            'id',t.id,
            'topic_no',t.topic_no,
            'title_ar',t.title_ar,
            'status',t.status,
            'priority',t.priority,
            'category_name_ar',tc.name_ar,
            'submitted_by_name_ar',submitter.full_name_ar
          )
        ) order by ai.agenda_order)
        from qarar_meetings.agenda_items ai
        join qarar_topics.topics t on t.id=ai.topic_id
        left join qarar_topics.topic_categories tc on tc.id=t.category_id
        join qarar_iam.users submitter on submitter.id=t.submitted_by_user_id
        left join lateral qarar_governance.get_topic_agenda_context(t.id) gc(governance_context) on true
        where ai.meeting_id=m.id
      ),'[]'::jsonb),
      'status_history',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',h.id,
          'from_status',h.from_status,
          'to_status',h.to_status,
          'reason',h.change_reason,
          'changed_at',h.changed_at
        ) order by h.changed_at,h.id)
        from qarar_meetings.meeting_status_history h
        where h.meeting_id=m.id
      ),'[]'::jsonb)
    )
    from qarar_meetings.meetings m
    join qarar_core.governance_units gu on gu.id=m.governance_unit_id
    left join qarar_meetings.meeting_types mt on mt.id=m.meeting_type_id
    where m.id=v_m.id
  );
end;
$$;

alter function qarar_meetings.get_meeting_detail(uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.get_meeting_detail(uuid)
  from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.get_meeting_detail(uuid) to qarar_api_executor;

commit;
