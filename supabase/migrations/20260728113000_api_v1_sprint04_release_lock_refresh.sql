begin;
update qarar_architecture.api_release_registry
set contract_count=124,
    contract_hash='ce6d73690e29716cfc9b752432e16db7',
    released_at='2026-07-28 00:00:00+00',
    notes='Sprint 4 release lock refreshed after the AI stale-write guard hardened the service implementation.'
where api_version='v1';
commit;
