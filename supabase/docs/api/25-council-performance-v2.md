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
| `decision_stats` | `{total, by_outcome:[{kind,count}], by_type:[{name_ar,count}], untyped, needs_execution, executed, overdue_execution, executors:{people,units}}` over issued decisions (`approved`, `sent_to_execution`, `under_follow_up`, `closed`, `rejected`) of the year. A decision needs execution when it has a non-cancelled task, and is executed when all of them are `completed` or `closed` |
| `topics` | `{total, regulated, direct, exception, legacy, ungoverned, discussed}`: distinct topics on the agendas of the year's sessions, by `governance_source` (`custom` = direct, empty = legacy); `ungoverned` = all but `regulated` |

## `POST /rest/v1/rpc/get_council_performance_v2`

Body: `{"p_council_id": "<uuid>", "p_academic_year": "2026-09-01" | null}`.

Returns `{academic_year_start, council, sessions, violations}`. `council` is the object above plus `chair_name_ar` and
`member_count`. `sessions` lists every session of the year in due order: `{meeting_id, title_ar, meeting_no,
sequence_no, planned_on, due_on, scheduled_on, held_on, status, outcome, late_days, present, recorded,
minutes_approved_on, decisions, link}`. `violations` lists the council's open violations, escalated first.

Errors: `42501` when the council is outside what the caller leads or follows; `P0002` when it does not exist.

## `POST /rest/v1/rpc/get_council_activity_v2`

Same body, scope and errors as `get_council_performance_v2`. Returns the records behind the figures:

| Key | Rows |
|---|---|
| `topics` | one per agenda listing in the year's non-cancelled sessions: `{id, topic_no, title_ar, governance_source, agenda_status, meeting_id, meeting_title_ar, meeting_date, decision_no, outcome_kind, link}` |
| `decisions` | issued decisions: `{id, decision_no, decision_text, outcome_kind, type_name_ar, issued_at, meeting_id, meeting_title_ar, topic_title_ar, tasks, tasks_done, link}` |
| `tasks` | non-cancelled tasks of those decisions, open first: `{id, action_no, title_ar, status, due_date, overdue, assignee_name_ar, assignee_unit_ar, decision_no, meeting_id, link}` |

## `POST /rest/v1/rpc/get_my_topics_follow_up_v2`

Body: `{"p_academic_year": "2026-09-01" | null}`. A topic is in scope when it stands at, was listed by, or was decided
by a council the caller leads or follows. Returns every unfinished topic plus finished ones created in the year (500 rows
at most, stalled first).

| Key | Content |
|---|---|
| `summary` | `{total, in_progress, stalled, returned, finished, ungoverned, avg_days_to_finish, avg_waiting_days}` |
| `by_council` | open topics by the council they stand at: `{id, name_ar, open, stalled, longest_wait}` |
| `by_category` | `{name_ar, total, finished, avg_days_to_finish}` |
| `topics` | `{id, topic_no, title_ar, category_name_ar, governance_source, state, status, at_council_id, at_council_name_ar, waiting_days, age_days, created_on, steps_total, steps_done, listed_count, decision_no, outcome_kind, tasks, tasks_done, link}` |

`state`: `finished` (status `approved`/`rejected`/`closed` or a completed route), `stalled` (an open `topic_stalled`
violation), `returned`, else `in_progress`. A topic stands at the council of its active route step, else its current unit.

## `POST /rest/v1/rpc/get_my_people_follow_up_v2`

Body: `{"p_academic_year": "2026-09-01" | null}`. Lists the active members (chair, rapporteur, member) of the councils
the caller leads or follows. Returns `{academic_year_start, summary, councils, people}`.

Person: `{user_id, full_name_ar, councils:[{id,name_ar,role_code,role_name_ar}], state, attendance:{present,recorded},
votes:{eligible,voted}, minutes:{total,signed,pending}, tasks:{total,done,overdue}, topics_submitted}`.
`votes` counts closed rounds only and never exposes how anyone voted. `state` is `attention` (a late task, a pending
signature, or under half of two or more sessions or rounds), `no_activity`, else `regular`.

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
`qarar_iam.council_profile_v2` gives the chair and member count, `qarar_decisions.council_decisions_v2` lists issued
decisions with their type names; `qarar_governance` assembles them. The four
cross-module calls are registered in `module_function_execute_allowlist`. No tables are added and nothing is written.
