# Meetings, Attendance, and Voting

## Governance Units

Read units from `/rest/v1/governance_units`. Important configuration fields include
`quorum_percentage` and `minute_approval_rule` (`chair_and_rapporteur` or `all_present_members`).

## Create Meeting

`POST /rest/v1/meetings`

```json
{
  "meeting_no": "M-2026-005",
  "governance_unit_id": "<uuid>",
  "meeting_type_id": "<uuid>",
  "title_ar": "الاجتماع الدوري الخامس",
  "scheduled_date": "2026-08-15",
  "start_time": "10:00:00",
  "end_time": "12:00:00",
  "location_type": "hybrid",
  "location_details": "قاعة الاجتماعات ورابط الاتصال",
  "status": "scheduled",
  "created_by_user_id": "<current-user-uuid>"
}
```
## Agenda Items

`POST /rest/v1/agenda_items`

```json
{
  "meeting_id": "<uuid>",
  "topic_id": "<uuid>",
  "agenda_order": 1,
  "agenda_status": "pending",
  "is_exception": false,
  "exception_reason": null,
  "voting_status": "not_started",
  "voting_result": "pending"
}
```

Normally, only approved topics may enter an agenda. Exceptional insertion requires the appropriate
governance authority and a non-empty reason; database guards remain authoritative.

## Attendance

Create or update `/rest/v1/attendance_records` with meeting, user, membership, attendance status,
and check-in time. Membership must belong to the meeting's organization and governance context.

```json
{
  "meeting_id": "<uuid>",
  "user_id": "<uuid>",
  "membership_id": "<uuid>",
  "attendance_status": "present",
  "check_in_at": "2026-08-15T06:55:00Z"
}
```

## Voting

`POST /rest/v1/votes`

```json
{
  "meeting_id": "<uuid>",
  "topic_id": "<uuid>",
  "user_id": "<uuid>",
  "membership_id": "<uuid>",
  "vote_value": "approve",
  "vote_note": "موافق مع التحفظ المثبت"
}
```

Vote values are `approve`, `reject`, and `abstain`. Voting is rejected outside the allowed meeting
and agenda states. Never calculate the authoritative result solely on the client.

## Recommended Meeting Query

```dart
final meeting = await supabase
    .from('meetings')
    .select('*, governance_units(*), agenda_items(*, topics(*)), attendance_records(*)')
    .eq('id', meetingId)
    .single();
```
