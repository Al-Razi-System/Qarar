begin;

insert into qarar_architecture.module_table_read_allowlist(
  source_module, target_schema, table_name, rationale
) values ('meetings', 'qarar_topics', 'topic_attachments', 'Expose governed topic files to authorized meeting participants during agenda discussion')
on conflict do nothing;

grant select on qarar_topics.topic_attachments to qarar_meetings_executor;

create or replace function qarar_meetings.list_meeting_topic_attachments(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_meeting qarar_meetings.meetings%rowtype;
begin
  select * into v_meeting
  from qarar_meetings.meetings
  where id = p_meeting_id and organization_id = v_org;

  if not found then raise exception 'meeting_not_found' using errcode = 'P0002'; end if;

  if not (
    qarar_iam.is_system_admin()
    or v_meeting.created_by_user_id = auth.uid()
    or qarar_iam.has_permission('meetings.read', v_meeting.governance_unit_id)
    or qarar_iam.has_permission('meetings.manage', v_meeting.governance_unit_id)
    or exists (
      select 1 from qarar_attendance.attendance_records attendance
      where attendance.organization_id = v_org
        and attendance.meeting_id = v_meeting.id
        and attendance.user_id = auth.uid()
    )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', attachment.id,
      'topic_id', attachment.topic_id,
      'file_name', attachment.file_name,
      'file_url', attachment.file_url,
      'mime_type', attachment.mime_type,
      'file_size_bytes', attachment.file_size_bytes,
      'description', attachment.description,
      'created_at', attachment.created_at
    ) order by item.agenda_order, attachment.created_at desc)
    from qarar_meetings.agenda_items item
    join qarar_topics.topic_attachments attachment
      on attachment.topic_id = item.topic_id
     and attachment.organization_id = item.organization_id
    where item.organization_id = v_org and item.meeting_id = v_meeting.id
  ), '[]'::jsonb);
end;
$function$;

alter function qarar_meetings.list_meeting_topic_attachments(uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.list_meeting_topic_attachments(uuid) from public, anon, authenticated, service_role;
grant execute on function qarar_meetings.list_meeting_topic_attachments(uuid) to qarar_api_executor, qarar_meetings_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'meetings', 'qarar_meetings', false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_meetings' and p.proname = 'list_meeting_topic_attachments'
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code,
    owning_schema = excluded.owning_schema, is_rls_predicate = excluded.is_rls_predicate;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
) values ('v1', 'list_meeting_topic_attachments', 'qarar_meetings', 'list_meeting_topic_attachments',
  'p_meeting_id uuid', 'meetings', 'authenticated')
on conflict (api_version, contract_name, identity_arguments) do update
set implementation_schema = excluded.implementation_schema,
    implementation_name = excluded.implementation_name,
    module_code = excluded.module_code, audience = excluded.audience,
    deprecated_at = null, replacement_contract = null;

create or replace function api_v1.list_meeting_topic_attachments(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog'
as $function$ select qarar_meetings.list_meeting_topic_attachments($1) $function$;
alter function api_v1.list_meeting_topic_attachments(uuid) owner to qarar_api_executor;
revoke all on function api_v1.list_meeting_topic_attachments(uuid) from public, anon, authenticated, service_role;
grant execute on function api_v1.list_meeting_topic_attachments(uuid) to authenticated, service_role;

update qarar_architecture.api_release_registry release
set contract_count = (select count(*) from qarar_architecture.api_contract_registry where api_version = release.api_version),
    contract_hash = (
      select md5(string_agg(p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' || pg_get_function_result(p.oid) || '|' || registry.audience, E'\n' order by p.proname, pg_get_function_identity_arguments(p.oid)))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'api_v1'
      join qarar_architecture.api_contract_registry registry on registry.api_version = release.api_version and registry.contract_name = p.proname and registry.identity_arguments = pg_get_function_identity_arguments(p.oid)
    ), released_at = clock_timestamp(), notes = 'Authorized meeting participants can review private topic attachments during agenda discussion.'
where release.api_version = 'v1';

notify pgrst, 'reload schema';
commit;
