begin;

grant execute on function qarar_topics.submit_typed_submission_v2(uuid) to qarar_meetings_executor;
grant select on qarar_topics.typed_submission_preparations_v2 to qarar_meetings_executor;

create function qarar_meetings.submit_scheduled_agenda_proposal_v2(
  p_request_id uuid,
  p_meeting_id uuid,
  p_occurrence_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare
  o uuid:=qarar_iam.current_organization_id();
  actor uuid:=auth.uid();
  preparation qarar_topics.typed_submission_preparations_v2%rowtype;
  meeting qarar_meetings.meetings%rowtype;
  occurrence qarar_governance.topic_schedule_occurrences_v2%rowtype;
  first_due_id uuid;
  submitted jsonb;
  agenda jsonb;
begin
  if o is null or actor is null or p_request_id is null or p_meeting_id is null or p_occurrence_id is null then
    raise exception using errcode='22023',message='بيانات استكمال المقترح غير صالحة';
  end if;

  select * into preparation
  from qarar_topics.typed_submission_preparations_v2
  where id=p_request_id and organization_id=o and actor_user_id=actor;
  if preparation.id is null then
    raise exception using errcode='42501',message='تجهيز الموضوع غير متاح';
  end if;

  select * into meeting
  from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=o
  for update;
  if meeting.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود'; end if;
  perform qarar_iam.assert_permission('agenda.manage',meeting.governance_unit_id);
  if meeting.status not in ('draft','scheduled') then
    raise exception using errcode='55000',message='لم يعد الاجتماع قابلاً لتعديل جدول الأعمال';
  end if;

  select * into occurrence
  from qarar_governance.topic_schedule_occurrences_v2
  where id=p_occurrence_id and organization_id=o
  for update;
  if occurrence.id is null then raise exception using errcode='P0002',message='الاستحقاق الدوري غير موجود'; end if;

  if occurrence.status='scheduled'
     and occurrence.meeting_id=meeting.id
     and occurrence.topic_id=(preparation.result->>'topic_id')::uuid then
    return preparation.result||jsonb_build_object(
      'agenda_item_id',occurrence.agenda_item_id,
      'occurrence_id',occurrence.id,
      'idempotent_replay',true
    );
  end if;
  if occurrence.status<>'due' then
    raise exception using errcode='55000',message='تمت معالجة هذا الاستحقاق الدوري مسبقًا';
  end if;
  if occurrence.governance_unit_id<>meeting.governance_unit_id
     or occurrence.topic_type_version_id<>(preparation.input->>'versionId')::uuid
     or meeting.governance_unit_id<>(preparation.input->>'unitId')::uuid
     or occurrence.available_from>coalesce(meeting.scheduled_date,current_date) then
    raise exception using errcode='23514',message='المقترح لا يطابق مجلس الاجتماع أو دورته';
  end if;

  select id into first_due_id
  from qarar_governance.topic_schedule_occurrences_v2
  where organization_id=o
    and governance_unit_id=meeting.governance_unit_id
    and topic_type_version_id=occurrence.topic_type_version_id
    and status='due'
    and available_from<=coalesce(meeting.scheduled_date,current_date)
  order by available_from,id
  for update
  limit 1;
  if first_due_id is distinct from occurrence.id then
    raise exception using errcode='55000',message='استكمل الاستحقاق الأقدم لهذا التصنيف أولًا';
  end if;

  submitted:=qarar_topics.submit_typed_submission_v2(p_request_id);
  agenda:=qarar_meetings.add_agenda_item(
    p_meeting_id,
    (submitted->>'topic_id')::uuid,
    false,
    null
  );

  select * into occurrence
  from qarar_governance.topic_schedule_occurrences_v2
  where id=p_occurrence_id and organization_id=o;
  if occurrence.status<>'scheduled'
     or occurrence.topic_id<>(submitted->>'topic_id')::uuid
     or occurrence.agenda_item_id<>(agenda->>'id')::uuid then
    raise exception using errcode='55000',message='تعذر ربط البند بالاستحقاق الدوري المحدد';
  end if;

  perform qarar_audit.append_audit_log(
    o,
    'meetings.scheduled_agenda_proposal.submit',
    'topic_schedule_occurrences_v2',
    occurrence.id,
    jsonb_build_object('meeting_id',meeting.id,'topic_id',occurrence.topic_id,'agenda_item_id',occurrence.agenda_item_id)
  );
  return submitted||jsonb_build_object(
    'agenda_item_id',occurrence.agenda_item_id,
    'occurrence_id',occurrence.id
  );
end $$;

alter function qarar_meetings.submit_scheduled_agenda_proposal_v2(uuid,uuid,uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.submit_scheduled_agenda_proposal_v2(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.submit_scheduled_agenda_proposal_v2(uuid,uuid,uuid) to qarar_api_executor;

create function api_v2.submit_scheduled_agenda_proposal_v2(
  p_request_id uuid,
  p_meeting_id uuid,
  p_occurrence_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text;
begin
  result:=qarar_meetings.submit_scheduled_agenda_proposal_v2(p_request_id,p_meeting_id,p_occurrence_id);
  return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then
  get stacked diagnostics state=returned_sqlstate,message=message_text;
  return api_v2.governance_error_envelope(state,message,trace);
end $$;

alter function api_v2.submit_scheduled_agenda_proposal_v2(uuid,uuid,uuid) owner to qarar_api_executor;
revoke all on function api_v2.submit_scheduled_agenda_proposal_v2(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function api_v2.submit_scheduled_agenda_proposal_v2(uuid,uuid,uuid) to authenticated;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
) values (
  'qarar_meetings.submit_scheduled_agenda_proposal_v2(uuid,uuid,uuid)'::regprocedure,
  'submit_scheduled_agenda_proposal_v2','p_request_id uuid, p_meeting_id uuid, p_occurrence_id uuid',
  'meetings','qarar_meetings',false
) on conflict(function_oid) do update set
  function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
) values (
  'v2','submit_scheduled_agenda_proposal_v2','qarar_meetings','submit_scheduled_agenda_proposal_v2',
  'p_request_id uuid, p_meeting_id uuid, p_occurrence_id uuid','meetings','authenticated'
) on conflict(api_version,contract_name,identity_arguments) do update set
  implementation_schema=excluded.implementation_schema,
  implementation_name=excluded.implementation_name,
  identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,
  audience=excluded.audience;

notify pgrst,'reload schema';
commit;
