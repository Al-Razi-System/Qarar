# Topics and Referrals

Topic tables are exposed through PostgREST under tenant RLS.

## List Topics

```http
GET /rest/v1/topics?select=*,topic_categories(*),governance_units(*)&order=created_at.desc&limit=25
```
Apply filters such as `status=eq.new`, `priority=eq.high`, and `current_unit_id=eq.<uuid>`.

## Create Topic

`POST /rest/v1/topics`

```json
{
  "topic_no": "T-2026-001",
  "title_ar": "مراجعة اللائحة التنفيذية",
  "title_en": "Executive regulation review",
  "description": "تفاصيل الموضوع",
  "category_id": "<uuid>",
  "current_unit_id": "<uuid>",
  "submitted_by_user_id": "<current-user-uuid>",
  "source_type": "new",
  "priority": "high",
  "status": "new"
}
```

Request the created record with `Prefer: return=representation`. The organization must come from
the authenticated tenant context and may not point to another organization.

## Update Topic

```http
PATCH /rest/v1/topics?id=eq.<uuid>
```

Send only editable fields. Workflow status changes must satisfy migration guards; the frontend
should refresh after a conflict instead of overwriting newer state.

## Refer Topic

`POST /rest/v1/topic_referrals`

```json
{
  "topic_id": "<uuid>",
  "from_unit_id": "<uuid>",
  "to_unit_id": "<uuid>",
  "referred_by_user_id": "<current-user-uuid>",
  "referral_reason": "للمراجعة والرفع بالتوصية",
  "status": "pending"
}
```

Read status history from `topic_status_history` rather than reconstructing it from the current topic row.
