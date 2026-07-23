# Sprint 01 Backend Review

Review date: 2026-07-24

Scope: PB-001, PB-002, PB-003, and PB-004.

## Findings Before Hardening

| Severity | Requirement | Gap |
|---|---|---|
| Critical | PB-001 | Topic numbers and tenant-sensitive identifiers were accepted from direct client inserts. |
| Critical | PB-001 | Creation did not atomically write initial history and audit records. |
| Critical | PB-002 | Backend validation covered foreign keys and enums only; required lengths and complete references were not enforced as one operation. |
| Critical | PB-004 | No workflow API or transition guard existed for approve, return, reject, or defer. |
| Critical | PB-004 | Direct table updates could bypass reasons, status history, audit, and concurrency checks. |
| High | PB-003 | No reviewer queue API existed for scoped search, filters, total count, and pagination. |
| High | PB-004 | The schema lacked explicit `returned`, `rejected`, and `deferred` review statuses. |
| High | Security | Topic capabilities were based on legacy role-code policies rather than explicit RBAC permissions. |
| High | QA | Sprint 01 had only four tenant-isolation assertions and no workflow acceptance coverage. |
| Medium | Frontend contract | Documentation instructed clients to insert and patch topic rows directly. |

## Implemented Closure

- Added explicit `topics.create`, `topics.read`, and `topics.review` permissions.
- Added `create_topic` with server-derived tenant/user, validated references, generated reference
  number, initial history, and audit in one transaction.
- Added `search_topic_review_queue` with unit-scoped authorization, search, filters, total count,
  and pagination.
- Added `review_topic` with controlled actions, mandatory reasons, self-review prevention,
  pessimistic row locking, optimistic `updated_at` validation, history, and audit.
- Added form options, submitter list, and complete topic-detail contracts for frontend screens.
- Added request idempotency, rate limits, `start_review`, deferred-topic `resume`, and queue indexes.
- Replaced legacy role-code topic visibility with explicit scoped `topics.read/review` RLS checks.
- Revoked direct authenticated writes to topics and status history.
- Added 40 focused acceptance assertions covering PB-001 through PB-004, including every successful
  review action, stale-write rejection, idempotency, tenant isolation, and frontend read contracts.
- Replaced the frontend topic API documentation with the RPC contracts.

## Deliberately Outside Sprint 01

- Editing and resubmitting returned topics is PB-005.
- Cross-unit referrals and route history are PB-006/PB-008 in Sprint 02.
- Evidence attachment lifecycle requires a separate storage contract review.
