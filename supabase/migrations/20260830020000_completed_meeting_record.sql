begin;

insert into qarar_architecture.module_table_read_allowlist(
  source_module, target_schema, table_name, rationale
) values
  ('meetings', 'qarar_attendance', 'attendance_records', 'Render the final attendance register for completed meetings'),
  ('meetings', 'qarar_attendance', 'quorum_snapshots', 'Render the final quorum result for completed meetings'),
  ('meetings', 'qarar_voting', 'voting_rounds', 'Render voting outcomes for completed meeting agenda items'),
  ('meetings', 'qarar_decisions', 'decisions', 'Render decisions issued from completed meetings'),
  ('meetings', 'qarar_minutes', 'minute_approvals', 'Render minute approval and signature status'),
  ('meetings', 'qarar_topics', 'topics', 'Render topic metadata in the completed meeting record'),
  ('meetings', 'qarar_iam', 'users', 'Resolve attendee and minute approver display names')
on conflict do nothing;

grant usage on schema qarar_attendance, qarar_voting, qarar_decisions,
  qarar_minutes, qarar_topics, qarar_iam to qarar_meetings_executor;
grant select on qarar_attendance.attendance_records, qarar_attendance.quorum_snapshots,
  qarar_voting.voting_rounds, qarar_decisions.decisions,
  qarar_minutes.meeting_minutes, qarar_minutes.minute_approvals,
  qarar_topics.topics, qarar_iam.users to qarar_meetings_executor;
grant execute on function qarar_iam.current_organization_id(),
  qarar_iam.is_system_admin(), qarar_iam.has_permission(text, uuid)
  to qarar_meetings_executor;

create or replace function qarar_meetings.get_completed_meeting_record(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_meeting qarar_meetings.meetings%rowtype;
  v_result jsonb;
begin
  select * into v_meeting
  from qarar_meetings.meetings
  where id = p_meeting_id and organization_id = v_org;

  if not found then
    raise exception 'meeting_not_found' using errcode = 'P0002';
  end if;

  if not (
    qarar_iam.is_system_admin()
    or v_meeting.created_by_user_id = auth.uid()
    or qarar_iam.has_permission('meetings.read', v_meeting.governance_unit_id)
    or qarar_iam.has_permission('meetings.manage', v_meeting.governance_unit_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_meeting.status not in ('closed', 'archived') then
    raise exception 'meeting_not_completed' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'meeting_id', v_meeting.id,
    'status', v_meeting.status,
    'quorum', coalesce((
      select to_jsonb(q) - 'organization_id'
      from qarar_attendance.quorum_snapshots q
      where q.organization_id = v_org and q.meeting_id = v_meeting.id
      order by q.calculated_at desc limit 1
    ), '{}'::jsonb),
    'attendance', jsonb_build_object(
      'eligible_count', (select count(*) from qarar_attendance.attendance_records a where a.organization_id = v_org and a.meeting_id = v_meeting.id),
      'present_count', (select count(*) from qarar_attendance.attendance_records a where a.organization_id = v_org and a.meeting_id = v_meeting.id and a.attendance_status in ('present', 'late')),
      'absent_count', (select count(*) from qarar_attendance.attendance_records a where a.organization_id = v_org and a.meeting_id = v_meeting.id and a.attendance_status = 'absent'),
      'excused_count', (select count(*) from qarar_attendance.attendance_records a where a.organization_id = v_org and a.meeting_id = v_meeting.id and a.attendance_status = 'excused'),
      'records', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'user_id', a.user_id, 'full_name_ar', coalesce(u.full_name_ar, u.full_name_en, '—'),
          'status', a.attendance_status, 'verification_status', a.verification_status,
          'check_in_method', a.check_in_method, 'check_in_at', a.check_in_at, 'verified_at', a.verified_at
        ) order by coalesce(u.full_name_ar, u.full_name_en, ''))
        from qarar_attendance.attendance_records a
        left join qarar_iam.users u on u.id = a.user_id and u.organization_id = a.organization_id
        where a.organization_id = v_org and a.meeting_id = v_meeting.id
      ), '[]'::jsonb)
    ),
    'agenda_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ai.id, 'agenda_order', ai.agenda_order, 'agenda_status', ai.agenda_status,
        'discussion_notes', ai.discussion_notes, 'voting_status', ai.voting_status,
        'voting_result', ai.voting_result,
        'topic', jsonb_build_object('id', t.id, 'topic_no', t.topic_no, 'title_ar', t.title_ar, 'status', t.status, 'priority', t.priority),
        'voting_rounds', coalesce((select jsonb_agg(to_jsonb(vr) - 'organization_id' order by vr.round_number) from qarar_voting.voting_rounds vr where vr.organization_id = v_org and vr.agenda_item_id = ai.id), '[]'::jsonb),
        'decisions', coalesce((select jsonb_agg(to_jsonb(d) - 'organization_id' order by d.issued_at, d.created_at) from qarar_decisions.decisions d where d.organization_id = v_org and d.agenda_item_id = ai.id), '[]'::jsonb)
      ) order by ai.agenda_order)
      from qarar_meetings.agenda_items ai
      left join qarar_topics.topics t on t.id = ai.topic_id and t.organization_id = ai.organization_id
      where ai.organization_id = v_org and ai.meeting_id = v_meeting.id
    ), '[]'::jsonb),
    'minutes', (
      select (to_jsonb(mm) - 'organization_id') || jsonb_build_object(
        'approvals', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ma.id, 'user_id', ma.user_id, 'full_name_ar', coalesce(u.full_name_ar, u.full_name_en, '—'),
            'approval_status', ma.approval_status, 'notes', ma.notes, 'resolved_at', ma.resolved_at,
            'signed_at', ma.signed_at, 'has_signature', ma.signature_hash is not null
          ) order by ma.created_at)
          from qarar_minutes.minute_approvals ma
          left join qarar_iam.users u on u.id = ma.user_id and u.organization_id = ma.organization_id
          where ma.organization_id = v_org and ma.minute_id = mm.id
        ), '[]'::jsonb)
      )
      from qarar_minutes.meeting_minutes mm
      where mm.organization_id = v_org and mm.meeting_id = v_meeting.id
      order by mm.updated_at desc limit 1
    )
  ) into v_result;

  return v_result;
