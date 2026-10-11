# Existing council meeting plan (v2)

`admin_get_council_detail_v2(p_council_id uuid)` returns the existing council detail, `can_create_meeting_plan` (institutional permission predicate) and nullable `meeting_plan` containing id, recurrence, first_meeting_date, ends_on and meeting_type_name_ar. Council-context `governance.units.read` is required; only the caller's organization is read.

`admin_update_council_v2(p_council_id uuid, p_values jsonb, p_expected_updated_at timestamptz, p_meeting_plan jsonb default null)` atomically saves metadata and optionally creates the first plan. `p_values` contains name_ar, name_en, description, unit_type_id, governance_class_id, minimum_active_members and allow_dual_leadership. An optional plan contains meeting_type_id, recurrence, first_meeting_date, ends_on and missed_after_days (default 7).

Council-context `governance.units.manage` is required; creation of the plan additionally requires institutional `governance.units.manage`, matching the existing first-draft trigger. Council row locking and the expected timestamp prevent stale metadata overwrites. A plan that already exists causes 40001; this command never modifies an existing plan or scheduled meetings. Missing/invalid plan values cause 22023; unavailable type causes 23503; unauthorized callers cause 42501. Errors roll back metadata, plan, first draft, counter, history and audit together.

Success returns the legacy update receipt plus saved:true and meeting_plan_id (null for metadata-only). A retry after uncertain success must reload council detail; the UI must not blindly repeat a rejected save. Creation uses the existing `create_council_plan_first_draft` trigger and records `council.meeting_plan.created` with the plan id. No imported council dates are inferred, and no meeting is convened automatically.

Boundary exception: the core executor reads and inserts `council_meeting_plans_v2` and reads `meeting_types`, exactly as the existing council creation command. No new table grants. Forward-only migration `20261010050000`; regression file 95. v1 remains unchanged.

## Monthly week windows

An optional `monthly_week` (1–5, monthly recurrence only) normalizes the first date to the start of that month's window. Weeks are days 1–7, 8–14, 15–21, 22–28 and the remaining days. A nonexistent fifth week is rejected. Such a plan is active, but its generated meeting is a draft with `planned_window_start`, `planned_window_end` and `schedule_date_confirmed:false`. The anchor date is not a confirmed appointment. Detail returns `monthly_week`; meeting search includes windows overlapping the requested date range.

Updating the meeting must specify a date inside its window and valid start/end times to confirm it. Clearing a time removes confirmation. A database trigger rejects scheduling without confirmation; the interface explains this beside the action. Existing date-based meetings retain their existing behavior.

`admin_create_council_with_plan_v2(p_values jsonb, p_meeting_plan jsonb, p_client_request_id uuid)` provides the same atomic creation journey for new councils. Values additionally include scope_unit_id and parent_council_id. The existing council creation receipt provides idempotent replay; replay never creates another meeting. Existing v1 creation is retained.

Internal `generate_council_monthly_drafts_v2()` is run daily by pg_cron. It creates only the current/upcoming draft for active weekly plans, skips archived councils and expired plans, and never convenes a meeting. Plan-row locking and a unique plan/window index prevent duplicate generation even after confirmation changes the appointment date. Ordinary API clients cannot invoke it. Forward migrations 510/520/530; regression file 96.
