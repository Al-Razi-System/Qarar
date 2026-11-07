-- The calendar shows a generated session name by its council and number, so its
-- contract carries the session number and whether the name is generated.
-- Impact map: docs/engineering/impact/MEETING_CALENDAR_SCALE_20261106_AR.md
begin;

do $$
declare v_def text;v_new text;v_old text:='''unit_name_ar'',u.name_ar,';
begin
  v_def:=pg_get_functiondef('qarar_meetings.list_meetings_calendar_v2(date,date,uuid[])'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'list_meetings_calendar_v2 unit field not found exactly once';
  end if;
  v_new:=replace(v_def,v_old,v_old||'''session_sequence_no'',m.session_sequence_no,''academic_year_start'',m.academic_year_start,''title_is_custom'',m.title_is_custom,');
  execute v_new;
end;
$$;

notify pgrst,'reload schema';
commit;
