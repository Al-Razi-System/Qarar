begin;
-- Trigger guard executes as its constrained owner, with a fixed search path.
alter function qarar_topics.protect_typed_topic_identity_v2() security definer;
-- The legacy governance creator still delegates to the public module boundary.
grant execute on function qarar_topics.create_topic_unrouted(text,text,uuid,uuid,text,text,text,uuid) to qarar_governance_executor;
-- Delegating helpers do not need direct cross-module grants.
revoke execute on function qarar_topics.get_topic_requirements_status(uuid) from qarar_governance_executor;
revoke execute on function qarar_governance.scheduled_agenda_suggestions_before_availability_v2(uuid,date) from qarar_meetings_executor;
notify pgrst,'reload schema';
commit;
