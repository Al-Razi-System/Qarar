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


## Meeting decisions and the minutes (2026-10-16)

- Every closed agenda item has one decision. `decisions.outcome_kind` is one of:
  - `approval`: drafted in the room after an approved vote;
  - `rejection`;
  - `undecided`: a tie or no votes;
  - `postponement`;
  - `referral`.
- The last four are created when the session ends (`in_progress` to `waiting_for_minutes`), with an Arabic text the chair or rapporteur may edit with `update_meeting_decision_text` until the minutes go out for signature. They are audited as `decisions.create_for_outcome`.
- When the minutes become `approved` (the last signature), every decision of the meeting still `draft` or `ready_for_approval` becomes `approved` and gets `issued_at`. Each one is audited as `decisions.approve_with_minutes`.
- `list_meeting_decisions` returns `outcome_kind`.
- Execution tasks carry `requires_evidence`, set when the assignment is created in the session.


## Executing and verifying tasks (v2, 2026-10-16)

Task states: `new` → `in_progress` → `submitted` (awaiting verification) → `completed`. A verifier may return a `submitted` task to `in_progress` with a reason. `is_overdue` is computed: the due date has passed and the task is not submitted, completed or cancelled.

**Roles**

- **Executor:** the assigned user, or a holder of `execution.unit_tasks.execute` in the assigned unit (a system administrator does not execute a unit's tasks).
- **Verifier:** the follow-up person, the chair who issued the meeting assignment, or a holder of `execution.tasks.verify`. Nobody verifies a task they submitted themselves (`42501`).
- **Reader:** executors, verifiers, and holders of `execution.tasks.read`.

**Contracts**

| Contract | Effect | Errors |
|---|---|---|
| `list_my_tasks_v2()` | `{to_execute, to_verify, following}` | — |
| `get_task_v2(p_task_id)` | Details, `events`, `evidence`, and `viewer` flags with the reason a step is blocked | `P0002`, `42501` |
| `start_task_v2(p_task_id, p_expected_updated_at)` | Starts the task | `42501`, `23514`, `40001` |
| `update_task_progress_v2(p_task_id, p_percent 0..99, p_note, p_expected_updated_at)` | Records progress | `22023`, `42501`, `23514`, `40001` |
| `submit_task_completion_v2(p_task_id, p_note, p_expected_updated_at)` | Submits for verification | `23514` when required evidence is missing |
| `verify_task_completion_v2(p_task_id, p_note, p_expected_updated_at)` | Completes the task at 100% and records `completed_at` | `42501`, `23514`, `40001` |
| `return_task_v2(p_task_id, p_reason 5..2000, p_expected_updated_at)` | Returns the task to `in_progress` | `22023`, `42501`, `23514`, `40001` |
| `add_task_evidence_v2(p_task_id, p_file_name, p_storage_path, p_mime_type, p_file_size_bytes, p_description)` | Adds evidence. The path must be under `tasks/{task_id}/`, and the object must exist in `qarar-evidence` with the stated size and type | `22023`, `23514`, `42501` |
| `remove_task_evidence_v2(p_evidence_id)` | Removes evidence before submission | `23514`, `42501` |

Every step is recorded in `qarar_execution.action_item_events` and audited as `execution.task.<step>`.

The dashboard route `/api/admin/tasks/evidence` uploads (`POST`), serves (`GET`) and removes (`DELETE`) evidence files. It follows the checks of the topic attachment route.


## Following decisions and managing tasks (v2, 2026-10-16)

**Access**

- **Read:** the chair or rapporteur of the decision's council, or a holder of `execution.tasks.read` or `execution.tasks.manage`.
- **Manage and close:** the council's chair, or a holder of `execution.tasks.manage`.

**Contracts**

| Contract | Effect | Errors |
|---|---|---|
| `list_decision_follow_up_v2(p_status 'open' or 'closed' or 'all')` | Followed decisions with task counts (`open_tasks`, `overdue_tasks` and so on), `progress_percent`, `can_manage`, `can_close` and `close_blocked_reason` | `22023` for an unknown filter |
| `list_decision_tasks_v2(p_decision_id)` | The same row, plus `tasks` (each with `can_manage`) and the `units` a task may be reassigned to | `P0002`, `42501` |
| `cancel_task_v2(p_task_id, p_reason, p_expected_updated_at)` | Cancels the task | `22023`, `42501`, `23514`, `40001` |
| `reassign_task_v2(p_task_id, p_assigned_user_id, p_assigned_unit_id, p_reason, p_expected_updated_at)` | Reassigns to exactly one person or unit. A submitted task is not reassigned | `22023`, `42501`, `23514`, `40001` |
| `extend_task_due_date_v2(p_task_id, p_due_date, p_reason, p_expected_updated_at)` | Sets a due date that is not in the past | `22023`, `42501`, `23514`, `40001` |
| `close_decision_v2(p_decision_id, p_note, p_expected_updated_at)` | Closes an `approved`, `sent_to_execution` or `under_follow_up` decision once every task is completed or cancelled | `23514` with the reason, `42501`, `40001` |

- Every reason is 5 to 2000 characters.
- Each step is recorded in the task trail and audited.
- The closing note is written to `decision_status_history.reason`.
