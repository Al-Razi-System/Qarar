begin;
create index topics_submitted_type_count_idx on qarar_topics.topics(organization_id,topic_type_version_id)
where topic_type_version_id is not null and submitted_at is not null;
commit;
