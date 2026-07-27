# Meeting Session, Attendance, Quorum, and Voting API

Use authenticated `POST /rest/v1/rpc/<function>` requests. Clients must not insert or update
`attendance_records`, `votes`, `voting_rounds`, `quorum_snapshots`, or their history tables.

## Permissions

| Permission | UI capability |
|---|---|
| `attendance.read` | View meeting roster and attendance |
| `attendance.manage` | Open the live meeting session |
| `attendance.check_in` | Submit the current member's QR check-in claim |
| `attendance.verify` | Create/revoke QR sessions and verify another member |
| `attendance.lock` | Lock the fully resolved attendance roster |
| `attendance.override` | Correct attendance through the governed exception path |
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

It atomically snapshots all active unit memberships into an unclaimed/pending attendance roster, moves the
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
      "status": "pending",
      "verification_status": "pending_verification",
      "check_in_method": "self_qr",
      "self_checked_in_at": "<timestamp>",
      "verified_by_user_id": null,
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
  "checkin_session": {
    "id": "<uuid>",
    "status": "active",
    "expires_at": "<timestamp>"
  },
  "open_voting_rounds": []
}
```

Attendance statuses are `pending`, `present`, `absent`, `excused`, and `late`.
Verification statuses are `unclaimed`, `pending_verification`, `verified`, and `rejected`.
Only verification/lock users receive check-in session metadata; token hashes are never returned.

## Create the QR Check-In Session

`create_checkin_session` accepts `p_meeting_id` and `p_valid_for_minutes` (5-120). It revokes any
previous active token and returns a new random token once:

```json
{
  "checkin_session_id": "<uuid>",
  "meeting_id": "<uuid>",
  "token": "<one-time-display-secret>",
  "expires_at": "<timestamp>"
}
```

Encode a frontend route containing the meeting ID and token into the QR image. Never persist the
raw token in client logs, analytics, or local storage. `revoke_checkin_session` takes the session ID
and a mandatory reason. Locking the roster closes the active session automatically.

## Member Self Check-In

`self_check_in` derives the member from the access token:

```json
{
  "p_meeting_id": "<uuid>",
  "p_token": "<scanned-token>",
  "p_device_label": "Optional device label"
}
```

The token must be active and unexpired, and the member must already be on the roster. Success only
creates `pending_verification`; it does not count toward quorum. A member cannot submit twice.

## Verify Attendance

`verify_attendance` is used by the rapporteur/verifier:

```json
{
  "p_attendance_record_id": "<uuid>",
  "p_status": "present",
  "p_note": "تمت مطابقة العضو",
  "p_expected_updated_at": "<attendance.updated_at>"
}
```

The verifier cannot verify their own attendance unless they hold the exceptional
`attendance.override` permission. Manual `present`/`late` without a QR claim requires a reason.
`present` and `late` count toward quorum only after verification. Every operation records the
subject, actor, previous/new state, method, request context, and time.

`get_attendance_history` takes `p_attendance_record_id` and returns the ordered status/actor trail.

## Lock and Override

`lock_attendance_roster` requires `p_meeting_id` and `p_expected_updated_at`. Every roster entry must
be resolved before locking. It closes QR check-in, saves a final quorum snapshot, and prevents
normal verification. Voting and failed-quorum actions are blocked until this lock exists.

`override_attendance` is the only correction path after locking:

```json
{
  "p_attendance_record_id": "<uuid>",
  "p_status": "excused",
  "p_reason": "سبب تصحيح موثق لا يقل عن عشرة أحرف",
  "p_expected_updated_at": "<attendance.updated_at>"
}
```

It requires `attendance.override`, never deletes prior evidence, and recalculates/saves quorum.
Overrides are blocked while any voting round is open.
The legacy `record_attendance` RPC is no longer client-callable.

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
The meeting must be `in_progress`, attendance must be locked, and quorum must be `met`. The server
snapshots active members currently verified as `present` or `late`; later governed overrides do not
alter that round's electorate.

For a governed topic, the current workflow step must have `step_type=voting`, be active, and belong
to the meeting council. The server snapshots that step on the voting round. Closing the round fails
with a concurrency error if the topic has moved to another step since the round opened.
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
| Check-in token invalid/expired | Ask the member to scan the current QR |
| Pending verification | Do not count the member toward quorum yet |
| Unresolved roster | Disable roster lock and highlight unresolved members |
