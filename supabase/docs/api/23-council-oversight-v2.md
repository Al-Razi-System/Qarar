# Council Oversight (v2)

Who may follow the performance of which councils, down the organisational tree. Following is **read-only**: it
never passes through `has_permission` and grants no management, voting or editing authority. Managing assignments
requires `governance.oversight.manage` (granted to `governance_admin`).

## Model

An assignment names a **holder** and a **scope**.

| `holder_kind` | Holder | Fields |
|---|---|---|
| `user` | One person | `holder_user_id` |
| `council_position` | Whoever holds a role in one council today | `holder_council_id`, `holder_role_code` |
| `position_rule` | Whoever holds a role in any council of a class; each one's root is their own council's unit | `holder_role_code`, `holder_class_id` |

| `target_mode` | Councils covered |
|---|---|
| `subtree` | Councils whose `scope_unit_id` lies at or below `root_unit_id` (or the holder council's unit for a rule), filtered by `target_class_ids` (empty = all) |
| `selected` | Exactly `council_ids` |

Positions are resolved from memberships in force on the day, so follow-up moves with the position. Councils without a
`scope_unit_id` never enter a subtree and are listed in the workspace as `unlinked_councils`. `starts_on`/`ends_on`
bound an assignment; ending one requires a reason and keeps it for review. Every change is audited.

## Contracts

`POST /rest/v1/rpc/admin_get_oversight_workspace_v2` (`Content-Profile: api_v2`) returns `assignments`, and the
options `users`, `roles`, `classes`, `units` (organisational tree), `councils`, `unlinked_councils`.

`POST /rest/v1/rpc/admin_preview_oversight_v2` with `{p_definition}` validates a definition without saving and returns
`{council_count, councils, holders}`.

`POST /rest/v1/rpc/admin_save_oversight_assignment_v2` with `{p_assignment_id|null, p_definition, p_expected_version|null, p_request_id}`
creates or updates. A repeated `p_request_id` returns the saved assignment; a stale version fails with `40001`.

`POST /rest/v1/rpc/admin_end_oversight_assignment_v2` with `{p_assignment_id, p_reason, p_expected_version}`.

`POST /rest/v1/rpc/get_my_oversight_scope_v2` returns `{councils:[{id,name_ar,class_name_ar,scope_unit_name_ar,via:[{assignment_id,title_ar,holder_kind}]}]}`
for the caller. Later phases (dashboard, alerts, reports) resolve scope through `qarar_iam.overseen_councils(user)`.

Validation failures use `22023`, denials `42501`, a missing assignment `P0002`.

## Violations and escalation

An hourly `pg_cron` job (`qarar-oversight-cycle`) runs `qarar_governance.run_oversight_cycle()`: it opens a violation
for each late item, closes it when the cause goes away, and escalates what stays open.

| `rule_code` | Late when | Closes when |
|---|---|---|
| `meeting_cycle_missed` | A planned meeting's window ended `threshold_days` ago without a confirmed date | The date is confirmed or the status changes |
| `task_overdue` | A task is `threshold_days` past its due date | Completed or cancelled |
| `minutes_pending` | `threshold_days` in `waiting_for_minutes`/`waiting_for_approval` | The meeting leaves those states |
| `topic_stalled` | A route step has been active `threshold_days` in a council | The step moves |
| `quorum_continuation` | A meeting continued without quorum | The meeting closes |

Level 0 is the council's chair and rapporteur (inbox always; WhatsApp `oversight.violation.detected` only for rules without
an existing alert, and never for backlog older than the escalation period at first detection). Every `escalation_days`
unresolved, the next level of followers is told (`oversight.violation.escalated`), nearest first — the follower whose
scope root is deepest in the tree. `escalate_immediately` sends level 1 at detection.

`POST /rest/v1/rpc/get_my_oversight_violations_v2` with `{p_status: open|resolved|all, p_rule_code, p_council_id}` returns
`{items, total, councils, rules}` for councils the caller leads (chair/rapporteur) or follows.

`admin_get_oversight_rules_v2` / `admin_save_oversight_rules_v2({p_rules:[{rule_code,enabled,threshold_days,escalation_days,escalate_immediately,version}]})`
read and change thresholds (0–365) and escalation periods (1–90); require `governance.oversight.manage`; stale `version` fails `40001`.

## Inbox (the bell)

`get_my_notifications_v2({p_limit, p_before})` returns `{items:[{id,category,title_ar,body_ar,link_path,created_at,read_at}], unread_count}`;
`mark_my_notifications_read_v2({p_ids|null})` marks the given (or all) read and returns the unread count. Violations and
escalations write here directly; every `notification_outbox` event with a `recipient_user_id` is mirrored here by trigger.
