begin;
do $$ declare definition text; marker text:='v_result:=qarar_topics.create_topic_from_type_v2';
begin
 definition:=pg_get_functiondef('qarar_topics.submit_typed_submission_v2(uuid)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Typed submission contract drift'; end if;
 execute replace(definition,marker,'if exists(select 1 from qarar_topics.typed_submission_files_v2 f left join storage.objects s on s.bucket_id=''qarar-evidence'' and s.name=f.storage_path where f.preparation_id=row.id and f.organization_id=o and (s.name is null or coalesce((s.metadata->>''size'')::bigint,-1)<>f.file_size_bytes or coalesce(s.metadata->>''mimetype'','''')<>f.mime_type)) then raise exception using errcode=''23514'',message=''أحد المرفقات لم يعد متاحًا أو لا يطابق بياناته؛ أعد رفعه قبل التقديم''; end if; '||marker);
end $$;
notify pgrst,'reload schema';
commit;
