-- The meetings read model lists unit types only for chair/rapporteur target selection.
begin;
grant select on qarar_core.governance_unit_types to qarar_meetings_executor;
commit;
