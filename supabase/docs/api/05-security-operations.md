# Sessions, Delegation, and IAM Approvals

## Register Device Session

Call `register_user_session(...)` after login and periodically when the app becomes active:

```json
{
  "p_device_id": "stable-installation-id",
  "p_device_name": "Omar's workstation",
  "p_platform": "windows",
  "p_app_version": "1.4.0",
  "p_auth_session_id": null,
  "p_ip_address": null,
  "p_user_agent": "Qarar Flutter/1.4.0"
}
```

Do not use hardware serial numbers as `device_id`; generate an app installation UUID and store it securely.

## List and Revoke Sessions

`list_my_sessions()` returns devices ordered by last activity. To revoke:

`POST /functions/v1/iam-admin`

```json
{ "action": "revoke_session", "session_id": "<uuid>" }
```

The Edge Function resolves the application session to its Auth `session_id`, deletes that Auth session,
marks the application session revoked, and writes an audit event. Deleting the Auth session invalidates
its refresh-token chain. The UI must still clear local credentials immediately after revoking its own session.
Success is `{ "revoked": true, "session_id": "<uuid>", "auth_sessions_revoked": 1 }`; a zero count means
the Auth session had already ended while the application record was still marked revoked.

`request_session_revocation(p_session_id)` records and audits an application-level revocation request,
but it cannot delete Supabase Auth refresh tokens. Frontend clients must use the `iam-admin`
`revoke_session` action above for effective revocation.

## Temporary Delegation

`admin_create_delegation(...)` delegates the permissions of one active source membership:

```json
{
  "p_source_membership_id": "<uuid>",
  "p_delegated_to_user_id": "<uuid>",
  "p_starts_at": "2026-08-01T00:00:00Z",
  "p_ends_at": "2026-08-10T00:00:00Z",
  "p_reason": "Annual leave coverage"
}
```

The maximum duration is 90 days. The delegate receives only the source membership's effective
permissions and unit scope. Use `admin_revoke_delegation(id, reason)` to end it early.
An internal `pg_cron` job runs every minute and changes stored `active` delegations whose `ends_at` has
passed to `expired`. Permission checks also enforce the time boundary independently of this maintenance job.

## Approval Queue

`iam_change_requests` statuses are `pending`, `approved`, `rejected`, `cancelled`, `applied`, and
`failed`. Administrators read the queue under RLS and call:

```json
{
  "p_request_id": "<uuid>",
  "p_decision": "approved",
  "p_notes": "Compared with approved matrix CR-104"
}
```

`admin_review_iam_change(...)` enforces that reviewer and requester are different users.

## Rate Limits

The `iam-admin` Edge Function calls the service-only
`service_consume_iam_rate_limit(actor_user_id, operation, limit, window_seconds)` contract.
Flutter and browser clients cannot execute this contract. They receive HTTP `429` from the Edge
Function and must not retry immediately. Rate-limit storage is operational and not user editable.

## Service-Role IAM Contracts

The following `service_role` contracts are implementation details of `iam-admin` and are denied to
authenticated clients:

| Contract | Purpose |
|---|---|
| `service_apply_user_status` | Apply the synchronized application status after the Auth ban/unban step |
| `service_finalize_invited_user` | Create the profile and optional membership after Auth invitation |
| `service_record_iam_event` | Record an Edge-orchestrated IAM audit event |
| `service_revoke_auth_sessions` | Mark application sessions revoked after Auth session deletion |
| `service_consume_iam_rate_limit` | Enforce per-actor operation limits |

Their exact signatures are listed in [12-contract-reference.md](./12-contract-reference.md). They are
documented for backend maintainers only and are not frontend endpoints.
