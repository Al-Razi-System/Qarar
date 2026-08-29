begin;

-- Meeting detail renders the category label for each governed agenda topic.
-- Record the cross-module dependency before granting the executor read access.
insert into qarar_architecture.module_table_read_allowlist(
  source_module,
  target_schema,
  table_name,
  rationale
) values (
  'meetings',
  'qarar_topics',
  'topic_categories',
  'Render the governed topic category in meeting agenda details'
)
on conflict do nothing;

grant usage on schema qarar_topics to qarar_meetings_executor;
grant select on qarar_topics.topic_categories to qarar_meetings_executor;

commit;
