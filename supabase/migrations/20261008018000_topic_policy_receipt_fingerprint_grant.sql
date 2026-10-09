begin;
-- The policy wrapper records the original client command fingerprint in the
-- same transaction. No client or service role gets mutable receipt access.
grant update(request_fingerprint) on qarar_governance.governance_bundle_command_receipts_v2 to qarar_governance_executor;
commit;