end;
$function$;

alter function qarar_meetings.get_completed_meeting_record(uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.get_completed_meeting_record(uuid) from public, anon, authenticated, service_role;
grant execute on function qarar_meetings.get_completed_meeting_record(uuid) to qarar_api_executor, qarar_meetings_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'meetings', 'qarar_meetings', false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_meetings' and p.proname = 'get_completed_meeting_record'
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code,
    owning_schema = excluded.owning_schema, is_rls_predicate = excluded.is_rls_predicate;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
) values ('v1', 'get_completed_meeting_record', 'qarar_meetings', 'get_completed_meeting_record',
  'p_meeting_id uuid', 'meetings', 'authenticated')
on conflict (api_version, contract_name, identity_arguments) do update
set implementation_schema = excluded.implementation_schema,
    implementation_name = excluded.implementation_name, module_code = excluded.module_code,
    audience = excluded.audience, deprecated_at = null, replacement_contract = null;

create or replace function api_v1.get_completed_meeting_record(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog'
as $function$ select qarar_meetings.get_completed_meeting_record($1) $function$;
alter function api_v1.get_completed_meeting_record(uuid) owner to qarar_api_executor;
revoke all on function api_v1.get_completed_meeting_record(uuid) from public, anon, authenticated, service_role;
grant execute on function api_v1.get_completed_meeting_record(uuid) to authenticated, service_role;

update qarar_architecture.api_release_registry release
set contract_count = (select count(*) from qarar_architecture.api_contract_registry where api_version = release.api_version),
    contract_hash = (
      select md5(string_agg(p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' || pg_get_function_result(p.oid) || '|' || registry.audience, E'\n' order by p.proname, pg_get_function_identity_arguments(p.oid)))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'api_v1'
      join qarar_architecture.api_contract_registry registry on registry.api_version = release.api_version and registry.contract_name = p.proname and registry.identity_arguments = pg_get_function_identity_arguments(p.oid)
    ), released_at = clock_timestamp(), notes = 'Completed meeting records expose attendance, agenda outcomes, votes, decisions, and minutes as one governed read model.'
where release.api_version = 'v1';

notify pgrst, 'reload schema';
commit;
