# Edge Functions and Storage

## Available Edge Functions

| Function | Purpose | Auth |
|---|---|---|
| `iam-admin` | User creation, status/lock controls, session revocation, invitations, password recovery | Required; permission checked |
| `generate-minutes` | Generate a meeting-minutes draft | Required through caller client |

Invoke from Flutter:

```dart
final response = await supabase.functions.invoke(
  'iam-admin',
  body: {'action': 'create_user', 'email': email, 'full_name_ar': name},
);
```

The self-hosted Edge Runtime routes `/functions/v1/<function-name>` through the `main` router.
Function environment contains internal `SUPABASE_URL`, anon key, and service-role key. Only functions
that genuinely need administrative Auth access may instantiate a service-role client.

Supported `iam-admin` actions are `create_user`, `update_user_status`, `lock_user`, `unlock_user`,
`revoke_session`, `resend_invitation`, and `send_password_reset`. User lifecycle details and payloads
are documented in [02-users-admin.md](./02-users-admin.md); session behavior is in
[05-security-operations.md](./05-security-operations.md).

## Evidence Storage

The `evidence-files` bucket is private. Use the authenticated Storage client so bucket policies and
tenant ownership are applied.

```dart
final path = '$organizationId/topics/$topicId/${const Uuid().v4()}-$safeName';
await supabase.storage.from('evidence-files').upload(path, file);
```

Store the resulting object path in the relevant application record. Do not store signed URLs;
generate short-lived signed URLs when rendering or downloading:

```dart
final url = await supabase.storage
    .from('evidence-files')
    .createSignedUrl(objectPath, 300);
```

Validate extension, MIME type, and file size in the client for usability, while treating backend
bucket limits and policies as authoritative. Never use a public bucket for governance evidence.

## Operational Errors

Edge responses use stable `error` identifiers. Log the identifier and request context, but do not
log bearer tokens, service keys, invitation links, generated prompts containing sensitive data, or files.
