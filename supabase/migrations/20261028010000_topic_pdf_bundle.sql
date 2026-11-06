-- Collapse the authorized topic-document reads into one network round trip.
-- Impact map: docs/engineering/impact/TOPIC_OFFICIAL_PDF_20261027_AR.md
begin;

create function qarar_topics.get_topic_pdf_bundle(
  p_topic_id uuid,
  p_meeting_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_topic jsonb;
  v_meeting jsonb;
  v_candidates jsonb;
  v_printed_by text;
begin
  -- get_topic_detail is the canonical contextual topic-read guard.
  v_topic := qarar_topics.get_topic_detail(p_topic_id);

  if p_meeting_id is not null then
    v_meeting := qarar_meetings.get_meeting_detail(p_meeting_id);
    v_candidates := qarar_meetings.search_eligible_agenda_topics(
      p_meeting_id,
      v_topic->>'topic_no',
      100,
      0
    );
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(v_candidates->'items','[]'::jsonb)) candidate
      where candidate->>'id' = p_topic_id::text
    ) then
      raise exception using
        errcode = '42501',
        message = 'لا يمكن تنزيل ملف الموضوع من سياق هذا الاجتماع.';
    end if;
  end if;

  select u.full_name_ar into v_printed_by
  from qarar_iam.users u
  where u.id = auth.uid()
    and u.organization_id = qarar_iam.current_organization_id()
    and u.status = 'active';

  return jsonb_build_object(
    'topic', v_topic,
    'workflow', qarar_governance.get_topic_workflow(p_topic_id),
    'attachments', qarar_topics.list_topic_attachments(p_topic_id),
    'requirements', qarar_topics.get_topic_requirements_status(p_topic_id),
    'references', qarar_topics.list_topic_regulation_references(p_topic_id),
    'referrals', qarar_topics.get_topic_route_history(p_topic_id),
    'meetings', qarar_topics.get_topic_meeting_history(p_topic_id),
    'activity', qarar_topics.get_topic_activity_timeline(p_topic_id),
    'printed_by', coalesce(v_printed_by, 'مستخدم نظام قرار')
  );
end;
$$;

alter function qarar_topics.get_topic_pdf_bundle(uuid,uuid) owner to qarar_topics_executor;
revoke all on function qarar_topics.get_topic_pdf_bundle(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_topics.get_topic_pdf_bundle(uuid,uuid) to qarar_api_executor;

grant execute on function qarar_governance.get_topic_workflow(uuid) to qarar_topics_executor;
insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values (
  'topics','qarar_governance','get_topic_workflow','p_topic_id uuid',
  'Build one authorized official topic-document read bundle without repeated HTTP round trips'
) on conflict do nothing;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'topics','qarar_topics',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_topics' and p.proname='get_topic_pdf_bundle'
on conflict do nothing;

create function api_v1.get_topic_pdf_bundle(p_topic_id uuid,p_meeting_id uuid default null)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$ select qarar_topics.get_topic_pdf_bundle($1,$2) $$;
alter function api_v1.get_topic_pdf_bundle(uuid,uuid) owner to qarar_api_executor;
revoke all on function api_v1.get_topic_pdf_bundle(uuid,uuid) from public,anon;
grant execute on function api_v1.get_topic_pdf_bundle(uuid,uuid) to authenticated,service_role;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
) values (
  'v1','get_topic_pdf_bundle','qarar_topics','get_topic_pdf_bundle',
  'p_topic_id uuid, p_meeting_id uuid','topics','authenticated'
) on conflict do nothing;

notify pgrst,'reload schema';
commit;
