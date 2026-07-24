# Qarar Backend Architecture

Qarar is a database-centric modular monolith on Supabase. PostgreSQL owns transactional domain
rules, RLS, constraints, triggers, audit events, and most commands. Edge Functions are adapters for
operations that require Supabase Auth administration, SMTP, external systems, or server secrets.

## Runtime Layers

1. Clients call Supabase Auth, Edge Functions, or reviewed RPCs in `api_v1`.
2. `api_v1` is the only versioned application RPC facade exposed through PostgREST.
3. Internal implementations enforce authorization and orchestrate transactions.
4. Each table is physically owned by one `qarar_*` module schema.
5. Cross-module integrity uses explicit foreign keys; cross-module behavior uses reviewed functions.
6. RLS and audit remain defense-in-depth controls, not substitutes for command validation.

`qarar_api_executor` owns the API wrappers but has no table privileges. Each internal function is
owned by one `qarar_<module>_executor` NOLOGIN role. Module roles can mutate their own tables, read
their own state, and use only cross-module reads and calls registered in
`module_table_read_allowlist` and `module_function_execute_allowlist`. Architecture tests compare
effective PostgreSQL privileges and source-level qualified references to these registries.

Internal module roles use `BYPASSRLS` because SECURITY DEFINER commands must enforce a complete
transaction across protected tables. They are never login or client roles. Every exposed contract
must derive its tenant from the validated actor, constrain rows by `organization_id`, and include a
cross-tenant behavioral test. CI also rejects contract implementations that contain no explicit
tenant or actor guard, but this source-text check is only an early review gate. Behavioral pgTAP
tests are the isolation proof. The shared negative suite exercises IAM, Topics, Meetings,
Attendance, Voting, and Audit using valid foreign-tenant identifiers, including access attempted by
a system administrator from another tenant.

## Module Ownership

| Module | Schema | Owned capability |
|---|---|---|
| Core | `qarar_core` | organizations and governance units |
| IAM | `qarar_iam` | users, RBAC, SSO, sessions, delegation |
| Topics | `qarar_topics` | topics, categories, review history, referrals |
| Meetings | `qarar_meetings` | meetings, lifecycle, agenda |
| Attendance | `qarar_attendance` | check-in, verification, roster, quorum |
| Voting | `qarar_voting` | voting rounds, eligibility, immutable votes |
| Minutes | `qarar_minutes` | minutes and approvals |
| Decisions | `qarar_decisions` | decisions, notes, lifecycle |
| Execution | `qarar_execution` | action items, evidence, follow-up, escalation |
| Audit | `qarar_audit` | append-only audit log |

`qarar_architecture.module_registry`, `entity_registry`, and `api_contract_registry` are executable
inventories. Architecture tests fail when a table or API wrapper bypasses those inventories.

## Dependency Rules

- A table has exactly one owning module.
- New application tables are forbidden in `public`.
- Frontends never call `public` implementation functions.
- New frontend commands and queries require a registered `api_v1` RPC and domain documentation.
- A cross-module table read or function call requires an allowlist row with a review rationale.
- Modules must not mutate another module's aggregate except through its command function or an
  explicitly tested write grant recorded by the architecture security test.
- Edge Functions validate the caller, then invoke `api_v1`; they do not duplicate domain rules.
- Edge-only mutations use `service_role` contracts with an explicit actor id revalidated in the
  database. There is no `edge_authenticated` pseudo-boundary.
- `public` views are temporary compatibility adapters for existing trusted integrations. No new
  frontend dependency may use them.
- Authentication secrets and service-role credentials exist only in server environments.

## Adding a Contract

1. Add the table or function in a versioned migration under its owning schema.
2. Add entity/API registry metadata and every required cross-module dependency in the same
   migration. Broad schema/table/function grants are forbidden.
3. Expose a versioned wrapper in `api_v1` with explicit grants and a controlled `search_path`.
4. Add pgTAP authorization, cross-tenant denial, state, concurrency, and rollback tests. Tenant
   isolation is mandatory for every new contract because module executors use `BYPASSRLS`.
5. Add a real HTTP integration test for multi-service flows.
6. Update the matching file under `docs/api`.

The complete v1 name/signature/result/audience surface is frozen by
`qarar_architecture.api_release_registry`. Its reviewed hash fails migrations and tests if an
existing v1 contract changes. Breaking changes require `api_v2`.

The decision and migration rationale is recorded in
[ADR-001-database-centric-modular-monolith.md](./ADR-001-database-centric-modular-monolith.md).

## Compatibility Retirement

Every remaining `public` view is registered in
`qarar_architecture.compatibility_surface_registry` with its consumers, owner, replacement, and
earliest removal date. Authenticated and anonymous roles have no DML privileges on these views.

Current consumers are limited to integration-test fixture setup, the pre-Sprint-04
`generate-minutes` Edge Function, and the legacy voting report. CI rejects any additional Edge
Function `.from(...)` dependency. Sprint 04 must migrate `generate-minutes` to governed contracts;
the general compatibility views are scheduled for removal no earlier than 2026-09-30 and the
reporting view no earlier than 2026-10-31.

## Migration Runtime

The self-hosted migration role must be `SUPERUSER`, `CREATEROLE`, and `BYPASSRLS`; the runner fails
its preflight otherwise. This is required for NOLOGIN executor ownership and the narrowly scoped
Auth lifecycle event trigger. The production stack must use the pinned PostgreSQL image and the
same `supabase_admin` migration role validated by CI.

One session-level PostgreSQL advisory lock serializes the complete migration batch. Every applied
file and the development seed are recorded with a SHA-256 checksum. A changed historical file
stops startup; corrections must be delivered as a new migration. Each migration and its ledger row
remain one transaction. CI starts two real `db-migrate` containers concurrently, observes one
granted advisory lock and one waiting lock in PostgreSQL, then requires both runners to finish
successfully with no leaked lock.
