# Meeting Minutes

## Read Minutes

```http
GET /rest/v1/meeting_minutes?meeting_id=eq.<uuid>&select=*,minute_approvals(*)
```
## Create or Update Draft

Use `POST /rest/v1/meeting_minutes` for the first draft and `PATCH` filtered by `id` for edits.

```json
{
  "meeting_id": "<uuid>",
  "content_draft": "نص مسودة المحضر",
  "content_final": null,
  "status": "draft",
  "generated_by_ai": false,
  "created_by_user_id": "<current-user-uuid>"
}
```

Statuses are `draft`, `generated`, `ready_for_approval`, and `approved`. Moving to approval creates
or validates the required approval records according to the governance unit rule.

## Generate Draft with AI

`POST /functions/v1/generate-minutes`

```json
{ "meeting_id": "<uuid>" }
```

The function reads only meeting data visible to the caller, sends a bounded prompt to the configured
AI provider, and inserts or updates `meeting_minutes.content_draft`. Success:

```json
{ "success": true, "message": "Minutes generated successfully" }
```

Generated content is always a draft requiring human review. The client must never display it as an
approved official record based only on `generated_by_ai=true`.

## Approve Minutes

Update the caller's row in `/rest/v1/minute_approvals`:

```json
{
  "approval_status": "approved",
  "notes": "موافق بدون ملاحظات"
}
```

Use the existing approval row ID. The backend marks the minutes approved only after all approvals
required by `minute_approval_rule` are satisfied.
