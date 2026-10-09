# Administrative User Management

User administration requires `iam.users.read`, `iam.users.manage`, or `iam.users.invite` as noted.

## Governed Offboarding

`admin_request_user_offboarding(p_target_user_id, p_successor_user_id, p_justification)` creates a
pending request and never disables the target directly. A successor is mandatory whenever the
target owns or follows an open action item.

`admin_list_iam_approval_requests(p_status)` returns both IAM-change and offboarding review queues.
The requester is included so clients can disable self-review controls, while the database remains
the authoritative enforcement boundary.

`admin_review_user_offboarding(p_request_id, p_decision, p_notes)` requires a different administrator.
Approval atomically deactivates the account, deletes `auth.sessions`, revokes tracked sessions and
delegations, ends memberships, transfers open tasks, and emits audit events sharing one correlation ID.

## Search Users

`POST /rest/v1/rpc/admin_search_users` requires `iam.users.read`.

```json
{
  "p_query": "omar",
  "p_status": "active",
  "p_role_id": null,
  "p_governance_unit_id": null,
  "p_limit": 25,
  "p_offset": 0
}
```

Search matches name, email, employee number, mobile, and job title. Status values are `active`,
`inactive`, and `suspended`.

Response: `{ "items": [...], "total": 120, "limit": 25, "offset": 0 }`. Keep the current filters
when requesting the next page and stop when `offset + items.length >= total`.

## Get User Detail

`POST /rest/v1/rpc/admin_get_user_detail`

```json
{ "p_user_id": "<uuid>" }
```

Returns profile, memberships, roles, preferences, and linked SSO identities for the edit screen.
Returns HTTP `404` semantics through an RPC error when the user is absent or belongs to another tenant.

## Create User

`POST /functions/v1/iam-admin` requires `iam.users.manage`.

```json
{
  "action": "create_user",
  "creation_mode": "temporary_password",
  "email": "member@example.edu.sa",
  "full_name_ar": "عضو جديد",
  "temporary_password": "Qarar-Strong!2026",
  "employee_no": "EMP-1024",
  "mobile": "0500000000",
  "job_title": "عضو مجلس",
  "role_id": "<uuid>",
  "governance_unit_id": "<uuid>",
  "membership_title": "عضو"
}
```

Success (`201`):

```json
{
  "user_id": "<uuid>",
  "membership_id": "<uuid-or-null>",
  "account_created": true,
  "invitation_sent": false,
  "must_change_password": true
}
```

The default `creation_mode` is `invitation`: an unconfirmed Auth identity and inactive
profile receive a one-time activation invitation. The receipt includes `invitation_sent:true`.
`temporary_password` mode is restricted to a system administrator (the sensitive
dashboard gateway requires MFA). Passwords are 12–128 characters with uppercase,
lowercase, digit and symbol. Both modes retain the 10-attempts/10-minutes rate limit.
An optional initial role requires its validated resource context.

Direct creation first creates unconfirmed Auth, then atomically finalizes the profile,
initial membership and password-replacement gate through `service_finalize_temporary_user`;
only then is email confirmed. No invitation is created or sent and no password appears
in the receipt or audit. Failed/uncertain provisioning must be checked in the user list
before attempting another creation. Compensation targets only the newly created identity.

## Required first password replacement

`POST /api/auth/login` checks the service-only `service_get_temporary_password_state`
after successful Auth authentication. Pending users receive HTTP 202 with
`{authenticated:false,password_change_required:true}` and a 15-minute HttpOnly strict
temporary cookie, not application/refresh cookies. Replacement expires seven days
after creation. Database organization and permission resolution are blocked while pending.

