begin;
update qarar_architecture.api_release_registry
set contract_count=124,
    contract_hash='05b50b0caf859fb7858bed09e3765305',
    released_at='2026-07-28 00:00:00+00',
    notes='Sprint 4 PB-026/PB-027/PB-028 adds governed submission and human approval contracts.'
where api_version='v1';
commit;
