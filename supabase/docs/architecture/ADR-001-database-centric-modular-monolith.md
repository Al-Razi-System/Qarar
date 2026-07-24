# ADR-001: Database-Centric Modular Monolith

- Status: Accepted
- Date: 2026-07-24

## Context

Qarar requires strict tenant isolation, governed workflows, atomic state changes, auditability, and
Supabase-native Auth/Realtime/Storage integration. The earlier implementation placed all domain
tables and callable functions in `public`, which made ownership unclear and allowed accidental
coupling even though individual workflows were protected.

## Decision

Use a database-centric modular monolith with physical PostgreSQL schemas per domain and a
versioned `api_v1` RPC facade. Keep domain invariants close to the data through constraints,
transactions, RLS, and triggers. Use Edge Functions only as privileged or external-system adapters.

Tables are moved to their owning schemas. `public` contains no application base tables. Temporary
security-invoker views preserve compatibility while clients migrate, but business writes are
performed through `api_v1`. Registry tables make ownership and exposed contracts testable.

API wrappers and module implementations use separate NOLOGIN owners with least-privilege table
grants. Migrations and their ledger entries execute in one transaction. Edge-only operations use
service-role contracts rather than granting a nominal Edge audience to authenticated clients.

## Consequences

- Atomic cross-table workflows remain straightforward in one PostgreSQL transaction.
- Module ownership, API review, and deprecation become explicit.
- A single deployment remains operationally simpler than distributed services.
- PostgreSQL migrations require disciplined backward compatibility and contract tests.
- Compatibility views must be removed after remaining trusted consumers migrate.
- A module can later be extracted behind the same API contract if scaling or team ownership
  justifies the operational cost.
