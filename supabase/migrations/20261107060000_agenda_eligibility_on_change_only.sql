-- The agenda eligibility trigger ran on EVERY update of an agenda item, so closing
-- a vote (which updates voting_status) re-ran the topic's requirement checks, which
-- demand `topics.read` in the topic's own context and refuse a topic that has since
-- left the approved state. The chair then could not close a vote: "لا تملك الصلاحية".
-- Eligibility is a condition of placing a topic on an agenda; it is checked on insert
-- and when the topic, meeting or exception of the item changes, not on later progress.
-- Impact map: docs/engineering/impact/AGENDA_ELIGIBILITY_ON_CHANGE_20261107_AR.md
begin;

do $$
declare v_def text;
  v_old text:='declare v_topic qarar_topics.topics%rowtype;v_meeting qarar_meetings.meetings%rowtype;
begin
';
begin
  v_def:=pg_get_functiondef('qarar_meetings.check_agenda_item_eligibility()'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'check_agenda_item_eligibility header not found exactly once';
  end if;
  execute replace(v_def,v_old,v_old||'  if tg_op=''UPDATE'' and new.topic_id is not distinct from old.topic_id
     and new.meeting_id is not distinct from old.meeting_id
     and new.is_exception is not distinct from old.is_exception
     and new.exception_reason is not distinct from old.exception_reason then
    return new;
  end if;
');
end;
$$;

notify pgrst,'reload schema';
commit;
