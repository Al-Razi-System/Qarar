-- Align the reviewed topics-to-meetings read dependencies with their runtime grants.
begin;

grant execute on function qarar_meetings.get_meeting_detail(uuid)
  to qarar_topics_executor;
grant execute on function qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer)
  to qarar_topics_executor;

commit;
