# Qarar Supabase

This directory contains the tracked Supabase baseline for `PB-054`.

## Scope

- Local Supabase configuration.
- Initial database schema for organization isolation, users, roles, memberships, governance units, topics, topic status history, and audit logs.
- Initial RLS policies using default-deny behavior for sensitive operations.
- Private storage bucket bootstrap for evidence files when the Supabase Storage schema is available.
- Development seed data for reference values only.

## Local Run

Install the Supabase CLI, then run from the repository root:

```powershell
npm install
npm run supabase:start
npm run supabase:reset
```

The CLI will print local `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and service keys. Keep real values in local environment files only; do not commit them.

The repository pins the Supabase CLI as an npm development dependency, so use the npm scripts above or `npx supabase ...`.

## Current Local Service Scope

The local config currently starts the database, API gateway, Auth, Realtime, and Storage. Optional services are disabled for the `PB-054` baseline:

- `Studio` is disabled because the pulled local Studio image failed health checks with `ERR_INVALID_PACKAGE_CONFIG`.
- `Edge Runtime` is disabled because no Edge Functions are part of `PB-054`.
- `local_smtp` is disabled because email delivery is not required for the schema/RLS baseline.

Re-enable these services in `supabase/config.toml` when a task needs them.

## First User Bootstrap

`supabase/seed.sql` intentionally creates only reference data. It does not create `auth.users` rows.

After creating the first account through Supabase Auth, call the bootstrap RPC as that authenticated user:

```sql
select public.bootstrap_current_user_profile(
  p_organization_code => 'qarar-demo',
  p_full_name_ar => 'مسؤول النظام'
);
```

This function:

- requires `auth.uid()`;
- requires an authenticated email claim;
- creates a matching `public.users` profile for the current Auth user;
- marks the first user in the organization as `is_system_admin = true`;
- returns the existing profile if the same user already bootstrapped the same organization;
- rejects any attempt after the organization already has a user.

Later user provisioning should be implemented through an explicit admin flow, not through seed data.

## Design Notes

- `auth.users` remains the authentication source. `public.users` stores the Qarar application profile and organization context.
- Every operational table added here has `organization_id` to support tenant isolation.
- Cross-table references that carry tenant-sensitive data use composite `(id, organization_id)` constraints to prevent records from pointing to users, roles, units, categories, or topics in another organization.
- First-user bootstrap is handled by `public.bootstrap_current_user_profile(...)`; it is limited to the first profile in an existing organization.
- RLS is enabled on all created tables.
- No delete policies are defined for sensitive operational tables.
- Audit logs are append-only for authenticated users and readable only by system/governance/audit roles.
- The first schema is intentionally narrow. Later tasks should add meetings, minutes, decisions, action items, notifications, and reporting tables through separate migrations tied to their backlog items.

## Validation

Validated locally with Supabase CLI `2.109.1`:

- `npm run supabase:start`
- Migration `20260710190000_pb054_core_schema.sql`
- `supabase/seed.sql`
- Public schema contains 10 baseline tables.
- Public schema contains 25 RLS policies.
- Public schema contains composite foreign keys that enforce tenant consistency on `memberships`, `topics`, `topic_status_history`, and `audit_logs`.
- Public schema contains first-user bootstrap RPC `bootstrap_current_user_profile`.
- First-user bootstrap RPC was tested with a local `auth.users` record and produced one `public.users` system-admin profile.
- Seed data contains 1 organization, 7 roles, and 3 topic categories.
