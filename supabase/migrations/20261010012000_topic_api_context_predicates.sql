begin;
create function qarar_topics.is_typed_topic_v2(p_topic_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$select exists(select 1 from qarar_topics.topics where id=p_topic_id and organization_id=qarar_iam.current_organization_id() and topic_type_version_id is not null)$$;
create function qarar_topics.has_typed_receipt_v2(p_request_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$select exists(select 1 from qarar_topics.topics where organization_id=qarar_iam.current_organization_id() and submitted_by_user_id=auth.uid() and client_request_id=p_request_id and topic_type_version_id is not null)$$;
do $$ declare f record; definition text;
begin
 for f in select oid,proname,pg_get_function_identity_arguments(oid) args from pg_proc where pronamespace='qarar_topics'::regnamespace and proname in ('is_typed_topic_v2','has_typed_receipt_v2') loop
  execute format('alter function qarar_topics.%I(%s) owner to qarar_topics_executor',f.proname,f.args);
  execute format('revoke all on function qarar_topics.%I(%s) from public,anon,authenticated,service_role',f.proname,f.args);
  execute format('grant execute on function qarar_topics.%I(%s) to qarar_api_executor',f.proname,f.args);
  insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate) values(f.oid,f.proname,f.args,'topics','qarar_topics',false);
 end loop;
 definition:=pg_get_functiondef('api_v2.create_topic_from_type_v2(text,text,uuid,uuid,uuid)'::regprocedure);
 execute replace(definition,'exists(select 1 from qarar_topics.topics where organization_id=qarar_iam.current_organization_id() and submitted_by_user_id=auth.uid() and client_request_id=p_client_request_id)','qarar_topics.has_typed_receipt_v2(p_client_request_id)');
 foreach definition in array array[pg_get_functiondef('api_v1.review_topic(uuid,text,text,timestamptz)'::regprocedure),pg_get_functiondef('api_v1.refer_topic(uuid,uuid,text,timestamptz)'::regprocedure)] loop
  execute replace(definition,'exists(select 1 from qarar_topics.topics where id=p_topic_id and organization_id=qarar_iam.current_organization_id() and topic_type_version_id is not null)','qarar_topics.is_typed_topic_v2(p_topic_id)');
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
