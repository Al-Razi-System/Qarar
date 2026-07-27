begin;

insert into qarar_architecture.module_table_read_allowlist(
 source_module,target_schema,table_name,rationale
) values
 ('minutes','qarar_meetings','agenda_items','Build the reviewed agenda portion of an AI-draft input context')
on conflict do nothing;

grant usage on schema qarar_meetings to qarar_minutes_executor;
grant select on qarar_meetings.agenda_items to qarar_minutes_executor;

commit;
