# Meeting Session, Attendance, Quorum, and Voting API

## Preparing topic-specific discussion instructions

`save_agenda_topic_instructions(p_meeting_id, p_topic_id, p_instructions, p_expected_updated_at)` is available only to an active `council_chair` in that meeting's council with `agenda.manage`, while the meeting is `draft` or `scheduled`. A system administrator or rapporteur without that chair membership is not allowed.

For a proposal not yet inserted, send a null token: normal agenda eligibility is checked and insertion plus customization is one atomic transaction. For an existing item, send its `updated_at`. A stale token or repeated insertion is rejected without overwriting anything. Empty text explicitly removes instructions for that agenda item; null text is invalid. Maximum stored length is 10,000 characters, using the existing instruction serialization.

The override belongs to this topic's agenda item in this meeting. Topic type, immutable submission snapshot, other topics and other meetings do not change. Existing items with a null override inherit their original instructions. `get_meeting_detail` and the live room receive the resolved `discussion_instructions`; preparation also receives `capabilities.can_edit_topic_instructions`. The proposal search supplies inherited instructions for editor initialization. Changes are audited and frozen after preparation is locked.

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

Before opening, call `get_meeting_session_start_timing_v2(p_meeting_id)`. It calculates the
official window from server time and the organization's timezone. A start on the scheduled date
from two hours before the start through the scheduled end returns `requires_confirmation=false`.
An earlier or later start returns the scheduled timestamps, the difference in minutes,
`requires_confirmation=true`, and whether the current actor is the contextual council chair.

`open_meeting_session` requires a `ready_to_start` meeting:

```json
{
  "p_meeting_id": "<uuid>",
  "p_expected_updated_at": "<meeting.updated_at>",
  "p_confirmed_off_schedule": false
}
```

It atomically snapshots all active unit memberships into an unclaimed/pending attendance roster, moves the
meeting to `in_progress`, creates status/history/audit records, and calculates the initial quorum.
The command recalculates the official window while holding the meeting lock. An off-schedule start
requires `p_confirmed_off_schedule=true` from an active chair of that meeting's council; a global
permission does not substitute for this role. Rejection creates no roster or partial opening event.
Legacy meetings with missing times remain openable and are recorded as `schedule_unavailable`.
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

Actions are `postpone`, `cancel`, and `continue`. The action is rejected when quorum is met.
Postponement/cancellation change state and append history and audit atomically.
`continue` additionally requires an active contextual `council_chair` role in this council,
not administrative mode or a rapporteur. It stores an immutable authorization/reason/quorum
snapshot in `meeting.quorum_continuation`, keeps the meeting `in_progress` and quorum
`not_met`, and writes audit. An optimistic meeting token and a meeting row lock serialize
this choice against postponement, voting and completion. No automatic/grandfathered exceptions.
`get_meeting_session_detail.viewer.can_decide_quorum` is the authoritative UI capability.
Until this choice is made, discussion cannot begin or advance when quorum is missing.
The live room immediately asks the chair after attendance locks (also for existing sessions).
Every decision returned by `list_meeting_decisions` includes the meeting's immutable
`quorum_continuation` provenance. Generated minutes carry an explicit insufficient-quorum
warning; submission refuses text that omits that warning. Other vote/summary/approval
requirements are unchanged.

## Member Cards (v2)

The live room shows a card for every roster member and their photo on the seat.

`list_meeting_member_profiles_v2(p_meeting_id uuid)` returns:

```json
{
  "mobile_visible": false,
  "members": [{
    "user_id": "uuid", "attendance_record_id": "uuid", "full_name_ar": "...",
    "job_title": "...", "email": "...", "mobile": null, "home_unit_name_ar": "...",
    "council_role_code": "council_chair", "council_role_name_ar": "...", "membership_title": null,
    "membership_start_date": "2026-01-15", "attendance_status": "present", "verification_status": "verified",
    "has_avatar": true, "avatar_revision": 3
  }]
}
```

- Same read authority as Session Detail: `attendance.read` or `attendance.manage` in the meeting's unit, or system administration.
- `mobile` is filled only when the caller holds the active `council_chair` or `council_rapporteur` role in the meeting's council (`mobile_visible: true`). System administration does not unlock it.
- The council role is the member's active membership in the meeting's council; the chair and the rapporteur win when one person holds several roles.
- The list never carries photo bytes.

