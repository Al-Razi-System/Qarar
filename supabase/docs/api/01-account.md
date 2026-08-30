# Current Account and Preferences

These operations are available to every authenticated active user and only affect the caller.

## Initial Profile Provisioning (Service-only)

`bootstrap_current_user_profile` is **not** an authenticated-client contract. Phase 0 removes the
browser and Flutter access path because a caller-supplied organization code could otherwise turn the
first application profile in an organization into a system administrator.

Do not call `POST /rest/v1/rpc/bootstrap_current_user_profile` from a client and never distribute a
service-role key to one. The only supported replacement is the one-time, controlled backend
`service_bootstrap_organization_admin` workflow. It requires an active organization with no
application profiles, an existing confirmed Auth identity with a matching email, an external approval
reference, and typed operator confirmation. Follow the
[initial-admin bootstrap runbook](../../../docs/INITIAL_ADMIN_BOOTSTRAP_RUNBOOK.md); do not implement
this through a dashboard route, client RPC, or direct table write. SSO, invitations, and normal
administrative user creation remain documented in [04-sso.md](./04-sso.md) and
[02-users-admin.md](./02-users-admin.md).

## Get My Account

`POST /rest/v1/rpc/get_my_account`

Body: `{}`

Returns profile fields, organization, preferences, active roles, and effective permissions.

```dart
final account = Map<String, dynamic>.from(
  await supabase.schema('api_v1').rpc('get_my_account') as Map,
);
```

Use the returned permission codes for route and control visibility. Refresh this context after a
role assignment, delegation, or permission approval.

## Update My Profile

`POST /rest/v1/rpc/update_my_profile`

```json
{
  "p_full_name_ar": "عمر محمد",
  "p_full_name_en": "Omar Mohammed",
  "p_mobile": "0500000000",
  "p_job_title": "أمين مجلس"
}
```

Editable fields are limited to names, mobile number, and job title. Organization, employee number,
status, roles, system-admin state, and email cannot be changed through this operation.

## Update My Preferences

`POST /rest/v1/rpc/update_my_preferences`

```json
{
  "p_locale": "ar-SA",
  "p_timezone": "Asia/Riyadh",
  "p_notification_settings": { "email": true, "push": true },
  "p_ui_settings": { "density": "compact", "theme": "system" }
}
```

The two settings objects are JSON and may evolve without a schema migration. Clients should
preserve unknown keys when updating one preference.

## Change Password

Password changes use Supabase Auth rather than an application RPC:

```dart
await supabase.auth.updateUser(
  UserAttributes(password: newPassword),
);
```

Use the recovery flow when the session is unavailable, and comply with secure-password-change
reauthentication when Auth requests a nonce.

The release-1 dashboard implements recovery at `/forgot-password` and receives the GoTrue
recovery session at `/auth/recovery`. The browser removes recovery credentials from the URL
fragment before rendering, the server accepts only a JWT whose signed `amr` contains
`recovery`, changes the password through GoTrue, and immediately performs a global logout to
revoke every refresh session. Access JWT lifetime remains bounded by `JWT_EXPIRY` because JWTs
are stateless; protected dashboard requests additionally re-evaluate the current identity and
MFA policy.

System administrators, actors holding any `iam.*` permission, and roles whose code identifies
a break-glass account must reach `aal2`. Password login for these actors receives only a
five-minute HttpOnly MFA bootstrap session. `/mfa` enrolls or verifies a TOTP factor, and the
application session is issued only after GoTrue returns an `aal2` token.
