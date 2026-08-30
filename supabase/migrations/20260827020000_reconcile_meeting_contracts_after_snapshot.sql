-- Reconcile meeting contracts after restoring a snapshot that contained an
-- older function body while the migration ledger already marked the newer
-- contract as applied.

grant select on qarar_iam.memberships, qarar_iam.roles
  to qarar_meetings_executor;

create or replace function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_can_manage boolean;
  v_can_agenda boolean;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();

  if v_m.id is null then
    raise exception using errcode = 'P0002', message = 'الاجتماع غير موجود.';
  end if;
  if v_m.created_by_user_id <> auth.uid()
     and not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('meetings.read', v_m.governance_unit_id)
     and not qarar_iam.has_permission('meetings.manage', v_m.governance_unit_id) then
    raise exception using errcode = '42501', message = 'لا تملك صلاحية عرض هذا الاجتماع.';
  end if;

  v_can_manage := qarar_iam.is_system_admin()
    or qarar_iam.has_permission('meetings.manage', v_m.governance_unit_id);
  v_can_agenda := qarar_iam.is_system_admin()
    or qarar_iam.has_permission('agenda.manage', v_m.governance_unit_id);

  return (
    select to_jsonb(m) || jsonb_build_object(
      'unit_name_ar', gu.name_ar,
      'governance_unit_name_ar', gu.name_ar,
      'meeting_type_name_ar', mt.name_ar,
      'agenda_count', (select count(*) from qarar_meetings.agenda_items where meeting_id = m.id),
      'governance_unit', jsonb_build_object('id', gu.id, 'code', gu.code, 'name_ar', gu.name_ar),
      'meeting_type', jsonb_build_object('id', mt.id, 'code', mt.code, 'name_ar', mt.name_ar),
      'capabilities', jsonb_build_object(
        'can_manage', v_can_manage,
        'can_manage_agenda', v_can_agenda and m.status in ('draft', 'scheduled'),
        'can_schedule', v_can_manage and m.status = 'draft',
        'can_send_invitations', v_can_manage and m.status = 'scheduled',
        'can_prepare_session', v_can_manage and m.status = 'scheduled',
        'can_start_session', v_can_manage and m.status = 'ready_to_start',
        'can_cancel', v_can_manage and m.status in ('draft', 'scheduled', 'ready_to_start'),
        'can_archive', v_can_manage and m.status = 'closed'
      ),
      'agenda_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ai.id,
          'agenda_order', ai.agenda_order,
          'agenda_status', ai.agenda_status,
          'discussion_notes', ai.discussion_notes,
          'is_exception', ai.is_exception,
          'exception_reason', ai.exception_reason,
          'voting_status', ai.voting_status,
          'voting_result', ai.voting_result,
          'updated_at', ai.updated_at,
          'workflow_step_type', governance_context ->> 'workflow_step_type',
          'workflow_responsibility', governance_context ->> 'workflow_responsibility',
          'workflow_step_name_ar', governance_context ->> 'workflow_step_name_ar',
          'voting_available_now', coalesce((governance_context ->> 'voting_available_now')::boolean, false),
          'requires_voting', coalesce((governance_context ->> 'requires_voting')::boolean, false),
          'topic', jsonb_build_object(
            'id', t.id,
            'topic_no', t.topic_no,
            'title_ar', t.title_ar,
            'status', t.status,
            'priority', t.priority,
            'category_name_ar', tc.name_ar,
            'submitted_by_name_ar', submitter.full_name_ar
          )
        ) order by ai.agenda_order)
        from qarar_meetings.agenda_items ai
        join qarar_topics.topics t on t.id = ai.topic_id
        left join qarar_topics.topic_categories tc on tc.id = t.category_id
        join qarar_iam.users submitter on submitter.id = t.submitted_by_user_id
        left join lateral qarar_governance.get_topic_agenda_context(t.id)
          gc(governance_context) on true
        where ai.meeting_id = m.id
      ), '[]'::jsonb),
      'status_history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id,
          'from_status', h.from_status,
          'to_status', h.to_status,
          'reason', h.change_reason,
          'changed_at', h.changed_at
        ) order by h.changed_at, h.id)
        from qarar_meetings.meeting_status_history h
        where h.meeting_id = m.id
      ), '[]'::jsonb)
    )
    from qarar_meetings.meetings m
    join qarar_core.governance_units gu on gu.id = m.governance_unit_id
    left join qarar_meetings.meeting_types mt on mt.id = m.meeting_type_id
    where m.id = v_m.id
  );
end;
$$;

alter function qarar_meetings.get_meeting_detail(uuid)
  owner to qarar_meetings_executor;
revoke all on function qarar_meetings.get_meeting_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_meetings.get_meeting_detail(uuid)
  to qarar_api_executor;

notify pgrst, 'reload schema';
