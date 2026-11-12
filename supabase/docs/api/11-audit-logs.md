# Audit Log Administration

Audit APIs require `audit.logs.read` and always restrict results to the caller's organization.
Audit rows are append-only for every role: triggers reject `UPDATE`, `DELETE` and `TRUNCATE`
(the only permitted change is the foreign key detaching a deleted actor), and those privileges are revoked.

## What every row records

A `BEFORE INSERT` trigger enriches every row whoever writes it:

| Field | Meaning |
|---|---|
| `actor_kind` | `user` (an authenticated person), `service` (the service role), `system` (migrations, seeds, jobs) |
| `request_id` | `X-Qarar-Request-Id` sent by the dashboard; links the event to server logs |
| `client_ip` | `X-Qarar-Client-IP` reported by the dashboard (the reverse proxy's trusted header), else the first `X-Forwarded-For` hop. A direct PostgREST caller can send any value, so treat it as reported, not proven |
| `user_agent` | `X-Qarar-User-Agent` or `User-Agent`, at most 500 characters |
| `previous_data` / `new_data` | Row snapshots before and after. Rows written before 2026-11-12 keep them in `metadata.old/new`; reads fall back to those |
| `changed_fields` | Keys whose value differs between the snapshots |
| `actor_capacity` | `{source, declared, roles, system_admin, governance_unit_id, governance_unit_name}` for user events. `derived`: the roles the actor held that day in the council the record belongs to (directly, or via its meeting, agenda item or decision). `declared`: what the command stated through `qarar_audit.declare_actor_capacity(capacity, unit)`, which rejects a capacity the actor does not hold, or an authority it records as `metadata.confirmation_authority`. The council name is kept as it was at the time |

Edge Functions (`iam-admin`, `generate-minutes`) forward `X-Qarar-Request-Id`, `X-Qarar-Client-IP` and
`X-Qarar-User-Agent` to every database client they build, including their service clients, so their audit rows
carry the same context as direct calls. A native client without a request id receives a fresh one.

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

`p_result` accepts `success`, `failure`, or `denied`. Search examines action, entity type, metadata, the actor's
name and email, and exact request or entity ids.
The time range includes `p_from` and excludes `p_to`. Limits are clamped to 1-200. The response contains
`items`, `total`, `limit`, and `offset`; items are ordered newest first and carry `actor_name_ar`, `actor_email`,
`actor_kind`, `request_id`, `client_ip`, `changed_fields`, `entity_label {reference,title}` (the record's number and
title, resolved live or from the snapshot when deleted) and `metadata`. Snapshots are only returned by the detail call.

## View Details

`POST /rest/v1/rpc/admin_get_audit_log`

```json
{ "p_audit_log_id": "<uuid>" }
```

Returns one complete tenant-scoped record (including `user_agent`, `previous_data`, `new_data`) or `audit log not found`. Metadata can contain security-sensitive
operational context, so this endpoint must not be exposed to general user roles.

## Export

`POST /rest/v1/rpc/admin_export_audit_logs` accepts the exact action, entity, actor, result, and time filters
from search. It returns versioned JSON with `schema_version`, `exported_at`, `organization_id`, and `items`.
Exports are ordered newest first and capped at 10,000 records per request. Use bounded time windows for larger
retention archives and protect exported files according to the organization's evidence-retention policy.

## Filter facets

`POST /rest/v1/rpc/admin_get_audit_facets_v2` returns `{entity_types:[{value,count}], actors:[{id,name_ar,count}], results:{success,denied,failure}}`
for the caller's organization, so filters only offer values that exist.

## Denied and failed attempts

A rejected command rolls back its own transaction, so it cannot audit itself. The dashboard therefore calls
`service_record_api_outcome_v2(p_actor_user_id, p_api_version, p_contract, p_result, p_error_code, p_http_status)`
with the service role after a `403`/`42501` (`denied`) or a `5xx`/`PGRST2xx` (`failure`). It writes `action`
`api.denied` or `api.failed`, `entity_type` `api_contract`, and the contract and error code in `metadata`, in the
actor's own organization. Only `service_role` may call it; a failure to record never changes the user's response.
