-- The dispatch context is owned by qarar_governance_executor and enriches an
-- immutable outbox event from authoritative meeting/task records. The
-- enrichment migration introduced those reads without granting its owner the
-- corresponding schema and table privileges, causing every dispatch to fail.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

grant usage on schema qarar_meetings, qarar_execution, qarar_decisions
  to qarar_governance_executor;

grant select on qarar_meetings.meetings,
                qarar_execution.action_items,
                qarar_decisions.decisions
  to qarar_governance_executor;

commit;
