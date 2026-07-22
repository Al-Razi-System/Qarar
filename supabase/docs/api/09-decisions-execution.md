# Decisions and Execution

## List Decisions

```http
GET /rest/v1/decisions?select=*,topics(*),meetings(*)&meeting_id=eq.<uuid>&order=created_at.desc
```
Useful filters include `topic_id`, `meeting_id`, `agenda_item_id`, `decision_status`, and governance unit.

## Create Decision

`POST /rest/v1/decisions`

```json
{
  "decision_no": "D-2026-010",
  "topic_id": "<uuid>",
  "meeting_id": "<uuid>",
  "agenda_item_id": "<uuid>",
  "governance_unit_id": "<uuid>",
  "decision_type_id": "<uuid>",
  "decision_text": "يعتمد المجلس التعديل وفق النسخة المرفقة.",
  "decision_status": "draft",
  "issued_by_user_id": "<current-user-uuid>",
  "requires_approval": true
}
```

Decision statuses include `draft`, `under_review`, `ready_for_approval`, `approved`,
`sent_to_execution`, `under_follow_up`, `closed`, `cancelled`, and `rejected`.

## Update Decision

```http
PATCH /rest/v1/decisions?id=eq.<uuid>
```

```json
{
  "decision_status": "ready_for_approval",
  "decision_text": "النص المنقح"
}
```

Database guards enforce legal transitions and protect approved history.

## Create Action Item

Action items may be created only for decisions in an approved or later executable state.

```json
{
  "action_no": "ACT-2026-055",
  "decision_id": "<uuid>",
  "topic_id": "<uuid>",
  "assigned_unit_id": "<uuid-or-null>",
  "assigned_user_id": "<uuid-or-null>",
  "title_ar": "تعميم اللائحة الجديدة",
  "description": "إرسال النسخة المعتمدة للجهات",
  "priority": "high",
  "due_date": "2026-09-01",
  "status": "new"
}
```

## Update Progress

```http
PATCH /rest/v1/action_items?id=eq.<uuid>
```

```json
{ "status": "in_progress", "progress_percent": 45 }
```

Statuses are `new`, `in_progress`, `completed`, `overdue`, `cancelled`, and `closed`.
Starting execution moves the parent decision to follow-up according to database logic.
