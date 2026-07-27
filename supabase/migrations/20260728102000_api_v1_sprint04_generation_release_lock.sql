begin;

update qarar_architecture.api_release_registry
set contract_count=122,
    contract_hash='485e8a6e4aebd82059cc4e7e9f52b8f1',
    released_at='2026-07-28 00:00:00+00',
    notes='Sprint 4 PB-050/PB-023 adds controlled AI-draft request and service completion contracts.'
where api_version='v1';

commit;
