# Audit Log Administration

Audit APIs require `audit.logs.read` and always restrict results to the caller's organization.
Audit rows are append-only for application clients.

## Search and Pagination

`POST /rest/v1/rpc/admin_search_audit_logs`

```json
{
  "p_query": "invitation",
  "p_action": null,
  "p_entity_type": "users",
  "p_actor_user_id": null,
  "p_result": "success",
  "p_from": "2026-07-01T00:00:00Z",
  "p_to": "2026-08-01T00:00:00Z",
  "p_limit": 50,
  "p_offset": 0
}
```

`p_result` accepts `success`, `failure`, or `denied`. Search examines action, entity type, and metadata.
The time range includes `p_from` and excludes `p_to`. Limits are clamped to 1-200. The response contains
`items`, `total`, `limit`, and `offset`; items are ordered newest first and include available actor name/email.

## View Details

`POST /rest/v1/rpc/admin_get_audit_log`

```json
{ "p_audit_log_id": "<uuid>" }
```

Returns one complete tenant-scoped record or `audit log not found`. Metadata can contain security-sensitive
operational context, so this endpoint must not be exposed to general user roles.

## Export

`POST /rest/v1/rpc/admin_export_audit_logs` accepts the exact action, entity, actor, result, and time filters
from search. It returns versioned JSON with `schema_version`, `exported_at`, `organization_id`, and `items`.
Exports are ordered newest first and capped at 10,000 records per request. Use bounded time windows for larger
retention archives and protect exported files according to the organization's evidence-retention policy.