`get_meeting_member_avatar_v2(p_meeting_id uuid, p_user_id uuid)` returns `{revision, has_image, content_base64}` for a roster member only (`P0002` otherwise). The dashboard serves it as JPEG at `GET /api/admin/meetings/{meetingId}/members/{userId}/avatar?v={avatar_revision}`.

## Screen Broadcast (v2)

While the session runs, one person drives what every screen shows: the chair by default, or the rapporteur after a handover.

`get_meeting_broadcast_v2(p_meeting_id uuid)` returns:

```json
{
  "meeting_id": "uuid", "active": true, "controller_role": "chair",
  "agenda_item_id": "uuid or null", "panel": "instructions", "revision": 4, "updated_at": "...",
  "viewer_controls": true, "can_hand_over": true, "can_take_back": false, "can_return": false
}
```

- Read authority as Session Detail. `active` is true only while the meeting is `in_progress`.
- `agenda_item_id` null means "the item the council is on".

`set_meeting_broadcast_v2(p_meeting_id, p_agenda_item_id, p_panel, p_expected_revision)`:

- Only the current controller, holding the active `council_chair` or `council_rapporteur` role in the meeting's council. System administration does not suffice (`42501`).
- `p_panel` is `instructions`, `attachments` or `history`. The item must belong to the meeting (`22023`).
- Only during the session (`23514`).
- A stale `p_expected_revision` is refused with `40001`; reload and retry.
- Navigation is display state and is not audited.

`hand_over_meeting_broadcast_v2(p_meeting_id, p_to_role, p_expected_revision)`:

- The chair hands control to the rapporteur (`p_to_role = 'rapporteur'`) or takes it back (`'chair'`). The rapporteur in control may only return it to the chair.
- Requires an active rapporteur for a handover to them (`23514`).
- Each handover is audited as `meetings.broadcast.handover`.

The dashboard reads the broadcast every two seconds while the session runs. A member's screen follows it: no item or panel of their own, and a full-screen control.

## Documents in the Room and Download Permission (v2)

`list_meeting_topic_attachments` (v1) also returns, per file:

- `agenda_item_id`: the item the file is discussed under.
- `download_allowed`: false when the chair withheld downloads for that item.
- `download_revision`: the revision of that decision.

`set_agenda_item_downloads_v2(p_agenda_item_id, p_allowed, p_expected_revision)`:

- The active `council_chair` of the meeting's council only (`42501`).
- Not after the meeting is closed, archived or cancelled (`23514`).
- A stale revision is refused (`40001`).
- Audited as `meetings.agenda.downloads`.
- Items without a decision keep their files downloadable.

The file routes (`/api/admin/topics/upload`, `/api/admin/typed-topics/files`) refuse a download through the meeting (`meetingId` set, not shown inline) for a withheld item with 403, and still serve PDF and images inline. Only these two routes may be framed, by this site only (`X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`).

`set_meeting_broadcast_document_v2(p_meeting_id, p_attachment_id, p_page, p_expected_revision)`:

- The current broadcast controller only, during the session.
- The file must belong to a topic on the meeting's agenda (`22023`). The page must be between 1 and 10000.
- Opening a file sets the broadcast item and the `attachments` panel. `p_attachment_id = null` closes it and keeps the item.
- `get_meeting_broadcast_v2` returns `attachment_id` and `page`.
- `set_meeting_broadcast_v2` closes an open file when the item changes or the files panel is left.

Withholding downloads does not stop anyone from capturing what is shown on their screen. Users with direct access to the topic outside the meeting keep that access.

## Agenda Item Timer (v2)

The database records when an item's discussion starts and ends: the trigger `agenda_items_track_discussion_time` follows `agenda_status`. `under_discussion` sets the start; `discussed` or `postponed` sets the end.

`list_meeting_item_timers_v2(p_meeting_id)` returns:

```json
{ "server_now": "...", "timers": [{ "agenda_item_id": "uuid", "planned_minutes": 15, "discussion_started_at": "...", "discussion_ended_at": null, "revision": 2 }] }
```

- Read authority as Session Detail.
- `server_now` lets every screen count from the server's clock.

`set_agenda_item_planned_minutes_v2(p_agenda_item_id, p_minutes, p_expected_revision)`:

- The active `council_chair` of the meeting's council only (`42501`).
- `p_minutes` is 1 to 240, or null to clear it (`22023`).
- Not after the meeting is closed, archived or cancelled (`23514`).
- A stale revision is refused (`40001`).
- Audited as `meetings.agenda.planned_minutes`.

