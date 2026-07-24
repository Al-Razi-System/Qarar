# Meeting Minutes

## Implementation Status

Frontend minute-management contracts are **not implemented yet**. They belong to Sprint 4. No
supported `api_v1` contract currently exists for reading, creating, editing, submitting, or approving
minutes. Clients must not read or write `meeting_minutes` or `minute_approvals` directly through
PostgREST.

The target workflow requires versioned contracts for:

- loading the current draft and its approval state;
- creating and editing a draft with optimistic concurrency;
- submitting a draft for approval;
- recording an authorized approver decision;
- publishing the immutable approved version;
- exposing status history and audit references.

These operations must enforce organization scope, governance-unit permissions, legal transitions,
and audit logging inside the backend transaction before this document can be marked implemented.

## Temporary AI Draft Generator

`POST /functions/v1/generate-minutes` is an existing compatibility Edge Function. It is not the
frontend contract for the complete minutes workflow and is scheduled for migration in
[GitHub issue #96](https://github.com/Al-Razi-System/Qarar/issues/96).

```json
{ "meeting_id": "<uuid>" }
```

Generated content is always an unapproved draft requiring human review. New frontend code must not
depend on the compatibility database views used internally by this function. The replacement
contract will be documented here when Sprint 4 is implemented.
