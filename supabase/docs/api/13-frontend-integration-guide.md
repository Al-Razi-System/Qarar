# Flutter Integration Guide

This is the implementation handoff for frontend developers. Read [00-common.md](./00-common.md)
first, then the workflow document linked from the screen map below. Exact RPC argument names and
PostgreSQL result types are frozen in [12-contract-reference.md](./12-contract-reference.md).

## Supported Frontend Scope

| Frontend area | Backend entry points | Workflow document | Status |
|---|---|---|---|
| Login, recovery, password change | Supabase Auth | [00-common.md](./00-common.md), [01-account.md](./01-account.md) | Implemented |
| My profile and preferences | `get_my_account`, `update_my_profile`, `update_my_preferences` | [01-account.md](./01-account.md) | Implemented; initial provisioning is service-only |
| User administration | `iam-admin`, `admin_search_users`, `admin_get_user_detail`, `admin_update_user_profile` | [02-users-admin.md](./02-users-admin.md) | Implemented |
| Roles and permissions | IAM `admin_*` contracts | [03-roles-permissions.md](./03-roles-permissions.md) | Implemented |
| SSO administration/login completion | SSO `admin_*`, `register_current_sso_login` | [04-sso.md](./04-sso.md) | Temporarily unavailable: domains are disabled until trusted ownership re-verification; group sync is service-only |
| Sessions, delegations, IAM approvals | Session/delegation/change-request contracts and `iam-admin` | [05-security-operations.md](./05-security-operations.md) | Implemented |
| Topic submission and review | Topic `api_v1` contracts | [06-topics.md](./06-topics.md) | Implemented |
| Topic referrals | Referral `api_v1` contracts | [06-topic-referrals.md](./06-topic-referrals.md) | Implemented |
| Meeting and agenda administration | Meeting `api_v1` contracts | [07-meetings.md](./07-meetings.md) | Implemented |
| Attendance, quorum, and voting | Attendance/voting `api_v1` contracts | [07-session-attendance-voting.md](./07-session-attendance-voting.md) | Implemented |
| Audit administration | Audit `admin_*` contracts | [11-audit-logs.md](./11-audit-logs.md) | Implemented |
| Minutes workflow | None for frontend use | [08-minutes.md](./08-minutes.md) | Deferred to Sprint 4 |
| Decisions and execution | None for frontend use | [09-decisions-execution.md](./09-decisions-execution.md) | Deferred to Sprint 5 |

Do not build deferred screens against physical tables or compatibility views. Keep them behind a
feature flag or out of navigation until their versioned contracts are implemented.

## Supabase Client

Use one configured client per signed-in application session. The SDK adds the bearer token and anon
key. Every application RPC must select the `api_v1` schema:

```dart
Future<T> callRpc<T>(
  SupabaseClient client,
  String function, {
  Map<String, dynamic> params = const {},
  required T Function(Object? value) decode,
}) async {
  final value = await client.schema('api_v1').rpc(function, params: params);
  return decode(value);
}
```

Never fall back to `client.from('<application-table>')` when a screen needs additional data. That is
a missing backend read model and must be added as a reviewed `api_v1` contract.

## Data Conventions

| Backend value | Flutter handling |
|---|---|
| `uuid` | Non-empty `String`; validate before sending |
| `date` | ISO `yyyy-MM-dd`; do not convert through UTC |
| `time` | ISO local wall time such as `10:00:00` |
| `timestamptz` | Parse as `DateTime`, retain UTC for writes, localize only for display |
| `jsonb` object | `Map<String, dynamic>.from(value as Map)` |
| `jsonb` array | `(value as List).map(...)`; do not assume mutable lists |
| PostgreSQL `void` | Treat a successful call as completion; the SDK result may be `null` |
| Nullable field | Preserve `null`; do not replace it with an empty string |

Unknown response fields must be ignored by decoders so additive backend changes do not break older
clients. Required fields used for identity, state, or concurrency must fail decoding when absent.

## Lists and Pagination

Search contracts return:

```json
{
  "items": [],
  "total": 0,
  "limit": 25,
  "offset": 0
}
```

Keep filters and `limit` stable while incrementing `offset`. Refresh from offset zero after a
mutation. Do not infer a total from `items.length`. Selector contracts documented as JSON arrays are
not paginated unless their workflow document explicitly provides pagination arguments.

## Concurrency and Idempotency

- Generate one `client_request_id` UUID when a create form is submitted and reuse it only while
  retrying that same submission.
- Keep every returned `updated_at` used by an edit screen.
- Send it through the documented `p_expected_updated_at` argument.
- On SQLSTATE `40001`, reload detail and ask the user to reconcile their changes. Do not retry an
  update automatically.
- After a successful command, reload the authoritative detail/query contract instead of patching a
  complex workflow object locally.

## Authorization in the UI

Load `get_current_user_access_context` after login and after any role, membership, delegation, or
SSO-group change. Permission codes control visibility and enabled state, but they are not security
boundaries. A `403`/SQLSTATE `42501` remains authoritative and must not be converted into a retry.

Use the `allowed_review_actions` and other server-provided state capabilities when available.
Do not reproduce lifecycle transition rules as the sole source of truth in Flutter.

## Error Mapping

Catch `PostgrestException` for RPC calls and `FunctionException` for Edge calls. Map by HTTP status
and stable code as defined in [00-common.md](./00-common.md). Store a client correlation ID with
diagnostic logs, but never store access tokens, SSO assertions, QR secrets, invitation/recovery
links, or sensitive `detail` values.

Recommended UI behavior:

| Failure | UI behavior |
|---|---|
| Validation (`400`) | Keep form values and show a field/workflow message |
| Authentication (`401`) | Refresh once; otherwise clear the session and open login |
| Authorization (`403`/`42501`) | Close the action, refresh access context, show access denied |
| Not found (`404`) | Return to the list without revealing cross-tenant existence |
| Conflict (`409`) | Reload the resource and explain that state changed |
| Stale write (`40001`) | Reload detail and require explicit resubmission |
| Rate limit (`429`) | Disable submit temporarily; never loop retries |
| Server failure (`500`) | Preserve safe form state and show a generic retry option |

## Integration Sequence

1. Authenticate through Supabase Auth.
2. Complete the applicable profile bootstrap or SSO registration flow.
3. Load `get_my_account` and `get_current_user_access_context`.
4. Register the device through `register_user_session`.
5. Build navigation from implemented scope and effective permissions.
6. Use the documented search/detail/command cycle for each screen.
7. Revoke the application/Auth session through `iam-admin` on remote-session removal.

The frontend is not responsible for organization IDs on ordinary commands unless the specific
workflow asks for a unit ID. Tenant identity always comes from the authenticated backend profile.
