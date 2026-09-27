begin;

-- policy_versions uses legal_status; the reference writer still addressed the
-- retired status column, causing governed topic creation to fail after its
-- workflow had been validated and instantiated.
do $block$
declare
  v_definition text;
begin
  select pg_get_functiondef('qarar_topics.save_topic_regulation_references(uuid,jsonb)'::regprocedure)
    into v_definition;
  if position('pv.status in(''published'',''effective'')' in v_definition) = 0 then
    raise exception 'Unexpected save_topic_regulation_references definition';
  end if;
  v_definition := replace(
    v_definition,
    'pv.status in(''published'',''effective'')',
    'pv.legal_status = ''effective'''
  );
  execute v_definition;
end;
$block$;

alter function qarar_topics.save_topic_regulation_references(uuid, jsonb)
  owner to qarar_topics_executor;
revoke all on function qarar_topics.save_topic_regulation_references(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function qarar_topics.save_topic_regulation_references(uuid, jsonb)
  to qarar_topics_executor;

commit;
