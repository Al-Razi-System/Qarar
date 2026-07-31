# Administrative User Management

User administration requires `iam.users.read`, `iam.users.manage`, or `iam.users.invite` as noted.

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
  "account_created": true
}
```

The function validates the caller, enforces a strong temporary password, limits creation to 10
attempts per 10 minutes, creates a confirmed Auth identity and application profile, and assigns the
optional initial role. No invitation email is sent. If profile or
role creation fails, it deletes the newly created Auth user as compensation.

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

## Force Password Reset

```json
{ "action": "send_password_reset", "user_id": "<uuid>", "redirect_to": "https://app.example/auth/reset" }
```

This generates and emails a recovery link and records `iam.password_reset.sent`. The administrator
does not receive or set the user's password.

## Edge Action Contract

All actions below use `POST /functions/v1/iam-admin` with the headers in [00-common.md](./00-common.md).

| Action | Required fields | Success | Important errors |
|---|---|---|---|
| `create_user` | `email`, `full_name_ar`, `temporary_password`; optional role and unit pair | `201`, `{user_id, membership_id, account_created}` | `400` validation/finalization, `409` Auth conflict, `429` rate limit |
| `update_user_status` | `user_id`, `status`; optional `reason` | `200`, status result | `400` invalid status, `404` Auth user absent, `429` rate limit |
| `lock_user` | `user_id`; optional `reason` | `200`, suspended result | `404` Auth user absent, `429` rate limit |
| `unlock_user` | `user_id`; optional `reason` | `200`, active result | `404` Auth user absent, `429` rate limit |
| `revoke_session` | `session_id`; optional `reason` | `200`, `{revoked, session_id, auth_sessions_revoked}` | `403` foreign/unauthorized session, `404` absent session |
| `resend_invitation` | `user_id`; optional `redirect_to` | `200`, `{sent, user_id, destination}` | `404` managed user absent, `429` rate limit |
| `send_password_reset` | `user_id`; optional `redirect_to` | `200`, `{sent, user_id, destination}` | `404` managed user absent, `429` rate limit |

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
