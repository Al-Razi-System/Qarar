# Council Follow-up and Performance (v2)

Read-only contracts behind `/admin/performance`. Both are `Content-Profile: api_v2`, for a signed-in user, and return
figures computed at request time. A caller sees only councils they lead (chair or rapporteur) or follow through an
oversight assignment.

## `POST /rest/v1/rpc/get_my_oversight_overview_v2`

Body: `{"p_academic_year": "2026-09-01" | null}`. `null` means the latest academic year that has started.

| Key | Content |
|---|---|
| `academic_year_start` | the year shown |
| `academic_years` | every academic year that has meetings, newest first |
| `summary` | `{total, regular, attention, stalled, inactive}` |
| `councils` | one object per council, `stalled` first, then `attention`, `regular`, `inactive`; then by name |

Council object:

| Key | Content |
|---|---|
| `id`, `name_ar`, `parent_name_ar`, `unit_status` | the council and its parent unit |
| `leads`, `follows` | why the caller sees it |
| `state` | `inactive` (unit not active), `stalled` (an escalated open violation, or the last two due sessions not held), `attention` (any open violation or a session past its due day), else `regular` |
| `sessions` | `{on_time, late, missed, overdue, upcoming, cancelled, due}`; `due` = the first four |
| `marks` | due sessions in order: `{meeting_id, outcome, late_days, due_on}` |
| `next_due` | due day of the next upcoming session |
| `attendance` | `{present, recorded}` over held sessions; `late` counts as present, `pending` is not recorded |
| `minutes` | `{avg_days, pending}`: days from the session to approval, and held sessions without approved minutes |
| `tasks` | `{total, done, overdue}` of tasks created in the year from the council's decisions, cancelled excluded |
| `decisions` | decisions issued in the year's sessions |
| `violations` | `{open, escalated}` |

## `POST /rest/v1/rpc/get_council_performance_v2`

Body: `{"p_council_id": "<uuid>", "p_academic_year": "2026-09-01" | null}`.

Returns `{academic_year_start, council, sessions, violations}`. `council` is the object above plus `chair_name_ar` and
`member_count`. `sessions` lists every session of the year in due order: `{meeting_id, title_ar, meeting_no,
sequence_no, planned_on, due_on, scheduled_on, held_on, status, outcome, late_days, present, recorded,
minutes_approved_on, decisions, link}`. `violations` lists the council's open violations, escalated first.

Errors: `42501` when the council is outside what the caller leads or follows; `P0002` when it does not exist.

## Session outcome

The due day is the end of the planned window (`planned_window_end`), or `scheduled_date` for an unplanned session; it
is the same day the `meeting_cycle_missed` rule uses. Days are taken in `Asia/Riyadh`.

| `outcome` | Meaning | `late_days` |
|---|---|---|
| `on_time` | reached `in_progress` on or before the due day | 0 |
| `late` | reached `in_progress` after it | days after the due day |
| `missed` | status `not_held` | 0 |
| `overdue` | not held and the due day has passed | days since the due day |
| `cancelled` | status `cancelled` or `postponed`; excluded from every ratio | 0 |
| `upcoming` | everything else | 0 |

## Composition

`qarar_meetings.council_sessions_v2` classifies sessions, `qarar_attendance.meeting_attendance_v2` counts attendance and
`qarar_iam.council_profile_v2` gives the chair and member count; `qarar_governance` assembles them. The three
cross-module calls are registered in `module_function_execute_allowlist`. No tables are added and nothing is written.