`POST /api/auth/temporary-password` accepts `{currentPassword,password}`, derives the
user identity from the temporary cookie verified by Auth and never from a client UUID.
It rate-limits and verifies the current password, rejects equal plaintext passwords,
acquires `service_claim_temporary_password`, changes the password with the user's
Auth token, then calls `service_finish_temporary_password`. Completion verifies that
Auth's stored hash differs from the initial baseline, revokes Auth sessions and clears
the gate atomically. New sessions must exist in Auth; old temporary JWTs stay blocked.
The response is `{changed:true,message}` and the user signs in again (including MFA
if their roles require it). `service_release_temporary_password` only releases the
same failed attempt. Claims expire in five minutes; simultaneous attempts are conflicts.
Transport/uncertain update failures return `{uncertain:true,traceId,message}` and must
lead to checking login with the new password, not a blind update retry.
All five service contracts are inaccessible to browser/anonymous/authenticated RPC callers.

The underlying `admin_create_user_profile(...)` RPC only finalizes an application profile for an
already-created Auth user. It does not create an Auth identity or send email and is not the normal
frontend entry point. User-management screens must use the `iam-admin` `create_user` action so the
Auth, profile, membership, and rollback steps remain one governed operation.

## Update Profile

`POST /rest/v1/rpc/admin_update_user_profile` requires `iam.users.manage`.

```json
{
  "p_user_id": "<uuid>",
  "p_full_name_ar": "الاسم المعدل",
  "p_full_name_en": null,
  "p_employee_no": "EMP-1024",
  "p_mobile": "0500000000",
  "p_job_title": "مقرر اللجنة"
}
```

## Change Status, Lock, and Unlock

`POST /functions/v1/iam-admin` requires `iam.users.manage`.

```json
{ "action": "update_user_status", "user_id": "<uuid>", "status": "inactive", "reason": "Employment ended" }
```

For explicit security controls use `{"action":"lock_user","user_id":"<uuid>","reason":"..."}`
and `{"action":"unlock_user","user_id":"<uuid>"}`. Inactive or suspended users are banned in
Auth, all refresh sessions are deleted, application sessions are marked revoked, and the change is
audited. Unlocking removes the Auth ban but does not restore deleted sessions.

Success returns the resulting user status and number of revoked sessions. An administrator cannot
deactivate their own profile. Direct client execution of `admin_update_user_status` is intentionally
revoked; never call it from Flutter.

## Resend Invitation

```json
{ "action": "resend_invitation", "user_id": "<uuid>", "redirect_to": "https://app.example/auth/callback" }
```

This action permits five attempts per 15 minutes. It generates a fresh invite link, sends it through
configured SMTP, records `iam.invitation.resent`, and returns only a masked destination address.

When supplied, `redirect_to` must be an absolute HTTP(S) URL whose actual origin exactly matches a
canonical entry in the deployment-owned `ALLOWED_ORIGINS` list. The Edge Function checks this before
calling GoTrue, rejects wildcard/prefix lookalikes and URLs containing credentials, and records only
the validated canonical value. Do not pass a redirect constructed from untrusted input. Omitting the
field uses the server's normal Auth redirect configuration.

## Force Password Reset

```json
{ "action": "send_password_reset", "user_id": "<uuid>", "redirect_to": "https://app.example/auth/reset" }
```

This generates and emails a recovery link and records `iam.password_reset.sent`. The administrator
does not receive or set the user's password.

The same server-side `redirect_to` allowlist rule applies to recovery links; `URI_ALLOW_LIST` in
GoTrue is defense in depth, not the sole redirect control.

## Edge Action Contract

All actions below use `POST /functions/v1/iam-admin` with the headers in [00-common.md](./00-common.md).

