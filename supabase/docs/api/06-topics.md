# Topics

Sprint 01 topic writes use RPC functions rather than direct table writes. Authenticated clients have
read access under tenant RLS, but direct `INSERT`, `UPDATE`, and `DELETE` on `topics` and
`topic_status_history` are revoked.

## Reference Data

Call `POST /rest/v1/rpc/get_topic_form_options` before rendering the creation form:

```json
{}
```

It returns `categories`, `governance_units`, `priorities`, and `source_types`. Categories are active
tenant values; governance units are active units where the caller has `topics.create`. Do not cache
identifiers across tenants.

## Create Topic

`POST /rest/v1/rpc/create_topic` requires `topics.create` in the selected governance unit.

```json
{
  "p_title_ar": "مراجعة اللائحة التنفيذية",
  "p_description": "وصف تفصيلي للموضوع والغرض من عرضه",
  "p_category_id": "<uuid>",
  "p_current_unit_id": "<uuid>",
  "p_priority": "high",
  "p_source_type": "new",
  "p_title_en": "Executive regulation review",
  "p_client_request_id": "<client-generated-uuid>"
}
```

Required fields are Arabic title, description, category, and governance unit. The Arabic title must
contain 5-300 characters and the description 10-10,000 characters. Priorities are `low`, `medium`,
`high`, and `urgent`. Source types are `new`, `from_lower_unit`, `from_upper_unit`,
`from_peer_unit`, and `from_admin_entity`.

Success:

```json
{
  "id": "<uuid>",
  "topic_no": "TOP-2026-000001",
  "status": "new",
  "submitted_at": "2026-07-24T10:00:00Z",
  "idempotent_replay": false
}
```

The backend derives organization and submitter from the access token, validates references, generates
the organization/year-scoped number, creates initial status history, and appends an audit event in one
transaction. Any validation or permission failure leaves no partial record.

Generate one `p_client_request_id` when the user starts submission and reuse it for retries. Repeating
the request returns the original topic with `idempotent_replay: true`; it never creates a duplicate.
Creation is limited to 20 attempts per user per 10 minutes.

## My Topics

`POST /rest/v1/rpc/search_my_topics`

```json
{
  "p_query": null,
  "p_status": null,
  "p_priority": null,
  "p_limit": 25,
  "p_offset": 0
}
```

Returns `{items, total, limit, offset}` for the authenticated submitter only. Use this endpoint for
the submitter's post-create confirmation and personal topic list.

## Review Queue

`POST /rest/v1/rpc/search_topic_review_queue` requires `topics.read` or `topics.review` in at least
one unit. Results are then restricted to units where the caller has access.

```json
{
  "p_query": "TOP-2026",
  "p_status": "new",
  "p_priority": null,
  "p_category_id": null,
  "p_governance_unit_id": null,
  "p_limit": 25,
  "p_offset": 0
}
```

Filters are optional. `p_query` searches the reference number and Arabic/English titles. Limits are
clamped to 1-100. The response is:

```json
{
  "items": [
    {
      "id": "<uuid>",
      "topic_no": "TOP-2026-000001",
      "title_ar": "مراجعة اللائحة التنفيذية",
      "priority": "high",
      "status": "new",
      "category_id": "<uuid>",
      "category_name_ar": "إداري",
      "governance_unit_id": "<uuid>",
      "governance_unit_name_ar": "مجلس الإدارة",
      "submitted_by_user_id": "<uuid>",
      "submitted_by_name_ar": "مقدم الموضوع",
      "updated_at": "2026-07-24T10:00:00Z"
    }
  ],
  "total": 1,
  "limit": 25,
  "offset": 0
}
```

Keep each item's `updated_at`; it is required for concurrency-safe review.

## Topic Detail

`POST /rest/v1/rpc/get_topic_detail`

```json
{ "p_topic_id": "<uuid>" }
```

The submitter and users with scoped `topics.read` or `topics.review` can load the topic. The response
contains the full topic, `category`, `governance_unit`, `submitted_by`, ordered `history`, and
`allowed_review_actions`. Render review buttons from `allowed_review_actions`, then still treat the
backend as authoritative when the action is submitted.

## Review Actions

`POST /rest/v1/rpc/review_topic` requires `topics.review` in the topic's current unit.

```json
{
  "p_topic_id": "<uuid>",
  "p_action": "return",
  "p_reason": "يرجى استكمال الأثر المالي والمرفقات",
  "p_expected_updated_at": "2026-07-24T10:00:00Z"
}
```

Actions and resulting statuses:

| Action | Status | Reason |
|---|---|---|
| `start_review` | `under_review` | Optional |
| `approve` | `approved` | Optional |
| `return` | `returned` | Required, at least 5 characters |
| `reject` | `rejected` | Required, at least 5 characters |
| `defer` | `deferred` | Required, at least 5 characters |
| `resume` | `under_review` | Optional |

Decision actions accept `new` or `under_review`; `start_review` accepts `new`; `resume` accepts
`deferred`. The submitter cannot review their own topic. `p_expected_updated_at` is mandatory; when
another operation changed the topic, the RPC returns SQLSTATE `40001` and the UI must refresh before
retrying. Review operations are limited to 120 attempts per reviewer per 10 minutes.

Success:

```json
{
  "id": "<uuid>",
  "topic_no": "TOP-2026-000001",
  "previous_status": "new",
  "status": "returned",
  "action": "return"
}
```

Every successful action updates the topic, appends `topic_status_history`, and writes an audit event
atomically. Returned-topic editing and resubmission belong to PB-005 and are not exposed in Sprint 01.

## Read Topic History

Visible users can read the immutable workflow trail:

```http
GET /rest/v1/topic_status_history?topic_id=eq.<uuid>&select=*&order=changed_at.asc
```

Do not reconstruct history from the current topic status.

## Client Error Handling

| Condition | Expected handling |
|---|---|
| SQLSTATE `42501` | Permission or tenant failure; do not retry |
| SQLSTATE `40001` | Stale review; refresh topic and queue |
| Invalid title/description/reference | Map the RPC message to the relevant form field |
| Topic not awaiting review | Refresh queue; another reviewer completed it |
| Duplicate reference | Treat as server conflict and log; numbers are generated backend-side |

Referral operations are documented separately in [06-topic-referrals.md](./06-topic-referrals.md).
