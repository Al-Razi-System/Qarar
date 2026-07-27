begin;

grant usage on schema qarar_topics to qarar_api_executor;
grant execute on function qarar_topics.create_topic(text,text,uuid,uuid,text,text,text,uuid)
  to qarar_api_executor;

commit;
