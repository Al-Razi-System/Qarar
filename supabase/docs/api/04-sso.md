# SSO and Identity Federation

Supabase Auth performs SAML authentication. Qarar stores tenant domains, provider governance,
identity links, JIT rules, and group-to-role mappings.

## Configure Provider

`admin_upsert_sso_provider(...)` requires `iam.sso.manage`.

```json
{
  "p_provider_name": "University Entra ID",
  "p_supabase_sso_provider_id": "<supabase-provider-uuid>",
  "p_metadata_url": "https://login.example/metadata",
  "p_entity_id": "https://login.example/entity",
  "p_attribute_mapping": { "groups": "groups" },
  "p_default_role_id": "<uuid-or-null>",
  "p_default_governance_unit_id": "<uuid-or-null>",
  "p_provisioning_mode": "invited_only",
  "p_status": "active"
}
```

Provisioning modes are `disabled`, `invited_only`, and `jit`. Production deployments should prefer
`invited_only` unless the organization explicitly approves JIT provisioning.

## Register Allowed Domain

`admin_upsert_sso_domain(p_sso_provider_id, p_domain, p_verified)` stores a lowercase verified domain.
SSO login is rejected when the authenticated email domain is not active for that provider.

## Complete SSO Login

After Supabase Auth login, call:

```dart
await supabase.rpc('register_current_sso_login', params: {
  'p_full_name_ar': displayName,
});
```

The function validates provider/domain/provisioning mode, creates or updates the profile, links the
external identity, accepts a matching invitation, and assigns the invitation/default role.

## Map External Groups

`admin_upsert_sso_group_mapping(...)` maps one exact external group string to one role/unit pair.

```json
{
  "p_provider_id": "<uuid>",
  "p_external_group": "Council-Secretaries",
  "p_role_id": "<uuid>",
  "p_governance_unit_id": "<uuid>",
  "p_membership_title": "أمين المجلس",
  "p_is_active": true
}
```

After login, pass trusted groups extracted from the verified IdP assertion to
`sync_current_sso_groups(p_external_groups)`. Never accept group names from an editable profile field.

Each synchronization is authoritative for group-derived access. It creates memberships for current
mapped groups and ends memberships whose IdP groups disappeared. Provenance is stored separately so
pre-existing or manually assigned memberships are preserved even when they match the same role and unit.
An empty array removes all current SSO-derived memberships for that identity.
