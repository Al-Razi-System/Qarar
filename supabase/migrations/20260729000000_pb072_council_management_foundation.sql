begin;

-- PB-072 establishes council-management metadata on the existing Core entities.
-- It deliberately leaves meeting, attendance, voting, minutes, and regulation
-- policy columns untouched.

alter table qarar_core.governance_unit_types
  add column is_council_type boolean not null default false,
  add column is_system boolean not null default false;

update qarar_core.governance_unit_types
set is_council_type = true,
    is_system = true
where code in ('council', 'committee');

alter table qarar_core.governance_units
  add column description text,
  add column status_reason text,
  add column status_changed_at timestamptz,
  add column status_changed_by_user_id uuid,
  add column activated_at timestamptz,
  add column archived_at timestamptz,
  add column minimum_active_members integer not null default 1,
  add column allow_dual_leadership boolean not null default false,
  add constraint governance_units_minimum_active_members_check
    check (minimum_active_members >= 1),
  add constraint governance_units_status_metadata_check check (
    (status = 'active' and activated_at is not null and archived_at is null)
    or (status = 'inactive' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  ) not valid,
  add constraint governance_units_status_actor_tenant_fk
    foreign key (status_changed_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id)
    on delete restrict;

update qarar_core.governance_units
set status_changed_at = coalesce(updated_at, created_at, now()),
    activated_at = case
      when status = 'active' then coalesce(created_at, updated_at, now())
      else null
    end,
    archived_at = case
      when status = 'archived' then coalesce(updated_at, created_at, now())
      else null
    end,
    status_reason = case
      when status = 'active' then null
      else 'migration_backfill'
    end;

alter table qarar_core.governance_units
  alter column status_changed_at set default now(),
  alter column status_changed_at set not null,
  validate constraint governance_units_status_metadata_check;

create or replace function qarar_core.initialize_governance_unit_status_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog, qarar_core
as $$
begin
  new.status_changed_at := coalesce(new.status_changed_at, now());
  if new.status = 'active' then
    new.activated_at := coalesce(new.activated_at, now());
    new.archived_at := null;
  elsif new.status = 'archived' then
    new.archived_at := coalesce(new.archived_at, now());
  else
    new.archived_at := null;
  end if;
  return new;
end;
$$;

alter function qarar_core.initialize_governance_unit_status_metadata()
  owner to qarar_core_executor;

create trigger governance_units_initialize_status_metadata
before insert on qarar_core.governance_units
for each row execute function qarar_core.initialize_governance_unit_status_metadata();

create table qarar_core.governance_unit_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  governance_unit_id uuid not null,
  from_status text,
  to_status text not null,
  reason text not null,
  changed_by_user_id uuid,
  changed_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (governance_unit_id, organization_id)
    references qarar_core.governance_units(id, organization_id)
    on delete restrict,
  foreign key (changed_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id)
    on delete restrict,
  check (from_status is null or from_status in ('active', 'inactive', 'archived')),
  check (to_status in ('active', 'inactive', 'archived')),
  check (char_length(btrim(reason)) between 3 and 1000)
);

insert into qarar_core.governance_unit_status_history (
  organization_id,
  governance_unit_id,
  from_status,
  to_status,
  reason,
  changed_by_user_id,
  changed_at
)
select
  organization_id,
  id,
  null,
  status,
  'migration_backfill',
  null,
  status_changed_at
from qarar_core.governance_units;

create index governance_units_council_search_idx
  on qarar_core.governance_units (
    organization_id,
    status,
    unit_type_id,
    parent_unit_id,
    name_ar,
    id
  );

create index governance_units_governance_class_idx
  on qarar_core.governance_units (organization_id, governance_class_id)
  where governance_class_id is not null;

create index governance_unit_status_history_timeline_idx
  on qarar_core.governance_unit_status_history (
    organization_id,
    governance_unit_id,
    changed_at desc,
    id desc
  );

alter table qarar_core.governance_unit_status_history enable row level security;
alter table qarar_core.governance_unit_status_history force row level security;

alter table qarar_core.governance_unit_status_history owner to qarar_core_executor;

revoke all on table qarar_core.governance_unit_status_history
  from public, anon, authenticated, service_role;

insert into qarar_architecture.entity_registry (
  entity_name,
  module_code,
  legacy_public_view
) values (
  'governance_unit_status_history',
  'core',
  false
)
on conflict (entity_name) do update
set module_code = excluded.module_code,
    legacy_public_view = excluded.legacy_public_view;

comment on column qarar_core.governance_unit_types.is_council_type is
  'True when the reference type may be used by the bounded council-management API.';
comment on column qarar_core.governance_unit_types.is_system is
  'Protects tenant-seeded reference types from destructive administrative changes.';
comment on column qarar_core.governance_units.minimum_active_members is
  'Administrative completeness threshold only; it is not meeting quorum.';
comment on table qarar_core.governance_unit_status_history is
  'Append-only administrative lifecycle history for governance units managed as councils.';

commit;
