-- Official topic PDF export receipt. The document route reads the existing
-- authorized topic contracts, renders the file, then records the successful
-- export before returning bytes to the caller.
-- Impact map: docs/engineering/impact/TOPIC_OFFICIAL_PDF_20261027_AR.md
begin;

create function qarar_topics.record_topic_pdf_export(p_topic_id uuid, p_meeting_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_actor uuid := auth.uid();
  v_topic jsonb;
  v_meeting jsonb;
  v_candidates jsonb;
  v_recorded_at timestamptz := clock_timestamp();
begin
  if v_org is null or v_actor is null then
    raise exception using errcode = '42501', message = 'يلزم تسجيل الدخول لتنزيل ملف الموضوع.';
  end if;

  -- Reuse the same contextual guards as the two screens. This avoids a
  -- second, weaker interpretation of topic or meeting visibility.
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

  perform qarar_audit.append_audit_log(
    v_org,
    'topics.pdf.export',
    'topics',
    p_topic_id,
    jsonb_build_object(
      'topic_no', v_topic->>'topic_no',
      'meeting_id', p_meeting_id,
      'meeting_no', v_meeting->>'meeting_no',
      'recorded_at', v_recorded_at
    )
  );

  return jsonb_build_object(
    'recorded', true,
    'topic_id', p_topic_id,
    'meeting_id', p_meeting_id,
    'actor_user_id', v_actor,
    'recorded_at', v_recorded_at
  );
end;
$$;

alter function qarar_topics.record_topic_pdf_export(uuid,uuid) owner to qarar_topics_executor;
revoke all on function qarar_topics.record_topic_pdf_export(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_topics.record_topic_pdf_export(uuid,uuid) to qarar_api_executor;

-- The topic module delegates meeting-context authorization to the meeting
-- module instead of reading its tables or duplicating its permission rules.
grant execute on function qarar_meetings.get_meeting_detail(uuid) to qarar_topics_executor;
grant execute on function qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer) to qarar_topics_executor;
insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values (
  'topics','qarar_meetings','get_meeting_detail','p_meeting_id uuid',
  'Verify the optional meeting context before recording an official topic PDF export'
) on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values (
  'topics','qarar_meetings','search_eligible_agenda_topics',
  'p_meeting_id uuid, p_query text, p_limit integer, p_offset integer',
  'Verify that a topic PDF requested from an agenda proposal is eligible for that meeting'
) on conflict do nothing;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'topics','qarar_topics',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_topics' and p.proname='record_topic_pdf_export'
on conflict do nothing;

create function api_v1.record_topic_pdf_export(p_topic_id uuid, p_meeting_id uuid default null)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$ select qarar_topics.record_topic_pdf_export($1,$2) $$;
alter function api_v1.record_topic_pdf_export(uuid,uuid) owner to qarar_api_executor;
revoke all on function api_v1.record_topic_pdf_export(uuid,uuid) from public,anon;
grant execute on function api_v1.record_topic_pdf_export(uuid,uuid) to authenticated,service_role;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
) values (
  'v1','record_topic_pdf_export','qarar_topics','record_topic_pdf_export',
  'p_topic_id uuid, p_meeting_id uuid','topics','authenticated'
) on conflict do nothing;

notify pgrst,'reload schema';
commit;