| Action | Required fields | Success | Important errors |
|---|---|---|---|
| `create_user` | `email`, `full_name_ar`, `temporary_password`; optional role and unit pair | `201`, `{user_id, membership_id, account_created}` | `400` validation/finalization, `409` Auth conflict, `429` rate limit |
| `update_user_status` | `user_id`, `status`; optional `reason` | `200`, status result | `400` invalid status, `404` Auth user absent, `429` rate limit |
| `lock_user` | `user_id`; optional `reason` | `200`, suspended result | `404` Auth user absent, `429` rate limit |
| `unlock_user` | `user_id`; optional `reason` | `200`, active result | `404` Auth user absent, `429` rate limit |
| `revoke_session` | `session_id`; optional `reason` | `200`, `{revoked, session_id, auth_sessions_revoked}` | `403` foreign/unauthorized session, `404` absent session |
| `resend_invitation` | `user_id`; optional allowlisted `redirect_to` | `200`, `{sent, user_id, destination}` | `400` invalid redirect, `404` managed user absent, `429` rate limit |
| `send_password_reset` | `user_id`; optional allowlisted `redirect_to` | `200`, `{sent, user_id, destination}` | `400` invalid redirect, `404` managed user absent, `429` rate limit |

`role_id` and `governance_unit_id` for `create_user` must be supplied together. Treat the operation as
complete only after HTTP `201`; the backend removes the new Auth user if profile or membership creation fails.

Flutter invocation example:

```dart
final response = await supabase.functions.invoke('iam-admin', body: {
  'action': 'lock_user',
  'user_id': userId,
  'reason': reason,
});
final result = Map<String, dynamic>.from(response.data as Map);
```

## Invitation Records

For SSO or controlled provisioning, use `admin_create_invitation(...)` and
`admin_revoke_invitation(...)`. These records govern application access and do not replace the
Auth invitation email sent by `iam-admin`.

A pending invitation cannot carry organization/system authority, including a role whose active
permission matrix makes it elevated. Reissue it without a role or with a non-elevated role, wait for
the invited identity to be active and verified, then let a system administrator make the elevated
assignment through the normal role-assignment workflow.

## Multiple user roles (api_v2)

`get_user_roles_v2(p_user_id uuid)` returns the target's membership history,
role/unit choices and optimistic concurrency timestamps. It is system-admin
only and tenant-scoped. Organizational units may host operational roles;
`council_*` roles require a real, non-archived council.

`manage_user_role_v2(p_user_id uuid, p_action text, p_membership_id uuid = null,
p_expected_updated_at timestamptz = null, p_role_id uuid = null,
p_unit_id uuid = null, p_title text = null, p_start_date date = current_date,
p_end_date date = null, p_request_id uuid = null)` supports `add`, `update`,
`disable`, `enable`. Existing records require their last-read timestamp;
stale writes return a conflict. Adding requires an internally generated request
UUID, reused for retries of the same payload. UUIDs are never user-entered.

Disabling preserves membership history. Ended memberships are not reopened;
expired or unavailable roles require correction before reactivation. Existing
period-overlap, council leadership and IAM authority guards remain enforced.
Changes are transactional and audited with the actual actor. No change to
account status, temporary-password requirements, `is_system_admin`, or explicit
submission grants is made. Invited identities may be prepared without being
activated. The dashboard uses `/api/admin/users/[userId]/roles` (GET/PUT) with
session, MFA, origin and input validation, not a service-role shortcut.

## Scoped topic submitter role

The independent `topic_submitter` capability uses the submission profile, not a
fabricated voting membership. Saving a new profile assigns it with the configured
scope; existing profiles retain their previous access. `get_user_submission_scope_v2`
adds `submission_enabled` and `submission_role_code` without removing old fields.

`set_user_submission_enabled_v2(p_user_id uuid, p_expected_revision integer,
p_enabled boolean, p_request_id uuid)` toggles this capability while retaining
scope selections. It is system-admin/tenant limited, serializes with scope saves
and audits the actual actor. Re-enabling requires a saved nonempty scope. Saving
a disabled profile never enables it implicitly. Same-payload retries are safe;
version conflicts require reload. PATCH `/api/admin/users/[userId]/submission-scope`
uses this contract, and does not accept grant replacements in the toggle request.

The contextual permission predicate, topic-form options, classification listing,
preview and creation all obey the enabled scoped capability. Any independent
legacy membership permission remains additive: disabling this capability alone
does not withdraw a permission granted by another role. Existing topics, route
instances, identity status and password requirements remain unchanged.
