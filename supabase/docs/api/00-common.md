# Authentication and Common Rules

## Required Headers

Authenticated REST, RPC, and Edge Function calls use:

```http
Authorization: Bearer <user-access-token>
apikey: <anon-key>
Content-Type: application/json
```

Never expose the service-role key to Flutter, browsers, logs, crash reports, or source control.
Only trusted Edge Functions receive it through server environment variables.

## Calling REST and RPC

```bash
curl "$SUPABASE_URL/rest/v1/rpc/get_my_account" \
  -X POST \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```dart
final account = await supabase.rpc('get_my_account');
final meetings = await supabase
    .from('meetings')
    .select('*, governance_units(name_ar)')
    .order('scheduled_date');
```

RPC arguments are JSON object keys matching PostgreSQL parameter names exactly. Omitted optional
arguments use database defaults; send `null` only when the operation explicitly supports it.

## Tenant Isolation

The access token identifies the user. `public.users.organization_id` determines the tenant.
RLS and security-definer RPC checks prevent cross-organization access. Clients must not rely on
hiding UI controls as authorization; the backend permission check remains authoritative.

## Pagination and Filtering

PostgREST collections use `limit`, `offset`, `order`, and column filters. Administrative search
RPCs return `{ items, total, limit, offset }`. The UI should keep page size at or below 100.

## Error Contract

PostgREST/RPC errors normally contain:

```json
{
  "code": "42501",
  "message": "permission denied: iam.users.manage",
  "details": null,
  "hint": null
}
```

Edge Functions return:

```json
{ "error": "operation_failed", "detail": "permission denied: iam.users.manage" }
```

Errors rejected before an operation starts use a specific `error` such as `missing_authorization`,
`invalid_token`, `method_not_allowed`, `user_id_required`, or `unsupported_action`. Errors raised by
permission, rate-limit, Auth, SMTP, or database operations use `operation_failed` and may include a
safe `detail`. UI logic should primarily branch on HTTP status and use `error` for field/state handling.
Do not display `detail` verbatim in production; it is intended for diagnostics.

Important HTTP statuses:

| Status | Meaning | Client action |
|---|---|---|
| `400` | Invalid payload/state | Show validated message; do not retry automatically |
| `401` | Missing/expired token | Refresh once, then require login |
| `403` | Permission denied | Hide action and record authorization failure |
| `404` | Resource unavailable under RLS | Treat as absent; do not reveal foreign-tenant existence |
| `409` | Duplicate or conflicting state | Refresh the affected screen |
| `429` | Rate limit exceeded | Back off and show retry guidance |
| `500` | Internal failure | Show correlation-safe generic error and log locally |

## Soft Deletion

Users, roles, memberships, and governance records use status transitions instead of destructive
deletion. Historical audit, decisions, votes, and minutes must retain their references.

## Deferred Auth Features

Primary email change and MFA/2FA enforcement are intentionally deferred. Do not update
`public.users.email` directly. Those features require complete Supabase Auth confirmation,
recovery, assurance-level, and organization-policy flows before being exposed.
