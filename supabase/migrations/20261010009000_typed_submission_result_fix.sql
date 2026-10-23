begin;
do $$ declare definition text;
begin
 definition:=pg_get_functiondef('qarar_topics.submit_typed_submission_v2(uuid)'::regprocedure);
 definition:=replace(definition,'result jsonb;','v_result jsonb;');
 definition:=replace(definition,'result:=','v_result:=');
 definition:=replace(definition,'topic:=(result->','topic:=(v_result->');
 definition:=replace(definition,'result||qarar_governance','v_result||qarar_governance');
 definition:=replace(definition,'set result=submit_typed_submission_v2.result','set result=v_result');
 definition:=replace(definition,'return result;','return v_result;');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
