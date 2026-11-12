-- Reject malformed migration ledger rows at the source. Ad-hoc applies twice recorded a bare timestamp
-- (2026-10-08 and 2026-11-11/12) instead of the file name, which the drift check cannot match and which
-- needed scripts/repair-dev-migration-ledger.mjs afterwards. NOT VALID: enforced for every new or
-- changed row, without failing an environment that still carries old aliases awaiting that repair.
begin;

alter table qarar_internal.applied_migrations
  add constraint applied_migrations_version_format
  check (version = 'seed' or version ~ '^[0-9]{14}_[a-z0-9_]+$') not valid;

commit;
