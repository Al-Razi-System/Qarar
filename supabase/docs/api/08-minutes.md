# Meeting Minutes

## Implementation Status

Frontend minute-management contracts are not part of this branch yet. Clients must not read or
write minute tables directly through PostgREST. The minute workflow is delivered independently.

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
