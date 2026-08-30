# Roles and Permissions

## Access Context and Permission Checks

`POST /rest/v1/rpc/get_current_user_access_context` returns the caller's active roles and effective
permission codes. `POST /rest/v1/rpc/has_permission` performs an authoritative backend check:

```json
{
  "permission_code": "iam.roles.assign",
  "target_unit_id": "<optional-governance-unit-uuid>"
}
```

## List Roles

`admin_list_roles(p_query, p_scope, p_active_only)` requires `iam.roles.read`. Supported scopes are
`system`, `organization`, `governance_unit`, and `execution`.

```json
{ "p_query": null, "p_scope": "governance_unit", "p_active_only": true }
```

Returns a JSON array. Filtering and ordering are performed by the RPC; this list is intended for role
tables and assignment selectors.

## Get Role Detail

`admin_get_role_detail(p_role_id)` returns role metadata and its assigned permission objects.

```json
{ "p_role_id": "<uuid>" }
```

## Create or Update Role

`admin_upsert_role(...)` requires `iam.roles.manage`.

After `20260816080000_iam_authority_provenance_boundary.sql`, an organization- or
system-scoped role may be created or changed only by a system administrator. The same applies when
a role becomes elevated because of one of its active permissions; a local-looking role is not a way
to bypass the authority boundary.

```json
{
  "p_role_id": null,
  "p_code": "agenda_reviewer",
  "p_name_ar": "مراجع جدول الأعمال",
  "p_name_en": "Agenda Reviewer",
  "p_description": "يراجع البنود قبل الاجتماع",
  "p_role_scope": "governance_unit",
  "p_is_active": true
}
```

Use `admin_deactivate_role(p_role_id, p_reason)` instead of deleting a historical role.
Both create and update return the role UUID. `p_code` is immutable once clients depend on it as an API key.

## List and Maintain Permissions

- `admin_list_permissions(p_module, p_active_only)` requires `iam.permissions.read`.
- `admin_upsert_permission(...)` requires `iam.permissions.manage` and creates or updates a custom permission.

`admin_list_permissions` returns a JSON array and accepts nullable `p_module` plus `p_active_only`.
Permission maintenance should be exposed only to the highest IAM administration screen.

Permission codes are stable API identifiers such as `iam.users.manage`; display names may change.
Do not branch application logic on translated names.

## Authority Provenance Boundary

The backend derives a role's authority from both its declared `role_scope` and every active
permission assigned to it. The following scope matrix is enforced:

| Permission context scope | Permitted role scopes |
| --- | --- |
| `system` | `system` only |
| `organization` | `organization`, `system` |
| `governance_unit`, `execution`, `self` | Existing lower-scope semantics; still subject to the target-context permission check and RLS |

A role is elevated when its declared scope is `organization` or `system`, or when it carries an
active permission in either context. Only a system administrator may change an elevated role,
elevated permission, its matrix association, or an active membership that grants or revokes it.
An IAM change request can still be submitted for review, but applying a change that creates or
removes elevated authority requires the reviewing system administrator. APIs fail closed with a
permission error instead of downgrading the request to local authority.

## Assign Role to User

`admin_assign_role(...)` requires `iam.roles.assign` in the target unit.

```json
{
  "p_user_id": "<uuid>",
  "p_role_id": "<uuid>",
  "p_governance_unit_id": "<uuid>",
  "p_membership_title": "عضو",
  "p_start_date": "2026-08-01",
  "p_end_date": null
}
```

`admin_revoke_membership(p_membership_id, p_reason)` ends the membership and preserves history.
Assignment returns the membership UUID. Refresh the affected user's access context after either operation.
Assigning or revoking an elevated role is system-administrator-only even if the caller has an
otherwise valid unit-level assignment permission.

## Change Role Permissions

Direct authenticated execution of `admin_set_role_permissions` is disabled. Submit a reviewed change:

```json
{
  "p_role_id": "<uuid>",
  "p_permission_codes": ["topics.review", "meetings.read"],
  "p_justification": "Approved operating model revision"
}
```

Call `admin_request_role_permissions_change(...)`, then a different administrator calls
`admin_review_iam_change(request_id, 'approved', notes)`. The requester cannot approve their own request.
The request operation returns a change-request UUID; review returns no body. Accepted review decisions are
`approved` and `rejected`.

## Export and Import

`admin_export_permission_matrix()` returns schema version `1`, permissions, roles, and assignments.
To restore/import, call `admin_request_permission_matrix_import(matrix, justification)` and complete
the same independent approval workflow. Unknown document versions are rejected.
