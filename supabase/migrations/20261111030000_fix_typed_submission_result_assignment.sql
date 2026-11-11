begin;

create or replace function qarar_topics.submit_typed_submission_v2(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  o uuid:=qarar_iam.current_organization_id();
  preparation qarar_topics.typed_submission_preparations_v2%rowtype;
  snap jsonb;
  v_result jsonb;
  topic uuid;
begin
 select * into preparation from qarar_topics.typed_submission_preparations_v2
 where id=p_request_id and organization_id=o and actor_user_id=auth.uid() for update;
 if preparation.id is null then raise exception using errcode='42501',message='تجهيز الطلب غير متاح'; end if;
 if preparation.result is not null then return preparation.result||jsonb_build_object('idempotent_replay',true); end if;
 snap:=qarar_governance.prepare_typed_topic_v2((preparation.input->>'versionId')::uuid,(preparation.input->>'unitId')::uuid);
 if (select count(*) from qarar_topics.typed_submission_files_v2 where preparation_id=preparation.id and organization_id=o)<coalesce((snap#>>'{authoring,required_attachment_count}')::integer,0) then
   raise exception using errcode='23514',message='أكمل عدد المرفقات المطلوبة قبل تقديم الموضوع';
 end if;
 v_result:=qarar_topics.create_topic_from_type_v2(preparation.input->>'title',preparation.input->>'description',(preparation.input->>'versionId')::uuid,(preparation.input->>'unitId')::uuid,preparation.id);
 topic:=(v_result->>'topic_id')::uuid;
 insert into qarar_topics.topic_attachments(id,organization_id,topic_id,file_name,file_url,mime_type,file_size_bytes,description,uploaded_by_user_id)
 select id,o,topic,file_name,file_url,mime_type,file_size_bytes,display_name,auth.uid()
 from qarar_topics.typed_submission_files_v2 where preparation_id=preparation.id and organization_id=o;
 if jsonb_array_length(coalesce(preparation.input->'evidence','[]'::jsonb))>0 then
   raise exception using errcode='23514',message='استكمال المسار يتطلب مراجعة أدلته قبل تشغيله';
 end if;
 if not (qarar_topics.get_topic_requirements_status(topic)->>'ready_for_review')::boolean then
   raise exception using errcode='23514',message='أكمل جميع متطلبات التصنيف قبل تقديم الموضوع';
 end if;
 update qarar_topics.typed_submission_preparations_v2
 set result=v_result where id=preparation.id;
 perform qarar_audit.append_audit_log(o,'topics.prepare.submit','typed_submission_preparations_v2',preparation.id,jsonb_build_object('topic_id',topic));
 return v_result;
end $$;

alter function qarar_topics.submit_typed_submission_v2(uuid) owner to qarar_topics_executor;
revoke all on function qarar_topics.submit_typed_submission_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_topics.submit_typed_submission_v2(uuid) to qarar_api_executor;

notify pgrst,'reload schema';
commit;
