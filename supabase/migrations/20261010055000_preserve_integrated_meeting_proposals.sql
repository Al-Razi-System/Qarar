begin;
-- #136 adds the explicit tenant guard but was authored before the already
-- deployed typed-topic proposal consumer. Preserve both on incremental upgrade
-- and on a clean ordered install. Do not rerun the original data migration.
do $$ declare definition text; marker text;
begin
 definition:=pg_get_functiondef('qarar_meetings.get_meeting_detail(uuid)'::regprocedure);
 marker:='''scheduled_suggestions'',suggestions';
 if position(marker in definition)=0 then raise exception 'Meeting detail proposal contract drift';end if;
 if position('''submitted_suggestions''' in definition)=0 then
  definition:=replace(definition,marker,
   '''scheduled_suggestions'',suggestions,''submitted_suggestions'',case when coalesce((detail#>>''{capabilities,can_manage_agenda}'')::boolean,false) then qarar_meetings.search_eligible_agenda_topics(p_meeting_id,null,100,0) else null end');
 end if;
 marker:='return detail||jsonb_build_object';
 if position(marker in definition)=0 then raise exception 'Meeting detail capability contract drift';end if;
 definition:=replace(definition,marker,
  'detail:=jsonb_set(detail,''{capabilities,can_schedule}'',to_jsonb(coalesce((detail#>>''{capabilities,can_schedule}'')::boolean,false) and coalesce((detail->>''schedule_date_confirmed'')::boolean,true)));
 return detail||jsonb_build_object');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
