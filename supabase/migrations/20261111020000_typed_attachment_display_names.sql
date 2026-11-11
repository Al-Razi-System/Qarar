begin;

alter table qarar_topics.typed_submission_files_v2
  add column display_name text null
  check (display_name is null or char_length(btrim(display_name)) between 1 and 200);

create function qarar_topics.register_typed_submission_file_named_v2(
  p_request_id uuid,
  p_file_id uuid,
  p_name text,
  p_display_name text,
  p_path text,
  p_mime text,
  p_size bigint,
  p_url text,
  p_evidence_index integer default null
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  o uuid:=qarar_iam.current_organization_id();
  row qarar_topics.typed_submission_preparations_v2%rowtype;
  existing qarar_topics.typed_submission_files_v2%rowtype;
  object record;
  label text:=nullif(btrim(coalesce(p_display_name,'')),'');
begin
  if label is not null and char_length(label)>200 then
    raise exception using errcode='22023',message='اسم المرفق الاختياري طويل';
  end if;
  select * into row from qarar_topics.typed_submission_preparations_v2
   where id=p_request_id and organization_id=o and actor_user_id=auth.uid() for update;
  if row.id is null then raise exception using errcode='42501',message='تجهيز الطلب غير متاح'; end if;
  perform qarar_iam.assert_permission('topics.create',(row.input->>'unitId')::uuid);
  select * into existing from qarar_topics.typed_submission_files_v2 where id=p_file_id;
  if existing.id is not null then
    if existing.preparation_id<>p_request_id or existing.organization_id<>o
      or existing.file_name<>p_name or existing.display_name is distinct from label
      or existing.storage_path<>p_path or existing.file_size_bytes<>p_size
      or existing.mime_type<>p_mime or existing.evidence_index is distinct from p_evidence_index then
      raise exception using errcode='40001',message='مفتاح الملف مستخدم لملف مختلف';
    end if;
    return jsonb_build_object('id',p_file_id,'idempotent_replay',true);
  end if;
  if row.result is not null then raise exception using errcode='55000',message='تم تقديم هذا الطلب بالفعل'; end if;
  if p_path!~('^topic-preparations/'||p_request_id::text||'/'||p_file_id::text||'\.(pdf|png|jpg|docx)$')
    or p_url!~'^https?://[^/?#]+/api/admin/typed-topics/files\?'
    or p_url!~('submissionId='||p_request_id::text||'(&|$)')
    or p_url!~('fileId='||p_file_id::text||'(&|$)') then
    raise exception using errcode='22023',message='مسار الملف غير صالح';
  end if;
  if p_mime not in ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception using errcode='22023',message='نوع الملف غير مسموح';
  end if;
  if p_evidence_index is not null and (p_evidence_index<0 or p_evidence_index>=jsonb_array_length(coalesce(row.input->'evidence','[]'::jsonb))) then
    raise exception using errcode='22023',message='دليل المجلس غير صالح';
  end if;
  select name,metadata into object from storage.objects where bucket_id='qarar-evidence' and name=p_path;
  if object.name is null or coalesce((object.metadata->>'size')::bigint,-1)<>p_size or coalesce(object.metadata->>'mimetype','')<>p_mime then
    raise exception using errcode='23514',message='الملف غير موجود أو لا يطابق بيانات الرفع';
  end if;
  if (select count(*) from qarar_topics.typed_submission_files_v2 where preparation_id=p_request_id)>=30 then
    raise exception using errcode='23514',message='الحد الأقصى 30 ملفًا للطلب';
  end if;
  insert into qarar_topics.typed_submission_files_v2(
    id,organization_id,preparation_id,file_name,display_name,storage_path,mime_type,file_size_bytes,file_url,evidence_index
  ) values (
    p_file_id,o,p_request_id,p_name,label,p_path,p_mime,p_size,p_url,p_evidence_index
  );
  perform qarar_audit.append_audit_log(o,'topics.prepare.file','typed_submission_files_v2',p_file_id,
    jsonb_build_object('preparation_id',p_request_id,'has_display_name',label is not null));
  return jsonb_build_object('id',p_file_id);
end $$;

create or replace function qarar_topics.submit_typed_submission_v2(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); row qarar_topics.typed_submission_preparations_v2%rowtype; snap jsonb; result jsonb; topic uuid;
begin
 select * into row from qarar_topics.typed_submission_preparations_v2 where id=p_request_id and organization_id=o and actor_user_id=auth.uid() for update;
 if row.id is null then raise exception using errcode='42501',message='تجهيز الطلب غير متاح'; end if;
 if row.result is not null then return row.result||jsonb_build_object('idempotent_replay',true); end if;
 snap:=qarar_governance.prepare_typed_topic_v2((row.input->>'versionId')::uuid,(row.input->>'unitId')::uuid);
 if (select count(*) from qarar_topics.typed_submission_files_v2 where preparation_id=row.id and organization_id=o)<coalesce((snap#>>'{authoring,required_attachment_count}')::integer,0) then raise exception using errcode='23514',message='أكمل عدد المرفقات المطلوبة قبل تقديم الموضوع'; end if;
 result:=qarar_topics.create_topic_from_type_v2(row.input->>'title',row.input->>'description',(row.input->>'versionId')::uuid,(row.input->>'unitId')::uuid,row.id);
 topic:=(result->>'topic_id')::uuid;
 insert into qarar_topics.topic_attachments(id,organization_id,topic_id,file_name,file_url,mime_type,file_size_bytes,description,uploaded_by_user_id)
 select id,o,topic,file_name,file_url,mime_type,file_size_bytes,display_name,auth.uid()
 from qarar_topics.typed_submission_files_v2 where preparation_id=row.id and organization_id=o;
 if jsonb_array_length(coalesce(row.input->'evidence','[]'::jsonb))>0 then raise exception using errcode='23514',message='استكمال المسار يتطلب مراجعة أدلته قبل تشغيله'; end if;
 if not (qarar_topics.get_topic_requirements_status(topic)->>'ready_for_review')::boolean then raise exception using errcode='23514',message='أكمل جميع متطلبات التصنيف قبل تقديم الموضوع'; end if;
 update qarar_topics.typed_submission_preparations_v2 set result=result where id=row.id;
 perform qarar_audit.append_audit_log(o,'topics.prepare.submit','typed_submission_preparations_v2',row.id,jsonb_build_object('topic_id',topic));
 return result;
end $$;

alter function qarar_topics.register_typed_submission_file_named_v2(uuid,uuid,text,text,text,text,bigint,text,integer) owner to qarar_topics_executor;
revoke all on function qarar_topics.register_typed_submission_file_named_v2(uuid,uuid,text,text,text,text,bigint,text,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_topics.register_typed_submission_file_named_v2(uuid,uuid,text,text,text,text,bigint,text,integer) to qarar_api_executor;

create function api_v2.register_typed_submission_file_named_v2(
  p_request_id uuid,p_file_id uuid,p_name text,p_display_name text,p_path text,p_mime text,p_size bigint,p_url text,p_evidence_index integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text;
begin
 result:=qarar_topics.register_typed_submission_file_named_v2($1,$2,$3,$4,$5,$6,$7,$8,$9);
 return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then
 get stacked diagnostics state=returned_sqlstate,message=message_text;
 return api_v2.governance_error_envelope(state,message,trace);
end $$;
alter function api_v2.register_typed_submission_file_named_v2(uuid,uuid,text,text,text,text,bigint,text,integer) owner to qarar_api_executor;
revoke all on function api_v2.register_typed_submission_file_named_v2(uuid,uuid,text,text,text,text,bigint,text,integer) from public,anon,service_role;
grant execute on function api_v2.register_typed_submission_file_named_v2(uuid,uuid,text,text,text,text,bigint,text,integer) to authenticated;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'topics',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_topics' and p.proname='register_typed_submission_file_named_v2';

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values ('v2','register_typed_submission_file_named_v2','qarar_topics','register_typed_submission_file_named_v2',
  'p_request_id uuid, p_file_id uuid, p_name text, p_display_name text, p_path text, p_mime text, p_size bigint, p_url text, p_evidence_index integer','topics','authenticated');

notify pgrst,'reload schema';
commit;
