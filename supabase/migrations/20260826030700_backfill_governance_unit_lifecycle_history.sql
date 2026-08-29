begin;

-- The local seed is applied after migrations on a clean stack, so the original
-- one-time backfill cannot see its governance units.  Create the initial
-- append-only history row at insertion time as well, then repair any upgraded
-- database rows that predate this trigger.  The NOT EXISTS guard makes both
-- paths idempotent and preserves manually recorded lifecycle events.
create or replace function qarar_core.record_initial_governance_unit_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into qarar_core.governance_unit_status_history(
    organization_id,
    governance_unit_id,
    from_status,
    to_status,
    reason,
    changed_by_user_id,
    changed_at
  )
  select
    new.organization_id,
    new.id,
    null,
    new.status,
    'migration_backfill',
    new.status_changed_by_user_id,
    new.status_changed_at
  where not exists (
    select 1
    from qarar_core.governance_unit_status_history history
    where history.governance_unit_id = new.id
      and history.organization_id = new.organization_id
  );
  return new;
end;
$$;

alter function qarar_core.record_initial_governance_unit_status()
  owner to qarar_core_executor;
revoke all on function qarar_core.record_initial_governance_unit_status()
  from public, anon, authenticated, service_role;

drop trigger if exists governance_units_record_initial_status_history
  on qarar_core.governance_units;
create trigger governance_units_record_initial_status_history
after insert on qarar_core.governance_units
for each row
execute function qarar_core.record_initial_governance_unit_status();

insert into qarar_core.governance_unit_status_history(
  organization_id,
  governance_unit_id,
  from_status,
  to_status,
  reason,
  changed_by_user_id,
  changed_at
)
select
  unit.organization_id,
  unit.id,
  null,
  unit.status,
  'migration_backfill',
  unit.status_changed_by_user_id,
  unit.status_changed_at
from qarar_core.governance_units unit
where not exists (
  select 1
  from qarar_core.governance_unit_status_history history
  where history.governance_unit_id = unit.id
    and history.organization_id = unit.organization_id
);

commit;
