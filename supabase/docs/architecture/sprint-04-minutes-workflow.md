# Sprint 4 Minutes Workflow

## Business Boundary

An AI service may create or regenerate a draft. It never approves a minute, changes an approval
decision, or closes a meeting. Those actions are separate governed commands executed by authorized
people.

The workflow starts only for a meeting in `waiting_for_minutes`:

1. A permitted rapporteur, chair, or governance administrator creates a manual draft, or requests
   a controlled generated draft.
2. Every saved content value becomes an immutable revision. The latest revision is the only draft
   that can be submitted for approval.
3. A later command submits the current revision and creates the required human approval tasks.
4. Authorized human decisions determine whether the minute is approved. Meeting closure happens
   only after the final authorized approval, in the same transaction.

## Access Model

| Permission | Scope | Intended users |
| --- | --- | --- |
| `minutes.read` | Governance unit | Council members and minute managers |
| `minutes.manage` | Governance unit | Rapporteur, chair, governance administrator |
| `minutes.approve` | Governance unit | Chair and governance administrator |

The backend resolves the meeting governance unit and evaluates the permission inside every command;
clients do not submit an organization or unit identifier.

## PB-022 Contracts

All RPC calls use `/rest/v1/rpc/<contract>` and an authenticated Supabase access token. Direct
PostgREST access to minute tables is unsupported and denied.

### `get_meeting_minutes`

Input: `{ "p_meeting_id": "uuid" }`

Returns the meeting status and, if it exists, the minute, its immutable revisions, lifecycle history,
and approval records. The `content_final` field is intentionally not returned before the approved
publication contract is added.

### `create_minute_draft`

Input: `{ "p_meeting_id": "uuid", "p_content": "string" }`

Requires `minutes.manage`; the meeting must be `waiting_for_minutes`; and exactly one minute can
exist per meeting. It returns `minute_id`, `status`, `revision_no`, and `updated_at`.

### `update_minute_draft`

Input:

```json
{
  "p_minute_id": "uuid",
  "p_content": "string",
  "p_expected_updated_at": "2026-07-28T12:00:00Z"
}
```

Requires `minutes.manage`. It accepts only `draft` or `generated` minutes and uses
`p_expected_updated_at` for optimistic concurrency. A stale value fails with SQLSTATE `40001`; the
client must reload with `get_meeting_minutes`, present the conflict, and retry deliberately.

## Deferred Contracts

## Controlled Generation

`request_minute_generation` creates a tenant-scoped, ten-minute generation request after checking
`minutes.manage`. It snapshots the meeting, attendance, agenda, voting rounds, and decisions before
the Edge Function calls the provider. Repeating the same `p_client_request_id` returns the same
request.

Only the Edge Function's service-role contracts may complete or fail that request. Completion stores
an `ai_generated` immutable revision and leaves the minute in `generated`; it cannot submit,
approve, publish, or close anything. A failed request remains auditable and manual drafting remains
available. If a user changes the draft after the request snapshot was made, completion fails rather
than overwrite that newer human change.

## Deferred Contracts

`submit_minute_for_approval` and `decide_minute_approval` are implemented. A separate publish
contract is intentionally unnecessary: the final assigned human approval is the only operation that
publishes `content_final` and closes the meeting atomically.
