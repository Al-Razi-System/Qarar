# Meeting Minutes

## AI-Assisted Draft Generator

`POST /functions/v1/generate-minutes` creates an editable Arabic draft for a meeting that has reached
`waiting_for_minutes`. It is an Edge adapter for the external AI provider; all platform reads and the
draft write use governed `api_v1` contracts. It never exposes the service-role key to a client.

```json
{ "meeting_id": "<uuid>" }
```

The request must be `POST` with `Content-Type: application/json` and the standard bearer token from
[00-common.md](./00-common.md). The function has runtime JWT verification enabled and also verifies
the caller with Supabase Auth before doing any work.

## Authorization and Data Boundary

The caller needs `meetings.manage` on the meeting's governance unit. The function also reads the
attendance through `get_meeting_session_detail`; therefore the caller must independently have its
normal attendance-read access. It does not bypass that rule with the service role.

Only these governed contracts are used:

- `get_meeting_detail`
- `has_permission`
- `get_meeting_minutes`
- `get_meeting_session_detail`
- `save_meeting_minutes_draft`
- service-only `service_consume_iam_rate_limit` for the already verified actor

Before calling the provider, the adapter sends only the meeting number/title/date/time/unit name,
attendance name/status, and agenda topic/status/discussion/voting summaries. It excludes IDs, email,
contact data, location details, internal fields, and raw database records. Meeting data is explicitly
framed as untrusted input so text saved by users cannot alter the model's instructions. Prompts,
bearer tokens, provider keys, raw provider errors, and raw provider responses are never logged or
returned by the endpoint.

The provider call is time-bounded. Source data, request body, number of attendees/agenda items, and
generated output have hard size limits; oversized requests fail rather than silently sending an
unbounded record to the provider.

## Result and Review

On success:

```json
{
  "success": true,
  "generated": true,
  "requires_human_review": true,
  "minute_id": "<uuid>",
  "status": "draft"
}
```

The generated text is saved only as a `draft` through `save_meeting_minutes_draft`. It never submits,
approves, closes, or changes the meeting lifecycle. A human must review and submit it through the
normal minutes workflow. If an existing draft already contains content, the function returns it
idempotently and does not call the provider or overwrite it. If a draft appears or changes while the
provider is working, the function returns `409 minutes_changed` instead of replacing the observed
draft.

The current governed draft contract does not persist an AI-provenance flag. Treat the draft as
AI-assisted operationally and retain human review evidence; a future dedicated edge-only minutes
contract is required before adding persistent AI provenance.

## Errors

| Status | Error | Client action |
|---|---|---|
| 400 | `invalid_request` / `invalid_meeting_id` | Correct the payload. |
| 401 | `missing_authorization` / `invalid_token` | Refresh once, then sign in. |
| 403 | `forbidden` | Do not retry; request the required meeting/attendance access. |
| 409 | `meeting_not_ready_for_minutes` / `minutes_changed` / `state_conflict` | Reload the meeting and minutes state. |
| 413 / 422 | `payload_too_large` / `meeting_data_too_large` | Reduce the input or use the human drafting workflow. |
| 429 | `rate_limited` | Wait before retrying. |
| 502 / 503 / 504 | Provider, configuration, or governed-contract failure | Do not retry automatically; retain the human workflow. |

## Deployment Configuration

The Edge Runtime receives `GEMINI_API_KEY` and `ALLOWED_ORIGINS` only through server environment
variables. Production Compose requires both values; do not put either in a browser, Flutter client,
source control, logs, or analytics. `ALLOWED_ORIGINS` is a comma-separated allowlist of exact HTTPS
origins (no wildcard, path, trailing slash, query, or fragment) and must contain `APP_ORIGIN`. Requests
without an `Origin` header can still be used by trusted server-to-server callers with a valid JWT.