## Agenda Item Referral (v2)

The council's chair refers an item to another unit instead of a vote. It uses the topic referral of section 06: the referral is `pending` until the receiving unit accepts or rejects it with `respond_topic_referral`.

`refer_agenda_item_v2(p_agenda_item_id, p_to_unit_id, p_reason, p_expected_updated_at)`:

- The active `council_chair` of the meeting's council only (`42501`). A system administrator is refused.
- During the session (`in_progress`), once the item's discussion has started, before any vote opens, and once per item (`23514`).
- The destination must be an active unit other than the council and the topic's current unit (`22023`). The reason is 5 to 2000 characters (`22023`).
- `p_expected_updated_at` is the agenda item's `updated_at`. A stale value is refused (`40001`).
- An item under discussion becomes `discussed`. Audited as `meetings.agenda.referred` and `topics.referral.request`.
- No voting round opens on a referred item (`23514`). Ending the session accepts a referred item, as it does a postponed one.

`list_meeting_referrals_v2(p_meeting_id)` returns:

```json
{ "referrals": [{ "agenda_item_id": "uuid", "referral_id": "uuid", "to_unit_id": "uuid", "to_unit_name_ar": "...", "reason": "...", "status": "pending", "referred_at": "..." }],
  "destinations": [{ "id": "uuid", "name_ar": "..." }] }
```

- Read authority as Session Detail.
- `destinations` is filled for the council's chair only.

## Meeting Assignments (v2)

An assignment is an execution task tied to the decision drafted for an agenda item. The council's chair issues one during the session and it becomes a task at once, before the decision is approved (owner decision, 2026-10-16). The rapporteur proposes one for the chair to confirm.

`propose_meeting_assignment_v2(p_agenda_item_id, p_title, p_description, p_assigned_user_id, p_assigned_unit_id, p_due_date, p_follow_up_user_id, p_requires_evidence)`:

- The active `council_chair` or `council_rapporteur` of the meeting's council only (`42501`).
- During the session, and only once the item has a decision that is not rejected, cancelled or closed (`23514`).
- Title 5 to 300 characters. Description up to 2000. An active user or an active unit of the tenant. A due date not in the past. A follow-up person, who is an active user of the tenant and verifies completion (`22023`).
- `p_requires_evidence` states whether completing the task requires evidence files. It is carried to the task.
- From the chair: `status = active`, and an execution task `TSK-YYYY-NNNNNN` with status `new` is created. From the rapporteur: `status = proposed`.
- Audited as `meetings.assignment.propose`, `meetings.assignment.issue` and `execution.action_item.create_from_meeting`.

`confirm_meeting_assignment_v2(p_assignment_id, p_expected_revision)`:

- The chair only (`42501`), during the session, for a proposal (`23514`).
- A stale revision is refused (`40001`).
- Creates the task.

`withdraw_meeting_assignment_v2(p_assignment_id, p_expected_revision)`:

- The chair, or the rapporteur for their own proposal (`42501`), during the session.
- Cancels an issued assignment's task only while it is still `new` (`23514`).

