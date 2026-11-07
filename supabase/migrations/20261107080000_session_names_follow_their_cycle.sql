-- A generated session name took its month from the day the session is held, so a
-- session of the October cycle held on 7 November was named "نوفمبر" and looked like
-- the November session. A plan meeting is named by its cycle (the month its window
-- starts); a meeting outside a plan, by its date. Sessions already held keep their
-- name except those still running or in minutes, which are renamed here.
-- Impact map: docs/engineering/impact/SESSION_NAME_BY_CYCLE_20261108_AR.md
begin;

do $$
declare v_def text;v_new text;r record;
begin
  v_def:=pg_get_functiondef('qarar_meetings.refresh_council_session_numbers_v2(uuid,uuid,date)'::regprocedure);
  v_new:=replace(v_def,'for r in select id,scheduled_date,status,title_is_custom from qarar_meetings.meetings','for r in select id,scheduled_date,planned_window_start,status,title_is_custom from qarar_meetings.meetings');
  v_new:=replace(v_new,'council_session_title_v2(v_unit_name,v_held,r.scheduled_date)','council_session_title_v2(v_unit_name,v_held,coalesce(r.planned_window_start,r.scheduled_date))');
  v_new:=replace(v_new,'m.scheduled_date)','coalesce(m.planned_window_start,m.scheduled_date))');
  if v_new=v_def then raise exception 'refresh_council_session_numbers_v2 not changed'; end if;
  execute v_new;
  v_def:=pg_get_functiondef('qarar_meetings.number_council_sessions_on_change_v2()'::regprocedure);
  v_new:=replace(v_def,'council_session_title_v2(v_unit_name,v_number,scheduled_date)','council_session_title_v2(v_unit_name,v_number,coalesce(planned_window_start,scheduled_date))');
  if v_new=v_def then raise exception 'number_council_sessions_on_change_v2 not changed'; end if;
  execute v_new;
end;
$$;

-- Rename the generated names of sessions still running or in minutes, then refresh
-- the sessions ahead of each council and year.
do $$
declare r record;
begin
  perform set_config('qarar.meeting_sequence_refresh','on',true);
  update qarar_meetings.meetings m set title_ar=qarar_meetings.council_session_title_v2(
      (select u.name_ar from qarar_core.governance_units u where u.id=m.governance_unit_id),
      m.session_sequence_no,m.planned_window_start)
  where not m.title_is_custom and m.planned_window_start is not null and m.session_sequence_no is not null
    and m.status in('in_progress','waiting_for_minutes','waiting_for_approval')
    and m.title_ar is distinct from qarar_meetings.council_session_title_v2(
      (select u.name_ar from qarar_core.governance_units u where u.id=m.governance_unit_id),
      m.session_sequence_no,m.planned_window_start);
  perform set_config('qarar.meeting_sequence_refresh','',true);
  for r in select distinct organization_id,governance_unit_id,academic_year_start from qarar_meetings.meetings
    where not title_is_custom and planned_window_start is not null and governance_unit_id is not null and academic_year_start is not null
  loop
    perform qarar_meetings.refresh_council_session_numbers_v2(r.organization_id,r.governance_unit_id,r.academic_year_start);
  end loop;
end;
$$;

notify pgrst,'reload schema';
commit;
