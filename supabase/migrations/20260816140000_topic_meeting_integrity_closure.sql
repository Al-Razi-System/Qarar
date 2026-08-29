-- Close the remaining topic -> meeting integrity gaps without adding API contracts.

insert into qarar_architecture.module_table_read_allowlist(
  source_module,target_schema,table_name,rationale
) values (
  'topics','storage','objects','Validate that topic evidence was written to the private bucket before registering metadata'
) on conflict do nothing;

grant usage on schema storage to qarar_topics_executor;
grant select on storage.objects to qarar_topics_executor;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
 ('meetings','qarar_voting','voting_rounds','Block session completion while an approved vote has no decision'),
 ('meetings','qarar_decisions','decisions','Verify that every approved vote was formalized as a decision')
on conflict do nothing;
grant usage on schema qarar_voting,qarar_decisions to qarar_meetings_executor;
grant select on qarar_voting.voting_rounds,qarar_decisions.decisions to qarar_meetings_executor;

create or replace function qarar_topics.add_topic_attachment(
  p_topic_id uuid,p_file_name text,p_file_url text,p_mime_type text,p_file_size_bytes bigint,
  p_description text,p_requirement_code text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_topics as $$
declare
  v_result jsonb; v_attachment uuid; v_type text; v_item uuid; v_storage_path text;
  v_object record;
begin
  if p_file_url !~ '^https?://[^/?#]+/api/admin/topics/upload\?'
     or p_file_url !~ (('(^|[?&])topicId=' || p_topic_id::text || '(&|$)'))
     or p_file_url !~ (('[?&]path=topics%2F' || p_topic_id::text || '%2F')) then
    raise exception using errcode='22023',message='رابط مرفق الموضوع غير صادر من مسار الرفع المعتمد';
  end if;
  select (regexp_match(p_file_url,'[?&]path=([^&]+)'))[1] into v_storage_path;
  v_storage_path := replace(v_storage_path, '%2F', '/');
  if v_storage_path !~ ('^topics/' || p_topic_id::text || '/[0-9a-f-]+\.(pdf|png|jpg|docx)$') then
    raise exception using errcode='22023',message='مسار مرفق الموضوع غير صالح';
  end if;
  select o.name,o.metadata into v_object from storage.objects o
   where o.bucket_id='qarar-evidence' and o.name=v_storage_path;
  if v_object.name is null then
    raise exception using errcode='23514',message='لا يمكن تسجيل مرفق غير موجود في المخزن الخاص';
  end if;
  if coalesce((v_object.metadata->>'size')::bigint,-1) <> p_file_size_bytes
     or coalesce(v_object.metadata->>'mimetype','') <> p_mime_type then
    raise exception using errcode='23514',message='بيانات المرفق لا تطابق الكائن المخزن';
  end if;
  if p_mime_type not in ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception using errcode='22023',message='نوع المرفق غير مسموح';
  end if;

  if nullif(btrim(coalesce(p_requirement_code,'')),'') is not null then
    select policy_item_id into v_item from qarar_topics.topics where id=p_topic_id and organization_id=qarar_iam.current_organization_id();
    select q.requirement_type into v_type from qarar_governance.policy_rules r
      join qarar_governance.rule_requirements q on q.policy_rule_id=r.id and q.organization_id=r.organization_id
    where r.policy_item_id=v_item and r.organization_id=qarar_iam.current_organization_id() and r.status='active'
      and r.rule_code||':'||q.requirement_code=p_requirement_code;
    if v_type not in('document','evidence') then raise exception using errcode='23514',message='المتطلب المختار لا يكتمل برفع ملف'; end if;
  end if;
  v_result:=qarar_topics.add_topic_attachment(p_topic_id,p_file_name,p_file_url,p_mime_type,p_file_size_bytes,p_description);
  v_attachment:=(v_result->>'id')::uuid;
  update qarar_topics.topic_attachments set requirement_code=nullif(btrim(coalesce(p_requirement_code,'')),'') where id=v_attachment;
  if nullif(btrim(coalesce(p_requirement_code,'')),'') is not null then
    insert into qarar_topics.topic_requirement_fulfillments(
      organization_id,topic_id,requirement_code,status,evidence_attachment_id,fulfilled_by_user_id,fulfilled_at
    ) values(qarar_iam.current_organization_id(),p_topic_id,p_requirement_code,'fulfilled',v_attachment,auth.uid(),clock_timestamp())
    on conflict(topic_id,requirement_code) do update set status='fulfilled',evidence_attachment_id=excluded.evidence_attachment_id,
      fulfilled_by_user_id=excluded.fulfilled_by_user_id,fulfilled_at=excluded.fulfilled_at,updated_at=clock_timestamp();
  end if;
  return v_result||jsonb_build_object('requirement_code',nullif(btrim(coalesce(p_requirement_code,'')),''));
end $$;

create or replace function qarar_meetings.enforce_ready_meeting_integrity()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_meetings as $$
declare v_agenda int; v_members int; v_chair int; v_rapporteur int;
begin
  if new.status='ready_to_start' and old.status is distinct from new.status then
    select count(*) into v_agenda from qarar_meetings.agenda_items where meeting_id=new.id;
    select count(*),count(*) filter(where r.code='council_chair'),count(*) filter(where r.code='council_rapporteur')
      into v_members,v_chair,v_rapporteur
      from qarar_iam.memberships ms join qarar_iam.roles r on r.id=ms.role_id and r.organization_id=ms.organization_id
     where ms.organization_id=new.organization_id and ms.governance_unit_id=new.governance_unit_id
       and ms.membership_status='active' and ms.start_date<=new.scheduled_date
       and (ms.end_date is null or ms.end_date>=new.scheduled_date);
    if v_agenda=0 or v_members=0 or v_chair=0 or v_rapporteur=0 then
      raise exception using errcode='23514',message='لا يمكن تجهيز الاجتماع قبل اكتمال جدول الأعمال والأعضاء والرئيس والمقرر';
    end if;
  end if;
  return new;
end $$;

alter function qarar_meetings.enforce_ready_meeting_integrity() owner to qarar_meetings_executor;
revoke all on function qarar_meetings.enforce_ready_meeting_integrity() from public,anon,authenticated,service_role;
drop trigger if exists enforce_ready_meeting_integrity on qarar_meetings.meetings;
create trigger enforce_ready_meeting_integrity before update of status on qarar_meetings.meetings
for each row execute function qarar_meetings.enforce_ready_meeting_integrity();

create or replace function qarar_meetings.enforce_decision_before_session_completion()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_meetings as $$
begin
  if new.status='waiting_for_minutes' and old.status='in_progress' then
    if exists (
      select 1 from qarar_voting.voting_rounds vr
      where vr.meeting_id=new.id and vr.organization_id=new.organization_id
        and vr.status='closed' and vr.result='approved'
        and not exists (
          select 1 from qarar_decisions.decisions d
          where d.organization_id=vr.organization_id and d.agenda_item_id=vr.agenda_item_id
        )
    ) then
      raise exception using errcode='23514',message='أنشئ قرارًا لكل نتيجة تصويت موافق عليها قبل إنهاء الجلسة';
    end if;
  end if;
  return new;
end $$;

alter function qarar_meetings.enforce_decision_before_session_completion() owner to qarar_meetings_executor;
revoke all on function qarar_meetings.enforce_decision_before_session_completion() from public,anon,authenticated,service_role;
drop trigger if exists enforce_decision_before_session_completion on qarar_meetings.meetings;
create trigger enforce_decision_before_session_completion before update of status on qarar_meetings.meetings
for each row execute function qarar_meetings.enforce_decision_before_session_completion();

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_meetings' and p.proname in ('enforce_ready_meeting_integrity','enforce_decision_before_session_completion')
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
 module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

notify pgrst,'reload schema';
