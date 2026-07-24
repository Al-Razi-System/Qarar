# Qarar Supabase

This directory contains the tracked Supabase baseline for `PB-054`.

## Scope

- Local Supabase configuration.
- Initial database schema for organization isolation, users, roles, memberships, governance units, topics, topic status history, and audit logs.
- Initial RLS policies using default-deny behavior for sensitive operations.
- Private storage bucket bootstrap for evidence files when the Supabase Storage schema is available.
- Development seed data for reference values only.

## Full Docker Compose Run

The primary local environment is the pinned official self-hosted Supabase stack in the single file
`supabase/docker/docker-compose.yml`. It runs Database, Auth, PostgREST,
Realtime, Storage, imgproxy, Edge Runtime, Kong, Studio, Postgres Meta, Supavisor, Logflare,
Vector, Mailpit, and the Qarar migration runner.

On first setup, create the ignored local environment and generate unique secrets:

```powershell
Copy-Item supabase/docker/.env.example supabase/docker/.env
# Use supabase/docker/utils/generate-keys.sh on systems with sh/openssl,
# or provision equivalent cryptographically random values through the deployment secret manager.
```

Then run from the repository root:

```powershell
npm run docker:config
npm run docker:pull
npm run docker:start
npm run docker:status
```

Alternatively, from `supabase/docker` run the standard Compose command directly:

```powershell
docker compose up -d
```

Local entry points:

- API: `http://localhost:54321`
- Studio: `http://localhost:54323`
- Mailpit: `http://localhost:8025`
- PostgreSQL pooler: `localhost:54322`

The `db-migrate` one-shot service applies each file in `supabase/migrations` once, records it in
`qarar_internal.applied_migrations`, then applies `seed.sql` once. Existing data lives under the
ignored `supabase/docker/volumes/db/data` and `volumes/storage` directories.

The Supabase CLI stack remains available for isolated CLI-oriented testing:

```powershell
npm install
npm run supabase:start
npm run supabase:reset
```

The CLI will print local `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and service keys. Do not run the CLI
stack and full Compose stack simultaneously because they use the same local ports. Keep real values
in local environment files only; do not commit them.

The repository pins the Supabase CLI as an npm development dependency, so use the npm scripts above or `npx supabase ...`.

## API Documentation

The domain-oriented API index is [`docs/api/README.md`](docs/api/README.md). Endpoint groups are
kept in separate files for accounts, user administration, roles and permissions, SSO, security
operations, topics, meetings, minutes, decisions, Edge Functions, and Storage. Update the relevant
domain file whenever an API contract changes.

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

## IAM, RBAC, and SSO Governance

Migration `20260721000000_iam_rbac_sso.sql` adds the production IAM layer on top of the original tenant model:

- `permissions` stores reviewable application capabilities such as `iam.users.manage` and `iam.sso.manage`.
- `role_permissions` maps organization roles to capabilities instead of relying only on role codes.
- `user_invitations` supports controlled provisioning and later invitation delivery.
- `sso_identity_providers`, `sso_domains`, and `user_identity_links` govern organization-level SAML SSO mappings while Supabase Auth remains the identity provider.
- `get_current_user_access_context()` returns the signed-in user's organization, active roles, and effective permissions for Flutter route guards.
- Admin operations use RPC functions such as `admin_create_user_profile`, `admin_assign_role`, `admin_create_invitation`, `admin_upsert_sso_provider`, and `register_current_sso_login`.
- Admin screens are covered by RPCs for user search/detail/update/status changes, role search/detail/create/update/deactivation, custom permission upsert, and role permission matrix replacement.
- Self-service account screens are covered by `get_my_account`, `update_my_profile`, and `update_my_preferences`.
- Password and primary email changes remain Supabase Auth operations (`supabase.auth.updateUser` or password recovery), not writes to `public.users`.
- User and role deletion is implemented as soft deletion/status transitions to preserve governance history.
- IAM and SSO changes are audited through database triggers. Direct `authenticated` writes to `audit_logs` are revoked; users only receive `SELECT` under RLS.

Migration `20260722000000_iam_operations_hardening.sql` adds tracked device sessions, SSO
group-to-role mappings, time-bounded access delegation, four-eyes approval for sensitive role
permission changes, versioned permission-matrix import/export, and an atomic rate limiter.

`functions/iam-admin` owns privileged Supabase Auth user creation. It validates the caller,
checks `iam.users.manage`, applies a per-admin rate limit, sends the invitation, creates the Qarar
profile, and optionally assigns the initial role. `SUPABASE_SERVICE_ROLE_KEY` must remain a
server-only secret.

Primary email changes and MFA/2FA enforcement are explicitly deferred. Their required Auth
flows and policies are recorded in `docs/api_data_contract.md`; neither is represented as complete.

SSO setup is intentionally split:

1. Configure the SAML provider in Supabase Auth using the Supabase CLI or hosted dashboard.
2. Store the returned Supabase SSO provider id in `sso_identity_providers.supabase_sso_provider_id`.
3. Register the verified email domains in `sso_domains`.
4. After SSO login, call `register_current_sso_login(...)` so Qarar links the Supabase Auth identity to the correct organization, invitation, role, and unit.

## Design Notes

- `auth.users` remains the authentication source. `public.users` stores the Qarar application profile and organization context.
- Every operational table added here has `organization_id` to support tenant isolation.
- Cross-table references that carry tenant-sensitive data use composite `(id, organization_id)` constraints to prevent records from pointing to users, roles, units, categories, or topics in another organization.
- First-user bootstrap is handled by `public.bootstrap_current_user_profile(...)`; it is limited to the first profile in an existing organization.
- RLS is enabled on all created tables.
- No delete policies are defined for sensitive operational tables.
- Audit logs are append-only for authenticated users and readable only by system/governance/audit roles.
- IAM audit logs are append-only through trusted database functions and triggers, not direct client inserts.
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
- IAM migration `20260721000000_iam_rbac_sso.sql` was applied against the local `supabase_db_qarar` container.
- Database test `supabase/tests/database/06_iam_rbac_sso_test.sql` passed 22/22 assertions.
- IAM operations test `supabase/tests/database/07_iam_operations_hardening_test.sql` passed 17/17 assertions.
- Critical IAM closure test `supabase/tests/database/08_iam_critical_closure_test.sql` passed 16/16 assertions.
- Sprint 02 defensive and production-contract tests pass 32/32 assertions.
- The complete database suite currently stops at the legacy Sprint 04 direct-minutes-write tests;
  Sprint 04 requires RPC hardening before it can run under the stricter workflow write boundary.
- `npm run test:iam-edge` passed 7/7 TypeScript handler tests.
- `npm run test:iam-http` passed the real Kong/Auth/REST/Edge/SMTP user-provisioning and rollback flow.
- `npm run test:sprint01-http` passed the real topic creation, direct-write denial, reviewer queue,
  approval, status history, and audit flow through Kong/PostgREST.
- Sprint 03 defensive and production-contract tests pass 54/54 assertions.
- `npm run test:sprint03-http` passes the real short-lived QR session, member self check-in,
  independent verification, roster lock, quorum, eligible voting, direct-write denial, and
  frozen-result flow through Auth/Kong/PostgREST.
