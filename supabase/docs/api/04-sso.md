# SSO and Identity Federation

Supabase Auth performs SAML authentication. Qarar stores tenant domains, provider governance,
identity links, JIT rules, and group-to-role mappings.

## Configure Provider

`admin_upsert_sso_provider(...)` requires `iam.sso.manage`.

> Release 1 status: SSO is intentionally disabled. The production deployment fixes
> `GOTRUE_SAML_ENABLED=false` and `QARAR_SSO_ENABLED=false`; the login control, administration
> page, and mutation route are unavailable. Re-enabling it requires DNS TXT or IdP-controlled
> domain proof, issuer/audience/signature and metadata validation, signed-assertion-only group
> extraction, and a staging certification against the target Entra ID/SAML tenant.

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

`p_default_role_id` must be null or a non-elevated role. A role is elevated if its declared scope is
`organization` or `system`, or if any active permission makes it organization/system-scoped. SSO
defaults are deliberately not a path to grant elevated authority: activate and verify the identity,
then have a system administrator assign that authority explicitly.

## Register Allowed Domain

`admin_upsert_sso_domain(p_sso_provider_id, p_domain, p_verified)` preserves its legacy signature,
but `p_verified` is not a client-controlled field: sending `true` is rejected. A browser or mobile
client must omit it or send `false`; the domain is then stored as **disabled and pending
verification**.

There is intentionally no client-facing domain-verification endpoint during Phase 0. The containment
migration disables all existing domains and clears their historical `verified_at` values because they
could have been self-attested. A future trusted, audited server-side verification workflow must
establish ownership and set a new `verified_at` before activating a domain. Consequently, **SSO login
is unavailable until each required domain is re-verified**; login is rejected unless the provider is
active and the exact email domain is both `active` and has a non-null `verified_at` value.

## Complete SSO Login

After Supabase Auth login, call:

```dart
await supabase.schema('api_v1').rpc('register_current_sso_login', params: {
  'p_full_name_ar': displayName,
});
```

The function validates provider/domain/verification/provisioning mode, creates or updates the
profile, links the external identity, accepts a matching invitation, and assigns the
invitation/default role when it is non-elevated. An unverified or disabled domain is rejected before
profile provisioning. An organization/system role must never be supplied by an invitation or SSO
default during login.

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

After login, a trusted server-side SSO callback must extract groups from a verified IdP assertion and
may invoke the service-only `sync_current_sso_groups(p_external_groups)` contract. A browser or
Flutter client must never call this contract or provide its group array; an editable profile field,
request body, or client-generated claim is not a trusted authorization input.

Each synchronization is authoritative for group-derived access. It creates memberships for current
mapped groups and ends memberships whose IdP groups disappeared. Provenance is stored separately so
pre-existing or manually assigned memberships are preserved even when they match the same role and unit.
An empty array removes all current SSO-derived memberships for that identity. The verified-claims
callback and domain-proof workflow are required before this service path is enabled in production.

An active group mapping may grant only a non-elevated role. Group provenance, even from a verified
IdP assertion, is not sufficient provenance for organization/system authority. Use the normal
system-administrator assignment process after the user is active; do not try to encode that grant in
an SSO group or default role.
