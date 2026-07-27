begin;

insert into qarar_architecture.module_table_read_allowlist(
  source_module,target_schema,table_name,rationale
) values(
  'governance','qarar_topics','topics',
  'Read the governed aggregate while creating an immutable routing snapshot'
) on conflict do nothing;

grant select on qarar_topics.topics to qarar_governance_executor;

commit;
