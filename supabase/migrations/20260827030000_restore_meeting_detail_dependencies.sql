-- Dependencies introduced by the enriched meeting detail read model. These
-- grants are intentionally read/execute only and remain inside the meetings
-- module executor boundary.
grant select on qarar_topics.topic_categories, qarar_iam.users
  to qarar_meetings_executor;

grant execute on function qarar_governance.get_topic_agenda_context(uuid)
  to qarar_meetings_executor;
