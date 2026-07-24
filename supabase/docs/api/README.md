# Qarar Supabase API

This is the entry point for frontend, integration, and backend developers. Qarar exposes three API styles:

- Supabase Auth endpoints under `/auth/v1` for identity and sessions.
- Versioned PostgREST RPC contracts in schema `api_v1` under `/rest/v1/rpc/*`.
- Edge Functions under `/functions/v1` for trusted operations requiring server secrets.

## Base URLs

| Service | Local URL |
|---|---|
| API gateway | `http://localhost:54321` |
| REST/RPC | `http://localhost:54321/rest/v1` |
| Auth | `http://localhost:54321/auth/v1` |
| Edge Functions | `http://localhost:54321/functions/v1` |
| Studio | `http://localhost:54323` |
| Mailpit | `http://localhost:8025` |
| PostgreSQL pooler | `localhost:54322` |

## Documentation Groups

| Group | Document | Status | Main consumers |
|---|---|---|---|
| Authentication and common rules | [00-common.md](./00-common.md) | Implemented | All clients |
| Current account and preferences | [01-account.md](./01-account.md) | Implemented | Profile/settings screens |
| Administrative user management | [02-users-admin.md](./02-users-admin.md) | Implemented | User administration |
| Roles and permissions | [03-roles-permissions.md](./03-roles-permissions.md) | Implemented | IAM administration |
| SSO and identity federation | [04-sso.md](./04-sso.md) | Implemented | SSO administration/login |
| Sessions, delegation, approvals | [05-security-operations.md](./05-security-operations.md) | Implemented | Security administration |
| Topics | [06-topics.md](./06-topics.md) | Implemented | Topic workflows |
| Topic referrals and route history | [06-topic-referrals.md](./06-topic-referrals.md) | Implemented | Referral workflows |
| Meetings, attendance, voting | [07-meetings.md](./07-meetings.md) | Implemented | Meeting workflows |
| Session, attendance, quorum, voting | [07-session-attendance-voting.md](./07-session-attendance-voting.md) | Implemented | Live meeting workflows |
| Minutes | [08-minutes.md](./08-minutes.md) | Deferred to Sprint 4 | Minutes workflows |
| Decisions and execution | [09-decisions-execution.md](./09-decisions-execution.md) | Deferred to Sprint 5 | Decision follow-up |
| Edge Functions and storage | [10-edge-storage.md](./10-edge-storage.md) | Implemented, with noted compatibility surface | Integrations/uploads |
| Audit logs | [11-audit-logs.md](./11-audit-logs.md) | Implemented | Auditors/security administration |
| Exact RPC contract reference | [12-contract-reference.md](./12-contract-reference.md) | Generated from runtime registry | All API developers |
| Flutter integration and screen map | [13-frontend-integration-guide.md](./13-frontend-integration-guide.md) | Implemented-scope handoff | Flutter developers |

## Source of Truth

Database migrations remain the executable source of truth. Documentation changes must accompany
any changed table, RPC signature, Edge Function payload, permission requirement, or status enum.
The generated contract reference records every exposed `api_v1` signature and audience. The
documentation parity test fails when it differs from the runtime registry.
The physical module map and dependency rules are documented in
[../architecture/README.md](../architecture/README.md).
