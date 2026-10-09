begin;
-- The aggregate adapter updates only the original fingerprint and its enriched
-- response after all requirements have been saved in the same transaction.
grant update(response_payload) on qarar_governance.governance_bundle_command_receipts_v2 to qarar_governance_executor;
commit;
