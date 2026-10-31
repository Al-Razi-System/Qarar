begin;
create table qarar_topics.typed_submission_preparations_v2(
 id uuid primary key, organization_id uuid not null, actor_user_id uuid not null,
 input jsonb not null check(jsonb_typeof(input)='object'), result jsonb,
 created_at timestamptz not null default now(), unique(id,organization_id),
 foreign key(actor_user_id,organization_id) references qarar_iam.users(id,organization_id));
create table qarar_topics.typed_submission_files_v2(
 id uuid primary key, organization_id uuid not null, preparation_id uuid not null,
 file_name text not null check(char_length(file_name) between 1 and 255),
 storage_path text not null unique, mime_type text not null, file_size_bytes bigint not null check(file_size_bytes between 1 and 26214400),
 file_url text not null, evidence_index integer, created_at timestamptz not null default now(),
 foreign key(preparation_id,organization_id) references qarar_topics.typed_submission_preparations_v2(id,organization_id));
alter table qarar_topics.typed_submission_preparations_v2 enable row level security;
alter table qarar_topics.typed_submission_preparations_v2 force row level security;
alter table qarar_topics.typed_submission_files_v2 enable row level security;
alter table qarar_topics.typed_submission_files_v2 force row level security;
revoke all on qarar_topics.typed_submission_preparations_v2,qarar_topics.typed_submission_files_v2 from public,anon,authenticated,service_role;
grant select,insert,update on qarar_topics.typed_submission_preparations_v2 to qarar_topics_executor;
grant select,insert on qarar_topics.typed_submission_files_v2 to qarar_topics_executor;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values
('typed_submission_preparations_v2','topics',false),('typed_submission_files_v2','topics',false);

create function qarar_topics.prepare_typed_submission_v2(p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); a uuid:=auth.uid(); row qarar_topics.typed_submission_preparations_v2%rowtype; snap jsonb;
begin
 if o is null or a is null or p_request_id is null or jsonb_typeof(p_input)<>'object'
 or char_length(btrim(coalesce(p_input->>'title',''))) not between 5 and 300
 or char_length(btrim(coalesce(p_input->>'description',''))) not between 10 and 10000
 or jsonb_typeof(coalesce(p_input->'evidence','[]'::jsonb))<>'array' then raise exception using errcode='22023',message='أكمل بيانات الطلب'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into row from qarar_topics.typed_submission_preparations_v2 where id=p_request_id for update;
 if row.id is not null then
  if row.organization_id<>o or row.actor_user_id<>a then raise exception using errcode='42501',message='لا يمكن الوصول إلى هذا التجهيز'; end if;
  if row.input<>p_input then raise exception using errcode='40001',message='بيانات التجهيز تغيرت؛ تحقق من الطلب السابق أولًا'; end if;
 else
  snap:=qarar_governance.prepare_typed_topic_v2((p_input->>'versionId')::uuid,(p_input->>'unitId')::uuid);
  if jsonb_array_length(coalesce(p_input->'evidence','[]'::jsonb))>0 then perform qarar_iam.assert_permission('governance.prior_route.request',(p_input->>'unitId')::uuid); end if;
  perform qarar_iam.consume_iam_rate_limit('topics.prepare',20,600);
  insert into qarar_topics.typed_submission_preparations_v2(id,organization_id,actor_user_id,input) values(p_request_id,o,a,p_input);
  perform qarar_audit.append_audit_log(o,'topics.prepare','typed_submission_preparations_v2',p_request_id,'{}');
 end if;
 return jsonb_build_object('request_id',p_request_id,'result',row.result,'files',coalesce((select jsonb_agg(jsonb_build_object('id',id,'file_name',file_name)) from qarar_topics.typed_submission_files_v2 where preparation_id=p_request_id and organization_id=o),'[]'::jsonb));
end $$;

create function qarar_topics.register_typed_submission_file_v2(p_request_id uuid,p_file_id uuid,p_name text,p_path text,p_mime text,p_size bigint,p_url text,p_evidence_index integer default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); row qarar_topics.typed_submission_preparations_v2%rowtype; existing qarar_topics.typed_submission_files_v2%rowtype; object record;
begin
 select * into row from qarar_topics.typed_submission_preparations_v2 where id=p_request_id and organization_id=o and actor_user_id=auth.uid() for update;
 if row.id is null then raise exception using errcode='42501',message='تجهيز الطلب غير متاح'; end if;
 perform qarar_iam.assert_permission('topics.create',(row.input->>'unitId')::uuid);
 select * into existing from qarar_topics.typed_submission_files_v2 where id=p_file_id;
 if existing.id is not null then
  if existing.preparation_id<>p_request_id or existing.organization_id<>o or existing.file_name<>p_name or existing.storage_path<>p_path or existing.file_size_bytes<>p_size or existing.mime_type<>p_mime or existing.evidence_index is distinct from p_evidence_index then raise exception using errcode='40001',message='مفتاح الملف مستخدم لملف مختلف'; end if;
  return jsonb_build_object('id',p_file_id,'idempotent_replay',true);
 end if;
 if row.result is not null then raise exception using errcode='55000',message='تم تقديم هذا الطلب بالفعل'; end if;
 if p_path!~('^topic-preparations/'||p_request_id::text||'/'||p_file_id::text||'\.(pdf|png|jpg|docx)$') or p_url!~'^https?://[^/?#]+/api/admin/typed-topics/files\?' or p_url!~('submissionId='||p_request_id::text||'(&|$)') or p_url!~('fileId='||p_file_id::text||'(&|$)') then raise exception using errcode='22023',message='مسار الملف غير صالح'; end if;
 if p_mime not in ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception using errcode='22023',message='نوع الملف غير مسموح'; end if;
 if p_evidence_index is not null and (p_evidence_index<0 or p_evidence_index>=jsonb_array_length(coalesce(row.input->'evidence','[]'::jsonb))) then raise exception using errcode='22023',message='دليل المجلس غير صالح'; end if;
 select name,metadata into object from storage.objects where bucket_id='qarar-evidence' and name=p_path;
 if object.name is null or coalesce((object.metadata->>'size')::bigint,-1)<>p_size or coalesce(object.metadata->>'mimetype','')<>p_mime then raise exception using errcode='23514',message='الملف غير موجود أو لا يطابق بيانات الرفع'; end if;
 if (select count(*) from qarar_topics.typed_submission_files_v2 where preparation_id=p_request_id)>=30 then raise exception using errcode='23514',message='الحد الأقصى 30 ملفًا للطلب'; end if;
 insert into qarar_topics.typed_submission_files_v2(id,organization_id,preparation_id,file_name,storage_path,mime_type,file_size_bytes,file_url,evidence_index) values(p_file_id,o,p_request_id,p_name,p_path,p_mime,p_size,p_url,p_evidence_index);
 perform qarar_audit.append_audit_log(o,'topics.prepare.file','typed_submission_files_v2',p_file_id,jsonb_build_object('preparation_id',p_request_id));
 return jsonb_build_object('id',p_file_id);
