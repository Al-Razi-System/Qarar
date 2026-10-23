begin;
grant execute on function qarar_topics.assert_topic_requirements_ready(uuid,text) to qarar_meetings_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values('meetings','qarar_topics','assert_topic_requirements_ready','p_topic_id uuid, p_timing text','Require complete topic evidence before admitting a typed submission to a meeting') on conflict do nothing;
do $$ declare definition text; marker text;
begin
 definition:=pg_get_functiondef('qarar_meetings.add_agenda_item(uuid,uuid,boolean,text)'::regprocedure);
 marker:='if v_t.status<>''approved'' then';
 if position(marker in definition)=0 then raise exception 'Agenda command contract drift'; end if;
 definition:=replace(definition,marker,'if v_t.status<>''approved'' and not (v_t.topic_type_version_id is not null and v_t.status in (''new'',''under_review'') and v_t.routing_status=''routing_ready'') then');
 definition:=replace(definition,'select coalesce(max(agenda_order),0)+1','if v_t.topic_type_version_id is not null then perform qarar_topics.assert_topic_requirements_ready(v_t.id,''before_review''); end if; select coalesce(max(agenda_order),0)+1');
 execute definition;
 definition:=pg_get_functiondef('qarar_meetings.check_agenda_item_eligibility()'::regprocedure);
 marker:='if v_topic.status<>''approved'' and not new.is_exception then';
 if position(marker in definition)=0 then raise exception 'Agenda trigger contract drift'; end if;
 definition:=replace(definition,marker,'if v_topic.status<>''approved'' and not new.is_exception and not (v_topic.topic_type_version_id is not null and v_topic.status in (''new'',''under_review'') and v_topic.routing_status=''routing_ready'') then');
 definition:=replace(definition,'return new;','if v_topic.topic_type_version_id is not null then perform qarar_topics.assert_topic_requirements_ready(v_topic.id,''before_review''); end if; return new;');
 execute definition;
end $$;
-- The separate governed-agenda trigger still verifies an active meeting-owned
-- step assigned to this exact council. No blocked prior route is admissible.
notify pgrst,'reload schema';
commit;
