# Edge Functions and Storage

## Available Edge Functions

| Function | Purpose | Auth |
|---|---|---|
| `iam-admin` | User creation, status/lock controls, session revocation, invitations, password recovery | Required; permission checked |
| `generate-minutes` | Generate an AI-assisted meeting-minutes draft | Required; runtime JWT verification and defensive caller verification |

Invoke from Flutter:

```dart
final response = await supabase.functions.invoke(
  'iam-admin',
  body: {
    'action': 'create_user',
    'email': email,
    'full_name_ar': name,
    'temporary_password': temporaryPassword,
  },
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

The production bucket is `qarar-evidence` and is private. Browser and mobile clients **must not**
write to this bucket directly: a direct Storage upload would bypass the Dashboard BFF's content
signature checks and its mandatory pre-storage malware scan.

For current administrative attachments, submit multipart data to the authenticated BFF route:

- `POST /api/admin/topics/upload`
- `POST /api/admin/regulations/upload`

The BFF authorizes the target entity, limits the request to 25 MiB, verifies the actual file type,
scans it over its private ClamAV protocol, and only then writes a generated object path. A malware
verdict returns `422`; an unavailable scanner returns `503` and does not store the file. Do not
retry a `503` by calling Storage directly.

Downloads also go through the authenticated BFF routes and use `Content-Disposition: attachment`,
`X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-store`. Never use a public bucket
or persist signed URLs for governance evidence. See the [upload malware-scanning runbook](../../../docs/UPLOAD_MALWARE_SCANNING_RUNBOOK.md) for production deployment requirements.

## Operational Errors

Edge responses use stable `error` identifiers. Log the identifier and request context, but do not
log bearer tokens, service keys, invitation links, generated prompts containing sensitive data, or files.
