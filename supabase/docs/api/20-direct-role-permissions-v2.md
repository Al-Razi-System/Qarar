# Direct role permission saving (api_v2)

`set_role_permissions_direct_v2(p_role_id uuid, p_permission_codes text[],
p_expected_permission_codes text[], p_request_id uuid, p_reason text = null)`
replaces selectable active grants immediately. It returns
`{saved: true, role_id, permission_codes, superseded_request_count}`.

Only an active system administrator in the role's organization with AAL2 may
use this command. `iam.permissions.manage` alone does not authorize direct save.
No approval request is created. Organization/system capabilities must fit the
role's existing scope; saving never broadens the role scope or account authority.

The expected set is the active permission-code set returned by
`admin_get_role_detail`. A changed set produces SQLSTATE `40001` (dashboard HTTP
409); invalid codes produce `22023`; an inactive role produces `23514`.
Unknown/foreign roles produce `P0002`. An identical actor-bound request replay
returns its receipt without another audit; changed replay data is rejected.

The transaction locks the IAM authority boundary then the role. Legacy request
creation/review use the same boundary lock before their row locks. Existing
pending role-permission replacement requests are rejected with an explicit
superseded explanation, so later approval cannot overwrite a direct save.
Other legacy requests remain unchanged. Disabled definitions and their historical
grants are preserved. Audit records actor, before/after sets, request identity,
optional reason and superseded request IDs. Receipt-table access is private.

Dashboard operation `saveRolePermissions` uses this V2 contract with the user's
session, never a service-role key. Errors include a trace identifier and safe
Arabic copy. Uncertain mutations block blind repeat submission until reload.
