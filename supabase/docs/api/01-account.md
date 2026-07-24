# Current Account and Preferences

These operations are available to every authenticated active user and only affect the caller.

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
  "p_full_name_ar": "ط¹ظ…ط± ظ…ط­ظ…ط¯",
  "p_full_name_en": "Omar Mohammed",
  "p_mobile": "0500000000",
  "p_job_title": "ط£ظ…ظٹظ† ظ…ط¬ظ„ط³"
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
