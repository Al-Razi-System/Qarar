begin;
-- Register the existing narrow read used by council choices. No privilege is
-- widened: the form still checks tenant, active council and contextual create.
insert into qarar_architecture.module_table_read_allowlist
  (source_module,target_schema,table_name,rationale)
values ('topics','qarar_core','governance_unit_types',
  'Limit typed submission choices to active council types in the actor tenant')
on conflict do nothing;
commit;
