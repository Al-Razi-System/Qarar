# Meetings and Agenda API

All operations use `POST /rest/v1/rpc/<function>` with the authenticated Supabase headers described
in [00-common.md](./00-common.md). Clients must not write `meetings`, `agenda_items`, or
`meeting_status_history` directly.

## Form Options

`get_sprint02_form_options` takes `{}` and returns active `meeting_types`, units where the caller has
`meetings.create`, all active `referral_units`, and `location_types`.

## Create Meeting

Permission: `meetings.create` on `p_governance_unit_id`.

```json
{
  "p_governance_unit_id": "<uuid>",
  "p_meeting_type_id": "<uuid>",
  "p_title_ar": "اجتماع المجلس الدوري",
  "p_scheduled_date": "2026-08-15",
  "p_start_time": "10:00:00",
  "p_end_time": "12:00:00",
  "p_location_type": "hybrid",
  "p_location_details": "قاعة الاجتماعات ورابط الاتصال",
  "p_title_en": null,
  "p_client_request_id": "<uuid>"
}
```

`create_meeting` generates `meeting_no`, forces initial status `draft`, records history and audit,
and returns `{id, meeting_no, status, idempotent_replay}`. Reuse one client request UUID for retries.

## Search and Detail

`search_meetings` accepts optional `p_query`, `p_status`, `p_unit_id`, `p_from_date`, `p_to_date`,
plus `p_limit` (1-100) and `p_offset`. It returns `{items,total,limit,offset}`.

`get_meeting_detail` takes `{"p_meeting_id":"<uuid>"}` and returns the meeting, unit, meeting type,
ordered agenda items with topic summaries, and chronological `status_history`.

## Update Meeting

Permission: `meetings.manage`. Allowed only in `draft` or `scheduled`.

`update_meeting` requires all editable fields:

```json
{
  "p_meeting_id": "<uuid>",
  "p_title_ar": "العنوان المحدث",
  "p_scheduled_date": "2026-08-16",
  "p_start_time": "10:00:00",
  "p_end_time": "12:00:00",
  "p_location_type": "online",
  "p_location_details": "رابط آمن",
  "p_title_en": null,
  "p_meeting_type_id": "<uuid>",
  "p_expected_updated_at": "<meeting.updated_at>"
}
```

SQLSTATE `40001` means stale data; reload detail before retrying.

## Lifecycle

`transition_meeting` accepts `p_meeting_id`, `p_to_status`, `p_reason`, and
`p_expected_updated_at`. Valid transitions are:

`draft -> scheduled|cancelled -> ready_to_start|draft|cancelled -> in_progress|scheduled|cancelled
-> waiting_for_minutes -> waiting_for_approval -> closed -> archived`.

Cancelled meetings may move to `archived`. A cancellation reason of at least five characters is
mandatory. Every transition is atomic with status history and audit.

## Agenda

Permission: `agenda.manage` on the meeting unit.

- `search_eligible_agenda_topics`: `p_meeting_id`, optional query/pagination; returns approved,
  same-unit topics not already listed.
- `add_agenda_item`: `p_meeting_id`, `p_topic_id`, `p_is_exception`, `p_exception_reason`.
- `reorder_agenda_items`: the complete `p_ordered_item_ids` UUID array and current
  `p_expected_meeting_updated_at`.
- `remove_agenda_item`: `p_agenda_item_id` and optional `p_reason`.

Normal insertion requires an approved topic. An ineligible topic additionally requires
`agenda.exception` and a reason of 5-2000 characters. Agenda changes are locked after the meeting
leaves `draft` or `scheduled`. Reorder must send every current item exactly once.

## Error Handling

| Condition | Client action |
|---|---|
| SQLSTATE `42501` | Hide action or show authorization failure; do not retry |
| SQLSTATE `40001` | Reload meeting/detail then let the user retry |
| `meeting not found` | Treat as inaccessible or deleted from the current tenant |
| Invalid transition | Reload lifecycle state |
| Agenda locked | Disable agenda editing |
| Duplicate topic/item | Reload agenda; do not create a second item |

Live-session attendance, quorum, and voting are documented in
[07-session-attendance-voting.md](./07-session-attendance-voting.md).