`list_meeting_assignments_v2(p_meeting_id)` returns `viewer` (`can_issue`, `can_propose`), `assignments` (with assignee and follow-up names, `requires_evidence`, `action_no` and `action_status`), and `options` (the meeting's roster and the active units). `options` is filled for the chair and the rapporteur only. Read authority is the same as Session Detail.

`search_meeting_assignment_options_v2(p_meeting_id, p_query, p_limit default 20)` searches active users in the caller's organization by Arabic name, email, employee number or job title. It is available only to the active chair and rapporteur of the live meeting, requires at least two query characters, returns at most 20 minimal user records (`id`, `name_ar`, `email`, `job_title`), and never searches another tenant. It supports assigning or following a decision task by any university user rather than only the meeting roster.

**Execution rule.** `qarar_execution.check_action_item_creation` still refuses a task for a decision that is not approved (`23514`, Arabic message). The one exception is a task whose `meeting_assignment_id` is an assignment the chair issued for that very decision, while the decision is `ready_for_approval`. When a decision becomes `rejected`, the session's unfinished tasks are cancelled.

## Open Voting

`open_voting_round` accepts `p_agenda_item_id` and `p_expected_meeting_updated_at`.
The meeting must be `in_progress`, attendance must be locked, and quorum must be `met` or
the chair must have explicitly recorded `quorum_continuation` as described above. The server
snapshots active members currently verified as `present` or `late`; later governed overrides do not
alter that round's electorate.

Every agenda item is decided by the members' vote. In `get_meeting_detail`, each agenda item
returns `requires_voting: true`, `voting_available_now`, and `voting_unavailable_reason` (Arabic text,
`null` when the vote can open) so the room can show a disabled action with its reason.

For a governed topic, the current workflow step must be active and belong to the meeting council, and
the vote must be able to decide it:

- a `voting` step, as before; or
- a council step (`review`, `discussion`, `recommendation`, `approval`) whose route defines what
  happens on `approved` and on `rejected`, which is how the route designer writes every council step.

Steps of type `execution` or `follow_up`, and steps without both outcomes, are refused with `55000`
and the reason. A legacy topic without a route can always be voted on.

The server snapshots that step on the voting round. Closing the round applies the result to it:
`approved` or `rejected` moves the topic as its route says (advance, complete, or return). A tie the
chair did not break leaves a council step where it was; the round still closes and is audited as
`voting.route_unchanged`. Closing fails with a concurrency error if the topic has moved to another
step since the round opened. The route moves only through a closed round bound to that step;
meeting steps cannot be acted on from the topic page.
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

`list_meeting_voting_rounds` returns, for an open round, `votes_cast_count` and `participation`
(`[{user_id, full_name_ar, has_voted}]`) to callers with `voting.manage` or `agenda.manage` and to
the members snapshotted as eligible for that round. Every other caller receives `null` and `[]`.
It never returns a vote value or a vote note, and the option totals (`approve_count`,
`reject_count`, `abstain_count`) are `null` for everyone until the round is closed.

`cancel_voting_round` requires `p_voting_round_id` and a 5-2000 character `p_reason`. It marks the
round `cancelled`, preserves any already cast votes as audit evidence, and resets the agenda item so
a corrected round can be opened. A meeting cannot move to minutes while any round remains open.
A meeting also cannot move to minutes while an agenda item that was not postponed has no closed
round (`23514`, naming the item).

## Decisions

`create_decision_from_voting_round` drafts the decision of an approved, closed round. The council
rapporteur (`agenda.manage`) or the chair may draft it; only the chair may issue it without approval.

`list_meeting_decisions` returns each decision with `updated_at` and `can_edit_text`.
`can_edit_text` is `true` only when the caller may edit the text now, so clients show the edit
action only then.

`update_meeting_decision_text` edits the text of a saved decision and nothing else:

```json
{
  "p_decision_id": "uuid",
  "p_decision_text": "اعتماد الخطة بعد تعديل الميزانية.",
  "p_expected_updated_at": "2026-10-10T12:00:00Z"
}
```

- Allowed only for the council's chair or rapporteur, by an active membership in that council
  with the role `council_chair` or `council_rapporteur`. A system administrator, or a user holding
  `meetings.manage` or `agenda.manage` without a leadership role, is rejected with `42501`.
- Allowed while the meeting is `in_progress` or `waiting_for_minutes`, and while the decision has
  not entered execution.
- Rejected with `23514` while the minutes are out for approval (`waiting_for_approval`) and once
  they are approved. The text must be at least 10 characters (`22023`).
- `p_expected_updated_at` is the decision's `updated_at`; a stale value fails with `40001` so the
  chair and the rapporteur cannot overwrite each other.
- An identical text writes nothing and returns `changed: false`. Each change is audited as
  `decision.text_update` with the previous text.
- A minutes draft generated earlier keeps the old text, and `submit_meeting_minutes` refuses it
  until the draft carries the current text (see [08-minutes.md](./08-minutes.md)). Editing and
  submitting the minutes take the same per-meeting lock.

## Error Handling

| Condition | Client action |
|---|---|
| SQLSTATE `42501` | Hide operation or show authorization failure |
| SQLSTATE `40001` | Reload session before retrying |
| Meeting/session state error | Reload detail and disable invalid controls |
| Vote already cast | Mark the round completed for this member |
| Round not open | Remove it from the member's open-vote list |
| Quorum not met | Ask the contextual chair to postpone or explicitly continue; keep the warning and quorum evidence |
| Check-in token invalid/expired | Ask the member to scan the current QR |
| Pending verification | Do not count the member toward quorum yet |
| Unresolved roster | Disable roster lock and highlight unresolved members |
