begin;

do $$
declare v_definition text;
begin
  select pg_get_functiondef(
    'qarar_governance.instantiate_topic_workflow(uuid,uuid)'::regprocedure
  ) into v_definition;
  v_definition := replace(
    v_definition,
    'where id=p_topic_id and organization_id=v_org for update;',
    'where id=p_topic_id and organization_id=v_org;'
  );
  if v_definition like '%organization_id=v_org for update;%' then
    raise exception 'failed to remove cross-module row lock';
  end if;
  execute v_definition;
end;
$$;

alter function qarar_governance.instantiate_topic_workflow(uuid,uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.instantiate_topic_workflow(uuid,uuid)
  from public,anon,authenticated,service_role;

comment on function qarar_governance.instantiate_topic_workflow(uuid,uuid) is
'Creates immutable routing snapshots; topic row locking remains inside the narrow topics-owned snapshot function.';

commit;
