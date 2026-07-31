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

لإعداد اللائحة من الصفر، بما في ذلك الجاهزية والنطاقات والاستثناءات وسيناريوهات الاختبار،
راجع [دليل إعداد اللوائح والمسارات](../guides/02-regulation-setup-scenarios-ar.md).

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
8. For a new governed topic, load `get_topic_regulation_options`, let the user choose one eligible
   regulation, then use `create_topic_with_selected_regulation`.
9. Render the selected regulation with `get_topic_governance` and the executable route with
   `get_topic_workflow`.
10. Act on the current step with `act_topic_workflow_step`; voting steps advance only when the
    captured voting round is closed.

## Council Assignment

Each workflow step must provide exactly one of:

- `p_governance_unit_id`: one fixed council handles this step.
- `p_governance_class_id`: the engine selects the nearest council of that class from the topic
  unit and its ancestors.

The resolved council, responsibility, permission, outcomes, and source template are copied to the
workflow-instance snapshot. Later organization or template changes do not rewrite topic history.

Responsibilities are `present`, `review`, `discuss`, `recommend`, `initial_approve`,
`final_approve`, `execute`, and `follow_up`.

Step types are `review`, `discussion`, `recommendation`, `approval`, `voting`, `execution`, and
`follow_up`. Use `voting` only when the step must be completed from a frozen voting-round result.
A voting step must define exactly `approved`, `rejected`, `tie`, and `no_vote`; a template that
omits any of these outcomes cannot be activated.

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

- `admin_list_workflow_templates`: returns templates with their versions, ordered steps, and
  transitions for the administrative workflow designer.
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

## Scope Resolution and User Selection

`resolve_topic_governance` remains a compatibility preview for automatic integrations. Frontend flows must use `get_topic_regulation_options` followed by `create_topic_with_selected_regulation`. Multiple matching regulations are normal user-selectable options, not a data conflict. The detailed Arabic implementation guide is
[03-topic-regulation-selection-ar.md](../guides/03-topic-regulation-selection-ar.md).

Automatic matching remains deterministic:

```text
governance_unit > governance_class > governance_level >
governance_unit_type > unit_subtree > organization
```

Configured priority applies only inside the same specificity tier. A broad scope cannot beat a
council-specific scope using a larger priority. An active `is_included=true` override is the most
specific candidate, while `is_included=false` excludes that council. `match_criteria` is evaluated
against the topic and council context. Equal winning scores return
`multiple_policy_conflict`; the engine never silently selects one candidate.

Outcomes include `resolved`, `no_applicable_policy`, `multiple_policy_conflict`,
`policy_not_implemented`, `policy_partially_ready`, `custom_route_required`, and `blocked`.

## Topic Creation

New selection UIs must not use the previous automatic topic-creation sequence. The supported UI
sequence is:

1. Call `get_topic_regulation_options`.
2. Let the user choose exactly one eligible returned option, unless `total=1`.
3. Pass the returned `selection` IDs to `create_topic_with_selected_regulation`.

Do not create governed regulation topics with `create_topic`, automatic routing, or local client
policy selection. The selected regulation must be returned by the server and revalidated during
topic creation. `create_topic_with_workflow` remains a legacy automatic-routing fallback.

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

`create_topic_with_selected_regulation` atomically creates the topic, revalidates the selected
regulation, records the selected decision, snapshots the policy and route, resolves the council for
every step, opens the initial step when ready, writes compliance history, and emits an outbox event.

If routing is unresolved, the topic remains visible but receives `routing_blocked` or
`routing_conflict`. Policies allowing a custom or regulated fallback route receive
`governance_source=custom` and `routing_exception_pending`. Meeting, agenda, and voting
transitions must treat any status other than
`routing_ready` as non-actionable.

Routing states are `routing_pending`, `routing_resolved`, `routing_conflict`, `routing_blocked`,
`routing_exception_pending`, and `routing_ready`.

## Runtime Contracts

- `get_topic_governance`: policy/version/item/scope IDs, source, routing decision, explanation,
  candidates, and immutable mapping snapshot.
- `get_topic_workflow`: workflow status, current step, and ordered step snapshots.
- `act_topic_workflow_step`: requires a unique `p_idempotency_key` and current
  `p_expected_version`. Replays are safe and stale writes return SQLSTATE `40001`.
- Voting steps cannot be completed manually. Opening a voting round captures the exact active
  `workflow_instance_step_id`; closing it only advances that same step. A stale, unrelated, or
  cancelled round cannot move the route.
- Frozen results map as `approved -> approved`, `rejected -> rejected`, `tied -> tie`, and
  `no_votes -> no_vote`.
- New clients must send every non-voting step action through `act_topic_workflow_step`.

Only the current active step can be acted upon. Its resolved council and required permission are
checked on every command.

## Exceptions

Administrative review screens load the tenant-scoped queue with
`admin_list_governance_exceptions`. The response is paginated and includes the topic title and
selected workflow name without exposing internal governance tables.

Use `request_workflow_exception` only for blocked or conflicting topics. The request contains an
active validated `p_workflow_template_version_id`, a reason of at least ten characters, and a
required future `p_valid_until`.

`approve_workflow_exception` enforces four-eyes review: the requester cannot review their own
request. Expired requests cannot be approved. Approval snapshots and starts the exceptional
workflow. Rejection returns the topic to `routing_blocked`.

For a policy-authorized custom or fallback route, use `request_custom_workflow`, followed by
`approve_custom_workflow` from an independent reviewer. `p_valid_until` is mandatory and must be
in the future. The topic and mapping preserve `governance_source=custom` throughout execution.

At expiry, the background worker marks the request and its active workflow `expired`, cancels the
active step, and changes the topic route to `routing_expired`. Every workflow action also checks the
validity boundary directly, so an expired route cannot execute while waiting for the worker. To
renew it, submit `request_custom_workflow` again for the expired topic with the same active template,
a new future `p_valid_until`, and a new reason; an independent `approve_custom_workflow` review
reactivates the suspended step. A different template requires a new governed route rather than an
implicit replacement of an in-flight route.

## Council Classifications

- `admin_list_governance_unit_classes`: searchable, paginated list with assigned council count.
- `admin_create_governance_unit_class`: creates a tenant-owned classification.
- `admin_update_governance_unit_class`: updates or deactivates with optimistic concurrency.
- `admin_assign_governance_unit_class`: assigns an active classification to a council with
  optimistic concurrency.

## Error Handling

- `42501`: missing authentication, permission, or independent reviewer.
- `P0002`: tenant-owned resource not found.
- `22023`: invalid value, outcome, or required explanation.
- `23505`: duplicate code, version, scope, or pending exception.
- `23514`: incomplete workflow, invalid scope, or unresolved council.
- `23P01`: overlapping effective policy dates.
- `55000`: illegal lifecycle or workflow transition.
- `40001`: stale workflow step or council-classification update.

Display the server message for administrative forms. For topic creation also inspect `outcome`,
`routing_status`, and `explanation` to render blocked/conflict recovery actions.
