begin;

-- current_setting(..., true) returns NULL when the setting is absent.  In a
-- boolean AND expression that NULL could bypass a subsequent `not guard`
-- check, so normalize it explicitly to the denied state before evaluating a
-- manual workflow action.
do $$
declare
  v_function regprocedure;
  v_definition text;
  v_updated_definition text;
  v_updated_count integer := 0;
begin
  foreach v_function in array array[
    'qarar_governance.act_topic_workflow_step_core(uuid,text,text,uuid,integer)'::regprocedure,
    'qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    v_updated_definition := regexp_replace(
      v_definition,
      'current_setting\(''qarar\.voting_transition'',\s*true\)\s*=\s*''on''',
      'coalesce(current_setting(''qarar.voting_transition'', true), '''') = ''on''',
      'g'
    );

    -- The public wrapper is intentionally replaced by later lifecycle
    -- migrations and may delegate to the guarded core without carrying this
    -- expression itself.  Tighten every implementation that does contain the
    -- old nullable check, and require that at least one was updated.
    if v_updated_definition <> v_definition then
      execute v_updated_definition;
      v_updated_count := v_updated_count + 1;
    end if;
  end loop;

  if v_updated_count = 0 then
    raise exception 'expected voting transition guard was not found in any workflow implementation';
  end if;
end
$$;

commit;
