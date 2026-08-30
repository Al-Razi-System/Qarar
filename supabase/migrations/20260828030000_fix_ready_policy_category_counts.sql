do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_topic_categories_for_unit(uuid,date)'::regprocedure)
    into v_definition;
  if position('pv.automation_status = ''active''' in v_definition) = 0 then
    raise exception 'Unexpected get_topic_categories_for_unit definition';
  end if;
  v_definition := replace(
    v_definition,
    'pv.automation_status = ''active''',
    'pv.automation_status in (''ready'', ''active'')'
  );
  execute v_definition;
end;
$$;

alter function public.get_topic_categories_for_unit(uuid, date)
  owner to qarar_governance_executor;
