begin;
create extension if not exists pgtap;
select plan(26);

select has_column('qarar_core','governance_unit_types','is_council_type',
  'unit types identify council-compatible references');
select has_column('qarar_core','governance_unit_types','is_system',
  'system unit types are protected explicitly');

select has_column('qarar_core','governance_units','description',
  'councils have an administrative description');
select has_column('qarar_core','governance_units','status_reason',
  'councils retain the current status reason');
select has_column('qarar_core','governance_units','status_changed_at',
  'councils retain the latest status transition time');
select has_column('qarar_core','governance_units','status_changed_by_user_id',
  'councils retain the latest status actor');
select has_column('qarar_core','governance_units','activated_at',
  'councils retain activation time');
select has_column('qarar_core','governance_units','archived_at',
  'councils retain archival time');
select has_column('qarar_core','governance_units','minimum_active_members',
  'councils retain an administrative member threshold');
select has_column('qarar_core','governance_units','allow_dual_leadership',
  'councils declare whether one actor may hold both leadership roles');

select col_not_null('qarar_core','governance_units','status_changed_at',
  'every existing council has status transition time after backfill');
select col_not_null('qarar_core','governance_units','minimum_active_members',
  'administrative member threshold is mandatory');
select col_not_null('qarar_core','governance_units','allow_dual_leadership',
  'dual leadership behavior is explicit');
select col_has_default('qarar_core','governance_units','status_changed_at',
  'legacy inserts receive a server-side status transition time');
select has_trigger('qarar_core','governance_units',
  'governance_units_initialize_status_metadata',
  'legacy inserts receive status-consistent activation metadata');

select has_table('qarar_core','governance_unit_status_history',
  'council administrative status has append-only history');
select has_pk('qarar_core','governance_unit_status_history',
  'council status history has a primary key');
select has_fk('qarar_core','governance_unit_status_history',
  'council status history is referentially constrained');
select is(
  (select module_code from qarar_architecture.entity_registry
   where entity_name='governance_unit_status_history'),
  'core',
  'council status history is registered to Core'
);

select has_index('qarar_core','governance_units','governance_units_council_search_idx',
  'council administrative search has a covering index');
select has_index('qarar_core','governance_units','governance_units_governance_class_idx',
  'council classification lookup is indexed');
select has_index('qarar_core','governance_unit_status_history',
  'governance_unit_status_history_timeline_idx',
  'council status timeline is indexed');

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class
   where oid='qarar_core.governance_unit_status_history'::regclass),
  'council status history has forced RLS'
);
select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema='qarar_core'
     and table_name='governance_unit_status_history'
     and grantee in ('anon','authenticated')),
  0,
  'clients have no direct council status history privileges'
);

select ok(
  not exists (
    select 1
    from qarar_core.governance_units
    where minimum_active_members < 1
       or status_changed_at is null
       or (status='active' and (activated_at is null or archived_at is not null))
       or (status='archived' and archived_at is null)
  ),
  'existing governance units satisfy the new administrative metadata invariants'
);

select is(
  (select count(*)::integer
   from qarar_core.governance_unit_status_history h
   join qarar_core.governance_units u
     on u.id=h.governance_unit_id and u.organization_id=h.organization_id
   where h.from_status is null
     and h.to_status=u.status
     and h.reason='migration_backfill'),
  (select count(*)::integer from qarar_core.governance_units),
  'every existing governance unit receives one initial lifecycle history row'
);

select * from finish();
rollback;