end $$;

create function qarar_topics.get_typed_submission_file_v2(p_request_id uuid,p_file_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare row qarar_topics.typed_submission_preparations_v2%rowtype; file qarar_topics.typed_submission_files_v2%rowtype;
begin
 select * into row from qarar_topics.typed_submission_preparations_v2 where id=p_request_id and organization_id=qarar_iam.current_organization_id();
 if row.id is null then raise exception using errcode='42501',message='المرفق غير متاح'; end if;
 if row.result is not null then perform qarar_topics.get_topic_detail((row.result->>'topic_id')::uuid);
 elsif row.actor_user_id<>auth.uid() then raise exception using errcode='42501',message='المرفق غير متاح'; end if;
 select * into file from qarar_topics.typed_submission_files_v2 where preparation_id=row.id and id=p_file_id and organization_id=row.organization_id;
 if file.id is null then raise exception using errcode='P0002',message='المرفق غير موجود'; end if;
 return jsonb_build_object('path',file.storage_path,'mime_type',file.mime_type);
end $$;

create function qarar_topics.submit_typed_submission_v2(p_request_id uuid)
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
 insert into qarar_topics.topic_attachments(id,organization_id,topic_id,file_name,file_url,mime_type,file_size_bytes,uploaded_by_user_id)
 select id,o,topic,file_name,file_url,mime_type,file_size_bytes,auth.uid() from qarar_topics.typed_submission_files_v2 where preparation_id=row.id and organization_id=o;
 if jsonb_array_length(coalesce(row.input->'evidence','[]'::jsonb))>0 then raise exception using errcode='23514',message='استكمال المسار يتطلب مراجعة أدلته قبل تشغيله'; end if;
 if not (qarar_topics.get_topic_requirements_status(topic)->>'ready_for_review')::boolean then raise exception using errcode='23514',message='أكمل جميع متطلبات التصنيف قبل تقديم الموضوع'; end if;
 update qarar_topics.typed_submission_preparations_v2 set result=result where id=row.id;
 perform qarar_audit.append_audit_log(o,'topics.prepare.submit','typed_submission_preparations_v2',row.id,jsonb_build_object('topic_id',topic));
 return result;
end $$;

do $$ declare f record; begin
 for f in select oid,proname,pg_get_function_identity_arguments(oid) args from pg_proc where pronamespace='qarar_topics'::regnamespace and proname in ('prepare_typed_submission_v2','register_typed_submission_file_v2','get_typed_submission_file_v2','submit_typed_submission_v2') loop
  execute format('alter function qarar_topics.%I(%s) owner to qarar_topics_executor',f.proname,f.args);
  execute format('revoke all on function qarar_topics.%I(%s) from public,anon,authenticated,service_role',f.proname,f.args);
  execute format('grant execute on function qarar_topics.%I(%s) to qarar_api_executor',f.proname,f.args);
  insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate) values(f.oid,f.proname,f.args,'topics','qarar_topics',false);
  execute format('create function api_v2.%I(%s) returns jsonb language plpgsql security definer set search_path=pg_catalog as $body$ declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text; begin result:=qarar_topics.%I(%s); return jsonb_build_object(''ok'',true,''data'',result,''trace_id'',trace); exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text; return api_v2.governance_error_envelope(state,message,trace); end $body$',f.proname,f.args,f.proname,(select string_agg('$'||n,',') from generate_series(1,(select pronargs from pg_proc where oid=f.oid)) n));
  execute format('alter function api_v2.%I(%s) owner to qarar_api_executor',f.proname,f.args);
  execute format('revoke all on function api_v2.%I(%s) from public,anon,authenticated,service_role',f.proname,f.args);
  execute format('grant execute on function api_v2.%I(%s) to authenticated',f.proname,f.args);
  insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values('v2',f.proname,'qarar_topics',f.proname,f.args,'topics','authenticated');
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
