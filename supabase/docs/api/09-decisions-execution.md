# Decisions and Execution

## Implementation Status

Frontend contracts for decisions and execution follow-up are **not implemented yet**. They belong to
Sprint 5. No supported `api_v1` contract currently exists for listing, creating, updating, approving,
or closing decisions or action items. Clients must not access the `decisions` or `action_items`
compatibility views directly through PostgREST.

The target API requires versioned contracts for:

- searching and loading decisions with topic, meeting, and agenda context;
- drafting and editing a decision with optimistic concurrency;
- enforcing review, approval, issuance, cancellation, and closure transitions;
- creating assignments only from an executable decision;
- updating progress, evidence, due dates, reassignment, completion, and closure;
- querying overdue work and execution dashboards with tenant and unit scoping;
- exposing immutable status history and audit references.

The backend must enforce organization isolation, scoped permissions, transition rules, and audit
events atomically. Exact request and response contracts will be added here with the Sprint 5
implementation; frontend development must not infer them from physical tables.
