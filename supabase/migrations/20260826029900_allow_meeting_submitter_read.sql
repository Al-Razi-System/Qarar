begin;

-- Meeting detail renders the submitter name beside each agenda topic.
insert into qarar_architecture.module_table_read_allowlist(
  source_module,
  target_schema,
  table_name,
  rationale
) values (
  'meetings',
  'qarar_iam',
  'users',
  'Render the governed topic submitter in meeting agenda details'
)
on conflict do nothing;

grant usage on schema qarar_iam to qarar_meetings_executor;
grant select on qarar_iam.users to qarar_meetings_executor;

commit;
