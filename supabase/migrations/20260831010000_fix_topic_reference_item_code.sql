begin;

-- policy_items exposes item_code; the reference-list contract still used the
-- retired code column and returned HTTP 400 on newly created topic details.
do $block$
declare
  v_definition text;
begin
  select pg_get_functiondef('qarar_topics.list_topic_regulation_references(uuid)'::regprocedure)
    into v_definition;
  if position('''item_code'',i.code' in v_definition) = 0 then
    raise exception 'Unexpected list_topic_regulation_references definition';
  end if;
  v_definition := replace(v_definition, '''item_code'',i.code', '''item_code'',i.item_code');
  execute v_definition;
end;
$block$;

alter function qarar_topics.list_topic_regulation_references(uuid)
  owner to qarar_topics_executor;
revoke all on function qarar_topics.list_topic_regulation_references(uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_topics.list_topic_regulation_references(uuid)
  to qarar_topics_executor;

commit;
