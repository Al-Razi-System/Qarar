# Decisions and Execution

Flutter uses four authenticated `api_v1` contracts. All contracts derive the
organization and actor from the verified session; clients never submit either value.

## Form and search

`get_decision_form_options()` returns active governance units and decision types,
eligible topics, and eligible meetings. Topic and meeting options carry their
governance-unit UUID so the client cannot substitute a display name for a relation.

`search_decisions(p_query, p_status, p_limit, p_offset)` returns a tenant-scoped
page. `p_status = null` means all statuses. Search covers the decision number,
decision text, and topic title.

## Create

`create_decision(p_topic_id, p_governance_unit_id, p_decision_text,
p_decision_type_id, p_meeting_id, p_requires_approval, p_client_request_id)`
creates a draft. The backend verifies that the topic and optional meeting belong
to the same organization and governance unit. It allocates the decision number
atomically and writes status history and audit records in the same transaction.
Repeating the same request UUID for the same actor returns the original decision.

## Execution read

`get_decision_action_items(p_decision_id)` returns the stored assignments for the
decision. The response uses actual assignee, unit, status, due date, progress, and
description values; it does not manufacture placeholder data.

Direct access to compatibility views remains unsupported. Decision transitions and
execution writes continue to be enforced by the existing backend transition guards.
