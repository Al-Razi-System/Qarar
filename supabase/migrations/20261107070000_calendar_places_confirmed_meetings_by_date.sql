-- The calendar placed every meeting by its cycle window. A meeting whose date was
-- confirmed (a session held or planned off its window, e.g. a first session of
-- 2026-11-07 in the window 8-14 October) was therefore missing from the month it
-- is held in, while the list showed it. A confirmed date places the meeting; the
-- window places only a meeting still waiting for its date.
-- Impact map: docs/engineering/impact/CALENDAR_CONFIRMED_DATE_20261107_AR.md
begin;

do $$
declare v_def text;
  v_a text:='and coalesce(m.planned_window_end,m.scheduled_date)>=p_from_date';
  v_b text:='and coalesce(m.planned_window_start,m.scheduled_date)<=p_to_date';
  v_c text:='order by coalesce(m.planned_window_start,m.scheduled_date),m.start_time nulls last';
  v_dated text:='(m.schedule_date_confirmed and m.scheduled_date is not null)';
begin
  v_def:=pg_get_functiondef('qarar_meetings.list_meetings_calendar_v2(date,date,uuid[])'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_a,'')))/length(v_a)<>1
     or (length(v_def)-length(replace(v_def,v_b,'')))/length(v_b)<>1
     or (length(v_def)-length(replace(v_def,v_c,'')))/length(v_c)<>1 then
    raise exception 'list_meetings_calendar_v2 placement clauses not found exactly once';
  end if;
  v_def:=replace(v_def,v_a,'and case when '||v_dated||' then m.scheduled_date else coalesce(m.planned_window_end,m.scheduled_date) end>=p_from_date');
  v_def:=replace(v_def,v_b,'and case when '||v_dated||' then m.scheduled_date else coalesce(m.planned_window_start,m.scheduled_date) end<=p_to_date');
  v_def:=replace(v_def,v_c,'order by case when '||v_dated||' then m.scheduled_date else coalesce(m.planned_window_start,m.scheduled_date) end,m.start_time nulls last');
  execute v_def;
end;
$$;

notify pgrst,'reload schema';
commit;
