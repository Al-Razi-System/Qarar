# Meeting Minutes

## Implementation Status

Frontend clients can load, create, and edit governed minute drafts through `api_v1`; request a
controlled generated draft; submit it for human approval; and record the assigned approvers'
decisions. The final required human approval publishes the immutable final content and closes the
meeting atomically. Clients must not read or write `meeting_minutes`, `minute_approvals`, revisions,
or history directly through PostgREST.

The implemented workflow provides contracts for:

- loading the current draft and its approval state;
- creating and editing a draft with optimistic concurrency;
- submitting a draft for approval;
- recording an authorized approver decision;
- publishing the immutable approved version;
- exposing status history and audit references.

The complete lifecycle rules are documented in
[Sprint 4 Minutes Workflow](../architecture/sprint-04-minutes-workflow.md).

## Draft RPCs

All calls use `POST /rest/v1/rpc/<contract>` with the signed-in user's access token.

### `get_meeting_minutes`

```json
{ "p_meeting_id": "uuid" }
```

Requires `minutes.read` for the meeting's governance unit. It returns the meeting state and the
current minute, including its revisions, history, and approval records when a minute exists.

### `create_minute_draft`

```json
{ "p_meeting_id": "uuid", "p_content": "Draft text" }
```

Requires `minutes.manage`. The meeting must be `waiting_for_minutes`, and the command rejects a
second minute for the same meeting. The returned `updated_at` is required for the next save.

### `update_minute_draft`

```json
{
  "p_minute_id": "uuid",
  "p_content": "Revised draft text",
  "p_expected_updated_at": "2026-07-28T12:00:00Z"
}
```

Requires `minutes.manage` and accepts only `draft` or `generated` minutes. A stale
`p_expected_updated_at` returns SQLSTATE `40001`; reload the minute rather than overwriting another
editor's work.

### `POST /functions/v1/generate-minutes`

```json
{
  "meeting_id": "uuid",
  "client_request_id": "uuid"
}
```

Requires `minutes.manage`. The function snapshots the permitted meeting context, generates an
editable draft, and returns `{request_id,status,minute_id,revision_id,revision_no}` with
`status="generated"`. It never submits, approves, publishes, or closes a meeting. Reuse
`client_request_id` only to retry an interrupted network request. A terminal failed request is
audited and a deliberate new generation attempt requires a new identifier.

### `submit_minute_for_approval`

Requires `minutes.manage`. Input is `{p_minute_id,p_expected_updated_at}`. The backend validates
the current content, creates a new approval round from the council's configured approval rule,
changes the minute to `ready_for_approval`, and changes the meeting to `waiting_for_approval`.

### `decide_minute_approval`

Input is `{p_approval_id,p_decision,p_note,p_expected_updated_at}` where `p_decision` is
`approved` or `rejected`. Only the user assigned to that approval task may decide it. A rejection
returns the minute and meeting to the draft/minutes-review path. The final required human approval
copies the reviewed draft to `content_final`, marks the minute `approved`, and closes the meeting in
the same transaction.

## Controlled AI Draft Generator

`generate-minutes` is now a controlled Edge Function. It does not use compatibility views and its
service-only persistence contracts are not callable by Flutter or browser clients.
