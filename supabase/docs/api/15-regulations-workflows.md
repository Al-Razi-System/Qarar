# Regulations and Governed Workflows

This document is the frontend contract for Sprint 3.5. All calls use:

```text
POST /rest/v1/rpc/{contract_name}
Authorization: Bearer <access-token>
Content-Type: application/json
Accept-Profile: api_v1
Content-Profile: api_v1
```

Direct writes to `qarar_governance` or `qarar_topics` are unsupported and denied.

## Frontend Flow

1. Create a workflow template with `admin_create_workflow_template`.
2. Add its councils and responsibilities using `admin_add_workflow_step`.
3. Map outcomes using `admin_add_workflow_transition`.
4. Create a policy using `admin_create_policy`, then create a draft with
   `admin_create_policy_version`.
5. Add hierarchical items with `admin_add_policy_item`.
6. Add inherited scopes using `admin_set_policy_scope` and explicit council exceptions using
   `admin_set_policy_item_scope_override`.
7. Submit, independently approve, and activate using the lifecycle commands.
8. Create topics using `create_topic_with_workflow`. The legacy `create_topic` contract now invokes
   the same governed transaction.
9. Render the selected regulation with `get_topic_governance` and the executable route with
   `get_topic_workflow`.
10. Act on the current step using the complete, return, or reject commands.

## Council Assignment

Each workflow step must provide exactly one of:

- `p_governance_unit_id`: one fixed council handles this step.
- `p_governance_class_id`: the engine selects the nearest council of that class from the topic
  unit and its ancestors.

The resolved council, responsibility, permission, outcomes, and source template are copied to the
workflow-instance snapshot. Later organization or template changes do not rewrite topic history.

Responsibilities are `present`, `review`, `discuss`, `recommend`, `initial_approve`,
`final_approve`, `execute`, and `follow_up`.

## Administrative Contracts

### Policy and version

- `admin_search_policies`: paginated search by code, Arabic/English name, and status.
- `admin_get_policy_detail`: returns versions with ordered items and scopes for the edit screen.
- `admin_update_policy`: updates metadata, owner, and active/inactive/archive state.
- `admin_create_policy`: creates the stable policy identity. Required: `p_code`, `p_name_ar`.
- `admin_create_policy_version`: creates the next numbered draft under `p_policy_id`.
- `admin_add_policy_item`: adds an item to a draft. `p_parent_item_id` creates hierarchy.
- `admin_update_policy_item`: updates one draft item and its workflow mapping.
- `admin_remove_policy_item`: permanently removes an unused draft item only.
- `admin_set_policy_scope`: assigns organization, unit type, governance level, class, unit, or
  subtree scope.
- `admin_remove_policy_scope`: removes one scope from a draft version only.
- `admin_set_policy_item_scope_override`: explicitly includes or excludes one council with reason
  and optional validity dates.

Draft configuration is immutable after submission or historical use.

### Workflow template

- `admin_create_workflow_template`: creates a template and its first draft version.
- `admin_create_workflow_version`: creates a blank version or clones an existing version.
- `admin_add_workflow_step`: defines council, responsibility, required permission, initial/terminal
  flags, conditions, and allowed outcomes.
- `admin_update_workflow_step`: updates a step in a draft version.
- `admin_remove_workflow_step`: removes a draft step and its connected transitions.
- `admin_add_workflow_transition`: maps one outcome to a next step or terminal transition.
- `admin_activate_workflow_template_version`: validates the graph, retires the previous active
  version, and activates the reviewed draft.

Allowed outcomes are `approved`, `rejected`, `returned`, `tie`, `no_vote`, `cancelled`, and
`completed`. Transition types are `forward`, `return`, `reject`, `complete`, and `cancel`.

### Lifecycle

- `admin_submit_policy_for_review`: requires at least one item and one active scope.
- `admin_approve_policy_version`: requires `governance.policies.approve`; the submitter cannot
  approve their own version.
- `admin_activate_policy_version`: requires legal approval and `automation_status=ready`.
- `admin_suspend_policy_version`: suspends only an effective version and requires a reason.

Legal states: `draft`, `under_review`, `approved`, `effective`, `suspended`, `expired`, `archived`.

Automation states: `not_configured`, `mapping_in_progress`, `validation_pending`,
`partially_ready`, `ready`, `blocked`.

## Scope Resolution

`resolve_topic_governance` can preview routing before creation. Matching is deterministic:

```text
governance_unit > governance_class > governance_level >
governance_unit_type > unit_subtree > organization
```

Configured priority is added within that specificity. Equal winning scores return
`multiple_policy_conflict`; the engine never silently selects one candidate.

Outcomes include `resolved`, `no_applicable_policy`, `multiple_policy_conflict`,
`policy_not_implemented`, `policy_partially_ready`, `custom_route_required`, and `blocked`.

## Topic Creation

Example:

```json
{
  "p_title_ar": "اعتماد الخطة الأكاديمية",
  "p_description": "طلب اعتماد الخطة الأكاديمية للقسم للعام القادم.",
  "p_category_id": "uuid",
  "p_current_unit_id": "uuid",
  "p_priority": "medium",
  "p_source_type": "new",
  "p_title_en": null,
  "p_client_request_id": "uuid"
}
```

`create_topic_with_workflow` atomically creates the topic, records the match decision, snapshots
the policy and route, resolves the council for every step, opens the initial step, writes compliance
history, and emits an outbox event.

If routing is unresolved, the topic remains visible but receives `routing_blocked` or
`routing_conflict`. Meeting, agenda, and voting transitions must treat any status other than
`routing_ready` as non-actionable.

Routing states are `routing_pending`, `routing_resolved`, `routing_conflict`, `routing_blocked`,
`routing_exception_pending`, and `routing_ready`.

## Runtime Contracts

- `get_topic_governance`: policy/version/item/scope IDs, source, routing decision, explanation,
  candidates, and immutable mapping snapshot.
- `get_topic_workflow`: workflow status, current step, and ordered step snapshots.
- `complete_topic_workflow_step`: accepts an allowed `p_outcome_code`.
- `return_topic_workflow_step`: uses the `returned` outcome and requires a comment.
- `reject_topic_workflow_step`: uses the `rejected` outcome and requires a comment.

Only the current active step can be acted upon. Its resolved council and required permission are
checked on every command.

## Exceptions

Use `request_workflow_exception` only for blocked or conflicting topics. The request contains an
active validated `p_workflow_template_version_id`, a reason of at least ten characters, and an
optional expiry.

`approve_workflow_exception` enforces four-eyes review: the requester cannot review their own
request. Approval snapshots and starts the exceptional workflow. Rejection returns the topic to
`routing_blocked`.

## Error Handling

- `42501`: missing authentication, permission, or independent reviewer.
- `P0002`: tenant-owned resource not found.
- `22023`: invalid value, outcome, or required explanation.
- `23505`: duplicate code, version, scope, or pending exception.
- `23514`: incomplete workflow, invalid scope, or unresolved council.
- `23P01`: overlapping effective policy dates.
- `55000`: illegal lifecycle or workflow transition.

Display the server message for administrative forms. For topic creation also inspect `outcome`,
`routing_status`, and `explanation` to render blocked/conflict recovery actions.
