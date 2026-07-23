# Meeting Session, Attendance, Quorum, and Voting API

Use authenticated `POST /rest/v1/rpc/<function>` requests. Clients must not insert or update
`attendance_records`, `votes`, `voting_rounds`, `quorum_snapshots`, or their history tables.

## Permissions

| Permission | UI capability |
|---|---|
| `attendance.read` | View meeting roster and attendance |
| `attendance.manage` | Open session and record attendance |
| `quorum.read` | View quorum result |
| `quorum.manage` | Apply an authorized failed-quorum action |
| `voting.read` | View rounds and results |
| `voting.manage` | Open/close voting and view individual votes |
| `voting.cast` | Cast the current user's vote |

## Open Meeting Session

`open_meeting_session` requires a `ready_to_start` meeting:

```json
{
  "p_meeting_id": "<uuid>",
  "p_expected_updated_at": "<meeting.updated_at>"
}
```

It atomically snapshots all active unit memberships into a pending attendance roster, moves the
meeting to `in_progress`, creates status/history/audit records, and calculates the initial quorum.
Do not use `transition_meeting` to start a meeting.

## Session Detail

`get_meeting_session_detail` takes `p_meeting_id` and returns:

```json
{
  "meeting": {
    "id": "<uuid>",
    "status": "in_progress",
    "quorum_status": "met",
    "updated_at": "<timestamp>"
  },
  "attendance": [
    {
      "id": "<uuid>",
      "user_id": "<uuid>",
      "full_name_ar": "اسم العضو",
      "status": "present",
      "updated_at": "<timestamp>"
    }
  ],
  "quorum": {
    "required_percentage": 60,
    "eligible_members": 5,
    "present_members": 4,
    "actual_percentage": 80,
    "quorum_status": "met"
  },
  "open_voting_rounds": []
}
```

Attendance statuses are `pending`, `present`, `absent`, `excused`, and `late`.

## Record Attendance

`record_attendance` accepts:

```json
{
  "p_attendance_record_id": "<uuid>",
  "p_status": "present",
  "p_remarks": "تم التحقق عند الدخول",
  "p_expected_updated_at": "<attendance.updated_at>"
}
```

Only an `in_progress` meeting can change. `present` and `late` count toward quorum. Every update
records actor/time/history and recalculates the meeting status. SQLSTATE `40001` requires refresh.
`get_attendance_history` takes `p_attendance_record_id` and returns the ordered status/actor trail.

`recalculate_meeting_quorum` accepts `p_meeting_id` and `p_record_snapshot` (normally `true`) and
returns required/actual percentages, eligible/present counts, status, and snapshot ID.

## Failed Quorum

`apply_quorum_failure` rechecks quorum and accepts:

```json
{
  "p_meeting_id": "<uuid>",
  "p_action": "postpone",
  "p_reason": "لم يكتمل النصاب النظامي",
  "p_expected_updated_at": "<meeting.updated_at>"
}
```

Actions are `postpone` and `cancel`. The action is rejected when quorum is met. It changes meeting
state and appends status history and audit atomically.

## Open Voting

`open_voting_round` accepts `p_agenda_item_id` and `p_expected_meeting_updated_at`.
The meeting must be `in_progress` with quorum `met`. The server snapshots active members currently
marked `present` or `late`; later attendance changes do not alter that round's electorate.
Only one voting round may be open across the meeting at a time.

Success includes `voting_round_id`, round number, status, and eligible voter count.

## Member Voting

`get_my_open_votes` accepts optional `p_meeting_id`. Each item includes agenda/topic data and
`has_voted`.

`cast_vote`:

```json
{
  "p_voting_round_id": "<uuid>",
  "p_vote_value": "approve",
  "p_vote_note": "موافق"
}
```

Values are `approve`, `reject`, and `abstain`. The server derives the current user and snapshotted
membership. A user may vote once per round; votes cannot be changed or deleted.

## Close and Read Voting

`close_voting_round` accepts `p_voting_round_id` and optional `p_reason`. It freezes counts and the
result using `simple_majority`:

- approvals greater than rejections: `approved`
- rejections greater than approvals: `rejected`
- equal nonzero counts: `tied`
- no votes: `no_votes`

`get_voting_round_detail` returns round metadata, result, and the caller's vote. Only users with
`voting.manage` receive the electorate/participation list and individual votes; members cannot
inspect other members' votes.

`cancel_voting_round` requires `p_voting_round_id` and a 5-2000 character `p_reason`. It marks the
round `cancelled`, preserves any already cast votes as audit evidence, and resets the agenda item so
a corrected round can be opened. A meeting cannot move to minutes while any round remains open.

## Error Handling

| Condition | Client action |
|---|---|
| SQLSTATE `42501` | Hide operation or show authorization failure |
| SQLSTATE `40001` | Reload session before retrying |
| Meeting/session state error | Reload detail and disable invalid controls |
| Vote already cast | Mark the round completed for this member |
| Round not open | Remove it from the member's open-vote list |
| Quorum not met | Disable voting and show failed-quorum actions to authorized users |
