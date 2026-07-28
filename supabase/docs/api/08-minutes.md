# Meeting Minutes

## Frontend Contracts

All minute commands use `POST /rest/v1/rpc/{contract}` with the `api_v1` profile. Direct reads and
writes to minute tables are unsupported.

- `get_meeting_minutes`: loads the current minute, its draft/version state, approvals, and history.
- `create_minute_draft`: starts a draft for a meeting.
- `update_minute_draft`: updates draft content with `p_expected_updated_at`; stale writes return `40001`.
- `request_minute_generation`: queues a generated draft using a client idempotency key.
- `submit_minute_for_approval`: freezes the submitted version and opens the approval workflow.
- `decide_minute_approval`: records an authorized approval or return decision with optimistic concurrency.

The browser and Flutter clients must never call `service_complete_minute_generation` or
`service_fail_minute_generation`; they are service-role callbacks used by the generation worker.

| Contract | Stable response keys |
|---|---|
| `get_meeting_minutes` | meeting/minute state, versions, approvals, and history |
| `create_minute_draft` | `minute_id`, `status`, `version`, `updated_at` |
| `update_minute_draft` | `minute_id`, `version`, `updated_at` |
| `request_minute_generation` | `request_id`, `status`, `idempotent_replay` |
| `submit_minute_for_approval` | `minute_id`, `status`, approval identifiers |
| `decide_minute_approval` | `approval_id`, `decision`, minute status, `updated_at` |

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
