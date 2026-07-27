# Meeting Minutes

## Implementation Status

PB-022 is implemented: frontend clients can load, create, and edit governed minute drafts through
`api_v1`. Submitting, human approval, publication, and controlled AI generation remain Sprint 4
commands and are not available yet. Clients must not read or write `meeting_minutes`,
`minute_approvals`, revisions, or history directly through PostgREST.

The target workflow requires versioned contracts for:

- loading the current draft and its approval state;
- creating and editing a draft with optimistic concurrency;
- submitting a draft for approval;
- recording an authorized approver decision;
- publishing the immutable approved version;
- exposing status history and audit references.

The implemented draft contracts and the remaining lifecycle rules are documented in
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

## Temporary AI Draft Generator

`POST /functions/v1/generate-minutes` is an existing compatibility Edge Function. It is not the
frontend contract for the complete minutes workflow and is scheduled for migration in
[GitHub issue #96](https://github.com/Al-Razi-System/Qarar/issues/96).

```json
{ "meeting_id": "<uuid>" }
```

Generated content is always an unapproved draft requiring human review. New frontend code must not
depend on the compatibility database views used internally by this function. The replacement
contract will be documented here when Sprint 4 is implemented.
