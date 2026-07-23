# Sprint 02 Backend Production Review

## Scope

Reviewed PB-006, PB-008, PB-009, PB-010, PB-011, PB-012, PB-013, and PB-014 against the
implemented schema, RLS, frontend operations, audit requirements, and automated tests.

## Closed Gaps

- Added atomic referral request/accept/reject operations and chronological route history.
- Kept topics in the source unit until destination acceptance.
- Added response reason, responder, and response timestamp as distinct referral fields.
- Added server-generated meeting numbers and idempotent meeting creation.
- Added meeting form options, search, pagination, detail, optimistic update, and lifecycle RPCs.
- Added immutable meeting status history and audit events.
- Added eligible-topic search and atomic agenda add, reorder, remove, and exception operations.
- Replaced role-code exception checks with scoped `agenda.exception`.
- Replaced broad organization RLS with scoped permission policies.
- Revoked direct authenticated writes to workflow tables.
- Added 27 production-contract assertions in addition to the five defensive guard assertions.

## Frontend Contract

Frontend developers should use:

- [Topic Referrals API](../api/06-topic-referrals.md)
- [Meetings and Agenda API](../api/07-meetings.md)
- [Authentication and Common Rules](../api/00-common.md)

## Verification Boundary

Sprint 02 focused database tests pass 32/32 assertions. The broader suite exposes a Sprint 03
legacy dependency: attendance/voting tests update meeting state directly. Direct meeting writes are
now intentionally blocked, so Sprint 03 must receive lifecycle/quorum/voting RPCs rather than
reopening table writes. This is a Sprint 03 production-hardening item, not a reason to weaken the
Sprint 02 contract.
