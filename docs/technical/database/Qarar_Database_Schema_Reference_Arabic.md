# Qarar Database Schema Reference

> Generated from the live database. Do not edit manually. Run `scripts/export-database-schema-reference.ps1` after every migration.

- Generated at: `2026-08-24T20:32:45.361354+00:00`
- Database: `postgres`
- Relations: **138**
- Routines and API contracts: **517**

## Included Schemas

`api_v1`, `public`, `qarar_architecture`, `qarar_attendance`, `qarar_audit`, `qarar_core`, `qarar_decisions`, `qarar_execution`, `qarar_governance`, `qarar_iam`, `qarar_internal`, `qarar_meetings`, `qarar_minutes`, `qarar_topics`, `qarar_voting`

## Relations and Columns

### `public.access_delegations`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `delegated_by_user_id` | `uuid` | yes | `-` |
| 4 | `delegated_to_user_id` | `uuid` | yes | `-` |
| 5 | `source_membership_id` | `uuid` | yes | `-` |
| 6 | `starts_at` | `timestamp with time zone` | yes | `-` |
| 7 | `ends_at` | `timestamp with time zone` | yes | `-` |
| 8 | `reason` | `text` | yes | `-` |
| 9 | `status` | `text` | yes | `-` |
| 10 | `revoked_at` | `timestamp with time zone` | yes | `-` |
| 11 | `revoked_by_user_id` | `uuid` | yes | `-` |
| 12 | `created_at` | `timestamp with time zone` | yes | `-` |
| 13 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.action_evidence`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `action_item_id` | `uuid` | yes | `-` |
| 4 | `evidence_type` | `text` | yes | `-` |
| 5 | `description` | `text` | yes | `-` |
| 6 | `file_name` | `text` | yes | `-` |
| 7 | `storage_path` | `text` | yes | `-` |
| 8 | `uploaded_by_user_id` | `uuid` | yes | `-` |
| 9 | `uploaded_at` | `timestamp with time zone` | yes | `-` |

### `public.action_items`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `action_no` | `text` | yes | `-` |
| 4 | `decision_id` | `uuid` | yes | `-` |
| 5 | `topic_id` | `uuid` | yes | `-` |
| 6 | `assigned_unit_id` | `uuid` | yes | `-` |
| 7 | `assigned_user_id` | `uuid` | yes | `-` |
| 8 | `follow_up_user_id` | `uuid` | yes | `-` |
| 9 | `title_ar` | `text` | yes | `-` |
| 10 | `title_en` | `text` | yes | `-` |
| 11 | `description` | `text` | yes | `-` |
| 12 | `status` | `text` | yes | `-` |
| 13 | `progress_percent` | `integer` | yes | `-` |
| 14 | `priority` | `text` | yes | `-` |
| 15 | `due_date` | `date` | yes | `-` |
| 16 | `started_at` | `timestamp with time zone` | yes | `-` |
| 17 | `completed_at` | `timestamp with time zone` | yes | `-` |
| 18 | `created_at` | `timestamp with time zone` | yes | `-` |
| 19 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.agenda_items`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_id` | `uuid` | yes | `-` |
| 4 | `topic_id` | `uuid` | yes | `-` |
| 5 | `agenda_order` | `integer` | yes | `-` |
| 6 | `agenda_status` | `text` | yes | `-` |
| 7 | `discussion_notes` | `text` | yes | `-` |
| 8 | `created_at` | `timestamp with time zone` | yes | `-` |
| 9 | `updated_at` | `timestamp with time zone` | yes | `-` |
| 10 | `is_exception` | `boolean` | yes | `-` |
| 11 | `exception_reason` | `text` | yes | `-` |
| 12 | `voting_status` | `text` | yes | `-` |
| 13 | `voting_result` | `text` | yes | `-` |

### `public.attendance_events`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_id` | `uuid` | yes | `-` |
| 4 | `attendance_record_id` | `uuid` | yes | `-` |
| 5 | `subject_user_id` | `uuid` | yes | `-` |
| 6 | `actor_user_id` | `uuid` | yes | `-` |
| 7 | `event_type` | `text` | yes | `-` |
| 8 | `previous_state` | `jsonb` | yes | `-` |
| 9 | `new_state` | `jsonb` | yes | `-` |
| 10 | `reason` | `text` | yes | `-` |
| 11 | `context` | `jsonb` | yes | `-` |
| 12 | `occurred_at` | `timestamp with time zone` | yes | `-` |

### `public.attendance_history`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `attendance_record_id` | `uuid` | yes | `-` |
| 4 | `meeting_id` | `uuid` | yes | `-` |
| 5 | `user_id` | `uuid` | yes | `-` |
| 6 | `from_status` | `text` | yes | `-` |
| 7 | `to_status` | `text` | yes | `-` |
| 8 | `changed_by_user_id` | `uuid` | yes | `-` |
| 9 | `remarks` | `text` | yes | `-` |
| 10 | `changed_at` | `timestamp with time zone` | yes | `-` |

### `public.attendance_records`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_id` | `uuid` | yes | `-` |
| 4 | `user_id` | `uuid` | yes | `-` |
| 5 | `membership_id` | `uuid` | yes | `-` |
| 6 | `attendance_status` | `text` | yes | `-` |
| 7 | `check_in_at` | `timestamp with time zone` | yes | `-` |
| 8 | `check_out_at` | `timestamp with time zone` | yes | `-` |
| 9 | `remarks` | `text` | yes | `-` |
| 10 | `created_at` | `timestamp with time zone` | yes | `-` |
| 11 | `updated_at` | `timestamp with time zone` | yes | `-` |
| 12 | `recorded_by_user_id` | `uuid` | yes | `-` |
| 13 | `verification_status` | `text` | yes | `-` |
| 14 | `check_in_method` | `text` | yes | `-` |
| 15 | `self_checked_in_at` | `timestamp with time zone` | yes | `-` |
| 16 | `verified_by_user_id` | `uuid` | yes | `-` |
| 17 | `verified_at` | `timestamp with time zone` | yes | `-` |
| 18 | `verification_note` | `text` | yes | `-` |
| 19 | `check_in_context` | `jsonb` | yes | `-` |

### `public.audit_logs`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `actor_user_id` | `uuid` | yes | `-` |
| 4 | `action` | `text` | yes | `-` |
| 5 | `entity_type` | `text` | yes | `-` |
| 6 | `entity_id` | `uuid` | yes | `-` |
| 7 | `result` | `text` | yes | `-` |
| 8 | `previous_data` | `jsonb` | yes | `-` |
| 9 | `new_data` | `jsonb` | yes | `-` |
| 10 | `metadata` | `jsonb` | yes | `-` |
| 11 | `occurred_at` | `timestamp with time zone` | yes | `-` |

### `public.decision_notes`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `decision_id` | `uuid` | yes | `-` |
| 4 | `note_type` | `text` | yes | `-` |
| 5 | `note_text` | `text` | yes | `-` |
| 6 | `created_by_user_id` | `uuid` | yes | `-` |
| 7 | `created_at` | `timestamp with time zone` | yes | `-` |

### `public.decision_status_history`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `decision_id` | `uuid` | yes | `-` |
| 4 | `from_status` | `text` | yes | `-` |
| 5 | `to_status` | `text` | yes | `-` |
| 6 | `changed_by_user_id` | `uuid` | yes | `-` |
| 7 | `changed_at` | `timestamp with time zone` | yes | `-` |
| 8 | `reason` | `text` | yes | `-` |

### `public.decision_types`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `code` | `text` | yes | `-` |
| 4 | `name_ar` | `text` | yes | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `produces_action_item` | `boolean` | yes | `-` |
| 8 | `is_active` | `boolean` | yes | `-` |
| 9 | `created_at` | `timestamp with time zone` | yes | `-` |
| 10 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.decisions`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `decision_no` | `text` | yes | `-` |
| 4 | `topic_id` | `uuid` | yes | `-` |
| 5 | `meeting_id` | `uuid` | yes | `-` |
| 6 | `agenda_item_id` | `uuid` | yes | `-` |
| 7 | `governance_unit_id` | `uuid` | yes | `-` |
| 8 | `decision_type_id` | `uuid` | yes | `-` |
| 9 | `decision_text` | `text` | yes | `-` |
| 10 | `decision_status` | `text` | yes | `-` |
| 11 | `issued_at` | `timestamp with time zone` | yes | `-` |
| 12 | `issued_by_user_id` | `uuid` | yes | `-` |
| 13 | `requires_approval` | `boolean` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | yes | `-` |
| 15 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.escalations`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `action_item_id` | `uuid` | yes | `-` |
| 4 | `escalation_level` | `integer` | yes | `-` |
| 5 | `escalation_reason` | `text` | yes | `-` |
| 6 | `escalated_to_user_id` | `uuid` | yes | `-` |
| 7 | `escalated_to_unit_id` | `uuid` | yes | `-` |
| 8 | `status` | `text` | yes | `-` |
| 9 | `escalated_at` | `timestamp with time zone` | yes | `-` |
| 10 | `closed_at` | `timestamp with time zone` | yes | `-` |

### `public.follow_up_records`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `action_item_id` | `uuid` | yes | `-` |
| 4 | `follow_up_type` | `text` | yes | `-` |
| 5 | `follow_up_note` | `text` | yes | `-` |
| 6 | `status_snapshot` | `text` | yes | `-` |
| 7 | `progress_snapshot` | `integer` | yes | `-` |
| 8 | `recorded_by_user_id` | `uuid` | yes | `-` |
| 9 | `recorded_at` | `timestamp with time zone` | yes | `-` |

### `public.governance_unit_types`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `code` | `text` | yes | `-` |
| 4 | `name_ar` | `text` | yes | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `is_active` | `boolean` | yes | `-` |
| 8 | `created_at` | `timestamp with time zone` | yes | `-` |
| 9 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.governance_units`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `parent_unit_id` | `uuid` | yes | `-` |
| 4 | `unit_type_id` | `uuid` | yes | `-` |
| 5 | `code` | `text` | yes | `-` |
| 6 | `name_ar` | `text` | yes | `-` |
| 7 | `name_en` | `text` | yes | `-` |
| 8 | `level_no` | `integer` | yes | `-` |
| 9 | `status` | `text` | yes | `-` |
| 10 | `created_at` | `timestamp with time zone` | yes | `-` |
| 11 | `updated_at` | `timestamp with time zone` | yes | `-` |
| 12 | `quorum_percentage` | `integer` | yes | `-` |
| 13 | `minute_approval_rule` | `text` | yes | `-` |

### `public.iam_change_requests`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `change_type` | `text` | yes | `-` |
| 4 | `target_role_id` | `uuid` | yes | `-` |
| 5 | `payload` | `jsonb` | yes | `-` |
| 6 | `justification` | `text` | yes | `-` |
| 7 | `status` | `text` | yes | `-` |
| 8 | `requested_by_user_id` | `uuid` | yes | `-` |
| 9 | `reviewed_by_user_id` | `uuid` | yes | `-` |
| 10 | `reviewed_at` | `timestamp with time zone` | yes | `-` |
| 11 | `review_notes` | `text` | yes | `-` |
| 12 | `applied_at` | `timestamp with time zone` | yes | `-` |
| 13 | `failure_reason` | `text` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | yes | `-` |
| 15 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.iam_operation_rate_limits`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `actor_user_id` | `uuid` | yes | `-` |
| 2 | `operation` | `text` | yes | `-` |
| 3 | `window_started_at` | `timestamp with time zone` | yes | `-` |
| 4 | `request_count` | `integer` | yes | `-` |

### `public.meeting_checkin_sessions`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_id` | `uuid` | yes | `-` |
| 4 | `token_hash` | `text` | yes | `-` |
| 5 | `status` | `text` | yes | `-` |
| 6 | `starts_at` | `timestamp with time zone` | yes | `-` |
| 7 | `expires_at` | `timestamp with time zone` | yes | `-` |
| 8 | `created_by_user_id` | `uuid` | yes | `-` |
| 9 | `created_at` | `timestamp with time zone` | yes | `-` |
| 10 | `revoked_by_user_id` | `uuid` | yes | `-` |
| 11 | `revoked_at` | `timestamp with time zone` | yes | `-` |
| 12 | `revoke_reason` | `text` | yes | `-` |

### `public.meeting_minutes`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_id` | `uuid` | yes | `-` |
| 4 | `content_draft` | `text` | yes | `-` |
| 5 | `content_final` | `text` | yes | `-` |
| 6 | `status` | `text` | yes | `-` |
| 7 | `generated_by_ai` | `boolean` | yes | `-` |
| 8 | `generated_at` | `timestamp with time zone` | yes | `-` |
| 9 | `reviewed_by_user_id` | `uuid` | yes | `-` |
| 10 | `reviewed_at` | `timestamp with time zone` | yes | `-` |
| 11 | `approved_at` | `timestamp with time zone` | yes | `-` |
| 12 | `created_at` | `timestamp with time zone` | yes | `-` |
| 13 | `updated_at` | `timestamp with time zone` | yes | `-` |
| 14 | `created_by_user_id` | `uuid` | yes | `-` |

### `public.meeting_number_counters`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `organization_id` | `uuid` | yes | `-` |
| 2 | `calendar_year` | `integer` | yes | `-` |
| 3 | `last_value` | `bigint` | yes | `-` |
| 4 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.meeting_status_history`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_id` | `uuid` | yes | `-` |
| 4 | `from_status` | `text` | yes | `-` |
| 5 | `to_status` | `text` | yes | `-` |
| 6 | `changed_by_user_id` | `uuid` | yes | `-` |
| 7 | `change_reason` | `text` | yes | `-` |
| 8 | `changed_at` | `timestamp with time zone` | yes | `-` |

### `public.meeting_types`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `code` | `text` | yes | `-` |
| 4 | `name_ar` | `text` | yes | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `is_active` | `boolean` | yes | `-` |
| 8 | `created_at` | `timestamp with time zone` | yes | `-` |
| 9 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.meetings`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_no` | `text` | yes | `-` |
| 4 | `governance_unit_id` | `uuid` | yes | `-` |
| 5 | `meeting_type_id` | `uuid` | yes | `-` |
| 6 | `title_ar` | `text` | yes | `-` |
| 7 | `title_en` | `text` | yes | `-` |
| 8 | `scheduled_date` | `date` | yes | `-` |
| 9 | `start_time` | `time without time zone` | yes | `-` |
| 10 | `end_time` | `time without time zone` | yes | `-` |
| 11 | `location_type` | `text` | yes | `-` |
| 12 | `location_details` | `text` | yes | `-` |
| 13 | `status` | `text` | yes | `-` |
| 14 | `quorum_status` | `text` | yes | `-` |
| 15 | `created_by_user_id` | `uuid` | yes | `-` |
| 16 | `created_at` | `timestamp with time zone` | yes | `-` |
| 17 | `updated_at` | `timestamp with time zone` | yes | `-` |
| 18 | `client_request_id` | `uuid` | yes | `-` |
| 19 | `attendance_locked_at` | `timestamp with time zone` | yes | `-` |
| 20 | `attendance_locked_by_user_id` | `uuid` | yes | `-` |

### `public.memberships`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `user_id` | `uuid` | yes | `-` |
| 4 | `governance_unit_id` | `uuid` | yes | `-` |
| 5 | `role_id` | `uuid` | yes | `-` |
| 6 | `membership_title` | `text` | yes | `-` |
| 7 | `membership_status` | `text` | yes | `-` |
| 8 | `start_date` | `date` | yes | `-` |
| 9 | `end_date` | `date` | yes | `-` |
| 10 | `created_at` | `timestamp with time zone` | yes | `-` |
| 11 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.minute_approvals`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `minute_id` | `uuid` | yes | `-` |
| 4 | `user_id` | `uuid` | yes | `-` |
| 5 | `membership_id` | `uuid` | yes | `-` |
| 6 | `approval_status` | `text` | yes | `-` |
| 7 | `notes` | `text` | yes | `-` |
| 8 | `resolved_at` | `timestamp with time zone` | yes | `-` |
| 9 | `created_at` | `timestamp with time zone` | yes | `-` |
| 10 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.organizations`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `code` | `text` | yes | `-` |
| 3 | `name_ar` | `text` | yes | `-` |
| 4 | `name_en` | `text` | yes | `-` |
| 5 | `sector` | `text` | yes | `-` |
| 6 | `status` | `text` | yes | `-` |
| 7 | `default_language` | `text` | yes | `-` |
| 8 | `timezone` | `text` | yes | `-` |
| 9 | `created_at` | `timestamp with time zone` | yes | `-` |
| 10 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.permissions`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `code` | `text` | yes | `-` |
| 4 | `module` | `text` | yes | `-` |
| 5 | `action` | `text` | yes | `-` |
| 6 | `context_scope` | `text` | yes | `-` |
| 7 | `name_ar` | `text` | yes | `-` |
| 8 | `name_en` | `text` | yes | `-` |
| 9 | `description` | `text` | yes | `-` |
| 10 | `is_system_permission` | `boolean` | yes | `-` |
| 11 | `is_active` | `boolean` | yes | `-` |
| 12 | `created_at` | `timestamp with time zone` | yes | `-` |
| 13 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.quorum_snapshots`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_id` | `uuid` | yes | `-` |
| 4 | `required_percentage` | `integer` | yes | `-` |
| 5 | `eligible_members` | `integer` | yes | `-` |
| 6 | `present_members` | `integer` | yes | `-` |
| 7 | `actual_percentage` | `numeric(7,4)` | yes | `-` |
| 8 | `quorum_status` | `text` | yes | `-` |
| 9 | `calculated_by_user_id` | `uuid` | yes | `-` |
| 10 | `calculated_at` | `timestamp with time zone` | yes | `-` |

### `public.role_permissions`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `role_id` | `uuid` | yes | `-` |
| 4 | `permission_id` | `uuid` | yes | `-` |
| 5 | `granted_by_user_id` | `uuid` | yes | `-` |
| 6 | `granted_at` | `timestamp with time zone` | yes | `-` |
| 7 | `is_active` | `boolean` | yes | `-` |
| 8 | `created_at` | `timestamp with time zone` | yes | `-` |
| 9 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.roles`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `code` | `text` | yes | `-` |
| 4 | `name_ar` | `text` | yes | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `role_scope` | `text` | yes | `-` |
| 8 | `is_active` | `boolean` | yes | `-` |
| 9 | `created_at` | `timestamp with time zone` | yes | `-` |
| 10 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.sso_domains`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `sso_provider_id` | `uuid` | yes | `-` |
| 4 | `domain` | `text` | yes | `-` |
| 5 | `status` | `text` | yes | `-` |
| 6 | `verified_at` | `timestamp with time zone` | yes | `-` |
| 7 | `created_at` | `timestamp with time zone` | yes | `-` |
| 8 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.sso_group_membership_links`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `provider_id` | `uuid` | yes | `-` |
| 4 | `mapping_id` | `uuid` | yes | `-` |
| 5 | `user_id` | `uuid` | yes | `-` |
| 6 | `membership_id` | `uuid` | yes | `-` |
| 7 | `owns_membership` | `boolean` | yes | `-` |
| 8 | `external_group` | `text` | yes | `-` |
| 9 | `last_seen_at` | `timestamp with time zone` | yes | `-` |
| 10 | `created_at` | `timestamp with time zone` | yes | `-` |

### `public.sso_group_role_mappings`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `provider_id` | `uuid` | yes | `-` |
| 4 | `external_group` | `text` | yes | `-` |
| 5 | `role_id` | `uuid` | yes | `-` |
| 6 | `governance_unit_id` | `uuid` | yes | `-` |
| 7 | `membership_title` | `text` | yes | `-` |
| 8 | `is_active` | `boolean` | yes | `-` |
| 9 | `created_at` | `timestamp with time zone` | yes | `-` |
| 10 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.sso_identity_providers`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `provider_type` | `text` | yes | `-` |
| 4 | `provider_name` | `text` | yes | `-` |
| 5 | `supabase_sso_provider_id` | `uuid` | yes | `-` |
| 6 | `entity_id` | `text` | yes | `-` |
| 7 | `metadata_url` | `text` | yes | `-` |
| 8 | `attribute_mapping` | `jsonb` | yes | `-` |
| 9 | `default_role_id` | `uuid` | yes | `-` |
| 10 | `default_governance_unit_id` | `uuid` | yes | `-` |
| 11 | `provisioning_mode` | `text` | yes | `-` |
| 12 | `status` | `text` | yes | `-` |
| 13 | `created_by_user_id` | `uuid` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | yes | `-` |
| 15 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.topic_categories`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `code` | `text` | yes | `-` |
| 4 | `name_ar` | `text` | yes | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `is_active` | `boolean` | yes | `-` |
| 8 | `created_at` | `timestamp with time zone` | yes | `-` |
| 9 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.topic_number_counters`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `organization_id` | `uuid` | yes | `-` |
| 2 | `calendar_year` | `integer` | yes | `-` |
| 3 | `last_value` | `bigint` | yes | `-` |
| 4 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.topic_referrals`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `topic_id` | `uuid` | yes | `-` |
| 4 | `from_unit_id` | `uuid` | yes | `-` |
| 5 | `to_unit_id` | `uuid` | yes | `-` |
| 6 | `referred_by_user_id` | `uuid` | yes | `-` |
| 7 | `referral_reason` | `text` | yes | `-` |
| 8 | `status` | `text` | yes | `-` |
| 9 | `referred_at` | `timestamp with time zone` | yes | `-` |
| 10 | `updated_at` | `timestamp with time zone` | yes | `-` |
| 11 | `response_reason` | `text` | yes | `-` |
| 12 | `responded_by_user_id` | `uuid` | yes | `-` |
| 13 | `responded_at` | `timestamp with time zone` | yes | `-` |

### `public.topic_status_history`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `topic_id` | `uuid` | yes | `-` |
| 4 | `from_status` | `text` | yes | `-` |
| 5 | `to_status` | `text` | yes | `-` |
| 6 | `changed_by_user_id` | `uuid` | yes | `-` |
| 7 | `changed_at` | `timestamp with time zone` | yes | `-` |
| 8 | `change_reason` | `text` | yes | `-` |

### `public.topics`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `topic_no` | `text` | yes | `-` |
| 4 | `title_ar` | `text` | yes | `-` |
| 5 | `title_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `category_id` | `uuid` | yes | `-` |
| 8 | `current_unit_id` | `uuid` | yes | `-` |
| 9 | `submitted_by_user_id` | `uuid` | yes | `-` |
| 10 | `source_type` | `text` | yes | `-` |
| 11 | `priority` | `text` | yes | `-` |
| 12 | `status` | `text` | yes | `-` |
| 13 | `submitted_at` | `timestamp with time zone` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | yes | `-` |
| 15 | `updated_at` | `timestamp with time zone` | yes | `-` |
| 16 | `client_request_id` | `uuid` | yes | `-` |

### `public.user_identity_links`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `user_id` | `uuid` | yes | `-` |
| 4 | `provider_id` | `uuid` | yes | `-` |
| 5 | `external_subject` | `text` | yes | `-` |
| 6 | `external_email` | `text` | yes | `-` |
| 7 | `last_login_at` | `timestamp with time zone` | yes | `-` |
| 8 | `linked_at` | `timestamp with time zone` | yes | `-` |
| 9 | `status` | `text` | yes | `-` |

### `public.user_invitations`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `email` | `text` | yes | `-` |
| 4 | `full_name_ar` | `text` | yes | `-` |
| 5 | `role_id` | `uuid` | yes | `-` |
| 6 | `governance_unit_id` | `uuid` | yes | `-` |
| 7 | `invitation_status` | `text` | yes | `-` |
| 8 | `invited_by_user_id` | `uuid` | yes | `-` |
| 9 | `accepted_by_user_id` | `uuid` | yes | `-` |
| 10 | `token_hash` | `text` | yes | `-` |
| 11 | `expires_at` | `timestamp with time zone` | yes | `-` |
| 12 | `accepted_at` | `timestamp with time zone` | yes | `-` |
| 13 | `revoked_at` | `timestamp with time zone` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | yes | `-` |
| 15 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.user_preferences`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `user_id` | `uuid` | yes | `-` |
| 4 | `locale` | `text` | yes | `-` |
| 5 | `timezone` | `text` | yes | `-` |
| 6 | `notification_settings` | `jsonb` | yes | `-` |
| 7 | `ui_settings` | `jsonb` | yes | `-` |
| 8 | `created_at` | `timestamp with time zone` | yes | `-` |
| 9 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.user_sessions`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `user_id` | `uuid` | yes | `-` |
| 4 | `auth_session_id` | `uuid` | yes | `-` |
| 5 | `device_id` | `text` | yes | `-` |
| 6 | `device_name` | `text` | yes | `-` |
| 7 | `platform` | `text` | yes | `-` |
| 8 | `app_version` | `text` | yes | `-` |
| 9 | `ip_address` | `inet` | yes | `-` |
| 10 | `user_agent` | `text` | yes | `-` |
| 11 | `last_seen_at` | `timestamp with time zone` | yes | `-` |
| 12 | `revoked_at` | `timestamp with time zone` | yes | `-` |
| 13 | `revocation_reason` | `text` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | yes | `-` |
| 15 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.users`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `employee_no` | `text` | yes | `-` |
| 4 | `full_name_ar` | `text` | yes | `-` |
| 5 | `full_name_en` | `text` | yes | `-` |
| 6 | `email` | `text` | yes | `-` |
| 7 | `mobile` | `text` | yes | `-` |
| 8 | `job_title` | `text` | yes | `-` |
| 9 | `status` | `text` | yes | `-` |
| 10 | `is_system_admin` | `boolean` | yes | `-` |
| 11 | `created_at` | `timestamp with time zone` | yes | `-` |
| 12 | `updated_at` | `timestamp with time zone` | yes | `-` |

### `public.votes`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_id` | `uuid` | yes | `-` |
| 4 | `topic_id` | `uuid` | yes | `-` |
| 5 | `decision_id` | `uuid` | yes | `-` |
| 6 | `user_id` | `uuid` | yes | `-` |
| 7 | `membership_id` | `uuid` | yes | `-` |
| 8 | `vote_value` | `text` | yes | `-` |
| 9 | `vote_note` | `text` | yes | `-` |
| 10 | `voted_at` | `timestamp with time zone` | yes | `-` |
| 11 | `voting_round_id` | `uuid` | yes | `-` |

### `public.voting_eligible_members`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `organization_id` | `uuid` | yes | `-` |
| 2 | `voting_round_id` | `uuid` | yes | `-` |
| 3 | `user_id` | `uuid` | yes | `-` |
| 4 | `membership_id` | `uuid` | yes | `-` |
| 5 | `snapshotted_at` | `timestamp with time zone` | yes | `-` |

### `public.voting_results_view`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `meeting_id` | `uuid` | yes | `-` |
| 2 | `topic_id` | `uuid` | yes | `-` |
| 3 | `total_votes` | `bigint` | yes | `-` |
| 4 | `approve_count` | `bigint` | yes | `-` |
| 5 | `reject_count` | `bigint` | yes | `-` |
| 6 | `abstain_count` | `bigint` | yes | `-` |
| 7 | `calculated_result` | `text` | yes | `-` |

### `public.voting_rounds`

Kind: `view`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | yes | `-` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `meeting_id` | `uuid` | yes | `-` |
| 4 | `agenda_item_id` | `uuid` | yes | `-` |
| 5 | `round_number` | `integer` | yes | `-` |
| 6 | `status` | `text` | yes | `-` |
| 7 | `calculation_rule` | `text` | yes | `-` |
| 8 | `eligible_voter_count` | `integer` | yes | `-` |
| 9 | `approve_count` | `integer` | yes | `-` |
| 10 | `reject_count` | `integer` | yes | `-` |
| 11 | `abstain_count` | `integer` | yes | `-` |
| 12 | `result` | `text` | yes | `-` |
| 13 | `opened_by_user_id` | `uuid` | yes | `-` |
| 14 | `opened_at` | `timestamp with time zone` | yes | `-` |
| 15 | `closed_by_user_id` | `uuid` | yes | `-` |
| 16 | `closed_at` | `timestamp with time zone` | yes | `-` |
| 17 | `close_reason` | `text` | yes | `-` |

### `qarar_architecture.api_contract_registry`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `api_version` | `text` | no | `-` |
| 2 | `contract_name` | `name` | no | `-` |
| 3 | `implementation_schema` | `name` | no | `-` |
| 4 | `implementation_name` | `name` | no | `-` |
| 5 | `identity_arguments` | `text` | no | `-` |
| 6 | `module_code` | `text` | no | `-` |
| 7 | `audience` | `text` | no | `-` |
| 8 | `deprecated_at` | `timestamp with time zone` | yes | `-` |
| 9 | `replacement_contract` | `name` | yes | `-` |

**Constraints and relationships**
- `api_contract_registry_audience_check` (check): `CHECK (audience = ANY (ARRAY['authenticated'::text, 'service_role'::text, 'edge_authenticated'::text]))`
- `api_contract_registry_module_code_fkey` (foreign_key): `FOREIGN KEY (module_code) REFERENCES qarar_architecture.module_registry(module_code)`
- `api_contract_registry_pkey` (primary_key): `PRIMARY KEY (api_version, contract_name, identity_arguments)`

**Indexes**
- `api_contract_registry_pkey`: `CREATE UNIQUE INDEX api_contract_registry_pkey ON qarar_architecture.api_contract_registry USING btree (api_version, contract_name, identity_arguments)`

### `qarar_architecture.api_release_registry`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `api_version` | `text` | no | `-` |
| 2 | `contract_count` | `integer` | no | `-` |
| 3 | `contract_hash` | `text` | no | `-` |
| 4 | `released_at` | `timestamp with time zone` | no | `-` |
| 5 | `removal_not_before` | `date` | yes | `-` |
| 6 | `notes` | `text` | no | `-` |

**Constraints and relationships**
- `api_release_registry_contract_count_check` (check): `CHECK (contract_count > 0)`
- `api_release_registry_contract_hash_check` (check): `CHECK (contract_hash ~ '^[0-9a-f]{32}$'::text)`
- `api_release_registry_pkey` (primary_key): `PRIMARY KEY (api_version)`

**Indexes**
- `api_release_registry_pkey`: `CREATE UNIQUE INDEX api_release_registry_pkey ON qarar_architecture.api_release_registry USING btree (api_version)`

### `qarar_architecture.compatibility_surface_registry`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `relation_name` | `name` | no | `-` |
| 2 | `consumers` | `text[]` | no | `-` |
| 3 | `owning_team` | `text` | no | `-` |
| 4 | `client_read_only` | `boolean` | no | `true` |
| 5 | `removal_not_before` | `date` | no | `-` |
| 6 | `replacement` | `text` | no | `-` |

**Constraints and relationships**
- `compatibility_surface_registry_consumers_check` (check): `CHECK (cardinality(consumers) > 0)`
- `compatibility_surface_registry_pkey` (primary_key): `PRIMARY KEY (relation_name)`

**Indexes**
- `compatibility_surface_registry_pkey`: `CREATE UNIQUE INDEX compatibility_surface_registry_pkey ON qarar_architecture.compatibility_surface_registry USING btree (relation_name)`

### `qarar_architecture.entity_registry`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `entity_name` | `name` | no | `-` |
| 2 | `module_code` | `text` | no | `-` |
| 3 | `legacy_public_view` | `boolean` | no | `true` |
| 4 | `moved_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `entity_registry_module_code_fkey` (foreign_key): `FOREIGN KEY (module_code) REFERENCES qarar_architecture.module_registry(module_code)`
- `entity_registry_pkey` (primary_key): `PRIMARY KEY (entity_name)`

**Indexes**
- `entity_registry_pkey`: `CREATE UNIQUE INDEX entity_registry_pkey ON qarar_architecture.entity_registry USING btree (entity_name)`

### `qarar_architecture.function_registry`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `function_oid` | `oid` | no | `-` |
| 2 | `function_name` | `name` | no | `-` |
| 3 | `identity_arguments` | `text` | no | `-` |
| 4 | `module_code` | `text` | no | `-` |
| 5 | `owning_schema` | `name` | no | `-` |
| 6 | `is_rls_predicate` | `boolean` | no | `false` |

**Constraints and relationships**
- `function_registry_module_code_fkey` (foreign_key): `FOREIGN KEY (module_code) REFERENCES qarar_architecture.module_registry(module_code)`
- `function_registry_pkey` (primary_key): `PRIMARY KEY (function_oid)`
- `function_registry_function_name_identity_arguments_key` (unique): `UNIQUE (function_name, identity_arguments)`

**Indexes**
- `function_registry_function_name_identity_arguments_key`: `CREATE UNIQUE INDEX function_registry_function_name_identity_arguments_key ON qarar_architecture.function_registry USING btree (function_name, identity_arguments)`
- `function_registry_pkey`: `CREATE UNIQUE INDEX function_registry_pkey ON qarar_architecture.function_registry USING btree (function_oid)`

### `qarar_architecture.module_function_execute_allowlist`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `source_module` | `text` | no | `-` |
| 2 | `target_schema` | `name` | no | `-` |
| 3 | `function_name` | `name` | no | `-` |
| 4 | `identity_arguments` | `text` | no | `-` |
| 5 | `rationale` | `text` | no | `-` |

**Constraints and relationships**
- `module_function_execute_allowlist_source_module_fkey` (foreign_key): `FOREIGN KEY (source_module) REFERENCES qarar_architecture.module_registry(module_code)`
- `module_function_execute_allowlist_pkey` (primary_key): `PRIMARY KEY (source_module, target_schema, function_name, identity_arguments)`

**Indexes**
- `module_function_execute_allowlist_pkey`: `CREATE UNIQUE INDEX module_function_execute_allowlist_pkey ON qarar_architecture.module_function_execute_allowlist USING btree (source_module, target_schema, function_name, identity_arguments)`

### `qarar_architecture.module_registry`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `module_code` | `text` | no | `-` |
| 2 | `schema_name` | `name` | no | `-` |
| 3 | `description` | `text` | no | `-` |
| 4 | `is_exposed` | `boolean` | no | `false` |

**Constraints and relationships**
- `module_registry_pkey` (primary_key): `PRIMARY KEY (module_code)`
- `module_registry_schema_name_key` (unique): `UNIQUE (schema_name)`

**Indexes**
- `module_registry_pkey`: `CREATE UNIQUE INDEX module_registry_pkey ON qarar_architecture.module_registry USING btree (module_code)`
- `module_registry_schema_name_key`: `CREATE UNIQUE INDEX module_registry_schema_name_key ON qarar_architecture.module_registry USING btree (schema_name)`

### `qarar_architecture.module_table_read_allowlist`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `source_module` | `text` | no | `-` |
| 2 | `target_schema` | `name` | no | `-` |
| 3 | `table_name` | `name` | no | `-` |
| 4 | `rationale` | `text` | no | `-` |

**Constraints and relationships**
- `module_table_read_allowlist_source_module_fkey` (foreign_key): `FOREIGN KEY (source_module) REFERENCES qarar_architecture.module_registry(module_code)`
- `module_table_read_allowlist_pkey` (primary_key): `PRIMARY KEY (source_module, target_schema, table_name)`

**Indexes**
- `module_table_read_allowlist_pkey`: `CREATE UNIQUE INDEX module_table_read_allowlist_pkey ON qarar_architecture.module_table_read_allowlist USING btree (source_module, target_schema, table_name)`

### `qarar_attendance.attendance_events`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_id` | `uuid` | no | `-` |
| 4 | `attendance_record_id` | `uuid` | no | `-` |
| 5 | `subject_user_id` | `uuid` | no | `-` |
| 6 | `actor_user_id` | `uuid` | yes | `-` |
| 7 | `event_type` | `text` | no | `-` |
| 8 | `previous_state` | `jsonb` | yes | `-` |
| 9 | `new_state` | `jsonb` | yes | `-` |
| 10 | `reason` | `text` | yes | `-` |
| 11 | `context` | `jsonb` | no | `'{}'::jsonb` |
| 12 | `occurred_at` | `timestamp with time zone` | no | `clock_timestamp()` |

**Constraints and relationships**
- `attendance_events_event_type_check` (check): `CHECK (event_type = ANY (ARRAY['roster_initialized'::text, 'self_check_in'::text, 'attendance_verified'::text, 'attendance_rejected'::text, 'attendance_overridden'::text, 'roster_locked'::text, 'checkin_session_created'::text, 'checkin_session_revoked'::text]))`
- `attendance_events_actor_user_id_fkey` (foreign_key): `FOREIGN KEY (actor_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `attendance_events_actor_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (actor_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `attendance_events_attendance_record_id_fkey` (foreign_key): `FOREIGN KEY (attendance_record_id) REFERENCES qarar_attendance.attendance_records(id) ON DELETE RESTRICT`
- `attendance_events_attendance_record_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (attendance_record_id, organization_id) REFERENCES qarar_attendance.attendance_records(id, organization_id)`
- `attendance_events_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `attendance_events_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `attendance_events_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `attendance_events_subject_user_id_fkey` (foreign_key): `FOREIGN KEY (subject_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `attendance_events_subject_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (subject_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `attendance_events_pkey` (primary_key): `PRIMARY KEY (id)`

**Indexes**
- `attendance_events_meeting_time_idx`: `CREATE INDEX attendance_events_meeting_time_idx ON qarar_attendance.attendance_events USING btree (organization_id, meeting_id, occurred_at, id)`
- `attendance_events_pkey`: `CREATE UNIQUE INDEX attendance_events_pkey ON qarar_attendance.attendance_events USING btree (id)`

### `qarar_attendance.attendance_history`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `attendance_record_id` | `uuid` | no | `-` |
| 4 | `meeting_id` | `uuid` | no | `-` |
| 5 | `user_id` | `uuid` | no | `-` |
| 6 | `from_status` | `text` | yes | `-` |
| 7 | `to_status` | `text` | no | `-` |
| 8 | `changed_by_user_id` | `uuid` | yes | `-` |
| 9 | `remarks` | `text` | yes | `-` |
| 10 | `changed_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `attendance_history_to_status_check` (check): `CHECK (to_status = ANY (ARRAY['pending'::text, 'present'::text, 'absent'::text, 'excused'::text, 'late'::text]))`
- `attendance_history_attendance_record_id_fkey` (foreign_key): `FOREIGN KEY (attendance_record_id) REFERENCES qarar_attendance.attendance_records(id) ON DELETE RESTRICT`
- `attendance_history_attendance_record_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (attendance_record_id, organization_id) REFERENCES qarar_attendance.attendance_records(id, organization_id)`
- `attendance_history_changed_by_user_id_fkey` (foreign_key): `FOREIGN KEY (changed_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `attendance_history_changed_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (changed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `attendance_history_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `attendance_history_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `attendance_history_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `attendance_history_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `attendance_history_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `attendance_history_pkey` (primary_key): `PRIMARY KEY (id)`

**Indexes**
- `attendance_history_meeting_time_idx`: `CREATE INDEX attendance_history_meeting_time_idx ON qarar_attendance.attendance_history USING btree (organization_id, meeting_id, changed_at, id)`
- `attendance_history_pkey`: `CREATE UNIQUE INDEX attendance_history_pkey ON qarar_attendance.attendance_history USING btree (id)`

### `qarar_attendance.attendance_records`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_id` | `uuid` | no | `-` |
| 4 | `user_id` | `uuid` | no | `-` |
| 5 | `membership_id` | `uuid` | no | `-` |
| 6 | `attendance_status` | `text` | no | `'pending'::text` |
| 7 | `check_in_at` | `timestamp with time zone` | yes | `-` |
| 8 | `check_out_at` | `timestamp with time zone` | yes | `-` |
| 9 | `remarks` | `text` | yes | `-` |
| 10 | `created_at` | `timestamp with time zone` | no | `now()` |
| 11 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 12 | `recorded_by_user_id` | `uuid` | yes | `-` |
| 13 | `verification_status` | `text` | no | `'unclaimed'::text` |
| 14 | `check_in_method` | `text` | yes | `-` |
| 15 | `self_checked_in_at` | `timestamp with time zone` | yes | `-` |
| 16 | `verified_by_user_id` | `uuid` | yes | `-` |
| 17 | `verified_at` | `timestamp with time zone` | yes | `-` |
| 18 | `verification_note` | `text` | yes | `-` |
| 19 | `check_in_context` | `jsonb` | no | `'{}'::jsonb` |

**Constraints and relationships**
- `attendance_records_attendance_status_check` (check): `CHECK (attendance_status = ANY (ARRAY['pending'::text, 'present'::text, 'absent'::text, 'excused'::text, 'late'::text]))`
- `attendance_records_check_in_method_check` (check): `CHECK (check_in_method = ANY (ARRAY['self_qr'::text, 'manual'::text, 'override'::text, 'legacy'::text]))`
- `attendance_records_verification_status_check` (check): `CHECK (verification_status = ANY (ARRAY['unclaimed'::text, 'pending_verification'::text, 'verified'::text, 'rejected'::text]))`
- `attendance_records_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `attendance_records_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `attendance_records_membership_id_fkey` (foreign_key): `FOREIGN KEY (membership_id) REFERENCES qarar_iam.memberships(id) ON DELETE RESTRICT`
- `attendance_records_membership_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (membership_id, organization_id) REFERENCES qarar_iam.memberships(id, organization_id)`
- `attendance_records_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `attendance_records_recorded_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (recorded_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `attendance_records_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `attendance_records_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `attendance_records_verified_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (verified_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `attendance_records_pkey` (primary_key): `PRIMARY KEY (id)`
- `attendance_records_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `attendance_records_meeting_id_user_id_key` (unique): `UNIQUE (meeting_id, user_id)`

**Indexes**
- `attendance_records_id_organization_id_key`: `CREATE UNIQUE INDEX attendance_records_id_organization_id_key ON qarar_attendance.attendance_records USING btree (id, organization_id)`
- `attendance_records_meeting_id_user_id_key`: `CREATE UNIQUE INDEX attendance_records_meeting_id_user_id_key ON qarar_attendance.attendance_records USING btree (meeting_id, user_id)`
- `attendance_records_pkey`: `CREATE UNIQUE INDEX attendance_records_pkey ON qarar_attendance.attendance_records USING btree (id)`

### `qarar_attendance.meeting_checkin_sessions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_id` | `uuid` | no | `-` |
| 4 | `token_hash` | `text` | no | `-` |
| 5 | `status` | `text` | no | `'active'::text` |
| 6 | `starts_at` | `timestamp with time zone` | no | `-` |
| 7 | `expires_at` | `timestamp with time zone` | no | `-` |
| 8 | `created_by_user_id` | `uuid` | no | `-` |
| 9 | `created_at` | `timestamp with time zone` | no | `now()` |
| 10 | `revoked_by_user_id` | `uuid` | yes | `-` |
| 11 | `revoked_at` | `timestamp with time zone` | yes | `-` |
| 12 | `revoke_reason` | `text` | yes | `-` |

**Constraints and relationships**
- `meeting_checkin_sessions_check` (check): `CHECK (expires_at > starts_at)`
- `meeting_checkin_sessions_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text, 'closed'::text]))`
- `meeting_checkin_sessions_created_by_user_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `meeting_checkin_sessions_created_by_user_id_organization_i_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `meeting_checkin_sessions_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `meeting_checkin_sessions_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `meeting_checkin_sessions_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `meeting_checkin_sessions_revoked_by_user_id_fkey` (foreign_key): `FOREIGN KEY (revoked_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `meeting_checkin_sessions_revoked_by_user_id_organization_i_fkey` (foreign_key): `FOREIGN KEY (revoked_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `meeting_checkin_sessions_pkey` (primary_key): `PRIMARY KEY (id)`
- `meeting_checkin_sessions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `meeting_checkin_sessions_id_organization_id_key`: `CREATE UNIQUE INDEX meeting_checkin_sessions_id_organization_id_key ON qarar_attendance.meeting_checkin_sessions USING btree (id, organization_id)`
- `meeting_checkin_sessions_one_active_uidx`: `CREATE UNIQUE INDEX meeting_checkin_sessions_one_active_uidx ON qarar_attendance.meeting_checkin_sessions USING btree (meeting_id) WHERE (status = 'active'::text)`
- `meeting_checkin_sessions_pkey`: `CREATE UNIQUE INDEX meeting_checkin_sessions_pkey ON qarar_attendance.meeting_checkin_sessions USING btree (id)`

### `qarar_attendance.quorum_snapshots`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_id` | `uuid` | no | `-` |
| 4 | `required_percentage` | `integer` | no | `-` |
| 5 | `eligible_members` | `integer` | no | `-` |
| 6 | `present_members` | `integer` | no | `-` |
| 7 | `actual_percentage` | `numeric(7,4)` | no | `-` |
| 8 | `quorum_status` | `text` | no | `-` |
| 9 | `calculated_by_user_id` | `uuid` | yes | `-` |
| 10 | `calculated_at` | `timestamp with time zone` | no | `clock_timestamp()` |

**Constraints and relationships**
- `quorum_snapshots_actual_percentage_check` (check): `CHECK (actual_percentage >= 0::numeric AND actual_percentage <= 100::numeric)`
- `quorum_snapshots_eligible_members_check` (check): `CHECK (eligible_members >= 0)`
- `quorum_snapshots_present_members_check` (check): `CHECK (present_members >= 0)`
- `quorum_snapshots_quorum_status_check` (check): `CHECK (quorum_status = ANY (ARRAY['met'::text, 'not_met'::text]))`
- `quorum_snapshots_required_percentage_check` (check): `CHECK (required_percentage >= 1 AND required_percentage <= 100)`
- `quorum_snapshots_calculated_by_user_id_fkey` (foreign_key): `FOREIGN KEY (calculated_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `quorum_snapshots_calculated_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (calculated_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `quorum_snapshots_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `quorum_snapshots_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `quorum_snapshots_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `quorum_snapshots_pkey` (primary_key): `PRIMARY KEY (id)`

**Indexes**
- `quorum_snapshots_meeting_time_idx`: `CREATE INDEX quorum_snapshots_meeting_time_idx ON qarar_attendance.quorum_snapshots USING btree (organization_id, meeting_id, calculated_at DESC, id DESC)`
- `quorum_snapshots_pkey`: `CREATE UNIQUE INDEX quorum_snapshots_pkey ON qarar_attendance.quorum_snapshots USING btree (id)`

### `qarar_audit.audit_logs`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | yes | `-` |
| 3 | `actor_user_id` | `uuid` | yes | `-` |
| 4 | `action` | `text` | no | `-` |
| 5 | `entity_type` | `text` | no | `-` |
| 6 | `entity_id` | `uuid` | yes | `-` |
| 7 | `result` | `text` | no | `'success'::text` |
| 8 | `previous_data` | `jsonb` | yes | `-` |
| 9 | `new_data` | `jsonb` | yes | `-` |
| 10 | `metadata` | `jsonb` | no | `'{}'::jsonb` |
| 11 | `occurred_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `audit_logs_result_check` (check): `CHECK (result = ANY (ARRAY['success'::text, 'failure'::text, 'denied'::text]))`
- `audit_logs_actor_user_id_fkey` (foreign_key): `FOREIGN KEY (actor_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `audit_logs_actor_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (actor_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `audit_logs_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `audit_logs_pkey` (primary_key): `PRIMARY KEY (id)`

**Indexes**
- `audit_logs_pkey`: `CREATE UNIQUE INDEX audit_logs_pkey ON qarar_audit.audit_logs USING btree (id)`
- `idx_audit_logs_entity`: `CREATE INDEX idx_audit_logs_entity ON qarar_audit.audit_logs USING btree (entity_type, entity_id)`
- `idx_audit_logs_organization_time`: `CREATE INDEX idx_audit_logs_organization_time ON qarar_audit.audit_logs USING btree (organization_id, occurred_at DESC)`

### `qarar_core.governance_unit_status_history`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `governance_unit_id` | `uuid` | no | `-` |
| 4 | `from_status` | `text` | yes | `-` |
| 5 | `to_status` | `text` | no | `-` |
| 6 | `reason` | `text` | no | `-` |
| 7 | `changed_by_user_id` | `uuid` | yes | `-` |
| 8 | `changed_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `governance_unit_status_history_from_status_check` (check): `CHECK (from_status IS NULL OR (from_status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))`
- `governance_unit_status_history_reason_check` (check): `CHECK (char_length(btrim(reason)) >= 3 AND char_length(btrim(reason)) <= 1000)`
- `governance_unit_status_history_to_status_check` (check): `CHECK (to_status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))`
- `governance_unit_status_histor_changed_by_user_id_organizat_fkey` (foreign_key): `FOREIGN KEY (changed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `governance_unit_status_histor_governance_unit_id_organizat_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id) ON DELETE RESTRICT`
- `governance_unit_status_history_pkey` (primary_key): `PRIMARY KEY (id)`
- `governance_unit_status_history_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `governance_unit_status_history_id_organization_id_key`: `CREATE UNIQUE INDEX governance_unit_status_history_id_organization_id_key ON qarar_core.governance_unit_status_history USING btree (id, organization_id)`
- `governance_unit_status_history_pkey`: `CREATE UNIQUE INDEX governance_unit_status_history_pkey ON qarar_core.governance_unit_status_history USING btree (id)`
- `governance_unit_status_history_timeline_idx`: `CREATE INDEX governance_unit_status_history_timeline_idx ON qarar_core.governance_unit_status_history USING btree (organization_id, governance_unit_id, changed_at DESC, id DESC)`

### `qarar_core.governance_unit_types`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `code` | `text` | no | `-` |
| 4 | `name_ar` | `text` | no | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `is_active` | `boolean` | no | `true` |
| 8 | `created_at` | `timestamp with time zone` | no | `now()` |
| 9 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 10 | `is_council_type` | `boolean` | no | `false` |
| 11 | `is_system` | `boolean` | no | `false` |

**Constraints and relationships**
- `governance_unit_types_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `governance_unit_types_pkey` (primary_key): `PRIMARY KEY (id)`
- `governance_unit_types_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `governance_unit_types_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `governance_unit_types_id_organization_id_key`: `CREATE UNIQUE INDEX governance_unit_types_id_organization_id_key ON qarar_core.governance_unit_types USING btree (id, organization_id)`
- `governance_unit_types_organization_id_code_key`: `CREATE UNIQUE INDEX governance_unit_types_organization_id_code_key ON qarar_core.governance_unit_types USING btree (organization_id, code)`
- `governance_unit_types_pkey`: `CREATE UNIQUE INDEX governance_unit_types_pkey ON qarar_core.governance_unit_types USING btree (id)`

### `qarar_core.governance_units`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `parent_unit_id` | `uuid` | yes | `-` |
| 4 | `unit_type_id` | `uuid` | no | `-` |
| 5 | `code` | `text` | no | `-` |
| 6 | `name_ar` | `text` | no | `-` |
| 7 | `name_en` | `text` | yes | `-` |
| 8 | `level_no` | `integer` | no | `1` |
| 9 | `status` | `text` | no | `'active'::text` |
| 10 | `created_at` | `timestamp with time zone` | no | `now()` |
| 11 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 12 | `quorum_percentage` | `integer` | no | `51` |
| 13 | `minute_approval_rule` | `text` | no | `'chair_and_rapporteur'::text` |
| 14 | `governance_class_id` | `uuid` | yes | `-` |
| 15 | `description` | `text` | yes | `-` |
| 16 | `status_reason` | `text` | yes | `-` |
| 17 | `status_changed_at` | `timestamp with time zone` | no | `now()` |
| 18 | `status_changed_by_user_id` | `uuid` | yes | `-` |
| 19 | `activated_at` | `timestamp with time zone` | yes | `-` |
| 20 | `archived_at` | `timestamp with time zone` | yes | `-` |
| 21 | `minimum_active_members` | `integer` | no | `1` |
| 22 | `allow_dual_leadership` | `boolean` | no | `false` |
| 23 | `created_by_user_id` | `uuid` | yes | `-` |
| 24 | `client_request_id` | `uuid` | yes | `-` |

**Constraints and relationships**
- `governance_units_level_no_check` (check): `CHECK (level_no > 0)`
- `governance_units_minimum_active_members_check` (check): `CHECK (minimum_active_members >= 1)`
- `governance_units_minute_approval_rule_check` (check): `CHECK (minute_approval_rule = ANY (ARRAY['chair_and_rapporteur'::text, 'all_present_members'::text]))`
- `governance_units_quorum_percentage_check` (check): `CHECK (quorum_percentage >= 1 AND quorum_percentage <= 100)`
- `governance_units_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))`
- `governance_units_status_metadata_check` (check): `CHECK (status = 'active'::text AND activated_at IS NOT NULL AND archived_at IS NULL OR status = 'inactive'::text AND archived_at IS NULL OR status = 'archived'::text AND archived_at IS NOT NULL)`
- `governance_units_class_tenant_fk` (foreign_key): `FOREIGN KEY (governance_class_id, organization_id) REFERENCES qarar_governance.governance_unit_classes(id, organization_id) ON DELETE RESTRICT`
- `governance_units_creator_tenant_fk` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `governance_units_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `governance_units_parent_unit_id_fkey` (foreign_key): `FOREIGN KEY (parent_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `governance_units_parent_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (parent_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `governance_units_status_actor_tenant_fk` (foreign_key): `FOREIGN KEY (status_changed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `governance_units_unit_type_id_fkey` (foreign_key): `FOREIGN KEY (unit_type_id) REFERENCES qarar_core.governance_unit_types(id) ON DELETE RESTRICT`
- `governance_units_unit_type_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (unit_type_id, organization_id) REFERENCES qarar_core.governance_unit_types(id, organization_id)`
- `governance_units_pkey` (primary_key): `PRIMARY KEY (id)`
- `governance_units_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `governance_units_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `governance_units_council_search_idx`: `CREATE INDEX governance_units_council_search_idx ON qarar_core.governance_units USING btree (organization_id, status, unit_type_id, parent_unit_id, name_ar, id)`
- `governance_units_creation_idempotency_uidx`: `CREATE UNIQUE INDEX governance_units_creation_idempotency_uidx ON qarar_core.governance_units USING btree (organization_id, created_by_user_id, client_request_id) WHERE (client_request_id IS NOT NULL)`
- `governance_units_governance_class_idx`: `CREATE INDEX governance_units_governance_class_idx ON qarar_core.governance_units USING btree (organization_id, governance_class_id) WHERE (governance_class_id IS NOT NULL)`
- `governance_units_id_organization_id_key`: `CREATE UNIQUE INDEX governance_units_id_organization_id_key ON qarar_core.governance_units USING btree (id, organization_id)`
- `governance_units_organization_id_code_key`: `CREATE UNIQUE INDEX governance_units_organization_id_code_key ON qarar_core.governance_units USING btree (organization_id, code)`
- `governance_units_pkey`: `CREATE UNIQUE INDEX governance_units_pkey ON qarar_core.governance_units USING btree (id)`
- `idx_governance_units_organization_id`: `CREATE INDEX idx_governance_units_organization_id ON qarar_core.governance_units USING btree (organization_id)`

### `qarar_core.organizations`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `code` | `text` | no | `-` |
| 3 | `name_ar` | `text` | no | `-` |
| 4 | `name_en` | `text` | yes | `-` |
| 5 | `sector` | `text` | yes | `-` |
| 6 | `status` | `text` | no | `'active'::text` |
| 7 | `default_language` | `text` | no | `'ar'::text` |
| 8 | `timezone` | `text` | no | `'Asia/Riyadh'::text` |
| 9 | `created_at` | `timestamp with time zone` | no | `now()` |
| 10 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `organizations_default_language_check` (check): `CHECK (default_language = ANY (ARRAY['ar'::text, 'en'::text]))`
- `organizations_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))`
- `organizations_pkey` (primary_key): `PRIMARY KEY (id)`
- `organizations_code_key` (unique): `UNIQUE (code)`

**Indexes**
- `organizations_code_key`: `CREATE UNIQUE INDEX organizations_code_key ON qarar_core.organizations USING btree (code)`
- `organizations_pkey`: `CREATE UNIQUE INDEX organizations_pkey ON qarar_core.organizations USING btree (id)`

### `qarar_decisions.decision_notes`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `decision_id` | `uuid` | no | `-` |
| 4 | `note_type` | `text` | no | `'general'::text` |
| 5 | `note_text` | `text` | no | `-` |
| 6 | `created_by_user_id` | `uuid` | no | `-` |
| 7 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `decision_notes_note_type_check` (check): `CHECK (note_type = ANY (ARRAY['general'::text, 'reservation'::text, 'clarification'::text]))`
- `decision_notes_created_by_user_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `decision_notes_created_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `decision_notes_decision_id_fkey` (foreign_key): `FOREIGN KEY (decision_id) REFERENCES qarar_decisions.decisions(id) ON DELETE RESTRICT`
- `decision_notes_decision_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (decision_id, organization_id) REFERENCES qarar_decisions.decisions(id, organization_id)`
- `decision_notes_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `decision_notes_pkey` (primary_key): `PRIMARY KEY (id)`
- `decision_notes_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `decision_notes_id_organization_id_key`: `CREATE UNIQUE INDEX decision_notes_id_organization_id_key ON qarar_decisions.decision_notes USING btree (id, organization_id)`
- `decision_notes_pkey`: `CREATE UNIQUE INDEX decision_notes_pkey ON qarar_decisions.decision_notes USING btree (id)`

### `qarar_decisions.decision_status_history`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `decision_id` | `uuid` | no | `-` |
| 4 | `from_status` | `text` | yes | `-` |
| 5 | `to_status` | `text` | no | `-` |
| 6 | `changed_by_user_id` | `uuid` | yes | `-` |
| 7 | `changed_at` | `timestamp with time zone` | no | `now()` |
| 8 | `reason` | `text` | yes | `-` |

**Constraints and relationships**
- `decision_status_history_changed_by_user_id_fkey` (foreign_key): `FOREIGN KEY (changed_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `decision_status_history_changed_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (changed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `decision_status_history_decision_id_fkey` (foreign_key): `FOREIGN KEY (decision_id) REFERENCES qarar_decisions.decisions(id) ON DELETE RESTRICT`
- `decision_status_history_decision_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (decision_id, organization_id) REFERENCES qarar_decisions.decisions(id, organization_id)`
- `decision_status_history_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `decision_status_history_pkey` (primary_key): `PRIMARY KEY (id)`
- `decision_status_history_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `decision_status_history_id_organization_id_key`: `CREATE UNIQUE INDEX decision_status_history_id_organization_id_key ON qarar_decisions.decision_status_history USING btree (id, organization_id)`
- `decision_status_history_pkey`: `CREATE UNIQUE INDEX decision_status_history_pkey ON qarar_decisions.decision_status_history USING btree (id)`

### `qarar_decisions.decision_types`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `code` | `text` | no | `-` |
| 4 | `name_ar` | `text` | no | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `produces_action_item` | `boolean` | no | `false` |
| 8 | `is_active` | `boolean` | no | `true` |
| 9 | `created_at` | `timestamp with time zone` | no | `now()` |
| 10 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `decision_types_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `decision_types_pkey` (primary_key): `PRIMARY KEY (id)`
- `decision_types_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `decision_types_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `decision_types_id_organization_id_key`: `CREATE UNIQUE INDEX decision_types_id_organization_id_key ON qarar_decisions.decision_types USING btree (id, organization_id)`
- `decision_types_organization_id_code_key`: `CREATE UNIQUE INDEX decision_types_organization_id_code_key ON qarar_decisions.decision_types USING btree (organization_id, code)`
- `decision_types_pkey`: `CREATE UNIQUE INDEX decision_types_pkey ON qarar_decisions.decision_types USING btree (id)`

### `qarar_decisions.decisions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `decision_no` | `text` | no | `-` |
| 4 | `topic_id` | `uuid` | no | `-` |
| 5 | `meeting_id` | `uuid` | yes | `-` |
| 6 | `agenda_item_id` | `uuid` | yes | `-` |
| 7 | `governance_unit_id` | `uuid` | no | `-` |
| 8 | `decision_type_id` | `uuid` | yes | `-` |
| 9 | `decision_text` | `text` | no | `-` |
| 10 | `decision_status` | `text` | no | `'draft'::text` |
| 11 | `issued_at` | `timestamp with time zone` | yes | `-` |
| 12 | `issued_by_user_id` | `uuid` | no | `-` |
| 13 | `requires_approval` | `boolean` | no | `true` |
| 14 | `created_at` | `timestamp with time zone` | no | `now()` |
| 15 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `decisions_decision_status_check` (check): `CHECK (decision_status = ANY (ARRAY['draft'::text, 'under_review'::text, 'ready_for_approval'::text, 'approved'::text, 'sent_to_execution'::text, 'under_follow_up'::text, 'closed'::text, 'cancelled'::text, 'rejected'::text]))`
- `decisions_agenda_item_id_fkey` (foreign_key): `FOREIGN KEY (agenda_item_id) REFERENCES qarar_meetings.agenda_items(id) ON DELETE RESTRICT`
- `decisions_agenda_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (agenda_item_id, organization_id) REFERENCES qarar_meetings.agenda_items(id, organization_id)`
- `decisions_decision_type_id_fkey` (foreign_key): `FOREIGN KEY (decision_type_id) REFERENCES qarar_decisions.decision_types(id) ON DELETE RESTRICT`
- `decisions_decision_type_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (decision_type_id, organization_id) REFERENCES qarar_decisions.decision_types(id, organization_id)`
- `decisions_governance_unit_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `decisions_governance_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `decisions_issued_by_user_id_fkey` (foreign_key): `FOREIGN KEY (issued_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `decisions_issued_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (issued_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `decisions_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `decisions_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `decisions_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `decisions_topic_id_fkey` (foreign_key): `FOREIGN KEY (topic_id) REFERENCES qarar_topics.topics(id) ON DELETE RESTRICT`
- `decisions_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id)`
- `decisions_pkey` (primary_key): `PRIMARY KEY (id)`
- `decisions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `decisions_organization_id_decision_no_key` (unique): `UNIQUE (organization_id, decision_no)`

**Indexes**
- `decisions_id_organization_id_key`: `CREATE UNIQUE INDEX decisions_id_organization_id_key ON qarar_decisions.decisions USING btree (id, organization_id)`
- `decisions_one_per_agenda_item_idx`: `CREATE UNIQUE INDEX decisions_one_per_agenda_item_idx ON qarar_decisions.decisions USING btree (organization_id, agenda_item_id) WHERE (agenda_item_id IS NOT NULL)`
- `decisions_organization_id_decision_no_key`: `CREATE UNIQUE INDEX decisions_organization_id_decision_no_key ON qarar_decisions.decisions USING btree (organization_id, decision_no)`
- `decisions_pkey`: `CREATE UNIQUE INDEX decisions_pkey ON qarar_decisions.decisions USING btree (id)`
- `idx_decisions_org_topic`: `CREATE INDEX idx_decisions_org_topic ON qarar_decisions.decisions USING btree (organization_id, topic_id)`

### `qarar_execution.action_evidence`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `action_item_id` | `uuid` | no | `-` |
| 4 | `evidence_type` | `text` | no | `'document'::text` |
| 5 | `description` | `text` | no | `-` |
| 6 | `file_name` | `text` | yes | `-` |
| 7 | `storage_path` | `text` | yes | `-` |
| 8 | `uploaded_by_user_id` | `uuid` | no | `-` |
| 9 | `uploaded_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `action_evidence_evidence_type_check` (check): `CHECK (evidence_type = ANY (ARRAY['document'::text, 'link'::text, 'note'::text]))`
- `action_evidence_action_item_id_fkey` (foreign_key): `FOREIGN KEY (action_item_id) REFERENCES qarar_execution.action_items(id) ON DELETE RESTRICT`
- `action_evidence_action_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (action_item_id, organization_id) REFERENCES qarar_execution.action_items(id, organization_id)`
- `action_evidence_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `action_evidence_uploaded_by_user_id_fkey` (foreign_key): `FOREIGN KEY (uploaded_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `action_evidence_uploaded_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (uploaded_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `action_evidence_pkey` (primary_key): `PRIMARY KEY (id)`
- `action_evidence_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `action_evidence_id_organization_id_key`: `CREATE UNIQUE INDEX action_evidence_id_organization_id_key ON qarar_execution.action_evidence USING btree (id, organization_id)`
- `action_evidence_pkey`: `CREATE UNIQUE INDEX action_evidence_pkey ON qarar_execution.action_evidence USING btree (id)`

### `qarar_execution.action_items`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `action_no` | `text` | no | `-` |
| 4 | `decision_id` | `uuid` | no | `-` |
| 5 | `topic_id` | `uuid` | no | `-` |
| 6 | `assigned_unit_id` | `uuid` | yes | `-` |
| 7 | `assigned_user_id` | `uuid` | yes | `-` |
| 8 | `follow_up_user_id` | `uuid` | yes | `-` |
| 9 | `title_ar` | `text` | no | `-` |
| 10 | `title_en` | `text` | yes | `-` |
| 11 | `description` | `text` | yes | `-` |
| 12 | `status` | `text` | no | `'new'::text` |
| 13 | `progress_percent` | `integer` | no | `0` |
| 14 | `priority` | `text` | no | `'medium'::text` |
| 15 | `due_date` | `date` | yes | `-` |
| 16 | `started_at` | `timestamp with time zone` | yes | `-` |
| 17 | `completed_at` | `timestamp with time zone` | yes | `-` |
| 18 | `created_at` | `timestamp with time zone` | no | `now()` |
| 19 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `action_items_check` (check): `CHECK (assigned_unit_id IS NOT NULL OR assigned_user_id IS NOT NULL)`
- `action_items_priority_check` (check): `CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))`
- `action_items_progress_percent_check` (check): `CHECK (progress_percent >= 0 AND progress_percent <= 100)`
- `action_items_status_check` (check): `CHECK (status = ANY (ARRAY['new'::text, 'in_progress'::text, 'completed'::text, 'overdue'::text, 'cancelled'::text, 'closed'::text]))`
- `action_items_assigned_unit_id_fkey` (foreign_key): `FOREIGN KEY (assigned_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `action_items_assigned_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (assigned_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `action_items_assigned_user_id_fkey` (foreign_key): `FOREIGN KEY (assigned_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `action_items_assigned_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (assigned_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `action_items_decision_id_fkey` (foreign_key): `FOREIGN KEY (decision_id) REFERENCES qarar_decisions.decisions(id) ON DELETE RESTRICT`
- `action_items_decision_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (decision_id, organization_id) REFERENCES qarar_decisions.decisions(id, organization_id)`
- `action_items_follow_up_user_id_fkey` (foreign_key): `FOREIGN KEY (follow_up_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `action_items_follow_up_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (follow_up_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `action_items_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `action_items_topic_id_fkey` (foreign_key): `FOREIGN KEY (topic_id) REFERENCES qarar_topics.topics(id) ON DELETE RESTRICT`
- `action_items_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id)`
- `action_items_pkey` (primary_key): `PRIMARY KEY (id)`
- `action_items_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `action_items_organization_id_action_no_key` (unique): `UNIQUE (organization_id, action_no)`

**Indexes**
- `action_items_id_organization_id_key`: `CREATE UNIQUE INDEX action_items_id_organization_id_key ON qarar_execution.action_items USING btree (id, organization_id)`
- `action_items_organization_id_action_no_key`: `CREATE UNIQUE INDEX action_items_organization_id_action_no_key ON qarar_execution.action_items USING btree (organization_id, action_no)`
- `action_items_pkey`: `CREATE UNIQUE INDEX action_items_pkey ON qarar_execution.action_items USING btree (id)`
- `idx_action_items_org_decision`: `CREATE INDEX idx_action_items_org_decision ON qarar_execution.action_items USING btree (organization_id, decision_id)`

### `qarar_execution.escalations`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `action_item_id` | `uuid` | no | `-` |
| 4 | `escalation_level` | `integer` | no | `1` |
| 5 | `escalation_reason` | `text` | no | `-` |
| 6 | `escalated_to_user_id` | `uuid` | yes | `-` |
| 7 | `escalated_to_unit_id` | `uuid` | yes | `-` |
| 8 | `status` | `text` | no | `'active'::text` |
| 9 | `escalated_at` | `timestamp with time zone` | no | `now()` |
| 10 | `closed_at` | `timestamp with time zone` | yes | `-` |

**Constraints and relationships**
- `escalations_escalation_level_check` (check): `CHECK (escalation_level > 0)`
- `escalations_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'resolved'::text, 'closed'::text]))`
- `escalations_action_item_id_fkey` (foreign_key): `FOREIGN KEY (action_item_id) REFERENCES qarar_execution.action_items(id) ON DELETE RESTRICT`
- `escalations_action_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (action_item_id, organization_id) REFERENCES qarar_execution.action_items(id, organization_id)`
- `escalations_escalated_to_unit_id_fkey` (foreign_key): `FOREIGN KEY (escalated_to_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `escalations_escalated_to_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (escalated_to_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `escalations_escalated_to_user_id_fkey` (foreign_key): `FOREIGN KEY (escalated_to_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `escalations_escalated_to_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (escalated_to_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `escalations_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `escalations_pkey` (primary_key): `PRIMARY KEY (id)`
- `escalations_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `escalations_id_organization_id_key`: `CREATE UNIQUE INDEX escalations_id_organization_id_key ON qarar_execution.escalations USING btree (id, organization_id)`
- `escalations_pkey`: `CREATE UNIQUE INDEX escalations_pkey ON qarar_execution.escalations USING btree (id)`

### `qarar_execution.follow_up_records`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `action_item_id` | `uuid` | no | `-` |
| 4 | `follow_up_type` | `text` | no | `'status_update'::text` |
| 5 | `follow_up_note` | `text` | no | `-` |
| 6 | `status_snapshot` | `text` | yes | `-` |
| 7 | `progress_snapshot` | `integer` | yes | `-` |
| 8 | `recorded_by_user_id` | `uuid` | no | `-` |
| 9 | `recorded_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `follow_up_records_follow_up_type_check` (check): `CHECK (follow_up_type = ANY (ARRAY['status_update'::text, 'reminder'::text, 'warning'::text]))`
- `follow_up_records_action_item_id_fkey` (foreign_key): `FOREIGN KEY (action_item_id) REFERENCES qarar_execution.action_items(id) ON DELETE RESTRICT`
- `follow_up_records_action_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (action_item_id, organization_id) REFERENCES qarar_execution.action_items(id, organization_id)`
- `follow_up_records_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `follow_up_records_recorded_by_user_id_fkey` (foreign_key): `FOREIGN KEY (recorded_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `follow_up_records_recorded_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (recorded_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `follow_up_records_pkey` (primary_key): `PRIMARY KEY (id)`
- `follow_up_records_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `follow_up_records_id_organization_id_key`: `CREATE UNIQUE INDEX follow_up_records_id_organization_id_key ON qarar_execution.follow_up_records USING btree (id, organization_id)`
- `follow_up_records_pkey`: `CREATE UNIQUE INDEX follow_up_records_pkey ON qarar_execution.follow_up_records USING btree (id)`

### `qarar_governance.governance_alerts`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | yes | `-` |
| 4 | `compliance_event_id` | `uuid` | yes | `-` |
| 5 | `alert_type` | `text` | no | `-` |
| 6 | `severity` | `text` | no | `-` |
| 7 | `title_ar` | `text` | no | `-` |
| 8 | `details` | `jsonb` | no | `'{}'::jsonb` |
| 9 | `status` | `text` | no | `'open'::text` |
| 10 | `assigned_to_user_id` | `uuid` | yes | `-` |
| 11 | `acknowledged_by_user_id` | `uuid` | yes | `-` |
| 12 | `acknowledged_at` | `timestamp with time zone` | yes | `-` |
| 13 | `resolved_by_user_id` | `uuid` | yes | `-` |
| 14 | `resolved_at` | `timestamp with time zone` | yes | `-` |
| 15 | `created_at` | `timestamp with time zone` | no | `now()` |
| 16 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `governance_alerts_details_check` (check): `CHECK (jsonb_typeof(details) = 'object'::text)`
- `governance_alerts_severity_check` (check): `CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text]))`
- `governance_alerts_status_check` (check): `CHECK (status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text, 'dismissed'::text]))`
- `governance_alerts_acknowledged_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (acknowledged_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `governance_alerts_assigned_to_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (assigned_to_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `governance_alerts_compliance_event_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (compliance_event_id, organization_id) REFERENCES qarar_governance.governance_compliance_events(id, organization_id) ON DELETE RESTRICT`
- `governance_alerts_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `governance_alerts_resolved_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (resolved_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `governance_alerts_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id) ON DELETE RESTRICT`
- `governance_alerts_pkey` (primary_key): `PRIMARY KEY (id)`
- `governance_alerts_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `governance_alerts_id_organization_id_key`: `CREATE UNIQUE INDEX governance_alerts_id_organization_id_key ON qarar_governance.governance_alerts USING btree (id, organization_id)`
- `governance_alerts_pkey`: `CREATE UNIQUE INDEX governance_alerts_pkey ON qarar_governance.governance_alerts USING btree (id)`

### `qarar_governance.governance_compliance_events`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | yes | `-` |
| 4 | `workflow_instance_id` | `uuid` | yes | `-` |
| 5 | `event_type` | `text` | no | `-` |
| 6 | `severity` | `text` | no | `-` |
| 7 | `result` | `text` | no | `-` |
| 8 | `details` | `jsonb` | no | `'{}'::jsonb` |
| 9 | `actor_user_id` | `uuid` | yes | `-` |
| 10 | `occurred_at` | `timestamp with time zone` | no | `now()` |
| 11 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `governance_compliance_events_details_check` (check): `CHECK (jsonb_typeof(details) = 'object'::text)`
- `governance_compliance_events_result_check` (check): `CHECK (result = ANY (ARRAY['allowed'::text, 'denied'::text, 'pending'::text, 'resolved'::text]))`
- `governance_compliance_events_severity_check` (check): `CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text]))`
- `governance_compliance_events_actor_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (actor_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `governance_compliance_events_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `governance_compliance_events_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id) ON DELETE RESTRICT`
- `governance_compliance_events_workflow_instance_id_organiza_fkey` (foreign_key): `FOREIGN KEY (workflow_instance_id, organization_id) REFERENCES qarar_governance.workflow_instances(id, organization_id) ON DELETE RESTRICT`
- `governance_compliance_events_pkey` (primary_key): `PRIMARY KEY (id)`
- `governance_compliance_events_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `governance_compliance_events_id_organization_id_key`: `CREATE UNIQUE INDEX governance_compliance_events_id_organization_id_key ON qarar_governance.governance_compliance_events USING btree (id, organization_id)`
- `governance_compliance_events_pkey`: `CREATE UNIQUE INDEX governance_compliance_events_pkey ON qarar_governance.governance_compliance_events USING btree (id)`

### `qarar_governance.governance_exceptions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | no | `-` |
| 4 | `requested_source` | `text` | no | `-` |
| 5 | `requested_route` | `jsonb` | no | `-` |
| 6 | `reason` | `text` | no | `-` |
| 7 | `status` | `text` | no | `'pending'::text` |
| 8 | `requested_by_user_id` | `uuid` | no | `-` |
| 9 | `requested_at` | `timestamp with time zone` | no | `now()` |
| 10 | `reviewed_by_user_id` | `uuid` | yes | `-` |
| 11 | `reviewed_at` | `timestamp with time zone` | yes | `-` |
| 12 | `review_comment` | `text` | yes | `-` |
| 13 | `valid_until` | `timestamp with time zone` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | no | `now()` |
| 15 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `governance_exceptions_check` (check): `CHECK (reviewed_by_user_id IS NULL OR reviewed_by_user_id <> requested_by_user_id)`
- `governance_exceptions_check2` (check): `CHECK (valid_until IS NULL OR valid_until > requested_at)`
- `governance_exceptions_reason_check` (check): `CHECK (char_length(btrim(reason)) >= 10 AND char_length(btrim(reason)) <= 4000)`
- `governance_exceptions_requested_route_check` (check): `CHECK (jsonb_typeof(requested_route) = 'object'::text)`
- `governance_exceptions_requested_source_check` (check): `CHECK (requested_source = ANY (ARRAY['custom'::text, 'exception'::text]))`
- `governance_exceptions_review_check` (check): `CHECK ((status = ANY (ARRAY['pending'::text, 'expired'::text])) OR reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)`
- `governance_exceptions_status_check` (check): `CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'revoked'::text]))`
- `governance_exceptions_requested_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (requested_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `governance_exceptions_reviewed_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (reviewed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `governance_exceptions_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id) ON DELETE RESTRICT`
- `governance_exceptions_pkey` (primary_key): `PRIMARY KEY (id)`
- `governance_exceptions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `governance_exceptions_id_organization_id_key`: `CREATE UNIQUE INDEX governance_exceptions_id_organization_id_key ON qarar_governance.governance_exceptions USING btree (id, organization_id)`
- `governance_exceptions_pkey`: `CREATE UNIQUE INDEX governance_exceptions_pkey ON qarar_governance.governance_exceptions USING btree (id)`

### `qarar_governance.governance_unit_classes`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `code` | `text` | no | `-` |
| 4 | `name_ar` | `text` | no | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `governance_level` | `text` | no | `-` |
| 7 | `description` | `text` | yes | `-` |
| 8 | `is_active` | `boolean` | no | `true` |
| 9 | `created_at` | `timestamp with time zone` | no | `now()` |
| 10 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `governance_unit_classes_code_check` (check): `CHECK (code ~ '^[a-z][a-z0-9_]*$'::text)`
- `governance_unit_classes_governance_level_check` (check): `CHECK (governance_level = ANY (ARRAY['department'::text, 'faculty'::text, 'university'::text, 'committee'::text, 'executive'::text, 'other'::text]))`
- `governance_unit_classes_name_ar_check` (check): `CHECK (char_length(btrim(name_ar)) >= 2 AND char_length(btrim(name_ar)) <= 200)`
- `governance_unit_classes_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `governance_unit_classes_pkey` (primary_key): `PRIMARY KEY (id)`
- `governance_unit_classes_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `governance_unit_classes_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `governance_unit_classes_id_organization_id_key`: `CREATE UNIQUE INDEX governance_unit_classes_id_organization_id_key ON qarar_governance.governance_unit_classes USING btree (id, organization_id)`
- `governance_unit_classes_organization_id_code_key`: `CREATE UNIQUE INDEX governance_unit_classes_organization_id_code_key ON qarar_governance.governance_unit_classes USING btree (organization_id, code)`
- `governance_unit_classes_pkey`: `CREATE UNIQUE INDEX governance_unit_classes_pkey ON qarar_governance.governance_unit_classes USING btree (id)`

### `qarar_governance.notification_outbox`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `aggregate_type` | `text` | no | `-` |
| 4 | `aggregate_id` | `uuid` | no | `-` |
| 5 | `event_type` | `text` | no | `-` |
| 6 | `payload` | `jsonb` | no | `-` |
| 7 | `deduplication_key` | `text` | no | `-` |
| 8 | `status` | `text` | no | `'pending'::text` |
| 9 | `attempts` | `integer` | no | `0` |
| 10 | `available_at` | `timestamp with time zone` | no | `now()` |
| 11 | `locked_at` | `timestamp with time zone` | yes | `-` |
| 12 | `processed_at` | `timestamp with time zone` | yes | `-` |
| 13 | `last_error` | `text` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | no | `now()` |
| 15 | `lock_token` | `uuid` | yes | `-` |
| 16 | `locked_by_worker_id` | `uuid` | yes | `-` |
| 17 | `lease_expires_at` | `timestamp with time zone` | yes | `-` |
| 18 | `last_attempt_at` | `timestamp with time zone` | yes | `-` |
| 19 | `dead_lettered_at` | `timestamp with time zone` | yes | `-` |

**Constraints and relationships**
- `notification_outbox_attempts_check` (check): `CHECK (attempts >= 0)`
- `notification_outbox_payload_check` (check): `CHECK (jsonb_typeof(payload) = 'object'::text)`
- `notification_outbox_processing_lease_check` (check): `CHECK (status = 'processing'::text AND locked_at IS NOT NULL AND lock_token IS NOT NULL AND locked_by_worker_id IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_expires_at > locked_at OR status <> 'processing'::text AND locked_at IS NULL AND lock_token IS NULL AND locked_by_worker_id IS NULL AND lease_expires_at IS NULL)`
- `notification_outbox_status_check` (check): `CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'dead_letter'::text]))`
- `notification_outbox_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `notification_outbox_pkey` (primary_key): `PRIMARY KEY (id)`
- `notification_outbox_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `notification_outbox_organization_id_deduplication_key_key` (unique): `UNIQUE (organization_id, deduplication_key)`

**Indexes**
- `notification_outbox_dispatch_idx`: `CREATE INDEX notification_outbox_dispatch_idx ON qarar_governance.notification_outbox USING btree (available_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]))`
- `notification_outbox_id_organization_id_key`: `CREATE UNIQUE INDEX notification_outbox_id_organization_id_key ON qarar_governance.notification_outbox USING btree (id, organization_id)`
- `notification_outbox_lease_recovery_idx`: `CREATE INDEX notification_outbox_lease_recovery_idx ON qarar_governance.notification_outbox USING btree (lease_expires_at) WHERE (status = 'processing'::text)`
- `notification_outbox_organization_id_deduplication_key_key`: `CREATE UNIQUE INDEX notification_outbox_organization_id_deduplication_key_key ON qarar_governance.notification_outbox USING btree (organization_id, deduplication_key)`
- `notification_outbox_pkey`: `CREATE UNIQUE INDEX notification_outbox_pkey ON qarar_governance.notification_outbox USING btree (id)`

### `qarar_governance.policies`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `code` | `text` | no | `-` |
| 4 | `name_ar` | `text` | no | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `policy_type` | `text` | no | `'regulation'::text` |
| 7 | `description` | `text` | yes | `-` |
| 8 | `owner_user_id` | `uuid` | yes | `-` |
| 9 | `status` | `text` | no | `'active'::text` |
| 10 | `created_by_user_id` | `uuid` | no | `-` |
| 11 | `created_at` | `timestamp with time zone` | no | `now()` |
| 12 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 13 | `client_request_id` | `uuid` | yes | `-` |
| 14 | `owner_governance_unit_id` | `uuid` | yes | `-` |
| 15 | `legal_reference` | `text` | yes | `-` |
| 16 | `decision_number` | `text` | yes | `-` |

**Constraints and relationships**
- `policies_code_check` (check): `CHECK (code ~ '^[a-z][a-z0-9_.-]*$'::text)`
- `policies_name_ar_check` (check): `CHECK (char_length(btrim(name_ar)) >= 3 AND char_length(btrim(name_ar)) <= 300)`
- `policies_policy_type_check` (check): `CHECK (policy_type = ANY (ARRAY['regulation'::text, 'policy'::text, 'procedure'::text, 'framework'::text]))`
- `policies_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))`
- `policies_created_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policies_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `policies_owner_unit_tenant_fk` (foreign_key): `FOREIGN KEY (owner_governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id) ON DELETE RESTRICT`
- `policies_owner_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (owner_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policies_pkey` (primary_key): `PRIMARY KEY (id)`
- `policies_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `policies_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `policies_creation_idempotency_uidx`: `CREATE UNIQUE INDEX policies_creation_idempotency_uidx ON qarar_governance.policies USING btree (organization_id, created_by_user_id, client_request_id) WHERE (client_request_id IS NOT NULL)`
- `policies_id_organization_id_key`: `CREATE UNIQUE INDEX policies_id_organization_id_key ON qarar_governance.policies USING btree (id, organization_id)`
- `policies_organization_id_code_key`: `CREATE UNIQUE INDEX policies_organization_id_code_key ON qarar_governance.policies USING btree (organization_id, code)`
- `policies_pkey`: `CREATE UNIQUE INDEX policies_pkey ON qarar_governance.policies USING btree (id)`

### `qarar_governance.policy_attachments`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_id` | `uuid` | yes | `-` |
| 4 | `policy_version_id` | `uuid` | yes | `-` |
| 5 | `policy_item_id` | `uuid` | yes | `-` |
| 6 | `file_name` | `text` | no | `-` |
| 7 | `file_url` | `text` | no | `-` |
| 8 | `mime_type` | `text` | yes | `-` |
| 9 | `file_size_bytes` | `bigint` | yes | `-` |
| 10 | `description` | `text` | yes | `-` |
| 11 | `created_by_user_id` | `uuid` | no | `-` |
| 12 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `policy_attachments_check` (check): `CHECK (num_nonnulls(policy_id, policy_version_id, policy_item_id) = 1)`
- `policy_attachments_file_name_check` (check): `CHECK (char_length(btrim(file_name)) >= 1 AND char_length(btrim(file_name)) <= 255)`
- `policy_attachments_file_size_bytes_check` (check): `CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0)`
- `policy_attachments_file_url_check` (check): `CHECK (file_url ~ '^https?://'::text)`
- `policy_attachments_created_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_attachments_policy_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_id, organization_id) REFERENCES qarar_governance.policies(id, organization_id) ON DELETE RESTRICT`
- `policy_attachments_policy_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `policy_attachments_policy_version_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_version_id, organization_id) REFERENCES qarar_governance.policy_versions(id, organization_id) ON DELETE RESTRICT`
- `policy_attachments_pkey` (primary_key): `PRIMARY KEY (id)`
- `policy_attachments_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `policy_attachments_id_organization_id_key`: `CREATE UNIQUE INDEX policy_attachments_id_organization_id_key ON qarar_governance.policy_attachments USING btree (id, organization_id)`
- `policy_attachments_pkey`: `CREATE UNIQUE INDEX policy_attachments_pkey ON qarar_governance.policy_attachments USING btree (id)`

### `qarar_governance.policy_item_roles`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_item_id` | `uuid` | no | `-` |
| 4 | `sequence_no` | `integer` | no | `-` |
| 5 | `responsibility` | `text` | no | `-` |
| 6 | `governance_unit_id` | `uuid` | yes | `-` |
| 7 | `governance_class_id` | `uuid` | yes | `-` |
| 8 | `required_permission_code` | `text` | yes | `-` |
| 9 | `is_required` | `boolean` | no | `true` |
| 10 | `entry_conditions` | `jsonb` | no | `'{}'::jsonb` |
| 11 | `exit_conditions` | `jsonb` | no | `'{}'::jsonb` |
| 12 | `outcome_transition_map` | `jsonb` | no | `'{}'::jsonb` |
| 13 | `created_at` | `timestamp with time zone` | no | `now()` |
| 14 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `policy_item_roles_check` (check): `CHECK (governance_unit_id IS NOT NULL OR governance_class_id IS NOT NULL)`
- `policy_item_roles_check1` (check): `CHECK (NOT (governance_unit_id IS NOT NULL AND governance_class_id IS NOT NULL))`
- `policy_item_roles_entry_conditions_check` (check): `CHECK (jsonb_typeof(entry_conditions) = 'object'::text)`
- `policy_item_roles_exit_conditions_check` (check): `CHECK (jsonb_typeof(exit_conditions) = 'object'::text)`
- `policy_item_roles_outcome_transition_map_check` (check): `CHECK (jsonb_typeof(outcome_transition_map) = 'object'::text)`
- `policy_item_roles_responsibility_check` (check): `CHECK (responsibility = ANY (ARRAY['present'::text, 'review'::text, 'discuss'::text, 'recommend'::text, 'initial_approve'::text, 'final_approve'::text, 'execute'::text, 'follow_up'::text]))`
- `policy_item_roles_sequence_no_check` (check): `CHECK (sequence_no > 0)`
- `policy_item_roles_governance_class_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_class_id, organization_id) REFERENCES qarar_governance.governance_unit_classes(id, organization_id) ON DELETE RESTRICT`
- `policy_item_roles_governance_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id) ON DELETE RESTRICT`
- `policy_item_roles_organization_id_required_permission_code_fkey` (foreign_key): `FOREIGN KEY (organization_id, required_permission_code) REFERENCES qarar_iam.permissions(organization_id, code) ON DELETE RESTRICT`
- `policy_item_roles_policy_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `policy_item_roles_pkey` (primary_key): `PRIMARY KEY (id)`
- `policy_item_roles_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `policy_item_roles_policy_item_id_sequence_no_key` (unique): `UNIQUE (policy_item_id, sequence_no)`

**Indexes**
- `policy_item_roles_id_organization_id_key`: `CREATE UNIQUE INDEX policy_item_roles_id_organization_id_key ON qarar_governance.policy_item_roles USING btree (id, organization_id)`
- `policy_item_roles_pkey`: `CREATE UNIQUE INDEX policy_item_roles_pkey ON qarar_governance.policy_item_roles USING btree (id)`
- `policy_item_roles_policy_item_id_sequence_no_key`: `CREATE UNIQUE INDEX policy_item_roles_policy_item_id_sequence_no_key ON qarar_governance.policy_item_roles USING btree (policy_item_id, sequence_no)`

### `qarar_governance.policy_item_scope_overrides`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_item_id` | `uuid` | no | `-` |
| 4 | `scope_assignment_id` | `uuid` | no | `-` |
| 5 | `governance_unit_id` | `uuid` | no | `-` |
| 6 | `is_included` | `boolean` | no | `-` |
| 7 | `priority` | `integer` | no | `0` |
| 8 | `reason` | `text` | no | `-` |
| 9 | `valid_from` | `date` | yes | `-` |
| 10 | `valid_to` | `date` | yes | `-` |
| 11 | `created_by_user_id` | `uuid` | no | `-` |
| 12 | `created_at` | `timestamp with time zone` | no | `now()` |
| 13 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `policy_item_scope_overrides_check` (check): `CHECK (valid_to IS NULL OR valid_from IS NOT NULL)`
- `policy_item_scope_overrides_check1` (check): `CHECK (valid_to IS NULL OR valid_to >= valid_from)`
- `policy_item_scope_overrides_reason_check` (check): `CHECK (char_length(btrim(reason)) >= 5 AND char_length(btrim(reason)) <= 2000)`
- `policy_item_scope_overrides_created_by_user_id_organizatio_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_item_scope_overrides_governance_unit_id_organizatio_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id) ON DELETE RESTRICT`
- `policy_item_scope_overrides_policy_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `policy_item_scope_overrides_scope_assignment_id_organizati_fkey` (foreign_key): `FOREIGN KEY (scope_assignment_id, organization_id) REFERENCES qarar_governance.policy_scope_assignments(id, organization_id) ON DELETE RESTRICT`
- `policy_item_scope_overrides_pkey` (primary_key): `PRIMARY KEY (id)`
- `policy_item_scope_overrides_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `policy_item_scope_overrides_policy_item_id_scope_assignment_key` (unique): `UNIQUE (policy_item_id, scope_assignment_id, governance_unit_id, valid_from)`

**Indexes**
- `policy_item_scope_overrides_id_organization_id_key`: `CREATE UNIQUE INDEX policy_item_scope_overrides_id_organization_id_key ON qarar_governance.policy_item_scope_overrides USING btree (id, organization_id)`
- `policy_item_scope_overrides_pkey`: `CREATE UNIQUE INDEX policy_item_scope_overrides_pkey ON qarar_governance.policy_item_scope_overrides USING btree (id)`
- `policy_item_scope_overrides_policy_item_id_scope_assignment_key`: `CREATE UNIQUE INDEX policy_item_scope_overrides_policy_item_id_scope_assignment_key ON qarar_governance.policy_item_scope_overrides USING btree (policy_item_id, scope_assignment_id, governance_unit_id, valid_from)`

### `qarar_governance.policy_items`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_version_id` | `uuid` | no | `-` |
| 4 | `parent_item_id` | `uuid` | yes | `-` |
| 5 | `item_code` | `text` | no | `-` |
| 6 | `item_type` | `text` | no | `'article'::text` |
| 7 | `title_ar` | `text` | no | `-` |
| 8 | `title_en` | `text` | yes | `-` |
| 9 | `body_text` | `text` | yes | `-` |
| 10 | `sort_order` | `integer` | no | `-` |
| 11 | `governance_mode` | `text` | no | `'regulation_required'::text` |
| 12 | `topic_category_id` | `uuid` | yes | `-` |
| 13 | `match_criteria` | `jsonb` | no | `'{}'::jsonb` |
| 14 | `is_active` | `boolean` | no | `true` |
| 15 | `created_at` | `timestamp with time zone` | no | `now()` |
| 16 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 17 | `workflow_template_version_id` | `uuid` | yes | `-` |
| 18 | `official_text` | `text` | yes | `-` |
| 19 | `interpretation_text` | `text` | yes | `-` |
| 20 | `source_page_from` | `integer` | yes | `-` |
| 21 | `source_page_to` | `integer` | yes | `-` |
| 22 | `source_locator` | `text` | yes | `-` |
| 23 | `legal_status` | `text` | no | `'active'::text` |
| 24 | `amendment_note` | `text` | yes | `-` |
| 25 | `requires_executable_rule` | `boolean` | no | `false` |
| 26 | `supersedes_item_id` | `uuid` | yes | `-` |

**Constraints and relationships**
- `policy_items_check` (check): `CHECK (parent_item_id IS NULL OR parent_item_id <> id)`
- `policy_items_governance_mode_check` (check): `CHECK (governance_mode = ANY (ARRAY['regulation_required'::text, 'regulated_fallback_allowed'::text, 'custom_route_allowed'::text]))`
- `policy_items_item_code_check` (check): `CHECK (item_code ~ '^[A-Za-z0-9_.-]+$'::text)`
- `policy_items_item_type_check` (check): `CHECK (item_type = ANY (ARRAY['chapter'::text, 'section'::text, 'article'::text, 'clause'::text, 'procedure'::text]))`
- `policy_items_legal_status_check` (check): `CHECK (legal_status = ANY (ARRAY['active'::text, 'amended'::text, 'repealed'::text, 'suspended'::text]))`
- `policy_items_match_criteria_check` (check): `CHECK (jsonb_typeof(match_criteria) = 'object'::text)`
- `policy_items_page_range_check` (check): `CHECK (source_page_from IS NULL OR source_page_from > 0 AND (source_page_to IS NULL OR source_page_to >= source_page_from))`
- `policy_items_sort_order_check` (check): `CHECK (sort_order > 0)`
- `policy_items_title_ar_check` (check): `CHECK (char_length(btrim(title_ar)) >= 2 AND char_length(btrim(title_ar)) <= 500)`
- `policy_items_parent_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (parent_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `policy_items_policy_version_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_version_id, organization_id) REFERENCES qarar_governance.policy_versions(id, organization_id) ON DELETE RESTRICT`
- `policy_items_supersedes_fk` (foreign_key): `FOREIGN KEY (supersedes_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `policy_items_topic_category_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_category_id, organization_id) REFERENCES qarar_topics.topic_categories(id, organization_id) ON DELETE RESTRICT`
- `policy_items_workflow_version_tenant_fk` (foreign_key): `FOREIGN KEY (workflow_template_version_id, organization_id) REFERENCES qarar_governance.workflow_template_versions(id, organization_id) ON DELETE RESTRICT`
- `policy_items_pkey` (primary_key): `PRIMARY KEY (id)`
- `policy_items_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `policy_items_policy_version_id_item_code_key` (unique): `UNIQUE (policy_version_id, item_code)`
- `policy_items_policy_version_id_sort_order_key` (unique): `UNIQUE (policy_version_id, sort_order)`

**Indexes**
- `policy_items_id_organization_id_key`: `CREATE UNIQUE INDEX policy_items_id_organization_id_key ON qarar_governance.policy_items USING btree (id, organization_id)`
- `policy_items_pkey`: `CREATE UNIQUE INDEX policy_items_pkey ON qarar_governance.policy_items USING btree (id)`
- `policy_items_policy_version_id_item_code_key`: `CREATE UNIQUE INDEX policy_items_policy_version_id_item_code_key ON qarar_governance.policy_items USING btree (policy_version_id, item_code)`
- `policy_items_policy_version_id_sort_order_key`: `CREATE UNIQUE INDEX policy_items_policy_version_id_sort_order_key ON qarar_governance.policy_items USING btree (policy_version_id, sort_order)`

### `qarar_governance.policy_references`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `source_policy_item_id` | `uuid` | no | `-` |
| 4 | `target_policy_id` | `uuid` | yes | `-` |
| 5 | `target_policy_version_id` | `uuid` | yes | `-` |
| 6 | `target_policy_item_id` | `uuid` | yes | `-` |
| 7 | `external_reference` | `text` | yes | `-` |
| 8 | `reference_type` | `text` | no | `-` |
| 9 | `citation_text` | `text` | yes | `-` |
| 10 | `notes` | `text` | yes | `-` |
| 11 | `created_by_user_id` | `uuid` | no | `-` |
| 12 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `policy_references_check` (check): `CHECK (target_policy_id IS NOT NULL OR target_policy_version_id IS NOT NULL OR target_policy_item_id IS NOT NULL OR NULLIF(btrim(external_reference), ''::text) IS NOT NULL)`
- `policy_references_reference_type_check` (check): `CHECK (reference_type = ANY (ARRAY['implements'::text, 'amends'::text, 'repeals'::text, 'supersedes'::text, 'interprets'::text, 'exception_to'::text, 'related_to'::text, 'based_on'::text]))`
- `policy_references_created_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_references_source_policy_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (source_policy_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE CASCADE`
- `policy_references_target_policy_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (target_policy_id, organization_id) REFERENCES qarar_governance.policies(id, organization_id) ON DELETE RESTRICT`
- `policy_references_target_policy_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (target_policy_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `policy_references_target_policy_version_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (target_policy_version_id, organization_id) REFERENCES qarar_governance.policy_versions(id, organization_id) ON DELETE RESTRICT`
- `policy_references_pkey` (primary_key): `PRIMARY KEY (id)`
- `policy_references_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `policy_references_id_organization_id_key`: `CREATE UNIQUE INDEX policy_references_id_organization_id_key ON qarar_governance.policy_references USING btree (id, organization_id)`
- `policy_references_pkey`: `CREATE UNIQUE INDEX policy_references_pkey ON qarar_governance.policy_references USING btree (id)`

### `qarar_governance.policy_rules`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_item_id` | `uuid` | no | `-` |
| 4 | `rule_code` | `text` | no | `-` |
| 5 | `name_ar` | `text` | no | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `rule_type` | `text` | no | `-` |
| 8 | `status` | `text` | no | `'draft'::text` |
| 9 | `priority` | `integer` | no | `100` |
| 10 | `applies_when` | `jsonb` | no | `'{}'::jsonb` |
| 11 | `effect_payload` | `jsonb` | no | `'{}'::jsonb` |
| 12 | `requires_workflow` | `boolean` | no | `false` |
| 13 | `valid_from` | `date` | yes | `-` |
| 14 | `valid_to` | `date` | yes | `-` |
| 15 | `created_by_user_id` | `uuid` | no | `-` |
| 16 | `created_at` | `timestamp with time zone` | no | `now()` |
| 17 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `policy_rules_check` (check): `CHECK (jsonb_typeof(applies_when) = 'object'::text AND jsonb_typeof(effect_payload) = 'object'::text)`
- `policy_rules_check1` (check): `CHECK (valid_to IS NULL OR valid_from IS NOT NULL AND valid_to >= valid_from)`
- `policy_rules_name_ar_check` (check): `CHECK (char_length(btrim(name_ar)) >= 2 AND char_length(btrim(name_ar)) <= 300)`
- `policy_rules_priority_check` (check): `CHECK (priority >= 0 AND priority <= 10000)`
- `policy_rules_rule_code_check` (check): `CHECK (rule_code ~ '^[a-z][a-z0-9_.-]*$'::text)`
- `policy_rules_rule_type_check` (check): `CHECK (rule_type = ANY (ARRAY['eligibility'::text, 'prohibition'::text, 'requirement'::text, 'authority'::text, 'deadline'::text, 'calculation'::text, 'routing'::text, 'exception'::text, 'informational'::text]))`
- `policy_rules_status_check` (check): `CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'retired'::text]))`
- `policy_rules_created_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_rules_policy_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `policy_rules_pkey` (primary_key): `PRIMARY KEY (id)`
- `policy_rules_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `policy_rules_policy_item_id_rule_code_key` (unique): `UNIQUE (policy_item_id, rule_code)`

**Indexes**
- `policy_rules_id_organization_id_key`: `CREATE UNIQUE INDEX policy_rules_id_organization_id_key ON qarar_governance.policy_rules USING btree (id, organization_id)`
- `policy_rules_pkey`: `CREATE UNIQUE INDEX policy_rules_pkey ON qarar_governance.policy_rules USING btree (id)`
- `policy_rules_policy_item_id_rule_code_key`: `CREATE UNIQUE INDEX policy_rules_policy_item_id_rule_code_key ON qarar_governance.policy_rules USING btree (policy_item_id, rule_code)`

### `qarar_governance.policy_scope_assignments`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_version_id` | `uuid` | no | `-` |
| 4 | `scope_type` | `text` | no | `-` |
| 5 | `governance_unit_type_id` | `uuid` | yes | `-` |
| 6 | `governance_class_id` | `uuid` | yes | `-` |
| 7 | `governance_level` | `text` | yes | `-` |
| 8 | `governance_unit_id` | `uuid` | yes | `-` |
| 9 | `include_descendants` | `boolean` | no | `false` |
| 10 | `priority` | `integer` | no | `0` |
| 11 | `valid_from` | `date` | yes | `-` |
| 12 | `valid_to` | `date` | yes | `-` |
| 13 | `is_active` | `boolean` | no | `true` |
| 14 | `created_by_user_id` | `uuid` | no | `-` |
| 15 | `created_at` | `timestamp with time zone` | no | `now()` |
| 16 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `policy_scope_assignments_check` (check): `CHECK (valid_to IS NULL OR valid_from IS NOT NULL)`
- `policy_scope_assignments_check1` (check): `CHECK (valid_to IS NULL OR valid_to >= valid_from)`
- `policy_scope_assignments_check2` (check): `CHECK (scope_type = 'organization'::text AND governance_unit_type_id IS NULL AND governance_class_id IS NULL AND governance_level IS NULL AND governance_unit_id IS NULL OR scope_type = 'governance_unit_type'::text AND governance_unit_type_id IS NOT NULL AND governance_class_id IS NULL AND governance_level IS NULL AND governance_unit_id IS NULL OR scope_type = 'governance_level'::text AND governance_unit_type_id IS NULL AND governance_class_id IS NULL AND governance_level IS NOT NULL AND governance_unit_id IS NULL OR scope_type = 'governance_class'::text AND governance_unit_type_id IS NULL AND governance_class_id IS NOT NULL AND governance_level IS NULL AND governance_unit_id IS NULL OR (scope_type = ANY (ARRAY['governance_unit'::text, 'unit_subtree'::text])) AND governance_unit_type_id IS NULL AND governance_class_id IS NULL AND governance_level IS NULL AND governance_unit_id IS NOT NULL)`
- `policy_scope_assignments_check3` (check): `CHECK (scope_type = 'unit_subtree'::text OR NOT include_descendants)`
- `policy_scope_assignments_governance_level_check` (check): `CHECK (governance_level IS NULL OR (governance_level = ANY (ARRAY['department'::text, 'faculty'::text, 'university'::text, 'committee'::text, 'executive'::text, 'other'::text])))`
- `policy_scope_assignments_scope_type_check` (check): `CHECK (scope_type = ANY (ARRAY['organization'::text, 'governance_unit_type'::text, 'governance_level'::text, 'governance_class'::text, 'governance_unit'::text, 'unit_subtree'::text]))`
- `policy_scope_assignments_created_by_user_id_organization_i_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_scope_assignments_governance_class_id_organization__fkey` (foreign_key): `FOREIGN KEY (governance_class_id, organization_id) REFERENCES qarar_governance.governance_unit_classes(id, organization_id) ON DELETE RESTRICT`
- `policy_scope_assignments_governance_unit_id_organization_i_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id) ON DELETE RESTRICT`
- `policy_scope_assignments_governance_unit_type_id_organizat_fkey` (foreign_key): `FOREIGN KEY (governance_unit_type_id, organization_id) REFERENCES qarar_core.governance_unit_types(id, organization_id) ON DELETE RESTRICT`
- `policy_scope_assignments_policy_version_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_version_id, organization_id) REFERENCES qarar_governance.policy_versions(id, organization_id) ON DELETE RESTRICT`
- `policy_scope_assignments_pkey` (primary_key): `PRIMARY KEY (id)`
- `policy_scope_assignments_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `policy_scope_assignment_identity_uidx`: `CREATE UNIQUE INDEX policy_scope_assignment_identity_uidx ON qarar_governance.policy_scope_assignments USING btree (policy_version_id, scope_type, COALESCE(governance_unit_type_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(governance_class_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(governance_level, ''::text), COALESCE(governance_unit_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(valid_from, '-infinity'::date)) WHERE is_active`
- `policy_scope_assignments_id_organization_id_key`: `CREATE UNIQUE INDEX policy_scope_assignments_id_organization_id_key ON qarar_governance.policy_scope_assignments USING btree (id, organization_id)`
- `policy_scope_assignments_pkey`: `CREATE UNIQUE INDEX policy_scope_assignments_pkey ON qarar_governance.policy_scope_assignments USING btree (id)`

### `qarar_governance.policy_versions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_id` | `uuid` | no | `-` |
| 4 | `version_no` | `integer` | no | `-` |
| 5 | `version_label` | `text` | yes | `-` |
| 6 | `legal_status` | `text` | no | `'draft'::text` |
| 7 | `automation_status` | `text` | no | `'not_configured'::text` |
| 8 | `effective_from` | `date` | yes | `-` |
| 9 | `effective_to` | `date` | yes | `-` |
| 10 | `readiness_percent` | `integer` | no | `0` |
| 11 | `change_summary` | `text` | yes | `-` |
| 12 | `submitted_by_user_id` | `uuid` | yes | `-` |
| 13 | `submitted_at` | `timestamp with time zone` | yes | `-` |
| 14 | `approved_by_user_id` | `uuid` | yes | `-` |
| 15 | `approved_at` | `timestamp with time zone` | yes | `-` |
| 16 | `activated_by_user_id` | `uuid` | yes | `-` |
| 17 | `activated_at` | `timestamp with time zone` | yes | `-` |
| 18 | `suspended_by_user_id` | `uuid` | yes | `-` |
| 19 | `suspended_at` | `timestamp with time zone` | yes | `-` |
| 20 | `suspension_reason` | `text` | yes | `-` |
| 21 | `created_by_user_id` | `uuid` | no | `-` |
| 22 | `created_at` | `timestamp with time zone` | no | `now()` |
| 23 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 24 | `issuing_authority` | `text` | yes | `-` |
| 25 | `approval_authority` | `text` | yes | `-` |
| 26 | `approval_decision_number` | `text` | yes | `-` |
| 27 | `approval_date` | `date` | yes | `-` |
| 28 | `issue_reason` | `text` | yes | `-` |
| 29 | `supersedes_version_id` | `uuid` | yes | `-` |
| 30 | `source_document_hash` | `text` | yes | `-` |

**Constraints and relationships**
- `policy_versions_automation_status_check` (check): `CHECK (automation_status = ANY (ARRAY['not_configured'::text, 'mapping_in_progress'::text, 'validation_pending'::text, 'partially_ready'::text, 'ready'::text, 'blocked'::text]))`
- `policy_versions_check` (check): `CHECK (effective_to IS NULL OR effective_from IS NOT NULL)`
- `policy_versions_check1` (check): `CHECK (effective_to IS NULL OR effective_to >= effective_from)`
- `policy_versions_check2` (check): `CHECK (legal_status <> 'effective'::text OR effective_from IS NOT NULL AND approved_by_user_id IS NOT NULL)`
- `policy_versions_check3` (check): `CHECK (automation_status <> 'ready'::text OR readiness_percent = 100)`
- `policy_versions_legal_status_check` (check): `CHECK (legal_status = ANY (ARRAY['draft'::text, 'under_review'::text, 'approved'::text, 'effective'::text, 'suspended'::text, 'expired'::text, 'archived'::text]))`
- `policy_versions_readiness_percent_check` (check): `CHECK (readiness_percent >= 0 AND readiness_percent <= 100)`
- `policy_versions_version_no_check` (check): `CHECK (version_no > 0)`
- `policy_versions_activated_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (activated_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_versions_approved_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (approved_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_versions_created_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_versions_policy_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_id, organization_id) REFERENCES qarar_governance.policies(id, organization_id) ON DELETE RESTRICT`
- `policy_versions_submitted_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (submitted_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_versions_supersedes_fk` (foreign_key): `FOREIGN KEY (supersedes_version_id, organization_id) REFERENCES qarar_governance.policy_versions(id, organization_id) ON DELETE RESTRICT`
- `policy_versions_suspended_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (suspended_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `policy_versions_pkey` (primary_key): `PRIMARY KEY (id)`
- `policy_versions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `policy_versions_policy_id_version_no_key` (unique): `UNIQUE (policy_id, version_no)`
- `policy_versions_no_effective_overlap` (exclusion): `EXCLUDE USING gist (policy_id WITH =, daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]'::text) WITH &&) WHERE (legal_status = 'effective'::text)`

**Indexes**
- `policy_versions_id_organization_id_key`: `CREATE UNIQUE INDEX policy_versions_id_organization_id_key ON qarar_governance.policy_versions USING btree (id, organization_id)`
- `policy_versions_no_effective_overlap`: `CREATE INDEX policy_versions_no_effective_overlap ON qarar_governance.policy_versions USING gist (policy_id, daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]'::text)) WHERE (legal_status = 'effective'::text)`
- `policy_versions_pkey`: `CREATE UNIQUE INDEX policy_versions_pkey ON qarar_governance.policy_versions USING btree (id)`
- `policy_versions_policy_id_version_no_key`: `CREATE UNIQUE INDEX policy_versions_policy_id_version_no_key ON qarar_governance.policy_versions USING btree (policy_id, version_no)`

### `qarar_governance.regulation_match_decisions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | yes | `-` |
| 4 | `governance_unit_id` | `uuid` | no | `-` |
| 5 | `topic_category_id` | `uuid` | yes | `-` |
| 6 | `evaluated_at` | `timestamp with time zone` | no | `now()` |
| 7 | `effective_on` | `date` | no | `-` |
| 8 | `outcome` | `text` | no | `-` |
| 9 | `selected_policy_id` | `uuid` | yes | `-` |
| 10 | `selected_policy_version_id` | `uuid` | yes | `-` |
| 11 | `selected_policy_item_id` | `uuid` | yes | `-` |
| 12 | `selected_scope_assignment_id` | `uuid` | yes | `-` |
| 13 | `selected_workflow_template_version_id` | `uuid` | yes | `-` |
| 14 | `specificity_score` | `integer` | yes | `-` |
| 15 | `candidate_count` | `integer` | no | `0` |
| 16 | `explanation` | `jsonb` | no | `-` |
| 17 | `candidates` | `jsonb` | no | `'[]'::jsonb` |
| 18 | `created_by_user_id` | `uuid` | no | `-` |
| 19 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `regulation_match_decisions_candidate_count_check` (check): `CHECK (candidate_count >= 0)`
- `regulation_match_decisions_candidates_check` (check): `CHECK (jsonb_typeof(candidates) = 'array'::text)`
- `regulation_match_decisions_check` (check): `CHECK (outcome <> 'resolved'::text OR selected_policy_id IS NOT NULL AND selected_policy_version_id IS NOT NULL AND selected_policy_item_id IS NOT NULL AND selected_scope_assignment_id IS NOT NULL AND selected_workflow_template_version_id IS NOT NULL)`
- `regulation_match_decisions_explanation_check` (check): `CHECK (jsonb_typeof(explanation) = 'object'::text)`
- `regulation_match_decisions_outcome_check` (check): `CHECK (outcome = ANY (ARRAY['resolved'::text, 'manual_review_required'::text, 'policy_not_implemented'::text, 'policy_partially_ready'::text, 'no_applicable_policy'::text, 'multiple_policy_conflict'::text, 'custom_route_required'::text, 'exception_approval_required'::text, 'blocked'::text]))`
- `regulation_match_decisions_created_by_user_id_organization_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `regulation_match_decisions_governance_unit_id_organization_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id) ON DELETE RESTRICT`
- `regulation_match_decisions_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `regulation_match_decisions_selected_policy_id_organization_fkey` (foreign_key): `FOREIGN KEY (selected_policy_id, organization_id) REFERENCES qarar_governance.policies(id, organization_id) ON DELETE RESTRICT`
- `regulation_match_decisions_selected_policy_item_id_organiz_fkey` (foreign_key): `FOREIGN KEY (selected_policy_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `regulation_match_decisions_selected_policy_version_id_orga_fkey` (foreign_key): `FOREIGN KEY (selected_policy_version_id, organization_id) REFERENCES qarar_governance.policy_versions(id, organization_id) ON DELETE RESTRICT`
- `regulation_match_decisions_selected_scope_assignment_id_or_fkey` (foreign_key): `FOREIGN KEY (selected_scope_assignment_id, organization_id) REFERENCES qarar_governance.policy_scope_assignments(id, organization_id) ON DELETE RESTRICT`
- `regulation_match_decisions_selected_workflow_template_vers_fkey` (foreign_key): `FOREIGN KEY (selected_workflow_template_version_id, organization_id) REFERENCES qarar_governance.workflow_template_versions(id, organization_id) ON DELETE RESTRICT`
- `regulation_match_decisions_topic_category_id_organization__fkey` (foreign_key): `FOREIGN KEY (topic_category_id, organization_id) REFERENCES qarar_topics.topic_categories(id, organization_id) ON DELETE RESTRICT`
- `regulation_match_decisions_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id) ON DELETE RESTRICT`
- `regulation_match_decisions_pkey` (primary_key): `PRIMARY KEY (id)`
- `regulation_match_decisions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `regulation_match_decisions_id_organization_id_key`: `CREATE UNIQUE INDEX regulation_match_decisions_id_organization_id_key ON qarar_governance.regulation_match_decisions USING btree (id, organization_id)`
- `regulation_match_decisions_pkey`: `CREATE UNIQUE INDEX regulation_match_decisions_pkey ON qarar_governance.regulation_match_decisions USING btree (id)`

### `qarar_governance.rule_actions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_rule_id` | `uuid` | no | `-` |
| 4 | `action_code` | `text` | no | `-` |
| 5 | `label_ar` | `text` | no | `-` |
| 6 | `action_type` | `text` | no | `-` |
| 7 | `is_terminal` | `boolean` | no | `false` |
| 8 | `requires_reason` | `boolean` | no | `false` |
| 9 | `result_payload` | `jsonb` | no | `'{}'::jsonb` |
| 10 | `sequence_no` | `integer` | no | `-` |
| 11 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `rule_actions_action_type_check` (check): `CHECK (action_type = ANY (ARRAY['recommend'::text, 'approve'::text, 'reject'::text, 'return'::text, 'defer'::text, 'refer'::text, 'execute'::text, 'cancel'::text, 'request_exception'::text]))`
- `rule_actions_result_payload_check` (check): `CHECK (jsonb_typeof(result_payload) = 'object'::text)`
- `rule_actions_sequence_no_check` (check): `CHECK (sequence_no > 0)`
- `rule_actions_policy_rule_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_rule_id, organization_id) REFERENCES qarar_governance.policy_rules(id, organization_id) ON DELETE CASCADE`
- `rule_actions_pkey` (primary_key): `PRIMARY KEY (id)`
- `rule_actions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `rule_actions_policy_rule_id_action_code_key` (unique): `UNIQUE (policy_rule_id, action_code)`
- `rule_actions_policy_rule_id_sequence_no_key` (unique): `UNIQUE (policy_rule_id, sequence_no)`

**Indexes**
- `rule_actions_id_organization_id_key`: `CREATE UNIQUE INDEX rule_actions_id_organization_id_key ON qarar_governance.rule_actions USING btree (id, organization_id)`
- `rule_actions_pkey`: `CREATE UNIQUE INDEX rule_actions_pkey ON qarar_governance.rule_actions USING btree (id)`
- `rule_actions_policy_rule_id_action_code_key`: `CREATE UNIQUE INDEX rule_actions_policy_rule_id_action_code_key ON qarar_governance.rule_actions USING btree (policy_rule_id, action_code)`
- `rule_actions_policy_rule_id_sequence_no_key`: `CREATE UNIQUE INDEX rule_actions_policy_rule_id_sequence_no_key ON qarar_governance.rule_actions USING btree (policy_rule_id, sequence_no)`

### `qarar_governance.rule_authorities`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_rule_id` | `uuid` | no | `-` |
| 4 | `governance_unit_id` | `uuid` | yes | `-` |
| 5 | `governance_class_id` | `uuid` | yes | `-` |
| 6 | `responsibility` | `text` | no | `-` |
| 7 | `authority_action` | `text` | no | `-` |
| 8 | `required_permission_code` | `text` | yes | `-` |
| 9 | `sequence_no` | `integer` | no | `-` |
| 10 | `is_final` | `boolean` | no | `false` |
| 11 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `rule_authorities_authority_action_check` (check): `CHECK (authority_action = ANY (ARRAY['recommend'::text, 'approve'::text, 'final_approve'::text, 'reject'::text, 'return'::text, 'refer'::text, 'execute'::text, 'verify'::text, 'follow_up'::text]))`
- `rule_authorities_check` (check): `CHECK ((governance_unit_id IS NULL) <> (governance_class_id IS NULL))`
- `rule_authorities_responsibility_check` (check): `CHECK (responsibility = ANY (ARRAY['present'::text, 'review'::text, 'discuss'::text, 'recommend'::text, 'initial_approve'::text, 'final_approve'::text, 'execute'::text, 'follow_up'::text]))`
- `rule_authorities_sequence_no_check` (check): `CHECK (sequence_no > 0)`
- `rule_authorities_governance_class_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_class_id, organization_id) REFERENCES qarar_governance.governance_unit_classes(id, organization_id) ON DELETE RESTRICT`
- `rule_authorities_governance_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id) ON DELETE RESTRICT`
- `rule_authorities_organization_id_required_permission_code_fkey` (foreign_key): `FOREIGN KEY (organization_id, required_permission_code) REFERENCES qarar_iam.permissions(organization_id, code) ON DELETE RESTRICT`
- `rule_authorities_policy_rule_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_rule_id, organization_id) REFERENCES qarar_governance.policy_rules(id, organization_id) ON DELETE CASCADE`
- `rule_authorities_pkey` (primary_key): `PRIMARY KEY (id)`
- `rule_authorities_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `rule_authorities_policy_rule_id_sequence_no_key` (unique): `UNIQUE (policy_rule_id, sequence_no)`

**Indexes**
- `rule_authorities_id_organization_id_key`: `CREATE UNIQUE INDEX rule_authorities_id_organization_id_key ON qarar_governance.rule_authorities USING btree (id, organization_id)`
- `rule_authorities_pkey`: `CREATE UNIQUE INDEX rule_authorities_pkey ON qarar_governance.rule_authorities USING btree (id)`
- `rule_authorities_policy_rule_id_sequence_no_key`: `CREATE UNIQUE INDEX rule_authorities_policy_rule_id_sequence_no_key ON qarar_governance.rule_authorities USING btree (policy_rule_id, sequence_no)`

### `qarar_governance.rule_conditions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_rule_id` | `uuid` | no | `-` |
| 4 | `condition_code` | `text` | no | `-` |
| 5 | `field_path` | `text` | no | `-` |
| 6 | `operator` | `text` | no | `-` |
| 7 | `expected_value` | `jsonb` | no | `'null'::jsonb` |
| 8 | `failure_action` | `text` | no | `'block'::text` |
| 9 | `failure_message_ar` | `text` | yes | `-` |
| 10 | `sequence_no` | `integer` | no | `-` |
| 11 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `rule_conditions_failure_action_check` (check): `CHECK (failure_action = ANY (ARRAY['block'::text, 'reject'::text, 'return_for_completion'::text, 'warn'::text, 'request_exception'::text]))`
- `rule_conditions_operator_check` (check): `CHECK (operator = ANY (ARRAY['eq'::text, 'neq'::text, 'gt'::text, 'gte'::text, 'lt'::text, 'lte'::text, 'in'::text, 'not_in'::text, 'contains'::text, 'exists'::text, 'not_exists'::text, 'before'::text, 'after'::text, 'matches'::text]))`
- `rule_conditions_sequence_no_check` (check): `CHECK (sequence_no > 0)`
- `rule_conditions_policy_rule_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_rule_id, organization_id) REFERENCES qarar_governance.policy_rules(id, organization_id) ON DELETE CASCADE`
- `rule_conditions_pkey` (primary_key): `PRIMARY KEY (id)`
- `rule_conditions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `rule_conditions_policy_rule_id_condition_code_key` (unique): `UNIQUE (policy_rule_id, condition_code)`
- `rule_conditions_policy_rule_id_sequence_no_key` (unique): `UNIQUE (policy_rule_id, sequence_no)`

**Indexes**
- `rule_conditions_id_organization_id_key`: `CREATE UNIQUE INDEX rule_conditions_id_organization_id_key ON qarar_governance.rule_conditions USING btree (id, organization_id)`
- `rule_conditions_pkey`: `CREATE UNIQUE INDEX rule_conditions_pkey ON qarar_governance.rule_conditions USING btree (id)`
- `rule_conditions_policy_rule_id_condition_code_key`: `CREATE UNIQUE INDEX rule_conditions_policy_rule_id_condition_code_key ON qarar_governance.rule_conditions USING btree (policy_rule_id, condition_code)`
- `rule_conditions_policy_rule_id_sequence_no_key`: `CREATE UNIQUE INDEX rule_conditions_policy_rule_id_sequence_no_key ON qarar_governance.rule_conditions USING btree (policy_rule_id, sequence_no)`

### `qarar_governance.rule_requirements`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_rule_id` | `uuid` | no | `-` |
| 4 | `requirement_code` | `text` | no | `-` |
| 5 | `name_ar` | `text` | no | `-` |
| 6 | `requirement_type` | `text` | no | `-` |
| 7 | `is_mandatory` | `boolean` | no | `true` |
| 8 | `timing` | `text` | no | `'before_submission'::text` |
| 9 | `validation_spec` | `jsonb` | no | `'{}'::jsonb` |
| 10 | `sequence_no` | `integer` | no | `-` |
| 11 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `rule_requirements_requirement_type_check` (check): `CHECK (requirement_type = ANY (ARRAY['document'::text, 'data'::text, 'approval'::text, 'fee'::text, 'declaration'::text, 'evidence'::text]))`
- `rule_requirements_sequence_no_check` (check): `CHECK (sequence_no > 0)`
- `rule_requirements_timing_check` (check): `CHECK (timing = ANY (ARRAY['before_submission'::text, 'before_review'::text, 'before_decision'::text, 'after_decision'::text]))`
- `rule_requirements_validation_spec_check` (check): `CHECK (jsonb_typeof(validation_spec) = 'object'::text)`
- `rule_requirements_policy_rule_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_rule_id, organization_id) REFERENCES qarar_governance.policy_rules(id, organization_id) ON DELETE CASCADE`
- `rule_requirements_pkey` (primary_key): `PRIMARY KEY (id)`
- `rule_requirements_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `rule_requirements_policy_rule_id_requirement_code_key` (unique): `UNIQUE (policy_rule_id, requirement_code)`
- `rule_requirements_policy_rule_id_sequence_no_key` (unique): `UNIQUE (policy_rule_id, sequence_no)`

**Indexes**
- `rule_requirements_id_organization_id_key`: `CREATE UNIQUE INDEX rule_requirements_id_organization_id_key ON qarar_governance.rule_requirements USING btree (id, organization_id)`
- `rule_requirements_pkey`: `CREATE UNIQUE INDEX rule_requirements_pkey ON qarar_governance.rule_requirements USING btree (id)`
- `rule_requirements_policy_rule_id_requirement_code_key`: `CREATE UNIQUE INDEX rule_requirements_policy_rule_id_requirement_code_key ON qarar_governance.rule_requirements USING btree (policy_rule_id, requirement_code)`
- `rule_requirements_policy_rule_id_sequence_no_key`: `CREATE UNIQUE INDEX rule_requirements_policy_rule_id_sequence_no_key ON qarar_governance.rule_requirements USING btree (policy_rule_id, sequence_no)`

### `qarar_governance.rule_workflow_bindings`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `policy_rule_id` | `uuid` | no | `-` |
| 4 | `workflow_template_version_id` | `uuid` | no | `-` |
| 5 | `binding_type` | `text` | no | `'primary'::text` |
| 6 | `selection_conditions` | `jsonb` | no | `'{}'::jsonb` |
| 7 | `priority` | `integer` | no | `100` |
| 8 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `rule_workflow_bindings_binding_type_check` (check): `CHECK (binding_type = ANY (ARRAY['primary'::text, 'objection'::text, 'exception'::text, 'fallback'::text]))`
- `rule_workflow_bindings_selection_conditions_check` (check): `CHECK (jsonb_typeof(selection_conditions) = 'object'::text)`
- `rule_workflow_bindings_policy_rule_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_rule_id, organization_id) REFERENCES qarar_governance.policy_rules(id, organization_id) ON DELETE CASCADE`
- `rule_workflow_bindings_workflow_template_version_id_organi_fkey` (foreign_key): `FOREIGN KEY (workflow_template_version_id, organization_id) REFERENCES qarar_governance.workflow_template_versions(id, organization_id) ON DELETE RESTRICT`
- `rule_workflow_bindings_pkey` (primary_key): `PRIMARY KEY (id)`
- `rule_workflow_bindings_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `rule_workflow_bindings_policy_rule_id_workflow_template_ver_key` (unique): `UNIQUE (policy_rule_id, workflow_template_version_id, binding_type)`

**Indexes**
- `rule_workflow_bindings_id_organization_id_key`: `CREATE UNIQUE INDEX rule_workflow_bindings_id_organization_id_key ON qarar_governance.rule_workflow_bindings USING btree (id, organization_id)`
- `rule_workflow_bindings_pkey`: `CREATE UNIQUE INDEX rule_workflow_bindings_pkey ON qarar_governance.rule_workflow_bindings USING btree (id)`
- `rule_workflow_bindings_policy_rule_id_workflow_template_ver_key`: `CREATE UNIQUE INDEX rule_workflow_bindings_policy_rule_id_workflow_template_ver_key ON qarar_governance.rule_workflow_bindings USING btree (policy_rule_id, workflow_template_version_id, binding_type)`

### `qarar_governance.topic_governance_mappings`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | no | `-` |
| 4 | `governance_source` | `text` | no | `-` |
| 5 | `routing_status` | `text` | no | `-` |
| 6 | `routing_decision_id` | `uuid` | no | `-` |
| 7 | `policy_id` | `uuid` | yes | `-` |
| 8 | `policy_version_id` | `uuid` | yes | `-` |
| 9 | `policy_item_id` | `uuid` | yes | `-` |
| 10 | `policy_scope_assignment_id` | `uuid` | yes | `-` |
| 11 | `workflow_template_version_id` | `uuid` | yes | `-` |
| 12 | `snapshot` | `jsonb` | no | `-` |
| 13 | `mapped_by_user_id` | `uuid` | no | `-` |
| 14 | `mapped_at` | `timestamp with time zone` | no | `now()` |
| 15 | `superseded_at` | `timestamp with time zone` | yes | `-` |

**Constraints and relationships**
- `topic_governance_mappings_governance_source_check` (check): `CHECK (governance_source = ANY (ARRAY['regulated'::text, 'custom'::text, 'exception'::text]))`
- `topic_governance_mappings_routing_status_check` (check): `CHECK (routing_status = ANY (ARRAY['routing_pending'::text, 'routing_resolved'::text, 'routing_conflict'::text, 'routing_blocked'::text, 'routing_exception_pending'::text, 'routing_ready'::text, 'routing_expired'::text]))`
- `topic_governance_mappings_snapshot_check` (check): `CHECK (jsonb_typeof(snapshot) = 'object'::text)`
- `topic_governance_mappings_mapped_by_user_id_organization_i_fkey` (foreign_key): `FOREIGN KEY (mapped_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `topic_governance_mappings_policy_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_id, organization_id) REFERENCES qarar_governance.policies(id, organization_id) ON DELETE RESTRICT`
- `topic_governance_mappings_policy_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `topic_governance_mappings_policy_scope_assignment_id_organ_fkey` (foreign_key): `FOREIGN KEY (policy_scope_assignment_id, organization_id) REFERENCES qarar_governance.policy_scope_assignments(id, organization_id) ON DELETE RESTRICT`
- `topic_governance_mappings_policy_version_id_organization_i_fkey` (foreign_key): `FOREIGN KEY (policy_version_id, organization_id) REFERENCES qarar_governance.policy_versions(id, organization_id) ON DELETE RESTRICT`
- `topic_governance_mappings_routing_decision_id_organization_fkey` (foreign_key): `FOREIGN KEY (routing_decision_id, organization_id) REFERENCES qarar_governance.regulation_match_decisions(id, organization_id) ON DELETE RESTRICT`
- `topic_governance_mappings_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id) ON DELETE RESTRICT`
- `topic_governance_mappings_workflow_template_version_id_org_fkey` (foreign_key): `FOREIGN KEY (workflow_template_version_id, organization_id) REFERENCES qarar_governance.workflow_template_versions(id, organization_id) ON DELETE RESTRICT`
- `topic_governance_mappings_pkey` (primary_key): `PRIMARY KEY (id)`
- `topic_governance_mappings_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `topic_governance_mappings_topic_id_key` (unique): `UNIQUE (topic_id) DEFERRABLE`

**Indexes**
- `topic_governance_mappings_id_organization_id_key`: `CREATE UNIQUE INDEX topic_governance_mappings_id_organization_id_key ON qarar_governance.topic_governance_mappings USING btree (id, organization_id)`
- `topic_governance_mappings_pkey`: `CREATE UNIQUE INDEX topic_governance_mappings_pkey ON qarar_governance.topic_governance_mappings USING btree (id)`
- `topic_governance_mappings_topic_id_key`: `CREATE UNIQUE INDEX topic_governance_mappings_topic_id_key ON qarar_governance.topic_governance_mappings USING btree (topic_id)`

### `qarar_governance.topic_regulation_references`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `extensions.gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | no | `-` |
| 4 | `policy_id` | `uuid` | no | `-` |
| 5 | `policy_version_id` | `uuid` | no | `-` |
| 6 | `policy_item_id` | `uuid` | yes | `-` |
| 7 | `scope_assignment_id` | `uuid` | yes | `-` |
| 8 | `reference_type` | `text` | no | `-` |
| 9 | `is_primary` | `boolean` | no | `false` |
| 10 | `label_snapshot` | `text` | no | `-` |
| 11 | `created_by_user_id` | `uuid` | no | `-` |
| 12 | `created_at` | `timestamp with time zone` | no | `clock_timestamp()` |

**Constraints and relationships**
- `topic_regulation_references_label_snapshot_check` (check): `CHECK (char_length(btrim(label_snapshot)) >= 2 AND char_length(btrim(label_snapshot)) <= 500)`
- `topic_regulation_references_reference_type_check` (check): `CHECK (reference_type = ANY (ARRAY['policy'::text, 'chapter'::text, 'section'::text, 'article'::text, 'clause'::text, 'procedure'::text]))`
- `topic_regulation_references_created_by_user_id_organizatio_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `topic_regulation_references_policy_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_id, organization_id) REFERENCES qarar_governance.policies(id, organization_id) ON DELETE RESTRICT`
- `topic_regulation_references_policy_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (policy_item_id, organization_id) REFERENCES qarar_governance.policy_items(id, organization_id) ON DELETE RESTRICT`
- `topic_regulation_references_policy_version_id_organization_fkey` (foreign_key): `FOREIGN KEY (policy_version_id, organization_id) REFERENCES qarar_governance.policy_versions(id, organization_id) ON DELETE RESTRICT`
- `topic_regulation_references_scope_assignment_id_organizati_fkey` (foreign_key): `FOREIGN KEY (scope_assignment_id, organization_id) REFERENCES qarar_governance.policy_scope_assignments(id, organization_id) ON DELETE RESTRICT`
- `topic_regulation_references_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id) ON DELETE CASCADE`
- `topic_regulation_references_pkey` (primary_key): `PRIMARY KEY (id)`
- `topic_regulation_references_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `topic_regulation_one_primary_idx`: `CREATE UNIQUE INDEX topic_regulation_one_primary_idx ON qarar_governance.topic_regulation_references USING btree (topic_id) WHERE is_primary`
- `topic_regulation_reference_identity_idx`: `CREATE UNIQUE INDEX topic_regulation_reference_identity_idx ON qarar_governance.topic_regulation_references USING btree (topic_id, policy_id, policy_version_id, COALESCE(policy_item_id, '00000000-0000-0000-0000-000000000000'::uuid))`
- `topic_regulation_references_id_organization_id_key`: `CREATE UNIQUE INDEX topic_regulation_references_id_organization_id_key ON qarar_governance.topic_regulation_references USING btree (id, organization_id)`
- `topic_regulation_references_pkey`: `CREATE UNIQUE INDEX topic_regulation_references_pkey ON qarar_governance.topic_regulation_references USING btree (id)`

### `qarar_governance.workflow_instance_steps`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `workflow_instance_id` | `uuid` | no | `-` |
| 4 | `template_step_id` | `uuid` | no | `-` |
| 5 | `sequence_no` | `integer` | no | `-` |
| 6 | `status` | `text` | no | `'pending'::text` |
| 7 | `assigned_unit_id` | `uuid` | yes | `-` |
| 8 | `required_permission_code` | `text` | yes | `-` |
| 9 | `opened_at` | `timestamp with time zone` | yes | `-` |
| 10 | `acted_by_user_id` | `uuid` | yes | `-` |
| 11 | `acted_at` | `timestamp with time zone` | yes | `-` |
| 12 | `outcome_code` | `text` | yes | `-` |
| 13 | `comment` | `text` | yes | `-` |
| 14 | `snapshot` | `jsonb` | no | `-` |
| 15 | `created_at` | `timestamp with time zone` | no | `now()` |
| 16 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 17 | `action_idempotency_key` | `uuid` | yes | `-` |
| 18 | `action_version` | `integer` | no | `0` |

**Constraints and relationships**
- `workflow_instance_steps_outcome_code_check` (check): `CHECK (outcome_code IS NULL OR (outcome_code = ANY (ARRAY['approved'::text, 'rejected'::text, 'returned'::text, 'tie'::text, 'no_vote'::text, 'cancelled'::text, 'completed'::text])))`
- `workflow_instance_steps_sequence_no_check` (check): `CHECK (sequence_no > 0)`
- `workflow_instance_steps_snapshot_check` (check): `CHECK (jsonb_typeof(snapshot) = 'object'::text)`
- `workflow_instance_steps_status_check` (check): `CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'completed'::text, 'returned'::text, 'rejected'::text, 'cancelled'::text, 'skipped'::text]))`
- `workflow_instance_steps_acted_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (acted_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `workflow_instance_steps_assigned_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (assigned_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id) ON DELETE RESTRICT`
- `workflow_instance_steps_organization_id_required_permissio_fkey` (foreign_key): `FOREIGN KEY (organization_id, required_permission_code) REFERENCES qarar_iam.permissions(organization_id, code) ON DELETE RESTRICT`
- `workflow_instance_steps_template_step_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (template_step_id, organization_id) REFERENCES qarar_governance.workflow_template_steps(id, organization_id) ON DELETE RESTRICT`
- `workflow_instance_steps_workflow_instance_id_organization__fkey` (foreign_key): `FOREIGN KEY (workflow_instance_id, organization_id) REFERENCES qarar_governance.workflow_instances(id, organization_id) ON DELETE RESTRICT`
- `workflow_instance_steps_pkey` (primary_key): `PRIMARY KEY (id)`
- `workflow_instance_steps_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `workflow_instance_steps_workflow_instance_id_template_step__key` (unique): `UNIQUE (workflow_instance_id, template_step_id)`

**Indexes**
- `workflow_instance_steps_id_organization_id_key`: `CREATE UNIQUE INDEX workflow_instance_steps_id_organization_id_key ON qarar_governance.workflow_instance_steps USING btree (id, organization_id)`
- `workflow_instance_steps_pkey`: `CREATE UNIQUE INDEX workflow_instance_steps_pkey ON qarar_governance.workflow_instance_steps USING btree (id)`
- `workflow_instance_steps_workflow_instance_id_template_step__key`: `CREATE UNIQUE INDEX workflow_instance_steps_workflow_instance_id_template_step__key ON qarar_governance.workflow_instance_steps USING btree (workflow_instance_id, template_step_id)`
- `workflow_step_action_idempotency_uidx`: `CREATE UNIQUE INDEX workflow_step_action_idempotency_uidx ON qarar_governance.workflow_instance_steps USING btree (workflow_instance_id, action_idempotency_key) WHERE (action_idempotency_key IS NOT NULL)`

### `qarar_governance.workflow_instances`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | no | `-` |
| 4 | `topic_governance_mapping_id` | `uuid` | no | `-` |
| 5 | `workflow_template_version_id` | `uuid` | no | `-` |
| 6 | `status` | `text` | no | `'active'::text` |
| 7 | `current_step_id` | `uuid` | yes | `-` |
| 8 | `started_by_user_id` | `uuid` | no | `-` |
| 9 | `started_at` | `timestamp with time zone` | no | `now()` |
| 10 | `completed_at` | `timestamp with time zone` | yes | `-` |
| 11 | `snapshot` | `jsonb` | no | `-` |
| 12 | `created_at` | `timestamp with time zone` | no | `now()` |
| 13 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `workflow_instances_snapshot_check` (check): `CHECK (jsonb_typeof(snapshot) = 'object'::text)`
- `workflow_instances_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'rejected'::text, 'cancelled'::text, 'blocked'::text, 'expired'::text]))`
- `workflow_instances_current_step_tenant_fk` (foreign_key): `FOREIGN KEY (current_step_id, organization_id) REFERENCES qarar_governance.workflow_instance_steps(id, organization_id) DEFERRABLE INITIALLY DEFERRED`
- `workflow_instances_started_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (started_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `workflow_instances_topic_governance_mapping_id_organizatio_fkey` (foreign_key): `FOREIGN KEY (topic_governance_mapping_id, organization_id) REFERENCES qarar_governance.topic_governance_mappings(id, organization_id) ON DELETE RESTRICT`
- `workflow_instances_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id) ON DELETE RESTRICT`
- `workflow_instances_workflow_template_version_id_organizati_fkey` (foreign_key): `FOREIGN KEY (workflow_template_version_id, organization_id) REFERENCES qarar_governance.workflow_template_versions(id, organization_id) ON DELETE RESTRICT`
- `workflow_instances_pkey` (primary_key): `PRIMARY KEY (id)`
- `workflow_instances_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `workflow_instances_topic_id_key` (unique): `UNIQUE (topic_id)`

**Indexes**
- `workflow_instances_id_organization_id_key`: `CREATE UNIQUE INDEX workflow_instances_id_organization_id_key ON qarar_governance.workflow_instances USING btree (id, organization_id)`
- `workflow_instances_pkey`: `CREATE UNIQUE INDEX workflow_instances_pkey ON qarar_governance.workflow_instances USING btree (id)`
- `workflow_instances_topic_id_key`: `CREATE UNIQUE INDEX workflow_instances_topic_id_key ON qarar_governance.workflow_instances USING btree (topic_id)`

### `qarar_governance.workflow_template_steps`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `workflow_template_version_id` | `uuid` | no | `-` |
| 4 | `step_code` | `text` | no | `-` |
| 5 | `name_ar` | `text` | no | `-` |
| 6 | `sequence_no` | `integer` | no | `-` |
| 7 | `step_type` | `text` | no | `-` |
| 8 | `responsibility` | `text` | no | `-` |
| 9 | `governance_unit_id` | `uuid` | yes | `-` |
| 10 | `governance_class_id` | `uuid` | yes | `-` |
| 11 | `required_permission_code` | `text` | yes | `-` |
| 12 | `is_initial` | `boolean` | no | `false` |
| 13 | `is_terminal` | `boolean` | no | `false` |
| 14 | `entry_conditions` | `jsonb` | no | `'{}'::jsonb` |
| 15 | `exit_conditions` | `jsonb` | no | `'{}'::jsonb` |
| 16 | `allowed_outcomes` | `text[]` | no | `ARRAY[]::text[]` |
| 17 | `created_at` | `timestamp with time zone` | no | `now()` |
| 18 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `workflow_template_steps_allowed_outcomes_check` (check): `CHECK (cardinality(allowed_outcomes) > 0)`
- `workflow_template_steps_check` (check): `CHECK ((governance_unit_id IS NULL) <> (governance_class_id IS NULL))`
- `workflow_template_steps_entry_conditions_check` (check): `CHECK (jsonb_typeof(entry_conditions) = 'object'::text)`
- `workflow_template_steps_exit_conditions_check` (check): `CHECK (jsonb_typeof(exit_conditions) = 'object'::text)`
- `workflow_template_steps_responsibility_check` (check): `CHECK (responsibility = ANY (ARRAY['present'::text, 'review'::text, 'discuss'::text, 'recommend'::text, 'initial_approve'::text, 'final_approve'::text, 'execute'::text, 'follow_up'::text]))`
- `workflow_template_steps_sequence_no_check` (check): `CHECK (sequence_no > 0)`
- `workflow_template_steps_step_code_check` (check): `CHECK (step_code ~ '^[a-z][a-z0-9_]*$'::text)`
- `workflow_template_steps_step_type_check` (check): `CHECK (step_type = ANY (ARRAY['review'::text, 'discussion'::text, 'recommendation'::text, 'approval'::text, 'voting'::text, 'execution'::text, 'follow_up'::text]))`
- `workflow_template_steps_governance_class_id_organization_i_fkey` (foreign_key): `FOREIGN KEY (governance_class_id, organization_id) REFERENCES qarar_governance.governance_unit_classes(id, organization_id) ON DELETE RESTRICT`
- `workflow_template_steps_governance_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id) ON DELETE RESTRICT`
- `workflow_template_steps_organization_id_required_permissio_fkey` (foreign_key): `FOREIGN KEY (organization_id, required_permission_code) REFERENCES qarar_iam.permissions(organization_id, code) ON DELETE RESTRICT`
- `workflow_template_steps_workflow_template_version_id_organ_fkey` (foreign_key): `FOREIGN KEY (workflow_template_version_id, organization_id) REFERENCES qarar_governance.workflow_template_versions(id, organization_id) ON DELETE RESTRICT`
- `workflow_template_steps_pkey` (primary_key): `PRIMARY KEY (id)`
- `workflow_template_steps_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `workflow_template_steps_workflow_template_version_id_sequen_key` (unique): `UNIQUE (workflow_template_version_id, sequence_no)`
- `workflow_template_steps_workflow_template_version_id_step_c_key` (unique): `UNIQUE (workflow_template_version_id, step_code)`

**Indexes**
- `workflow_template_steps_id_organization_id_key`: `CREATE UNIQUE INDEX workflow_template_steps_id_organization_id_key ON qarar_governance.workflow_template_steps USING btree (id, organization_id)`
- `workflow_template_steps_pkey`: `CREATE UNIQUE INDEX workflow_template_steps_pkey ON qarar_governance.workflow_template_steps USING btree (id)`
- `workflow_template_steps_workflow_template_version_id_sequen_key`: `CREATE UNIQUE INDEX workflow_template_steps_workflow_template_version_id_sequen_key ON qarar_governance.workflow_template_steps USING btree (workflow_template_version_id, sequence_no)`
- `workflow_template_steps_workflow_template_version_id_step_c_key`: `CREATE UNIQUE INDEX workflow_template_steps_workflow_template_version_id_step_c_key ON qarar_governance.workflow_template_steps USING btree (workflow_template_version_id, step_code)`

### `qarar_governance.workflow_template_transitions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `workflow_template_version_id` | `uuid` | no | `-` |
| 4 | `from_step_id` | `uuid` | no | `-` |
| 5 | `to_step_id` | `uuid` | yes | `-` |
| 6 | `outcome_code` | `text` | no | `-` |
| 7 | `transition_type` | `text` | no | `'forward'::text` |
| 8 | `conditions` | `jsonb` | no | `'{}'::jsonb` |
| 9 | `created_at` | `timestamp with time zone` | no | `now()` |
| 10 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `workflow_template_transitions_check` (check): `CHECK ((transition_type = ANY (ARRAY['complete'::text, 'reject'::text, 'cancel'::text])) AND to_step_id IS NULL OR (transition_type = ANY (ARRAY['forward'::text, 'return'::text])) AND to_step_id IS NOT NULL)`
- `workflow_template_transitions_conditions_check` (check): `CHECK (jsonb_typeof(conditions) = 'object'::text)`
- `workflow_template_transitions_outcome_code_check` (check): `CHECK (outcome_code = ANY (ARRAY['approved'::text, 'rejected'::text, 'returned'::text, 'tie'::text, 'no_vote'::text, 'cancelled'::text, 'completed'::text]))`
- `workflow_template_transitions_transition_type_check` (check): `CHECK (transition_type = ANY (ARRAY['forward'::text, 'return'::text, 'reject'::text, 'complete'::text, 'cancel'::text]))`
- `workflow_template_transitions_from_step_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (from_step_id, organization_id) REFERENCES qarar_governance.workflow_template_steps(id, organization_id) ON DELETE RESTRICT`
- `workflow_template_transitions_to_step_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (to_step_id, organization_id) REFERENCES qarar_governance.workflow_template_steps(id, organization_id) ON DELETE RESTRICT`
- `workflow_template_transitions_workflow_template_version_id_fkey` (foreign_key): `FOREIGN KEY (workflow_template_version_id, organization_id) REFERENCES qarar_governance.workflow_template_versions(id, organization_id) ON DELETE RESTRICT`
- `workflow_template_transitions_pkey` (primary_key): `PRIMARY KEY (id)`
- `workflow_template_transitions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `workflow_template_transitions_workflow_template_version_id__key` (unique): `UNIQUE (workflow_template_version_id, from_step_id, outcome_code)`

**Indexes**
- `workflow_template_transitions_id_organization_id_key`: `CREATE UNIQUE INDEX workflow_template_transitions_id_organization_id_key ON qarar_governance.workflow_template_transitions USING btree (id, organization_id)`
- `workflow_template_transitions_pkey`: `CREATE UNIQUE INDEX workflow_template_transitions_pkey ON qarar_governance.workflow_template_transitions USING btree (id)`
- `workflow_template_transitions_workflow_template_version_id__key`: `CREATE UNIQUE INDEX workflow_template_transitions_workflow_template_version_id__key ON qarar_governance.workflow_template_transitions USING btree (workflow_template_version_id, from_step_id, outcome_code)`

### `qarar_governance.workflow_template_versions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `workflow_template_id` | `uuid` | no | `-` |
| 4 | `version_no` | `integer` | no | `-` |
| 5 | `status` | `text` | no | `'draft'::text` |
| 6 | `allow_cycles` | `boolean` | no | `false` |
| 7 | `validation_status` | `text` | no | `'pending'::text` |
| 8 | `validation_errors` | `jsonb` | no | `'[]'::jsonb` |
| 9 | `activated_by_user_id` | `uuid` | yes | `-` |
| 10 | `activated_at` | `timestamp with time zone` | yes | `-` |
| 11 | `created_by_user_id` | `uuid` | no | `-` |
| 12 | `created_at` | `timestamp with time zone` | no | `now()` |
| 13 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `workflow_template_versions_check` (check): `CHECK (status <> 'active'::text OR validation_status = 'valid'::text AND activated_by_user_id IS NOT NULL AND activated_at IS NOT NULL)`
- `workflow_template_versions_status_check` (check): `CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text]))`
- `workflow_template_versions_validation_errors_check` (check): `CHECK (jsonb_typeof(validation_errors) = 'array'::text)`
- `workflow_template_versions_validation_status_check` (check): `CHECK (validation_status = ANY (ARRAY['pending'::text, 'valid'::text, 'invalid'::text]))`
- `workflow_template_versions_version_no_check` (check): `CHECK (version_no > 0)`
- `workflow_template_versions_activated_by_user_id_organizati_fkey` (foreign_key): `FOREIGN KEY (activated_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `workflow_template_versions_created_by_user_id_organization_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `workflow_template_versions_workflow_template_id_organizati_fkey` (foreign_key): `FOREIGN KEY (workflow_template_id, organization_id) REFERENCES qarar_governance.workflow_templates(id, organization_id) ON DELETE RESTRICT`
- `workflow_template_versions_pkey` (primary_key): `PRIMARY KEY (id)`
- `workflow_template_versions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `workflow_template_versions_workflow_template_id_version_no_key` (unique): `UNIQUE (workflow_template_id, version_no)`

**Indexes**
- `workflow_template_one_active_version_uidx`: `CREATE UNIQUE INDEX workflow_template_one_active_version_uidx ON qarar_governance.workflow_template_versions USING btree (workflow_template_id) WHERE (status = 'active'::text)`
- `workflow_template_versions_id_organization_id_key`: `CREATE UNIQUE INDEX workflow_template_versions_id_organization_id_key ON qarar_governance.workflow_template_versions USING btree (id, organization_id)`
- `workflow_template_versions_pkey`: `CREATE UNIQUE INDEX workflow_template_versions_pkey ON qarar_governance.workflow_template_versions USING btree (id)`
- `workflow_template_versions_workflow_template_id_version_no_key`: `CREATE UNIQUE INDEX workflow_template_versions_workflow_template_id_version_no_key ON qarar_governance.workflow_template_versions USING btree (workflow_template_id, version_no)`

### `qarar_governance.workflow_templates`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `code` | `text` | no | `-` |
| 4 | `name_ar` | `text` | no | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `status` | `text` | no | `'active'::text` |
| 8 | `created_by_user_id` | `uuid` | no | `-` |
| 9 | `created_at` | `timestamp with time zone` | no | `now()` |
| 10 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `workflow_templates_code_check` (check): `CHECK (code ~ '^[a-z][a-z0-9_.-]*$'::text)`
- `workflow_templates_name_ar_check` (check): `CHECK (char_length(btrim(name_ar)) >= 3 AND char_length(btrim(name_ar)) <= 300)`
- `workflow_templates_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))`
- `workflow_templates_created_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `workflow_templates_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `workflow_templates_pkey` (primary_key): `PRIMARY KEY (id)`
- `workflow_templates_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `workflow_templates_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `workflow_templates_id_organization_id_key`: `CREATE UNIQUE INDEX workflow_templates_id_organization_id_key ON qarar_governance.workflow_templates USING btree (id, organization_id)`
- `workflow_templates_organization_id_code_key`: `CREATE UNIQUE INDEX workflow_templates_organization_id_code_key ON qarar_governance.workflow_templates USING btree (organization_id, code)`
- `workflow_templates_pkey`: `CREATE UNIQUE INDEX workflow_templates_pkey ON qarar_governance.workflow_templates USING btree (id)`

### `qarar_iam.access_delegations`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `delegated_by_user_id` | `uuid` | no | `-` |
| 4 | `delegated_to_user_id` | `uuid` | no | `-` |
| 5 | `source_membership_id` | `uuid` | no | `-` |
| 6 | `starts_at` | `timestamp with time zone` | no | `-` |
| 7 | `ends_at` | `timestamp with time zone` | no | `-` |
| 8 | `reason` | `text` | no | `-` |
| 9 | `status` | `text` | no | `'active'::text` |
| 10 | `revoked_at` | `timestamp with time zone` | yes | `-` |
| 11 | `revoked_by_user_id` | `uuid` | yes | `-` |
| 12 | `created_at` | `timestamp with time zone` | no | `now()` |
| 13 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `access_delegations_check` (check): `CHECK (delegated_by_user_id <> delegated_to_user_id)`
- `access_delegations_check1` (check): `CHECK (ends_at > starts_at)`
- `access_delegations_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text]))`
- `access_delegations_delegated_by_user_id_fkey` (foreign_key): `FOREIGN KEY (delegated_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `access_delegations_delegated_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (delegated_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `access_delegations_delegated_to_user_id_fkey` (foreign_key): `FOREIGN KEY (delegated_to_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `access_delegations_delegated_to_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (delegated_to_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `access_delegations_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `access_delegations_revoked_by_user_id_fkey` (foreign_key): `FOREIGN KEY (revoked_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `access_delegations_source_membership_id_fkey` (foreign_key): `FOREIGN KEY (source_membership_id) REFERENCES qarar_iam.memberships(id) ON DELETE RESTRICT`
- `access_delegations_pkey` (primary_key): `PRIMARY KEY (id)`

**Indexes**
- `access_delegations_effective_idx`: `CREATE INDEX access_delegations_effective_idx ON qarar_iam.access_delegations USING btree (delegated_to_user_id, starts_at, ends_at) WHERE (status = 'active'::text)`
- `access_delegations_pkey`: `CREATE UNIQUE INDEX access_delegations_pkey ON qarar_iam.access_delegations USING btree (id)`

### `qarar_iam.iam_change_requests`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `change_type` | `text` | no | `-` |
| 4 | `target_role_id` | `uuid` | yes | `-` |
| 5 | `payload` | `jsonb` | no | `-` |
| 6 | `justification` | `text` | no | `-` |
| 7 | `status` | `text` | no | `'pending'::text` |
| 8 | `requested_by_user_id` | `uuid` | no | `-` |
| 9 | `reviewed_by_user_id` | `uuid` | yes | `-` |
| 10 | `reviewed_at` | `timestamp with time zone` | yes | `-` |
| 11 | `review_notes` | `text` | yes | `-` |
| 12 | `applied_at` | `timestamp with time zone` | yes | `-` |
| 13 | `failure_reason` | `text` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | no | `now()` |
| 15 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `iam_change_requests_change_type_check` (check): `CHECK (change_type = ANY (ARRAY['role_permissions_replace'::text, 'permission_matrix_import'::text]))`
- `iam_change_requests_status_check` (check): `CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'applied'::text, 'failed'::text]))`
- `iam_change_requests_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `iam_change_requests_requested_by_user_id_fkey` (foreign_key): `FOREIGN KEY (requested_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `iam_change_requests_requested_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (requested_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `iam_change_requests_reviewed_by_user_id_fkey` (foreign_key): `FOREIGN KEY (reviewed_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `iam_change_requests_reviewed_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (reviewed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `iam_change_requests_target_role_id_fkey` (foreign_key): `FOREIGN KEY (target_role_id) REFERENCES qarar_iam.roles(id) ON DELETE RESTRICT`
- `iam_change_requests_target_role_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (target_role_id, organization_id) REFERENCES qarar_iam.roles(id, organization_id)`
- `iam_change_requests_pkey` (primary_key): `PRIMARY KEY (id)`

**Indexes**
- `iam_change_requests_pending_idx`: `CREATE INDEX iam_change_requests_pending_idx ON qarar_iam.iam_change_requests USING btree (organization_id, created_at) WHERE (status = 'pending'::text)`
- `iam_change_requests_pkey`: `CREATE UNIQUE INDEX iam_change_requests_pkey ON qarar_iam.iam_change_requests USING btree (id)`

### `qarar_iam.iam_operation_rate_limits`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `actor_user_id` | `uuid` | no | `-` |
| 2 | `operation` | `text` | no | `-` |
| 3 | `window_started_at` | `timestamp with time zone` | no | `-` |
| 4 | `request_count` | `integer` | no | `1` |

**Constraints and relationships**
- `iam_operation_rate_limits_request_count_check` (check): `CHECK (request_count > 0)`
- `iam_operation_rate_limits_pkey` (primary_key): `PRIMARY KEY (actor_user_id, operation, window_started_at)`

**Indexes**
- `iam_operation_rate_limits_pkey`: `CREATE UNIQUE INDEX iam_operation_rate_limits_pkey ON qarar_iam.iam_operation_rate_limits USING btree (actor_user_id, operation, window_started_at)`

### `qarar_iam.memberships`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `user_id` | `uuid` | no | `-` |
| 4 | `governance_unit_id` | `uuid` | no | `-` |
| 5 | `role_id` | `uuid` | no | `-` |
| 6 | `membership_title` | `text` | yes | `-` |
| 7 | `membership_status` | `text` | no | `'active'::text` |
| 8 | `start_date` | `date` | no | `CURRENT_DATE` |
| 9 | `end_date` | `date` | yes | `-` |
| 10 | `created_at` | `timestamp with time zone` | no | `now()` |
| 11 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `memberships_check` (check): `CHECK (end_date IS NULL OR end_date >= start_date)`
- `memberships_membership_status_check` (check): `CHECK (membership_status = ANY (ARRAY['active'::text, 'inactive'::text, 'ended'::text]))`
- `memberships_governance_unit_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `memberships_governance_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `memberships_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `memberships_role_id_fkey` (foreign_key): `FOREIGN KEY (role_id) REFERENCES qarar_iam.roles(id) ON DELETE RESTRICT`
- `memberships_role_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (role_id, organization_id) REFERENCES qarar_iam.roles(id, organization_id)`
- `memberships_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `memberships_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `memberships_pkey` (primary_key): `PRIMARY KEY (id)`
- `memberships_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `memberships_organization_id_user_id_governance_unit_id_role_key` (unique): `UNIQUE (organization_id, user_id, governance_unit_id, role_id, start_date)`
- `memberships_no_overlapping_periods` (exclusion): `EXCLUDE USING gist (organization_id WITH =, user_id WITH =, governance_unit_id WITH =, role_id WITH =, daterange(start_date, COALESCE(end_date + 1, 'infinity'::date), '[)'::text) WITH &&)`

**Indexes**
- `idx_memberships_user_unit`: `CREATE INDEX idx_memberships_user_unit ON qarar_iam.memberships USING btree (user_id, governance_unit_id)`
- `memberships_id_organization_id_key`: `CREATE UNIQUE INDEX memberships_id_organization_id_key ON qarar_iam.memberships USING btree (id, organization_id)`
- `memberships_no_overlapping_periods`: `CREATE INDEX memberships_no_overlapping_periods ON qarar_iam.memberships USING gist (organization_id, user_id, governance_unit_id, role_id, daterange(start_date, COALESCE((end_date + 1), 'infinity'::date), '[)'::text))`
- `memberships_organization_id_user_id_governance_unit_id_role_key`: `CREATE UNIQUE INDEX memberships_organization_id_user_id_governance_unit_id_role_key ON qarar_iam.memberships USING btree (organization_id, user_id, governance_unit_id, role_id, start_date)`
- `memberships_pkey`: `CREATE UNIQUE INDEX memberships_pkey ON qarar_iam.memberships USING btree (id)`

### `qarar_iam.permissions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `code` | `text` | no | `-` |
| 4 | `module` | `text` | no | `-` |
| 5 | `action` | `text` | no | `-` |
| 6 | `context_scope` | `text` | no | `-` |
| 7 | `name_ar` | `text` | no | `-` |
| 8 | `name_en` | `text` | yes | `-` |
| 9 | `description` | `text` | yes | `-` |
| 10 | `is_system_permission` | `boolean` | no | `false` |
| 11 | `is_active` | `boolean` | no | `true` |
| 12 | `created_at` | `timestamp with time zone` | no | `now()` |
| 13 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `permissions_code_format_check` (check): `CHECK (code ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'::text)`
- `permissions_code_lower_check` (check): `CHECK (code = lower(code))`
- `permissions_context_scope_check` (check): `CHECK (context_scope = ANY (ARRAY['system'::text, 'organization'::text, 'governance_unit'::text, 'execution'::text, 'self'::text]))`
- `permissions_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `permissions_pkey` (primary_key): `PRIMARY KEY (id)`
- `permissions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `permissions_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `permissions_id_organization_id_key`: `CREATE UNIQUE INDEX permissions_id_organization_id_key ON qarar_iam.permissions USING btree (id, organization_id)`
- `permissions_organization_id_code_key`: `CREATE UNIQUE INDEX permissions_organization_id_code_key ON qarar_iam.permissions USING btree (organization_id, code)`
- `permissions_pkey`: `CREATE UNIQUE INDEX permissions_pkey ON qarar_iam.permissions USING btree (id)`

### `qarar_iam.role_permissions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `role_id` | `uuid` | no | `-` |
| 4 | `permission_id` | `uuid` | no | `-` |
| 5 | `granted_by_user_id` | `uuid` | yes | `-` |
| 6 | `granted_at` | `timestamp with time zone` | no | `now()` |
| 7 | `is_active` | `boolean` | no | `true` |
| 8 | `created_at` | `timestamp with time zone` | no | `now()` |
| 9 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `role_permissions_granted_by_user_id_fkey` (foreign_key): `FOREIGN KEY (granted_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `role_permissions_granted_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (granted_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `role_permissions_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `role_permissions_permission_id_fkey` (foreign_key): `FOREIGN KEY (permission_id) REFERENCES qarar_iam.permissions(id) ON DELETE RESTRICT`
- `role_permissions_permission_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (permission_id, organization_id) REFERENCES qarar_iam.permissions(id, organization_id)`
- `role_permissions_role_id_fkey` (foreign_key): `FOREIGN KEY (role_id) REFERENCES qarar_iam.roles(id) ON DELETE RESTRICT`
- `role_permissions_role_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (role_id, organization_id) REFERENCES qarar_iam.roles(id, organization_id)`
- `role_permissions_pkey` (primary_key): `PRIMARY KEY (id)`
- `role_permissions_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `role_permissions_organization_id_role_id_permission_id_key` (unique): `UNIQUE (organization_id, role_id, permission_id)`

**Indexes**
- `role_permissions_id_organization_id_key`: `CREATE UNIQUE INDEX role_permissions_id_organization_id_key ON qarar_iam.role_permissions USING btree (id, organization_id)`
- `role_permissions_organization_id_role_id_permission_id_key`: `CREATE UNIQUE INDEX role_permissions_organization_id_role_id_permission_id_key ON qarar_iam.role_permissions USING btree (organization_id, role_id, permission_id)`
- `role_permissions_pkey`: `CREATE UNIQUE INDEX role_permissions_pkey ON qarar_iam.role_permissions USING btree (id)`

### `qarar_iam.roles`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `code` | `text` | no | `-` |
| 4 | `name_ar` | `text` | no | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `role_scope` | `text` | no | `-` |
| 8 | `is_active` | `boolean` | no | `true` |
| 9 | `created_at` | `timestamp with time zone` | no | `now()` |
| 10 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `roles_role_scope_check` (check): `CHECK (role_scope = ANY (ARRAY['system'::text, 'organization'::text, 'governance_unit'::text, 'execution'::text]))`
- `roles_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `roles_pkey` (primary_key): `PRIMARY KEY (id)`
- `roles_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `roles_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `roles_id_organization_id_key`: `CREATE UNIQUE INDEX roles_id_organization_id_key ON qarar_iam.roles USING btree (id, organization_id)`
- `roles_organization_id_code_key`: `CREATE UNIQUE INDEX roles_organization_id_code_key ON qarar_iam.roles USING btree (organization_id, code)`
- `roles_pkey`: `CREATE UNIQUE INDEX roles_pkey ON qarar_iam.roles USING btree (id)`

### `qarar_iam.sso_domains`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `sso_provider_id` | `uuid` | no | `-` |
| 4 | `domain` | `text` | no | `-` |
| 5 | `status` | `text` | no | `'active'::text` |
| 6 | `verified_at` | `timestamp with time zone` | yes | `-` |
| 7 | `created_at` | `timestamp with time zone` | no | `now()` |
| 8 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `sso_domains_active_requires_verification` (check): `CHECK (status <> 'active'::text OR verified_at IS NOT NULL)`
- `sso_domains_domain_format_check` (check): `CHECK (domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'::text)`
- `sso_domains_domain_lower_check` (check): `CHECK (domain = lower(domain))`
- `sso_domains_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]))`
- `sso_domains_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `sso_domains_sso_provider_id_fkey` (foreign_key): `FOREIGN KEY (sso_provider_id) REFERENCES qarar_iam.sso_identity_providers(id) ON DELETE RESTRICT`
- `sso_domains_sso_provider_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (sso_provider_id, organization_id) REFERENCES qarar_iam.sso_identity_providers(id, organization_id)`
- `sso_domains_pkey` (primary_key): `PRIMARY KEY (id)`
- `sso_domains_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `sso_domains_organization_id_domain_key` (unique): `UNIQUE (organization_id, domain)`

**Indexes**
- `sso_domains_id_organization_id_key`: `CREATE UNIQUE INDEX sso_domains_id_organization_id_key ON qarar_iam.sso_domains USING btree (id, organization_id)`
- `sso_domains_organization_id_domain_key`: `CREATE UNIQUE INDEX sso_domains_organization_id_domain_key ON qarar_iam.sso_domains USING btree (organization_id, domain)`
- `sso_domains_pkey`: `CREATE UNIQUE INDEX sso_domains_pkey ON qarar_iam.sso_domains USING btree (id)`

### `qarar_iam.sso_group_membership_links`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `provider_id` | `uuid` | no | `-` |
| 4 | `mapping_id` | `uuid` | no | `-` |
| 5 | `user_id` | `uuid` | no | `-` |
| 6 | `membership_id` | `uuid` | no | `-` |
| 7 | `owns_membership` | `boolean` | no | `false` |
| 8 | `external_group` | `text` | no | `-` |
| 9 | `last_seen_at` | `timestamp with time zone` | no | `now()` |
| 10 | `created_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `sso_group_membership_links_mapping_id_fkey` (foreign_key): `FOREIGN KEY (mapping_id) REFERENCES qarar_iam.sso_group_role_mappings(id) ON DELETE CASCADE`
- `sso_group_membership_links_membership_id_fkey` (foreign_key): `FOREIGN KEY (membership_id) REFERENCES qarar_iam.memberships(id) ON DELETE CASCADE`
- `sso_group_membership_links_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `sso_group_membership_links_provider_id_fkey` (foreign_key): `FOREIGN KEY (provider_id) REFERENCES qarar_iam.sso_identity_providers(id) ON DELETE CASCADE`
- `sso_group_membership_links_provider_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (provider_id, organization_id) REFERENCES qarar_iam.sso_identity_providers(id, organization_id)`
- `sso_group_membership_links_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE CASCADE`
- `sso_group_membership_links_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `sso_group_membership_links_pkey` (primary_key): `PRIMARY KEY (id)`
- `sso_group_membership_links_organization_id_provider_id_mapp_key` (unique): `UNIQUE (organization_id, provider_id, mapping_id, user_id)`

**Indexes**
- `sso_group_membership_links_organization_id_provider_id_mapp_key`: `CREATE UNIQUE INDEX sso_group_membership_links_organization_id_provider_id_mapp_key ON qarar_iam.sso_group_membership_links USING btree (organization_id, provider_id, mapping_id, user_id)`
- `sso_group_membership_links_pkey`: `CREATE UNIQUE INDEX sso_group_membership_links_pkey ON qarar_iam.sso_group_membership_links USING btree (id)`
- `sso_group_membership_links_user_idx`: `CREATE INDEX sso_group_membership_links_user_idx ON qarar_iam.sso_group_membership_links USING btree (organization_id, provider_id, user_id)`

### `qarar_iam.sso_group_role_mappings`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `provider_id` | `uuid` | no | `-` |
| 4 | `external_group` | `text` | no | `-` |
| 5 | `role_id` | `uuid` | no | `-` |
| 6 | `governance_unit_id` | `uuid` | no | `-` |
| 7 | `membership_title` | `text` | yes | `-` |
| 8 | `is_active` | `boolean` | no | `true` |
| 9 | `created_at` | `timestamp with time zone` | no | `now()` |
| 10 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `sso_group_role_mappings_governance_unit_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `sso_group_role_mappings_governance_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `sso_group_role_mappings_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `sso_group_role_mappings_provider_id_fkey` (foreign_key): `FOREIGN KEY (provider_id) REFERENCES qarar_iam.sso_identity_providers(id) ON DELETE CASCADE`
- `sso_group_role_mappings_provider_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (provider_id, organization_id) REFERENCES qarar_iam.sso_identity_providers(id, organization_id)`
- `sso_group_role_mappings_role_id_fkey` (foreign_key): `FOREIGN KEY (role_id) REFERENCES qarar_iam.roles(id) ON DELETE RESTRICT`
- `sso_group_role_mappings_role_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (role_id, organization_id) REFERENCES qarar_iam.roles(id, organization_id)`
- `sso_group_role_mappings_pkey` (primary_key): `PRIMARY KEY (id)`
- `sso_group_role_mappings_organization_id_provider_id_externa_key` (unique): `UNIQUE (organization_id, provider_id, external_group)`

**Indexes**
- `sso_group_role_mappings_organization_id_provider_id_externa_key`: `CREATE UNIQUE INDEX sso_group_role_mappings_organization_id_provider_id_externa_key ON qarar_iam.sso_group_role_mappings USING btree (organization_id, provider_id, external_group)`
- `sso_group_role_mappings_pkey`: `CREATE UNIQUE INDEX sso_group_role_mappings_pkey ON qarar_iam.sso_group_role_mappings USING btree (id)`

### `qarar_iam.sso_identity_providers`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `provider_type` | `text` | no | `-` |
| 4 | `provider_name` | `text` | no | `-` |
| 5 | `supabase_sso_provider_id` | `uuid` | yes | `-` |
| 6 | `entity_id` | `text` | yes | `-` |
| 7 | `metadata_url` | `text` | yes | `-` |
| 8 | `attribute_mapping` | `jsonb` | no | `'{}'::jsonb` |
| 9 | `default_role_id` | `uuid` | yes | `-` |
| 10 | `default_governance_unit_id` | `uuid` | yes | `-` |
| 11 | `provisioning_mode` | `text` | no | `'invited_only'::text` |
| 12 | `status` | `text` | no | `'draft'::text` |
| 13 | `created_by_user_id` | `uuid` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | no | `now()` |
| 15 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `sso_identity_providers_metadata_url_check` (check): `CHECK (metadata_url IS NULL OR metadata_url ~* '^https://'::text)`
- `sso_identity_providers_provider_type_check` (check): `CHECK (provider_type = 'saml'::text)`
- `sso_identity_providers_provisioning_mode_check` (check): `CHECK (provisioning_mode = ANY (ARRAY['disabled'::text, 'invited_only'::text, 'jit'::text]))`
- `sso_identity_providers_status_check` (check): `CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'disabled'::text, 'archived'::text]))`
- `sso_identity_providers_created_by_user_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `sso_identity_providers_created_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `sso_identity_providers_default_governance_unit_id_fkey` (foreign_key): `FOREIGN KEY (default_governance_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `sso_identity_providers_default_governance_unit_id_organiza_fkey` (foreign_key): `FOREIGN KEY (default_governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `sso_identity_providers_default_role_id_fkey` (foreign_key): `FOREIGN KEY (default_role_id) REFERENCES qarar_iam.roles(id) ON DELETE RESTRICT`
- `sso_identity_providers_default_role_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (default_role_id, organization_id) REFERENCES qarar_iam.roles(id, organization_id)`
- `sso_identity_providers_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `sso_identity_providers_pkey` (primary_key): `PRIMARY KEY (id)`
- `sso_identity_providers_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `sso_identity_providers_organization_id_provider_name_key` (unique): `UNIQUE (organization_id, provider_name)`
- `sso_identity_providers_supabase_sso_provider_id_key` (unique): `UNIQUE (supabase_sso_provider_id)`

**Indexes**
- `sso_identity_providers_id_organization_id_key`: `CREATE UNIQUE INDEX sso_identity_providers_id_organization_id_key ON qarar_iam.sso_identity_providers USING btree (id, organization_id)`
- `sso_identity_providers_organization_id_provider_name_key`: `CREATE UNIQUE INDEX sso_identity_providers_organization_id_provider_name_key ON qarar_iam.sso_identity_providers USING btree (organization_id, provider_name)`
- `sso_identity_providers_pkey`: `CREATE UNIQUE INDEX sso_identity_providers_pkey ON qarar_iam.sso_identity_providers USING btree (id)`
- `sso_identity_providers_supabase_sso_provider_id_key`: `CREATE UNIQUE INDEX sso_identity_providers_supabase_sso_provider_id_key ON qarar_iam.sso_identity_providers USING btree (supabase_sso_provider_id)`

### `qarar_iam.user_identity_links`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `user_id` | `uuid` | no | `-` |
| 4 | `provider_id` | `uuid` | no | `-` |
| 5 | `external_subject` | `text` | no | `-` |
| 6 | `external_email` | `text` | yes | `-` |
| 7 | `last_login_at` | `timestamp with time zone` | yes | `-` |
| 8 | `linked_at` | `timestamp with time zone` | no | `now()` |
| 9 | `status` | `text` | no | `'active'::text` |

**Constraints and relationships**
- `user_identity_links_external_email_check` (check): `CHECK (external_email IS NULL OR external_email = lower(external_email))`
- `user_identity_links_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]))`
- `user_identity_links_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `user_identity_links_provider_id_fkey` (foreign_key): `FOREIGN KEY (provider_id) REFERENCES qarar_iam.sso_identity_providers(id) ON DELETE RESTRICT`
- `user_identity_links_provider_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (provider_id, organization_id) REFERENCES qarar_iam.sso_identity_providers(id, organization_id)`
- `user_identity_links_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `user_identity_links_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `user_identity_links_pkey` (primary_key): `PRIMARY KEY (id)`
- `user_identity_links_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `user_identity_links_organization_id_user_id_provider_id_key` (unique): `UNIQUE (organization_id, user_id, provider_id)`
- `user_identity_links_provider_id_external_subject_key` (unique): `UNIQUE (provider_id, external_subject)`

**Indexes**
- `user_identity_links_id_organization_id_key`: `CREATE UNIQUE INDEX user_identity_links_id_organization_id_key ON qarar_iam.user_identity_links USING btree (id, organization_id)`
- `user_identity_links_organization_id_user_id_provider_id_key`: `CREATE UNIQUE INDEX user_identity_links_organization_id_user_id_provider_id_key ON qarar_iam.user_identity_links USING btree (organization_id, user_id, provider_id)`
- `user_identity_links_pkey`: `CREATE UNIQUE INDEX user_identity_links_pkey ON qarar_iam.user_identity_links USING btree (id)`
- `user_identity_links_provider_id_external_subject_key`: `CREATE UNIQUE INDEX user_identity_links_provider_id_external_subject_key ON qarar_iam.user_identity_links USING btree (provider_id, external_subject)`

### `qarar_iam.user_invitations`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `email` | `text` | no | `-` |
| 4 | `full_name_ar` | `text` | yes | `-` |
| 5 | `role_id` | `uuid` | yes | `-` |
| 6 | `governance_unit_id` | `uuid` | yes | `-` |
| 7 | `invitation_status` | `text` | no | `'pending'::text` |
| 8 | `invited_by_user_id` | `uuid` | no | `-` |
| 9 | `accepted_by_user_id` | `uuid` | yes | `-` |
| 10 | `token_hash` | `text` | yes | `-` |
| 11 | `expires_at` | `timestamp with time zone` | no | `(now() + '7 days'::interval)` |
| 12 | `accepted_at` | `timestamp with time zone` | yes | `-` |
| 13 | `revoked_at` | `timestamp with time zone` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | no | `now()` |
| 15 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 16 | `auth_user_id` | `uuid` | yes | `-` |
| 17 | `activation_claim_hash` | `text` | yes | `-` |
| 18 | `activation_claimed_at` | `timestamp with time zone` | yes | `-` |

**Constraints and relationships**
- `user_invitations_check` (check): `CHECK (expires_at > created_at)`
- `user_invitations_email_check` (check): `CHECK (email = lower(email))`
- `user_invitations_email_check1` (check): `CHECK (POSITION(('@'::text) IN (email)) > 1)`
- `user_invitations_invitation_status_check` (check): `CHECK (invitation_status = ANY (ARRAY['pending'::text, 'activating'::text, 'accepted'::text, 'revoked'::text, 'expired'::text]))`
- `user_invitations_accepted_by_user_id_fkey` (foreign_key): `FOREIGN KEY (accepted_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `user_invitations_accepted_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (accepted_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `user_invitations_governance_unit_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `user_invitations_governance_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `user_invitations_invited_by_user_id_fkey` (foreign_key): `FOREIGN KEY (invited_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `user_invitations_invited_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (invited_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `user_invitations_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `user_invitations_role_id_fkey` (foreign_key): `FOREIGN KEY (role_id) REFERENCES qarar_iam.roles(id) ON DELETE RESTRICT`
- `user_invitations_role_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (role_id, organization_id) REFERENCES qarar_iam.roles(id, organization_id)`
- `user_invitations_pkey` (primary_key): `PRIMARY KEY (id)`
- `user_invitations_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `uq_pending_user_invitation_email`: `CREATE UNIQUE INDEX uq_pending_user_invitation_email ON qarar_iam.user_invitations USING btree (organization_id, email) WHERE (invitation_status = 'pending'::text)`
- `uq_user_invitations_auth_user`: `CREATE UNIQUE INDEX uq_user_invitations_auth_user ON qarar_iam.user_invitations USING btree (auth_user_id) WHERE ((auth_user_id IS NOT NULL) AND (invitation_status = ANY (ARRAY['pending'::text, 'activating'::text])))`
- `user_invitations_id_organization_id_key`: `CREATE UNIQUE INDEX user_invitations_id_organization_id_key ON qarar_iam.user_invitations USING btree (id, organization_id)`
- `user_invitations_pkey`: `CREATE UNIQUE INDEX user_invitations_pkey ON qarar_iam.user_invitations USING btree (id)`

### `qarar_iam.user_offboarding_requests`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `target_user_id` | `uuid` | no | `-` |
| 4 | `successor_user_id` | `uuid` | yes | `-` |
| 5 | `justification` | `text` | no | `-` |
| 6 | `status` | `text` | no | `'pending'::text` |
| 7 | `requested_by_user_id` | `uuid` | no | `-` |
| 8 | `reviewed_by_user_id` | `uuid` | yes | `-` |
| 9 | `review_notes` | `text` | yes | `-` |
| 10 | `reviewed_at` | `timestamp with time zone` | yes | `-` |
| 11 | `applied_at` | `timestamp with time zone` | yes | `-` |
| 12 | `correlation_id` | `uuid` | no | `gen_random_uuid()` |
| 13 | `created_at` | `timestamp with time zone` | no | `now()` |
| 14 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `user_offboarding_requests_check` (check): `CHECK (target_user_id <> requested_by_user_id)`
- `user_offboarding_requests_check1` (check): `CHECK (successor_user_id IS NULL OR successor_user_id <> target_user_id)`
- `user_offboarding_requests_check2` (check): `CHECK (reviewed_by_user_id IS NULL OR reviewed_by_user_id <> requested_by_user_id)`
- `user_offboarding_requests_status_check` (check): `CHECK (status = ANY (ARRAY['pending'::text, 'rejected'::text, 'applied'::text, 'failed'::text]))`
- `user_offboarding_requests_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `user_offboarding_requests_requested_by_user_id_organizatio_fkey` (foreign_key): `FOREIGN KEY (requested_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `user_offboarding_requests_reviewed_by_user_id_organization_fkey` (foreign_key): `FOREIGN KEY (reviewed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `user_offboarding_requests_successor_user_id_organization_i_fkey` (foreign_key): `FOREIGN KEY (successor_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `user_offboarding_requests_target_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (target_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `user_offboarding_requests_pkey` (primary_key): `PRIMARY KEY (id)`

**Indexes**
- `user_offboarding_one_pending_target_idx`: `CREATE UNIQUE INDEX user_offboarding_one_pending_target_idx ON qarar_iam.user_offboarding_requests USING btree (organization_id, target_user_id) WHERE (status = 'pending'::text)`
- `user_offboarding_requests_pkey`: `CREATE UNIQUE INDEX user_offboarding_requests_pkey ON qarar_iam.user_offboarding_requests USING btree (id)`
- `user_offboarding_review_queue_idx`: `CREATE INDEX user_offboarding_review_queue_idx ON qarar_iam.user_offboarding_requests USING btree (organization_id, created_at) WHERE (status = 'pending'::text)`

### `qarar_iam.user_preferences`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `user_id` | `uuid` | no | `-` |
| 4 | `locale` | `text` | no | `'ar-SA'::text` |
| 5 | `timezone` | `text` | no | `'Asia/Riyadh'::text` |
| 6 | `notification_settings` | `jsonb` | no | `'{}'::jsonb` |
| 7 | `ui_settings` | `jsonb` | no | `'{}'::jsonb` |
| 8 | `created_at` | `timestamp with time zone` | no | `now()` |
| 9 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `user_preferences_locale_check` (check): `CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'::text)`
- `user_preferences_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `user_preferences_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE CASCADE`
- `user_preferences_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `user_preferences_pkey` (primary_key): `PRIMARY KEY (id)`
- `user_preferences_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `user_preferences_organization_id_user_id_key` (unique): `UNIQUE (organization_id, user_id)`

**Indexes**
- `user_preferences_id_organization_id_key`: `CREATE UNIQUE INDEX user_preferences_id_organization_id_key ON qarar_iam.user_preferences USING btree (id, organization_id)`
- `user_preferences_organization_id_user_id_key`: `CREATE UNIQUE INDEX user_preferences_organization_id_user_id_key ON qarar_iam.user_preferences USING btree (organization_id, user_id)`
- `user_preferences_pkey`: `CREATE UNIQUE INDEX user_preferences_pkey ON qarar_iam.user_preferences USING btree (id)`

### `qarar_iam.user_sessions`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `user_id` | `uuid` | no | `-` |
| 4 | `auth_session_id` | `uuid` | yes | `-` |
| 5 | `device_id` | `text` | no | `-` |
| 6 | `device_name` | `text` | yes | `-` |
| 7 | `platform` | `text` | yes | `-` |
| 8 | `app_version` | `text` | yes | `-` |
| 9 | `ip_address` | `inet` | yes | `-` |
| 10 | `user_agent` | `text` | yes | `-` |
| 11 | `last_seen_at` | `timestamp with time zone` | no | `now()` |
| 12 | `revoked_at` | `timestamp with time zone` | yes | `-` |
| 13 | `revocation_reason` | `text` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | no | `now()` |
| 15 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `user_sessions_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `user_sessions_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE CASCADE`
- `user_sessions_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `user_sessions_pkey` (primary_key): `PRIMARY KEY (id)`
- `user_sessions_organization_id_user_id_device_id_key` (unique): `UNIQUE (organization_id, user_id, device_id)`

**Indexes**
- `user_sessions_active_idx`: `CREATE INDEX user_sessions_active_idx ON qarar_iam.user_sessions USING btree (user_id, last_seen_at DESC) WHERE (revoked_at IS NULL)`
- `user_sessions_organization_id_user_id_device_id_key`: `CREATE UNIQUE INDEX user_sessions_organization_id_user_id_device_id_key ON qarar_iam.user_sessions USING btree (organization_id, user_id, device_id)`
- `user_sessions_pkey`: `CREATE UNIQUE INDEX user_sessions_pkey ON qarar_iam.user_sessions USING btree (id)`

### `qarar_iam.users`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `-` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `employee_no` | `text` | yes | `-` |
| 4 | `full_name_ar` | `text` | no | `-` |
| 5 | `full_name_en` | `text` | yes | `-` |
| 6 | `email` | `text` | no | `-` |
| 7 | `mobile` | `text` | yes | `-` |
| 8 | `job_title` | `text` | yes | `-` |
| 9 | `status` | `text` | no | `'active'::text` |
| 10 | `is_system_admin` | `boolean` | no | `false` |
| 11 | `created_at` | `timestamp with time zone` | no | `now()` |
| 12 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `users_status_check` (check): `CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text]))`
- `users_id_fkey` (foreign_key): `FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT`
- `users_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `users_pkey` (primary_key): `PRIMARY KEY (id)`
- `users_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `users_organization_id_email_key` (unique): `UNIQUE (organization_id, email)`
- `users_organization_id_employee_no_key` (unique): `UNIQUE (organization_id, employee_no)`

**Indexes**
- `idx_users_organization_id`: `CREATE INDEX idx_users_organization_id ON qarar_iam.users USING btree (organization_id)`
- `users_id_organization_id_key`: `CREATE UNIQUE INDEX users_id_organization_id_key ON qarar_iam.users USING btree (id, organization_id)`
- `users_organization_id_email_key`: `CREATE UNIQUE INDEX users_organization_id_email_key ON qarar_iam.users USING btree (organization_id, email)`
- `users_organization_id_employee_no_key`: `CREATE UNIQUE INDEX users_organization_id_employee_no_key ON qarar_iam.users USING btree (organization_id, employee_no)`
- `users_pkey`: `CREATE UNIQUE INDEX users_pkey ON qarar_iam.users USING btree (id)`

### `qarar_internal.applied_migrations`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `version` | `text` | no | `-` |
| 2 | `checksum_sha256` | `text` | yes | `-` |
| 3 | `applied_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `applied_migrations_checksum_sha256_check` (check): `CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `applied_migrations_pkey` (primary_key): `PRIMARY KEY (version)`

**Indexes**
- `applied_migrations_pkey`: `CREATE UNIQUE INDEX applied_migrations_pkey ON qarar_internal.applied_migrations USING btree (version)`

### `qarar_meetings.agenda_items`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_id` | `uuid` | no | `-` |
| 4 | `topic_id` | `uuid` | no | `-` |
| 5 | `agenda_order` | `integer` | no | `-` |
| 6 | `agenda_status` | `text` | no | `'pending'::text` |
| 7 | `discussion_notes` | `text` | yes | `-` |
| 8 | `created_at` | `timestamp with time zone` | no | `now()` |
| 9 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 10 | `is_exception` | `boolean` | no | `false` |
| 11 | `exception_reason` | `text` | yes | `-` |
| 12 | `voting_status` | `text` | no | `'not_started'::text` |
| 13 | `voting_result` | `text` | no | `'pending'::text` |
| 14 | `topic_status_before_listing` | `text` | yes | `-` |

**Constraints and relationships**
- `agenda_items_agenda_order_check` (check): `CHECK (agenda_order > 0)`
- `agenda_items_agenda_status_check` (check): `CHECK (agenda_status = ANY (ARRAY['pending'::text, 'under_discussion'::text, 'discussed'::text, 'postponed'::text]))`
- `agenda_items_voting_result_check` (check): `CHECK (voting_result = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'tied'::text]))`
- `agenda_items_voting_status_check` (check): `CHECK (voting_status = ANY (ARRAY['not_started'::text, 'open'::text, 'closed'::text]))`
- `agenda_items_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `agenda_items_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `agenda_items_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `agenda_items_topic_id_fkey` (foreign_key): `FOREIGN KEY (topic_id) REFERENCES qarar_topics.topics(id) ON DELETE RESTRICT`
- `agenda_items_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id)`
- `agenda_items_pkey` (primary_key): `PRIMARY KEY (id)`
- `agenda_items_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `agenda_items_meeting_id_topic_id_key` (unique): `UNIQUE (meeting_id, topic_id)`

**Indexes**
- `agenda_items_id_organization_id_key`: `CREATE UNIQUE INDEX agenda_items_id_organization_id_key ON qarar_meetings.agenda_items USING btree (id, organization_id)`
- `agenda_items_meeting_id_topic_id_key`: `CREATE UNIQUE INDEX agenda_items_meeting_id_topic_id_key ON qarar_meetings.agenda_items USING btree (meeting_id, topic_id)`
- `agenda_items_meeting_order_uidx`: `CREATE UNIQUE INDEX agenda_items_meeting_order_uidx ON qarar_meetings.agenda_items USING btree (meeting_id, agenda_order)`
- `agenda_items_pkey`: `CREATE UNIQUE INDEX agenda_items_pkey ON qarar_meetings.agenda_items USING btree (id)`
- `idx_agenda_items_meeting`: `CREATE INDEX idx_agenda_items_meeting ON qarar_meetings.agenda_items USING btree (meeting_id)`

### `qarar_meetings.meeting_number_counters`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `organization_id` | `uuid` | no | `-` |
| 2 | `calendar_year` | `integer` | no | `-` |
| 3 | `last_value` | `bigint` | no | `-` |
| 4 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `meeting_number_counters_calendar_year_check` (check): `CHECK (calendar_year >= 2000 AND calendar_year <= 9999)`
- `meeting_number_counters_last_value_check` (check): `CHECK (last_value > 0)`
- `meeting_number_counters_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `meeting_number_counters_pkey` (primary_key): `PRIMARY KEY (organization_id, calendar_year)`

**Indexes**
- `meeting_number_counters_pkey`: `CREATE UNIQUE INDEX meeting_number_counters_pkey ON qarar_meetings.meeting_number_counters USING btree (organization_id, calendar_year)`

### `qarar_meetings.meeting_status_history`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_id` | `uuid` | no | `-` |
| 4 | `from_status` | `text` | yes | `-` |
| 5 | `to_status` | `text` | no | `-` |
| 6 | `changed_by_user_id` | `uuid` | yes | `-` |
| 7 | `change_reason` | `text` | yes | `-` |
| 8 | `changed_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `meeting_status_history_changed_by_user_id_fkey` (foreign_key): `FOREIGN KEY (changed_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `meeting_status_history_changed_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (changed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `meeting_status_history_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `meeting_status_history_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `meeting_status_history_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `meeting_status_history_pkey` (primary_key): `PRIMARY KEY (id)`

**Indexes**
- `meeting_status_history_meeting_time_idx`: `CREATE INDEX meeting_status_history_meeting_time_idx ON qarar_meetings.meeting_status_history USING btree (organization_id, meeting_id, changed_at, id)`
- `meeting_status_history_pkey`: `CREATE UNIQUE INDEX meeting_status_history_pkey ON qarar_meetings.meeting_status_history USING btree (id)`

### `qarar_meetings.meeting_types`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `code` | `text` | no | `-` |
| 4 | `name_ar` | `text` | no | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `is_active` | `boolean` | no | `true` |
| 8 | `created_at` | `timestamp with time zone` | no | `now()` |
| 9 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `meeting_types_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `meeting_types_pkey` (primary_key): `PRIMARY KEY (id)`
- `meeting_types_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `meeting_types_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `meeting_types_id_organization_id_key`: `CREATE UNIQUE INDEX meeting_types_id_organization_id_key ON qarar_meetings.meeting_types USING btree (id, organization_id)`
- `meeting_types_organization_id_code_key`: `CREATE UNIQUE INDEX meeting_types_organization_id_code_key ON qarar_meetings.meeting_types USING btree (organization_id, code)`
- `meeting_types_pkey`: `CREATE UNIQUE INDEX meeting_types_pkey ON qarar_meetings.meeting_types USING btree (id)`

### `qarar_meetings.meetings`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_no` | `text` | no | `-` |
| 4 | `governance_unit_id` | `uuid` | no | `-` |
| 5 | `meeting_type_id` | `uuid` | yes | `-` |
| 6 | `title_ar` | `text` | no | `-` |
| 7 | `title_en` | `text` | yes | `-` |
| 8 | `scheduled_date` | `date` | no | `-` |
| 9 | `start_time` | `time without time zone` | yes | `-` |
| 10 | `end_time` | `time without time zone` | yes | `-` |
| 11 | `location_type` | `text` | no | `'onsite'::text` |
| 12 | `location_details` | `text` | yes | `-` |
| 13 | `status` | `text` | no | `'draft'::text` |
| 14 | `quorum_status` | `text` | no | `'not_calculated'::text` |
| 15 | `created_by_user_id` | `uuid` | no | `-` |
| 16 | `created_at` | `timestamp with time zone` | no | `now()` |
| 17 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 18 | `client_request_id` | `uuid` | yes | `-` |
| 19 | `attendance_locked_at` | `timestamp with time zone` | yes | `-` |
| 20 | `attendance_locked_by_user_id` | `uuid` | yes | `-` |

**Constraints and relationships**
- `meetings_location_type_check` (check): `CHECK (location_type = ANY (ARRAY['onsite'::text, 'online'::text, 'hybrid'::text]))`
- `meetings_quorum_status_check` (check): `CHECK (quorum_status = ANY (ARRAY['not_calculated'::text, 'met'::text, 'not_met'::text]))`
- `meetings_status_check` (check): `CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'ready_to_start'::text, 'in_progress'::text, 'waiting_for_minutes'::text, 'waiting_for_approval'::text, 'closed'::text, 'archived'::text, 'cancelled'::text, 'postponed'::text]))`
- `meetings_attendance_locked_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (attendance_locked_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `meetings_created_by_user_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `meetings_created_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `meetings_governance_unit_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `meetings_governance_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (governance_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `meetings_meeting_type_id_fkey` (foreign_key): `FOREIGN KEY (meeting_type_id) REFERENCES qarar_meetings.meeting_types(id) ON DELETE RESTRICT`
- `meetings_meeting_type_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_type_id, organization_id) REFERENCES qarar_meetings.meeting_types(id, organization_id)`
- `meetings_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `meetings_pkey` (primary_key): `PRIMARY KEY (id)`
- `meetings_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `meetings_organization_id_meeting_no_key` (unique): `UNIQUE (organization_id, meeting_no)`

**Indexes**
- `idx_meetings_org_unit`: `CREATE INDEX idx_meetings_org_unit ON qarar_meetings.meetings USING btree (organization_id, governance_unit_id)`
- `meetings_id_organization_id_key`: `CREATE UNIQUE INDEX meetings_id_organization_id_key ON qarar_meetings.meetings USING btree (id, organization_id)`
- `meetings_idempotency_key_idx`: `CREATE UNIQUE INDEX meetings_idempotency_key_idx ON qarar_meetings.meetings USING btree (organization_id, created_by_user_id, client_request_id) WHERE (client_request_id IS NOT NULL)`
- `meetings_organization_id_meeting_no_key`: `CREATE UNIQUE INDEX meetings_organization_id_meeting_no_key ON qarar_meetings.meetings USING btree (organization_id, meeting_no)`
- `meetings_pkey`: `CREATE UNIQUE INDEX meetings_pkey ON qarar_meetings.meetings USING btree (id)`
- `meetings_search_idx`: `CREATE INDEX meetings_search_idx ON qarar_meetings.meetings USING btree (organization_id, governance_unit_id, status, scheduled_date, created_at DESC)`

### `qarar_minutes.meeting_minutes`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_id` | `uuid` | no | `-` |
| 4 | `content_draft` | `text` | yes | `-` |
| 5 | `content_final` | `text` | yes | `-` |
| 6 | `status` | `text` | no | `'draft'::text` |
| 7 | `generated_by_ai` | `boolean` | no | `false` |
| 8 | `generated_at` | `timestamp with time zone` | yes | `-` |
| 9 | `reviewed_by_user_id` | `uuid` | yes | `-` |
| 10 | `reviewed_at` | `timestamp with time zone` | yes | `-` |
| 11 | `approved_at` | `timestamp with time zone` | yes | `-` |
| 12 | `created_at` | `timestamp with time zone` | no | `now()` |
| 13 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 14 | `created_by_user_id` | `uuid` | yes | `-` |
| 15 | `final_content_hash` | `text` | yes | `-` |

**Constraints and relationships**
- `meeting_minutes_status_check` (check): `CHECK (status = ANY (ARRAY['draft'::text, 'generated'::text, 'ready_for_approval'::text, 'approved'::text]))`
- `meeting_minutes_created_by_user_id_fkey` (foreign_key): `FOREIGN KEY (created_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `meeting_minutes_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `meeting_minutes_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `meeting_minutes_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `meeting_minutes_reviewed_by_user_id_fkey` (foreign_key): `FOREIGN KEY (reviewed_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `meeting_minutes_reviewed_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (reviewed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `meeting_minutes_pkey` (primary_key): `PRIMARY KEY (id)`
- `meeting_minutes_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `meeting_minutes_meeting_id_organization_id_key` (unique): `UNIQUE (meeting_id, organization_id)`

**Indexes**
- `idx_meeting_minutes_meeting`: `CREATE INDEX idx_meeting_minutes_meeting ON qarar_minutes.meeting_minutes USING btree (meeting_id)`
- `meeting_minutes_id_organization_id_key`: `CREATE UNIQUE INDEX meeting_minutes_id_organization_id_key ON qarar_minutes.meeting_minutes USING btree (id, organization_id)`
- `meeting_minutes_meeting_id_organization_id_key`: `CREATE UNIQUE INDEX meeting_minutes_meeting_id_organization_id_key ON qarar_minutes.meeting_minutes USING btree (meeting_id, organization_id)`
- `meeting_minutes_pkey`: `CREATE UNIQUE INDEX meeting_minutes_pkey ON qarar_minutes.meeting_minutes USING btree (id)`

### `qarar_minutes.minute_approvals`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `minute_id` | `uuid` | no | `-` |
| 4 | `user_id` | `uuid` | no | `-` |
| 5 | `membership_id` | `uuid` | yes | `-` |
| 6 | `approval_status` | `text` | no | `'pending'::text` |
| 7 | `notes` | `text` | yes | `-` |
| 8 | `resolved_at` | `timestamp with time zone` | yes | `-` |
| 9 | `created_at` | `timestamp with time zone` | no | `now()` |
| 10 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 11 | `signature_strokes` | `jsonb` | yes | `-` |
| 12 | `signature_hash` | `text` | yes | `-` |
| 13 | `signed_content_hash` | `text` | yes | `-` |
| 14 | `signed_at` | `timestamp with time zone` | yes | `-` |

**Constraints and relationships**
- `minute_approvals_approval_status_check` (check): `CHECK (approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))`
- `minute_approvals_membership_id_fkey` (foreign_key): `FOREIGN KEY (membership_id) REFERENCES qarar_iam.memberships(id) ON DELETE SET NULL`
- `minute_approvals_minute_id_fkey` (foreign_key): `FOREIGN KEY (minute_id) REFERENCES qarar_minutes.meeting_minutes(id) ON DELETE RESTRICT`
- `minute_approvals_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `minute_approvals_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `minute_approvals_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `minute_approvals_pkey` (primary_key): `PRIMARY KEY (id)`
- `minute_approvals_minute_id_user_id_key` (unique): `UNIQUE (minute_id, user_id)`

**Indexes**
- `minute_approvals_minute_id_user_id_key`: `CREATE UNIQUE INDEX minute_approvals_minute_id_user_id_key ON qarar_minutes.minute_approvals USING btree (minute_id, user_id)`
- `minute_approvals_pkey`: `CREATE UNIQUE INDEX minute_approvals_pkey ON qarar_minutes.minute_approvals USING btree (id)`

### `qarar_topics.topic_attachments`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `extensions.gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | no | `-` |
| 4 | `file_name` | `text` | no | `-` |
| 5 | `file_url` | `text` | no | `-` |
| 6 | `mime_type` | `text` | no | `-` |
| 7 | `file_size_bytes` | `bigint` | no | `-` |
| 8 | `description` | `text` | yes | `-` |
| 9 | `uploaded_by_user_id` | `uuid` | no | `-` |
| 10 | `created_at` | `timestamp with time zone` | no | `clock_timestamp()` |
| 11 | `requirement_code` | `text` | yes | `-` |

**Constraints and relationships**
- `topic_attachments_description_check` (check): `CHECK (description IS NULL OR char_length(btrim(description)) <= 2000)`
- `topic_attachments_file_name_check` (check): `CHECK (char_length(btrim(file_name)) >= 1 AND char_length(btrim(file_name)) <= 255)`
- `topic_attachments_file_size_bytes_check` (check): `CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400)`
- `topic_attachments_file_url_check` (check): `CHECK (file_url ~ '^https?://'::text)`
- `topic_attachments_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `topic_attachments_topic_id_fkey` (foreign_key): `FOREIGN KEY (topic_id) REFERENCES qarar_topics.topics(id) ON DELETE CASCADE`
- `topic_attachments_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id) ON DELETE CASCADE`
- `topic_attachments_uploaded_by_user_id_fkey` (foreign_key): `FOREIGN KEY (uploaded_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `topic_attachments_uploaded_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (uploaded_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `topic_attachments_pkey` (primary_key): `PRIMARY KEY (id)`
- `topic_attachments_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `topic_attachments_id_organization_id_key`: `CREATE UNIQUE INDEX topic_attachments_id_organization_id_key ON qarar_topics.topic_attachments USING btree (id, organization_id)`
- `topic_attachments_pkey`: `CREATE UNIQUE INDEX topic_attachments_pkey ON qarar_topics.topic_attachments USING btree (id)`
- `topic_attachments_topic_idx`: `CREATE INDEX topic_attachments_topic_idx ON qarar_topics.topic_attachments USING btree (organization_id, topic_id, created_at DESC)`

### `qarar_topics.topic_categories`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `code` | `text` | no | `-` |
| 4 | `name_ar` | `text` | no | `-` |
| 5 | `name_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `is_active` | `boolean` | no | `true` |
| 8 | `created_at` | `timestamp with time zone` | no | `now()` |
| 9 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `topic_categories_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `topic_categories_pkey` (primary_key): `PRIMARY KEY (id)`
- `topic_categories_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `topic_categories_organization_id_code_key` (unique): `UNIQUE (organization_id, code)`

**Indexes**
- `topic_categories_id_organization_id_key`: `CREATE UNIQUE INDEX topic_categories_id_organization_id_key ON qarar_topics.topic_categories USING btree (id, organization_id)`
- `topic_categories_organization_id_code_key`: `CREATE UNIQUE INDEX topic_categories_organization_id_code_key ON qarar_topics.topic_categories USING btree (organization_id, code)`
- `topic_categories_pkey`: `CREATE UNIQUE INDEX topic_categories_pkey ON qarar_topics.topic_categories USING btree (id)`

### `qarar_topics.topic_number_counters`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `organization_id` | `uuid` | no | `-` |
| 2 | `calendar_year` | `integer` | no | `-` |
| 3 | `last_value` | `bigint` | no | `-` |
| 4 | `updated_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `topic_number_counters_calendar_year_check` (check): `CHECK (calendar_year >= 2000 AND calendar_year <= 9999)`
- `topic_number_counters_last_value_check` (check): `CHECK (last_value > 0)`
- `topic_number_counters_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `topic_number_counters_pkey` (primary_key): `PRIMARY KEY (organization_id, calendar_year)`

**Indexes**
- `topic_number_counters_pkey`: `CREATE UNIQUE INDEX topic_number_counters_pkey ON qarar_topics.topic_number_counters USING btree (organization_id, calendar_year)`

### `qarar_topics.topic_referrals`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | no | `-` |
| 4 | `from_unit_id` | `uuid` | yes | `-` |
| 5 | `to_unit_id` | `uuid` | no | `-` |
| 6 | `referred_by_user_id` | `uuid` | no | `-` |
| 7 | `referral_reason` | `text` | no | `-` |
| 8 | `status` | `text` | no | `'pending'::text` |
| 9 | `referred_at` | `timestamp with time zone` | no | `now()` |
| 10 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 11 | `response_reason` | `text` | yes | `-` |
| 12 | `responded_by_user_id` | `uuid` | yes | `-` |
| 13 | `responded_at` | `timestamp with time zone` | yes | `-` |

**Constraints and relationships**
- `topic_referrals_status_check` (check): `CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text]))`
- `topic_referrals_from_unit_id_fkey` (foreign_key): `FOREIGN KEY (from_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `topic_referrals_from_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (from_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `topic_referrals_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `topic_referrals_referred_by_user_id_fkey` (foreign_key): `FOREIGN KEY (referred_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `topic_referrals_referred_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (referred_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `topic_referrals_responded_by_user_id_fkey` (foreign_key): `FOREIGN KEY (responded_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `topic_referrals_responded_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (responded_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `topic_referrals_to_unit_id_fkey` (foreign_key): `FOREIGN KEY (to_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `topic_referrals_to_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (to_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `topic_referrals_topic_id_fkey` (foreign_key): `FOREIGN KEY (topic_id) REFERENCES qarar_topics.topics(id) ON DELETE RESTRICT`
- `topic_referrals_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id)`
- `topic_referrals_pkey` (primary_key): `PRIMARY KEY (id)`
- `topic_referrals_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `topic_referrals_id_organization_id_key`: `CREATE UNIQUE INDEX topic_referrals_id_organization_id_key ON qarar_topics.topic_referrals USING btree (id, organization_id)`
- `topic_referrals_one_pending_uidx`: `CREATE UNIQUE INDEX topic_referrals_one_pending_uidx ON qarar_topics.topic_referrals USING btree (topic_id) WHERE (status = 'pending'::text)`
- `topic_referrals_pkey`: `CREATE UNIQUE INDEX topic_referrals_pkey ON qarar_topics.topic_referrals USING btree (id)`
- `topic_referrals_topic_time_idx`: `CREATE INDEX topic_referrals_topic_time_idx ON qarar_topics.topic_referrals USING btree (organization_id, topic_id, referred_at, id)`

### `qarar_topics.topic_requirement_fulfillments`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `extensions.gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | no | `-` |
| 4 | `requirement_code` | `text` | no | `-` |
| 5 | `status` | `text` | no | `'fulfilled'::text` |
| 6 | `evidence_attachment_id` | `uuid` | yes | `-` |
| 7 | `note` | `text` | yes | `-` |
| 8 | `fulfilled_by_user_id` | `uuid` | yes | `-` |
| 9 | `fulfilled_at` | `timestamp with time zone` | yes | `-` |
| 10 | `created_at` | `timestamp with time zone` | no | `clock_timestamp()` |
| 11 | `updated_at` | `timestamp with time zone` | no | `clock_timestamp()` |

**Constraints and relationships**
- `topic_requirement_fulfillments_note_check` (check): `CHECK (note IS NULL OR char_length(btrim(note)) <= 2000)`
- `topic_requirement_fulfillments_status_check` (check): `CHECK (status = ANY (ARRAY['pending'::text, 'fulfilled'::text, 'waived'::text]))`
- `topic_requirement_fulfillment_evidence_attachment_id_organ_fkey` (foreign_key): `FOREIGN KEY (evidence_attachment_id, organization_id) REFERENCES qarar_topics.topic_attachments(id, organization_id) ON DELETE SET NULL`
- `topic_requirement_fulfillment_fulfilled_by_user_id_organiz_fkey` (foreign_key): `FOREIGN KEY (fulfilled_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id) ON DELETE RESTRICT`
- `topic_requirement_fulfillments_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id) ON DELETE CASCADE`
- `topic_requirement_fulfillments_pkey` (primary_key): `PRIMARY KEY (id)`
- `topic_requirement_fulfillments_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `topic_requirement_fulfillments_topic_id_requirement_code_key` (unique): `UNIQUE (topic_id, requirement_code)`

**Indexes**
- `topic_requirement_fulfillments_id_organization_id_key`: `CREATE UNIQUE INDEX topic_requirement_fulfillments_id_organization_id_key ON qarar_topics.topic_requirement_fulfillments USING btree (id, organization_id)`
- `topic_requirement_fulfillments_pkey`: `CREATE UNIQUE INDEX topic_requirement_fulfillments_pkey ON qarar_topics.topic_requirement_fulfillments USING btree (id)`
- `topic_requirement_fulfillments_topic_id_requirement_code_key`: `CREATE UNIQUE INDEX topic_requirement_fulfillments_topic_id_requirement_code_key ON qarar_topics.topic_requirement_fulfillments USING btree (topic_id, requirement_code)`

### `qarar_topics.topic_status_history`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_id` | `uuid` | no | `-` |
| 4 | `from_status` | `text` | yes | `-` |
| 5 | `to_status` | `text` | no | `-` |
| 6 | `changed_by_user_id` | `uuid` | yes | `-` |
| 7 | `changed_at` | `timestamp with time zone` | no | `now()` |
| 8 | `change_reason` | `text` | yes | `-` |

**Constraints and relationships**
- `topic_status_history_changed_by_user_id_fkey` (foreign_key): `FOREIGN KEY (changed_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `topic_status_history_changed_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (changed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `topic_status_history_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `topic_status_history_topic_id_fkey` (foreign_key): `FOREIGN KEY (topic_id) REFERENCES qarar_topics.topics(id) ON DELETE RESTRICT`
- `topic_status_history_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id)`
- `topic_status_history_pkey` (primary_key): `PRIMARY KEY (id)`

**Indexes**
- `topic_status_history_pkey`: `CREATE UNIQUE INDEX topic_status_history_pkey ON qarar_topics.topic_status_history USING btree (id)`
- `topic_status_history_topic_time_idx`: `CREATE INDEX topic_status_history_topic_time_idx ON qarar_topics.topic_status_history USING btree (organization_id, topic_id, changed_at, id)`

### `qarar_topics.topics`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `topic_no` | `text` | no | `-` |
| 4 | `title_ar` | `text` | no | `-` |
| 5 | `title_en` | `text` | yes | `-` |
| 6 | `description` | `text` | yes | `-` |
| 7 | `category_id` | `uuid` | yes | `-` |
| 8 | `current_unit_id` | `uuid` | yes | `-` |
| 9 | `submitted_by_user_id` | `uuid` | no | `-` |
| 10 | `source_type` | `text` | no | `'new'::text` |
| 11 | `priority` | `text` | no | `'medium'::text` |
| 12 | `status` | `text` | no | `'new'::text` |
| 13 | `submitted_at` | `timestamp with time zone` | yes | `-` |
| 14 | `created_at` | `timestamp with time zone` | no | `now()` |
| 15 | `updated_at` | `timestamp with time zone` | no | `now()` |
| 16 | `client_request_id` | `uuid` | yes | `-` |
| 17 | `governance_source` | `text` | yes | `'legacy'::text` |
| 18 | `policy_id` | `uuid` | yes | `-` |
| 19 | `policy_version_id` | `uuid` | yes | `-` |
| 20 | `policy_item_id` | `uuid` | yes | `-` |
| 21 | `policy_scope_assignment_id` | `uuid` | yes | `-` |
| 22 | `workflow_template_version_id` | `uuid` | yes | `-` |
| 23 | `workflow_instance_id` | `uuid` | yes | `-` |
| 24 | `current_workflow_step_id` | `uuid` | yes | `-` |
| 25 | `routing_status` | `text` | no | `'routing_ready'::text` |
| 26 | `routing_decision_id` | `uuid` | yes | `-` |

**Constraints and relationships**
- `topics_governance_source_check` (check): `CHECK (governance_source IS NULL OR (governance_source = ANY (ARRAY['regulated'::text, 'custom'::text, 'exception'::text, 'legacy'::text])))`
- `topics_priority_check` (check): `CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))`
- `topics_routing_status_check` (check): `CHECK (routing_status = ANY (ARRAY['routing_pending'::text, 'routing_resolved'::text, 'routing_conflict'::text, 'routing_blocked'::text, 'routing_exception_pending'::text, 'routing_ready'::text, 'routing_expired'::text]))`
- `topics_source_type_check` (check): `CHECK (source_type = ANY (ARRAY['new'::text, 'from_lower_unit'::text, 'from_upper_unit'::text, 'from_peer_unit'::text, 'from_admin_entity'::text]))`
- `topics_status_check` (check): `CHECK (status = ANY (ARRAY['new'::text, 'under_review'::text, 'returned'::text, 'approved'::text, 'rejected'::text, 'deferred'::text, 'listed'::text, 'in_process'::text, 'postponed'::text, 'closed'::text]))`
- `topics_category_id_fkey` (foreign_key): `FOREIGN KEY (category_id) REFERENCES qarar_topics.topic_categories(id) ON DELETE RESTRICT`
- `topics_category_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (category_id, organization_id) REFERENCES qarar_topics.topic_categories(id, organization_id)`
- `topics_current_unit_id_fkey` (foreign_key): `FOREIGN KEY (current_unit_id) REFERENCES qarar_core.governance_units(id) ON DELETE RESTRICT`
- `topics_current_unit_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (current_unit_id, organization_id) REFERENCES qarar_core.governance_units(id, organization_id)`
- `topics_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `topics_submitted_by_user_id_fkey` (foreign_key): `FOREIGN KEY (submitted_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `topics_submitted_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (submitted_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `topics_pkey` (primary_key): `PRIMARY KEY (id)`
- `topics_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`
- `topics_organization_id_topic_no_key` (unique): `UNIQUE (organization_id, topic_no)`

**Indexes**
- `idx_topics_current_unit_id`: `CREATE INDEX idx_topics_current_unit_id ON qarar_topics.topics USING btree (current_unit_id)`
- `idx_topics_organization_status`: `CREATE INDEX idx_topics_organization_status ON qarar_topics.topics USING btree (organization_id, status)`
- `topics_id_organization_id_key`: `CREATE UNIQUE INDEX topics_id_organization_id_key ON qarar_topics.topics USING btree (id, organization_id)`
- `topics_idempotency_key_idx`: `CREATE UNIQUE INDEX topics_idempotency_key_idx ON qarar_topics.topics USING btree (organization_id, submitted_by_user_id, client_request_id) WHERE (client_request_id IS NOT NULL)`
- `topics_organization_id_topic_no_key`: `CREATE UNIQUE INDEX topics_organization_id_topic_no_key ON qarar_topics.topics USING btree (organization_id, topic_no)`
- `topics_pkey`: `CREATE UNIQUE INDEX topics_pkey ON qarar_topics.topics USING btree (id)`
- `topics_review_queue_idx`: `CREATE INDEX topics_review_queue_idx ON qarar_topics.topics USING btree (organization_id, current_unit_id, status, priority, created_at DESC)`

### `qarar_voting.votes`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_id` | `uuid` | no | `-` |
| 4 | `topic_id` | `uuid` | yes | `-` |
| 5 | `decision_id` | `uuid` | yes | `-` |
| 6 | `user_id` | `uuid` | no | `-` |
| 7 | `membership_id` | `uuid` | no | `-` |
| 8 | `vote_value` | `text` | no | `-` |
| 9 | `vote_note` | `text` | yes | `-` |
| 10 | `voted_at` | `timestamp with time zone` | no | `now()` |
| 11 | `voting_round_id` | `uuid` | yes | `-` |

**Constraints and relationships**
- `votes_vote_value_check` (check): `CHECK (vote_value = ANY (ARRAY['approve'::text, 'reject'::text, 'abstain'::text]))`
- `votes_decision_id_fkey` (foreign_key): `FOREIGN KEY (decision_id) REFERENCES qarar_decisions.decisions(id) ON DELETE RESTRICT`
- `votes_decision_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (decision_id, organization_id) REFERENCES qarar_decisions.decisions(id, organization_id)`
- `votes_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `votes_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `votes_membership_id_fkey` (foreign_key): `FOREIGN KEY (membership_id) REFERENCES qarar_iam.memberships(id) ON DELETE RESTRICT`
- `votes_membership_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (membership_id, organization_id) REFERENCES qarar_iam.memberships(id, organization_id)`
- `votes_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `votes_topic_id_fkey` (foreign_key): `FOREIGN KEY (topic_id) REFERENCES qarar_topics.topics(id) ON DELETE RESTRICT`
- `votes_topic_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (topic_id, organization_id) REFERENCES qarar_topics.topics(id, organization_id)`
- `votes_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `votes_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `votes_voting_round_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (voting_round_id, organization_id) REFERENCES qarar_voting.voting_rounds(id, organization_id)`
- `votes_pkey` (primary_key): `PRIMARY KEY (id)`
- `votes_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `votes_id_organization_id_key`: `CREATE UNIQUE INDEX votes_id_organization_id_key ON qarar_voting.votes USING btree (id, organization_id)`
- `votes_pkey`: `CREATE UNIQUE INDEX votes_pkey ON qarar_voting.votes USING btree (id)`
- `votes_round_user_uidx`: `CREATE UNIQUE INDEX votes_round_user_uidx ON qarar_voting.votes USING btree (voting_round_id, user_id) WHERE (voting_round_id IS NOT NULL)`

### `qarar_voting.voting_eligible_members`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `organization_id` | `uuid` | no | `-` |
| 2 | `voting_round_id` | `uuid` | no | `-` |
| 3 | `user_id` | `uuid` | no | `-` |
| 4 | `membership_id` | `uuid` | no | `-` |
| 5 | `snapshotted_at` | `timestamp with time zone` | no | `now()` |

**Constraints and relationships**
- `voting_eligible_members_membership_id_fkey` (foreign_key): `FOREIGN KEY (membership_id) REFERENCES qarar_iam.memberships(id) ON DELETE RESTRICT`
- `voting_eligible_members_membership_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (membership_id, organization_id) REFERENCES qarar_iam.memberships(id, organization_id)`
- `voting_eligible_members_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `voting_eligible_members_user_id_fkey` (foreign_key): `FOREIGN KEY (user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `voting_eligible_members_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `voting_eligible_members_voting_round_id_fkey` (foreign_key): `FOREIGN KEY (voting_round_id) REFERENCES qarar_voting.voting_rounds(id) ON DELETE RESTRICT`
- `voting_eligible_members_voting_round_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (voting_round_id, organization_id) REFERENCES qarar_voting.voting_rounds(id, organization_id)`
- `voting_eligible_members_pkey` (primary_key): `PRIMARY KEY (voting_round_id, user_id)`

**Indexes**
- `voting_eligible_members_pkey`: `CREATE UNIQUE INDEX voting_eligible_members_pkey ON qarar_voting.voting_eligible_members USING btree (voting_round_id, user_id)`

### `qarar_voting.voting_rounds`

Kind: `table`

| # | Column | Type | Nullable | Default |
|---:|---|---|:---:|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `organization_id` | `uuid` | no | `-` |
| 3 | `meeting_id` | `uuid` | no | `-` |
| 4 | `agenda_item_id` | `uuid` | no | `-` |
| 5 | `round_number` | `integer` | no | `-` |
| 6 | `status` | `text` | no | `'open'::text` |
| 7 | `calculation_rule` | `text` | no | `'simple_majority'::text` |
| 8 | `eligible_voter_count` | `integer` | no | `-` |
| 9 | `approve_count` | `integer` | yes | `-` |
| 10 | `reject_count` | `integer` | yes | `-` |
| 11 | `abstain_count` | `integer` | yes | `-` |
| 12 | `result` | `text` | yes | `-` |
| 13 | `opened_by_user_id` | `uuid` | no | `-` |
| 14 | `opened_at` | `timestamp with time zone` | no | `now()` |
| 15 | `closed_by_user_id` | `uuid` | yes | `-` |
| 16 | `closed_at` | `timestamp with time zone` | yes | `-` |
| 17 | `close_reason` | `text` | yes | `-` |
| 18 | `workflow_instance_step_id` | `uuid` | yes | `-` |

**Constraints and relationships**
- `voting_rounds_calculation_rule_check` (check): `CHECK (calculation_rule = 'simple_majority'::text)`
- `voting_rounds_eligible_voter_count_check` (check): `CHECK (eligible_voter_count >= 0)`
- `voting_rounds_result_check` (check): `CHECK (result = ANY (ARRAY['approved'::text, 'rejected'::text, 'tied'::text, 'no_votes'::text, 'cancelled'::text]))`
- `voting_rounds_round_number_check` (check): `CHECK (round_number > 0)`
- `voting_rounds_status_check` (check): `CHECK (status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text]))`
- `voting_rounds_agenda_item_id_fkey` (foreign_key): `FOREIGN KEY (agenda_item_id) REFERENCES qarar_meetings.agenda_items(id) ON DELETE RESTRICT`
- `voting_rounds_agenda_item_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (agenda_item_id, organization_id) REFERENCES qarar_meetings.agenda_items(id, organization_id)`
- `voting_rounds_closed_by_user_id_fkey` (foreign_key): `FOREIGN KEY (closed_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE SET NULL`
- `voting_rounds_closed_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (closed_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `voting_rounds_meeting_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id) REFERENCES qarar_meetings.meetings(id) ON DELETE RESTRICT`
- `voting_rounds_meeting_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (meeting_id, organization_id) REFERENCES qarar_meetings.meetings(id, organization_id)`
- `voting_rounds_opened_by_user_id_fkey` (foreign_key): `FOREIGN KEY (opened_by_user_id) REFERENCES qarar_iam.users(id) ON DELETE RESTRICT`
- `voting_rounds_opened_by_user_id_organization_id_fkey` (foreign_key): `FOREIGN KEY (opened_by_user_id, organization_id) REFERENCES qarar_iam.users(id, organization_id)`
- `voting_rounds_organization_id_fkey` (foreign_key): `FOREIGN KEY (organization_id) REFERENCES qarar_core.organizations(id) ON DELETE RESTRICT`
- `voting_rounds_workflow_step_tenant_fk` (foreign_key): `FOREIGN KEY (workflow_instance_step_id, organization_id) REFERENCES qarar_governance.workflow_instance_steps(id, organization_id) ON DELETE RESTRICT`
- `voting_rounds_pkey` (primary_key): `PRIMARY KEY (id)`
- `voting_rounds_agenda_item_id_round_number_key` (unique): `UNIQUE (agenda_item_id, round_number)`
- `voting_rounds_id_organization_id_key` (unique): `UNIQUE (id, organization_id)`

**Indexes**
- `voting_rounds_agenda_item_id_round_number_key`: `CREATE UNIQUE INDEX voting_rounds_agenda_item_id_round_number_key ON qarar_voting.voting_rounds USING btree (agenda_item_id, round_number)`
- `voting_rounds_id_organization_id_key`: `CREATE UNIQUE INDEX voting_rounds_id_organization_id_key ON qarar_voting.voting_rounds USING btree (id, organization_id)`
- `voting_rounds_one_open_per_agenda_uidx`: `CREATE UNIQUE INDEX voting_rounds_one_open_per_agenda_uidx ON qarar_voting.voting_rounds USING btree (agenda_item_id) WHERE (status = 'open'::text)`
- `voting_rounds_one_open_per_meeting_uidx`: `CREATE UNIQUE INDEX voting_rounds_one_open_per_meeting_uidx ON qarar_voting.voting_rounds USING btree (meeting_id) WHERE (status = 'open'::text)`
- `voting_rounds_pkey`: `CREATE UNIQUE INDEX voting_rounds_pkey ON qarar_voting.voting_rounds USING btree (id)`
- `voting_rounds_workflow_instance_step_idx`: `CREATE INDEX voting_rounds_workflow_instance_step_idx ON qarar_voting.voting_rounds USING btree (workflow_instance_step_id) WHERE (workflow_instance_step_id IS NOT NULL)`

## Routines and API Contracts

| Schema | Routine | Arguments | Result | SECURITY DEFINER |
|---|---|---|---|:---:|
| `api_v1` | `act_topic_workflow_step` | `p_topic_id uuid, p_outcome_code text, p_comment text, p_idempotency_key uuid, p_expected_version integer` | `jsonb` | yes |
| `api_v1` | `add_agenda_item` | `p_meeting_id uuid, p_topic_id uuid, p_is_exception boolean, p_exception_reason text` | `jsonb` | yes |
| `api_v1` | `add_topic_attachment` | `p_topic_id uuid, p_file_name text, p_file_url text, p_mime_type text, p_file_size_bytes bigint, p_description text` | `jsonb` | yes |
| `api_v1` | `add_topic_attachment` | `p_topic_id uuid, p_file_name text, p_file_url text, p_mime_type text, p_file_size_bytes bigint, p_description text, p_requirement_code text` | `jsonb` | yes |
| `api_v1` | `admin_activate_council` | `p_council_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_activate_policy_version` | `p_policy_version_id uuid, p_effective_from date, p_effective_to date` | `jsonb` | yes |
| `api_v1` | `admin_activate_workflow_template_version` | `p_workflow_template_version_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_add_council_member` | `p_council_id uuid, p_user_id uuid, p_role_id uuid, p_membership_title text, p_start_date date, p_end_date date` | `jsonb` | yes |
| `api_v1` | `admin_add_policy_attachment` | `p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_file_name text, p_file_url text, p_mime_type text, p_file_size_bytes bigint, p_description text` | `jsonb` | yes |
| `api_v1` | `admin_add_policy_item` | `p_policy_version_id uuid, p_item_code text, p_title_ar text, p_sort_order integer, p_parent_item_id uuid, p_item_type text, p_title_en text, p_body_text text, p_governance_mode text, p_topic_category_id uuid, p_match_criteria jsonb, p_workflow_template_version_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_add_workflow_step` | `p_workflow_template_version_id uuid, p_step_code text, p_name_ar text, p_sequence_no integer, p_step_type text, p_responsibility text, p_governance_unit_id uuid, p_governance_class_id uuid, p_required_permission_code text, p_is_initial boolean, p_is_terminal boolean, p_entry_conditions jsonb, p_exit_conditions jsonb, p_allowed_outcomes text[]` | `jsonb` | yes |
| `api_v1` | `admin_add_workflow_transition` | `p_workflow_template_version_id uuid, p_from_step_id uuid, p_outcome_code text, p_to_step_id uuid, p_transition_type text, p_conditions jsonb` | `jsonb` | yes |
| `api_v1` | `admin_approve_policy_version` | `p_policy_version_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_archive_council` | `p_council_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_assign_council_leadership` | `p_council_id uuid, p_chair_user_id uuid, p_rapporteur_user_id uuid, p_effective_date date, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_assign_governance_unit_class` | `p_governance_unit_id uuid, p_class_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_assign_role` | `p_user_id uuid, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text, p_start_date date, p_end_date date` | `uuid` | yes |
| `api_v1` | `admin_compare_policy_versions` | `p_left_version_id uuid, p_right_version_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_create_council` | `p_code text, p_name_ar text, p_name_en text, p_description text, p_unit_type_id uuid, p_parent_unit_id uuid, p_governance_class_id uuid, p_minimum_active_members integer, p_allow_dual_leadership boolean, p_client_request_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_create_council_type` | `p_code text, p_name_ar text, p_name_en text, p_description text` | `jsonb` | yes |
| `api_v1` | `admin_create_delegation` | `p_source_membership_id uuid, p_delegated_to_user_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_reason text` | `uuid` | yes |
| `api_v1` | `admin_create_governance_unit` | `p_code text, p_name_ar text, p_name_en text, p_unit_type_id uuid, p_parent_unit_id uuid, p_governance_class_id uuid, p_level_no integer` | `jsonb` | yes |
| `api_v1` | `admin_create_governance_unit_class` | `p_code text, p_name_ar text, p_name_en text, p_governance_level text, p_description text` | `jsonb` | yes |
| `api_v1` | `admin_create_invitation` | `p_email text, p_full_name_ar text, p_role_id uuid, p_governance_unit_id uuid, p_expires_at timestamp with time zone` | `uuid` | yes |
| `api_v1` | `admin_create_meeting_type` | `p_name_ar text, p_description text` | `jsonb` | yes |
| `api_v1` | `admin_create_policy` | `p_code text, p_name_ar text, p_name_en text, p_policy_type text, p_description text, p_owner_user_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_create_policy_idempotent` | `p_code text, p_name_ar text, p_name_en text, p_policy_type text, p_description text, p_owner_user_id uuid, p_client_request_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_create_policy_version` | `p_policy_id uuid, p_version_label text, p_change_summary text` | `jsonb` | yes |
| `api_v1` | `admin_create_topic_category` | `p_code text, p_name_ar text, p_name_en text, p_description text` | `jsonb` | yes |
| `api_v1` | `admin_create_user_profile` | `p_auth_user_id uuid, p_email text, p_full_name_ar text, p_employee_no text, p_mobile text, p_job_title text` | `uuid` | yes |
| `api_v1` | `admin_create_workflow_template` | `p_code text, p_name_ar text, p_name_en text, p_description text` | `jsonb` | yes |
| `api_v1` | `admin_create_workflow_version` | `p_workflow_template_id uuid, p_clone_version_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_deactivate_council` | `p_council_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_deactivate_council_type` | `p_council_type_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_deactivate_role` | `p_role_id uuid, p_reason text` | `void` | yes |
| `api_v1` | `admin_end_council_membership` | `p_membership_id uuid, p_end_date date, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_export_audit_logs` | `p_action text, p_entity_type text, p_actor_user_id uuid, p_result text, p_from timestamp with time zone, p_to timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_export_permission_matrix` | `` | `jsonb` | yes |
| `api_v1` | `admin_get_audit_log` | `p_audit_log_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_get_council_detail` | `p_council_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_get_councils_tree` | `` | `jsonb` | yes |
| `api_v1` | `admin_get_policy_detail` | `p_policy_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_get_policy_legislative_model` | `p_policy_version_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_get_role_detail` | `p_role_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_get_user_detail` | `p_user_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_import_policy_bundle` | `p_bundle jsonb, p_client_request_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_import_policy_bundle_v4` | `p_bundle jsonb, p_client_request_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_list_council_members` | `p_council_id uuid, p_include_ended boolean, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_list_governance_exceptions` | `p_status text, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_list_governance_unit_classes` | `p_query text, p_is_active boolean, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_list_governance_unit_types` | `p_query text, p_active_only boolean` | `jsonb` | yes |
| `api_v1` | `admin_list_governance_units` | `p_query text, p_status text, p_unit_type_id uuid, p_governance_class_id uuid, p_parent_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_list_iam_approval_requests` | `p_status text` | `jsonb` | yes |
| `api_v1` | `admin_list_meeting_types` | `p_query text, p_is_active boolean` | `jsonb` | yes |
| `api_v1` | `admin_list_permissions` | `p_module text, p_active_only boolean` | `jsonb` | yes |
| `api_v1` | `admin_list_roles` | `p_query text, p_scope text, p_active_only boolean` | `jsonb` | yes |
| `api_v1` | `admin_list_topic_categories` | `p_query text, p_is_active boolean, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_list_workflow_templates` | `` | `jsonb` | yes |
| `api_v1` | `admin_move_council` | `p_council_id uuid, p_new_parent_unit_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_move_policy_item` | `p_policy_item_id uuid, p_parent_item_id uuid, p_sort_order integer` | `jsonb` | yes |
| `api_v1` | `admin_remove_empty_policy_version` | `p_policy_version_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_remove_policy_attachment` | `p_attachment_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_remove_policy_item` | `p_policy_item_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_remove_policy_reference` | `p_policy_reference_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_remove_policy_rule` | `p_policy_rule_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_remove_policy_scope` | `p_scope_assignment_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_remove_workflow_step` | `p_step_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_request_permission_matrix_import` | `p_matrix jsonb, p_justification text` | `uuid` | yes |
| `api_v1` | `admin_request_role_permissions_change` | `p_role_id uuid, p_permission_codes text[], p_justification text` | `uuid` | yes |
| `api_v1` | `admin_request_user_offboarding` | `p_target_user_id uuid, p_successor_user_id uuid, p_justification text` | `uuid` | yes |
| `api_v1` | `admin_review_iam_change` | `p_request_id uuid, p_decision text, p_notes text` | `void` | yes |
| `api_v1` | `admin_review_user_offboarding` | `p_request_id uuid, p_decision text, p_notes text` | `jsonb` | yes |
| `api_v1` | `admin_revoke_delegation` | `p_delegation_id uuid, p_reason text` | `void` | yes |
| `api_v1` | `admin_revoke_invitation` | `p_invitation_id uuid, p_reason text` | `void` | yes |
| `api_v1` | `admin_revoke_membership` | `p_membership_id uuid, p_reason text` | `void` | yes |
| `api_v1` | `admin_save_policy_reference` | `p_policy_reference_id uuid, p_source_policy_item_id uuid, p_target_policy_id uuid, p_target_policy_version_id uuid, p_target_policy_item_id uuid, p_external_reference text, p_reference_type text, p_citation_text text, p_notes text` | `jsonb` | yes |
| `api_v1` | `admin_save_policy_rule` | `p_policy_item_id uuid, p_rule jsonb` | `jsonb` | yes |
| `api_v1` | `admin_search_audit_logs` | `p_query text, p_action text, p_entity_type text, p_actor_user_id uuid, p_result text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_search_council_types` | `p_query text, p_is_active boolean, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_search_councils` | `p_query text, p_status text, p_unit_type_id uuid, p_governance_class_id uuid, p_parent_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_search_policies` | `p_query text, p_status text, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_search_users` | `p_query text, p_status text, p_role_id uuid, p_governance_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `admin_set_policy_item_scope_override` | `p_policy_item_id uuid, p_scope_assignment_id uuid, p_governance_unit_id uuid, p_is_included boolean, p_reason text, p_priority integer, p_valid_from date, p_valid_to date` | `jsonb` | yes |
| `api_v1` | `admin_set_policy_scope` | `p_policy_version_id uuid, p_scope_type text, p_target_id uuid, p_governance_level text, p_include_descendants boolean, p_priority integer, p_valid_from date, p_valid_to date` | `jsonb` | yes |
| `api_v1` | `admin_submit_policy_for_review` | `p_policy_version_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_suspend_policy_version` | `p_policy_version_id uuid, p_reason text` | `jsonb` | yes |
| `api_v1` | `admin_update_council` | `p_council_id uuid, p_name_ar text, p_name_en text, p_description text, p_unit_type_id uuid, p_governance_class_id uuid, p_minimum_active_members integer, p_allow_dual_leadership boolean, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_update_council_membership` | `p_membership_id uuid, p_membership_title text, p_start_date date, p_end_date date, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_update_council_type` | `p_council_type_id uuid, p_name_ar text, p_name_en text, p_description text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_update_governance_unit` | `p_governance_unit_id uuid, p_name_ar text, p_name_en text, p_unit_type_id uuid, p_parent_unit_id uuid, p_governance_class_id uuid, p_level_no integer, p_status text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_update_governance_unit_class` | `p_class_id uuid, p_name_ar text, p_name_en text, p_governance_level text, p_description text, p_is_active boolean, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_update_meeting_type` | `p_meeting_type_id uuid, p_name_ar text, p_description text, p_is_active boolean, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_update_policy` | `p_policy_id uuid, p_name_ar text, p_name_en text, p_description text, p_owner_user_id uuid, p_status text, p_owner_governance_unit_id uuid, p_legal_reference text, p_decision_number text` | `jsonb` | yes |
| `api_v1` | `admin_update_policy_item` | `p_policy_item_id uuid, p_title_ar text, p_title_en text, p_body_text text, p_sort_order integer, p_governance_mode text, p_topic_category_id uuid, p_match_criteria jsonb, p_workflow_template_version_id uuid, p_is_active boolean` | `jsonb` | yes |
| `api_v1` | `admin_update_policy_item_legal_text` | `p_policy_item_id uuid, p_official_text text, p_interpretation_text text, p_source_page_from integer, p_source_page_to integer, p_source_locator text, p_legal_status text, p_amendment_note text, p_requires_executable_rule boolean, p_supersedes_item_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_update_policy_version_legal_metadata` | `p_policy_version_id uuid, p_issuing_authority text, p_approval_authority text, p_approval_decision_number text, p_approval_date date, p_issue_reason text, p_supersedes_version_id uuid, p_source_document_hash text` | `jsonb` | yes |
| `api_v1` | `admin_update_topic_category` | `p_category_id uuid, p_name_ar text, p_name_en text, p_description text, p_is_active boolean, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `admin_update_user_profile` | `p_user_id uuid, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text` | `uuid` | yes |
| `api_v1` | `admin_update_workflow_step` | `p_step_id uuid, p_name_ar text, p_sequence_no integer, p_responsibility text, p_governance_unit_id uuid, p_governance_class_id uuid, p_required_permission_code text, p_is_initial boolean, p_is_terminal boolean, p_entry_conditions jsonb, p_exit_conditions jsonb, p_allowed_outcomes text[]` | `jsonb` | yes |
| `api_v1` | `admin_upsert_permission` | `p_code text, p_module text, p_action text, p_context_scope text, p_name_ar text, p_name_en text, p_description text, p_is_active boolean` | `uuid` | yes |
| `api_v1` | `admin_upsert_role` | `p_role_id uuid, p_code text, p_name_ar text, p_name_en text, p_description text, p_role_scope text, p_is_active boolean` | `uuid` | yes |
| `api_v1` | `admin_upsert_sso_domain` | `p_sso_provider_id uuid, p_domain text, p_verified boolean` | `uuid` | yes |
| `api_v1` | `admin_upsert_sso_group_mapping` | `p_provider_id uuid, p_external_group text, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text, p_is_active boolean` | `uuid` | yes |
| `api_v1` | `admin_upsert_sso_provider` | `p_provider_name text, p_supabase_sso_provider_id uuid, p_metadata_url text, p_entity_id text, p_attribute_mapping jsonb, p_default_role_id uuid, p_default_governance_unit_id uuid, p_provisioning_mode text, p_status text` | `uuid` | yes |
| `api_v1` | `admin_validate_council_administrative_readiness` | `p_council_id uuid` | `jsonb` | yes |
| `api_v1` | `admin_validate_policy_version_readiness` | `p_policy_version_id uuid` | `jsonb` | yes |
| `api_v1` | `apply_quorum_failure` | `p_meeting_id uuid, p_action text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `approve_custom_workflow` | `p_exception_id uuid, p_approve boolean, p_review_comment text` | `jsonb` | yes |
| `api_v1` | `approve_workflow_exception` | `p_exception_id uuid, p_approve boolean, p_review_comment text` | `jsonb` | yes |
| `api_v1` | `bootstrap_current_user_profile` | `p_organization_code text, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text` | `uuid` | yes |
| `api_v1` | `cancel_voting_round` | `p_voting_round_id uuid, p_reason text` | `jsonb` | yes |
| `api_v1` | `cast_vote` | `p_voting_round_id uuid, p_vote_value text, p_vote_note text` | `jsonb` | yes |
| `api_v1` | `close_voting_round` | `p_voting_round_id uuid, p_reason text` | `jsonb` | yes |
| `api_v1` | `complete_meeting_session` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `create_checkin_session` | `p_meeting_id uuid, p_valid_for_minutes integer` | `jsonb` | yes |
| `api_v1` | `create_decision_from_voting_round` | `p_voting_round_id uuid, p_decision_text text, p_requires_approval boolean` | `jsonb` | yes |
| `api_v1` | `create_meeting` | `p_governance_unit_id uuid, p_meeting_type_id uuid, p_title_ar text, p_scheduled_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_type text, p_location_details text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `api_v1` | `create_topic` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `api_v1` | `create_topic_exception_request` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_workflow_template_version_id uuid, p_reason text, p_valid_until timestamp with time zone, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `api_v1` | `create_topic_with_regulation_bundle` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_references jsonb, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `api_v1` | `create_topic_with_selected_regulation` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `api_v1` | `fulfill_topic_requirement` | `p_topic_id uuid, p_requirement_code text, p_note text` | `jsonb` | yes |
| `api_v1` | `generate_meeting_minutes_draft` | `p_meeting_id uuid` | `jsonb` | yes |
| `api_v1` | `get_attendance_history` | `p_attendance_record_id uuid` | `jsonb` | yes |
| `api_v1` | `get_available_councils` | `p_query text, p_unit_type_id uuid, p_governance_class_id uuid, p_parent_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `get_council_form_options` | `` | `jsonb` | yes |
| `api_v1` | `get_current_user_access_context` | `` | `jsonb` | yes |
| `api_v1` | `get_meeting_detail` | `p_meeting_id uuid` | `jsonb` | yes |
| `api_v1` | `get_meeting_minutes` | `p_meeting_id uuid` | `jsonb` | yes |
| `api_v1` | `get_meeting_readiness` | `p_meeting_id uuid` | `jsonb` | yes |
| `api_v1` | `get_meeting_session_detail` | `p_meeting_id uuid` | `jsonb` | yes |
| `api_v1` | `get_my_account` | `` | `jsonb` | yes |
| `api_v1` | `get_my_open_votes` | `p_meeting_id uuid` | `jsonb` | yes |
| `api_v1` | `get_policy_form_options` | `` | `jsonb` | yes |
| `api_v1` | `get_sprint02_form_options` | `` | `jsonb` | yes |
| `api_v1` | `get_topic_categories_for_unit` | `p_governance_unit_id uuid, p_effective_on date` | `jsonb` | yes |
| `api_v1` | `get_topic_detail` | `p_topic_id uuid` | `jsonb` | yes |
| `api_v1` | `get_topic_exception_workflow_options` | `p_governance_unit_id uuid` | `jsonb` | yes |
| `api_v1` | `get_topic_form_options` | `` | `jsonb` | yes |
| `api_v1` | `get_topic_governance` | `p_topic_id uuid` | `jsonb` | yes |
| `api_v1` | `get_topic_governance_summary` | `p_topic_id uuid` | `jsonb` | yes |
| `api_v1` | `get_topic_meeting_history` | `p_topic_id uuid` | `jsonb` | yes |
| `api_v1` | `get_topic_regulation_options` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date` | `jsonb` | yes |
| `api_v1` | `get_topic_regulation_preview` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid` | `jsonb` | yes |
| `api_v1` | `get_topic_regulation_route_preview` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid` | `jsonb` | yes |
| `api_v1` | `get_topic_regulation_tree` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date` | `jsonb` | yes |
| `api_v1` | `get_topic_requirements_status` | `p_topic_id uuid` | `jsonb` | yes |
| `api_v1` | `get_topic_route_history` | `p_topic_id uuid` | `jsonb` | yes |
| `api_v1` | `get_topic_workflow` | `p_topic_id uuid` | `jsonb` | yes |
| `api_v1` | `get_voting_round_detail` | `p_voting_round_id uuid` | `jsonb` | yes |
| `api_v1` | `has_permission` | `permission_code text, target_unit_id uuid` | `boolean` | yes |
| `api_v1` | `list_meeting_decisions` | `p_meeting_id uuid` | `jsonb` | yes |
| `api_v1` | `list_meeting_voting_rounds` | `p_meeting_id uuid` | `jsonb` | yes |
| `api_v1` | `list_my_sessions` | `` | `jsonb` | yes |
| `api_v1` | `list_topic_attachments` | `p_topic_id uuid` | `jsonb` | yes |
| `api_v1` | `list_topic_regulation_references` | `p_topic_id uuid` | `jsonb` | yes |
| `api_v1` | `lock_attendance_roster` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `open_meeting_session` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `open_voting_round` | `p_agenda_item_id uuid, p_expected_meeting_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `override_attendance` | `p_attendance_record_id uuid, p_status text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `preview_policy_conditions` | `p_conditions jsonb, p_context jsonb` | `jsonb` | yes |
| `api_v1` | `recalculate_meeting_quorum` | `p_meeting_id uuid, p_record_snapshot boolean` | `jsonb` | yes |
| `api_v1` | `refer_topic` | `p_topic_id uuid, p_to_unit_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `register_current_sso_login` | `p_full_name_ar text` | `uuid` | yes |
| `api_v1` | `register_user_session` | `p_device_id text, p_device_name text, p_platform text, p_app_version text, p_auth_session_id uuid, p_ip_address inet, p_user_agent text` | `uuid` | yes |
| `api_v1` | `remove_agenda_item` | `p_agenda_item_id uuid, p_reason text` | `jsonb` | yes |
| `api_v1` | `remove_topic_attachment` | `p_attachment_id uuid` | `jsonb` | yes |
| `api_v1` | `reorder_agenda_items` | `p_meeting_id uuid, p_ordered_item_ids uuid[], p_expected_meeting_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `request_custom_workflow` | `p_topic_id uuid, p_workflow_template_version_id uuid, p_reason text, p_valid_until timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `request_session_revocation` | `p_session_id uuid` | `jsonb` | yes |
| `api_v1` | `request_workflow_exception` | `p_topic_id uuid, p_workflow_template_version_id uuid, p_reason text, p_valid_until timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `respond_meeting_minutes_approval` | `p_approval_id uuid, p_decision text, p_notes text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `respond_topic_referral` | `p_referral_id uuid, p_decision text, p_reason text` | `jsonb` | yes |
| `api_v1` | `review_topic` | `p_topic_id uuid, p_action text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `revoke_checkin_session` | `p_checkin_session_id uuid, p_reason text` | `jsonb` | yes |
| `api_v1` | `save_meeting_minutes_draft` | `p_meeting_id uuid, p_content text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `search_eligible_agenda_topics` | `p_meeting_id uuid, p_query text, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `search_meetings` | `p_query text, p_status text, p_unit_id uuid, p_from_date date, p_to_date date, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `search_my_topics` | `p_query text, p_status text, p_priority text, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `search_topic_review_queue` | `p_query text, p_status text, p_priority text, p_category_id uuid, p_governance_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `api_v1` | `self_check_in` | `p_meeting_id uuid, p_token text, p_device_label text` | `jsonb` | yes |
| `api_v1` | `send_meeting_invitations` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `service_acknowledge_notification_outbox` | `p_event_id uuid, p_lock_token uuid` | `jsonb` | yes |
| `api_v1` | `service_apply_user_status` | `p_actor_user_id uuid, p_user_id uuid, p_status text, p_reason text` | `jsonb` | yes |
| `api_v1` | `service_bootstrap_organization_admin` | `p_auth_user_id uuid, p_organization_code text, p_email text, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text, p_approval_reference text` | `jsonb` | yes |
| `api_v1` | `service_claim_activation` | `p_token_hash text, p_claim_hash text` | `jsonb` | yes |
| `api_v1` | `service_claim_notification_outbox` | `p_worker_id uuid, p_lock_token uuid, p_limit integer, p_lease_seconds integer` | `TABLE(id uuid, organization_id uuid, aggregate_type text, aggregate_id uuid, event_type text, payload jsonb, deduplication_key text, attempts integer, lock_token uuid, lease_expires_at timestamp with time zone)` | yes |
| `api_v1` | `service_consume_iam_rate_limit` | `p_actor_user_id uuid, p_operation text, p_limit integer, p_window_seconds integer` | `integer` | yes |
| `api_v1` | `service_fail_notification_outbox` | `p_event_id uuid, p_lock_token uuid, p_error text` | `jsonb` | yes |
| `api_v1` | `service_finalize_invited_user` | `p_actor_user_id uuid, p_auth_user_id uuid, p_email text, p_full_name_ar text, p_employee_no text, p_mobile text, p_job_title text, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text` | `jsonb` | yes |
| `api_v1` | `service_finish_activation` | `p_invitation_id uuid, p_auth_user_id uuid, p_claim_hash text, p_success boolean` | `jsonb` | yes |
| `api_v1` | `service_issue_activation_invitation` | `p_actor_user_id uuid, p_auth_user_id uuid, p_email text, p_full_name_ar text, p_role_id uuid, p_governance_unit_id uuid, p_token_hash text, p_expires_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `service_preview_activation` | `p_token_hash text` | `jsonb` | yes |
| `api_v1` | `service_record_iam_event` | `p_actor_user_id uuid, p_target_user_id uuid, p_action text, p_metadata jsonb` | `uuid` | yes |
| `api_v1` | `service_revoke_auth_sessions` | `p_actor_user_id uuid, p_user_id uuid, p_auth_session_id uuid, p_reason text` | `integer` | yes |
| `api_v1` | `sign_meeting_minutes_approval` | `p_approval_id uuid, p_signature_strokes jsonb, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `submit_meeting_minutes` | `p_meeting_id uuid, p_content_final text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `sync_current_sso_groups` | `p_external_groups text[]` | `integer` | yes |
| `api_v1` | `transition_meeting` | `p_meeting_id uuid, p_to_status text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `update_agenda_discussion` | `p_agenda_item_id uuid, p_status text, p_discussion_notes text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `update_meeting` | `p_meeting_id uuid, p_title_ar text, p_scheduled_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_type text, p_location_details text, p_title_en text, p_meeting_type_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `api_v1` | `update_my_preferences` | `p_locale text, p_timezone text, p_notification_settings jsonb, p_ui_settings jsonb` | `jsonb` | yes |
| `api_v1` | `update_my_profile` | `p_full_name_ar text, p_full_name_en text, p_mobile text, p_job_title text` | `jsonb` | yes |
| `api_v1` | `verify_attendance` | `p_attendance_record_id uuid, p_status text, p_note text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `public` | `get_topic_categories_for_unit` | `p_governance_unit_id uuid, p_effective_on date` | `jsonb` | yes |
| `qarar_architecture` | `grant_iam_auth_session_access` | `` | `event_trigger` | yes |
| `qarar_attendance` | `apply_quorum_failure` | `p_meeting_id uuid, p_action text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_attendance` | `assert_live_meeting_manager` | `p_meeting_id uuid` | `void` | yes |
| `qarar_attendance` | `assert_live_meeting_operator` | `p_meeting_id uuid` | `void` | yes |
| `qarar_attendance` | `calculate_meeting_quorum` | `p_meeting_id uuid` | `text` | yes |
| `qarar_attendance` | `can_manage_live_meeting` | `p_meeting_id uuid` | `boolean` | yes |
| `qarar_attendance` | `can_operate_live_meeting` | `p_meeting_id uuid` | `boolean` | yes |
| `qarar_attendance` | `create_checkin_session` | `p_meeting_id uuid, p_valid_for_minutes integer` | `jsonb` | yes |
| `qarar_attendance` | `get_attendance_history` | `p_attendance_record_id uuid` | `jsonb` | yes |
| `qarar_attendance` | `get_meeting_session_detail` | `p_meeting_id uuid` | `jsonb` | yes |
| `qarar_attendance` | `guard_attendance_override_during_voting` | `` | `trigger` | yes |
| `qarar_attendance` | `lock_attendance_roster` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_attendance` | `on_attendance_change` | `` | `trigger` | yes |
| `qarar_attendance` | `open_meeting_session` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_attendance` | `override_attendance` | `p_attendance_record_id uuid, p_status text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_attendance` | `recalculate_meeting_quorum` | `p_meeting_id uuid, p_record_snapshot boolean` | `jsonb` | yes |
| `qarar_attendance` | `record_attendance` | `p_attendance_record_id uuid, p_status text, p_remarks text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_attendance` | `revoke_checkin_session` | `p_checkin_session_id uuid, p_reason text` | `jsonb` | yes |
| `qarar_attendance` | `self_check_in` | `p_meeting_id uuid, p_token text, p_device_label text` | `jsonb` | yes |
| `qarar_attendance` | `verify_attendance` | `p_attendance_record_id uuid, p_status text, p_note text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_audit` | `admin_export_audit_logs` | `p_action text, p_entity_type text, p_actor_user_id uuid, p_result text, p_from timestamp with time zone, p_to timestamp with time zone` | `jsonb` | yes |
| `qarar_audit` | `admin_get_audit_log` | `p_audit_log_id uuid` | `jsonb` | yes |
| `qarar_audit` | `admin_search_audit_logs` | `p_query text, p_action text, p_entity_type text, p_actor_user_id uuid, p_result text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_audit` | `append_audit_log` | `p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb` | `uuid` | yes |
| `qarar_audit` | `audit_row_change` | `` | `trigger` | yes |
| `qarar_core` | `admin_activate_council` | `p_council_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `admin_archive_council` | `p_council_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `admin_assign_governance_unit_class` | `p_governance_unit_id uuid, p_class_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `admin_create_council` | `p_code text, p_name_ar text, p_name_en text, p_description text, p_unit_type_id uuid, p_parent_unit_id uuid, p_governance_class_id uuid, p_minimum_active_members integer, p_allow_dual_leadership boolean, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_core` | `admin_create_council_type` | `p_code text, p_name_ar text, p_name_en text, p_description text` | `jsonb` | yes |
| `qarar_core` | `admin_create_governance_unit` | `p_code text, p_name_ar text, p_name_en text, p_unit_type_id uuid, p_parent_unit_id uuid, p_governance_class_id uuid, p_level_no integer` | `jsonb` | yes |
| `qarar_core` | `admin_deactivate_council` | `p_council_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `admin_deactivate_council_type` | `p_council_type_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `admin_get_council_detail` | `p_council_id uuid` | `jsonb` | yes |
| `qarar_core` | `admin_get_councils_tree` | `` | `jsonb` | yes |
| `qarar_core` | `admin_list_governance_unit_types` | `p_query text, p_active_only boolean` | `jsonb` | yes |
| `qarar_core` | `admin_list_governance_units` | `p_query text, p_status text, p_unit_type_id uuid, p_governance_class_id uuid, p_parent_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_core` | `admin_move_council` | `p_council_id uuid, p_new_parent_unit_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `admin_search_council_types` | `p_query text, p_is_active boolean, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_core` | `admin_search_councils` | `p_query text, p_status text, p_unit_type_id uuid, p_governance_class_id uuid, p_parent_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_core` | `admin_update_council` | `p_council_id uuid, p_name_ar text, p_name_en text, p_description text, p_unit_type_id uuid, p_governance_class_id uuid, p_minimum_active_members integer, p_allow_dual_leadership boolean, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `admin_update_council_type` | `p_council_type_id uuid, p_name_ar text, p_name_en text, p_description text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `admin_update_governance_unit` | `p_governance_unit_id uuid, p_name_ar text, p_name_en text, p_unit_type_id uuid, p_parent_unit_id uuid, p_governance_class_id uuid, p_level_no integer, p_status text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `admin_validate_council_administrative_readiness` | `p_council_id uuid` | `jsonb` | yes |
| `qarar_core` | `change_council_status` | `p_council_id uuid, p_target_status text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_core` | `current_app_user_id` | `` | `uuid` | no |
| `qarar_core` | `enforce_council_code_format` | `` | `trigger` | yes |
| `qarar_core` | `get_available_councils` | `p_query text, p_unit_type_id uuid, p_governance_class_id uuid, p_parent_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_core` | `get_council_form_options` | `` | `jsonb` | yes |
| `qarar_core` | `initialize_governance_unit_status_metadata` | `` | `trigger` | no |
| `qarar_core` | `provision_default_council_type` | `` | `trigger` | yes |
| `qarar_core` | `reject_status_history_mutation` | `` | `trigger` | yes |
| `qarar_core` | `set_updated_at` | `` | `trigger` | no |
| `qarar_core` | `touch_council_leadership_version` | `p_council_id uuid, p_expected_updated_at timestamp with time zone` | `timestamp with time zone` | yes |
| `qarar_decisions` | `audit_decision_status_history` | `` | `trigger` | yes |
| `qarar_decisions` | `auto_update_decision_follow_up` | `` | `trigger` | yes |
| `qarar_decisions` | `create_decision_from_voting_round` | `p_voting_round_id uuid, p_decision_text text, p_requires_approval boolean` | `jsonb` | yes |
| `qarar_decisions` | `guard_decision_status_transitions` | `` | `trigger` | yes |
| `qarar_decisions` | `list_meeting_decisions` | `p_meeting_id uuid` | `jsonb` | yes |
| `qarar_execution` | `check_action_item_creation` | `` | `trigger` | yes |
| `qarar_execution` | `reassign_user_open_tasks` | `p_organization_id uuid, p_target_user_id uuid, p_successor_user_id uuid, p_apply boolean` | `integer` | yes |
| `qarar_governance` | `acknowledge_notification_outbox` | `p_event_id uuid, p_lock_token uuid` | `jsonb` | yes |
| `qarar_governance` | `act_topic_workflow_step` | `p_topic_id uuid, p_outcome_code text, p_comment text` | `jsonb` | yes |
| `qarar_governance` | `act_topic_workflow_step` | `p_topic_id uuid, p_outcome_code text, p_comment text, p_idempotency_key uuid, p_expected_version integer` | `jsonb` | yes |
| `qarar_governance` | `act_topic_workflow_step_core` | `p_topic_id uuid, p_outcome_code text, p_comment text, p_idempotency_key uuid, p_expected_version integer` | `jsonb` | yes |
| `qarar_governance` | `act_topic_workflow_step_guarded_core` | `p_topic_id uuid, p_outcome_code text, p_comment text, p_idempotency_key uuid, p_expected_version integer` | `jsonb` | yes |
| `qarar_governance` | `admin_activate_policy_version` | `p_policy_version_id uuid, p_effective_from date, p_effective_to date` | `jsonb` | yes |
| `qarar_governance` | `admin_activate_workflow_template_version` | `p_workflow_template_version_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_add_policy_attachment` | `p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_file_name text, p_file_url text, p_mime_type text, p_file_size_bytes bigint, p_description text` | `jsonb` | yes |
| `qarar_governance` | `admin_add_policy_item` | `p_policy_version_id uuid, p_item_code text, p_title_ar text, p_sort_order integer, p_parent_item_id uuid, p_item_type text, p_title_en text, p_body_text text, p_governance_mode text, p_topic_category_id uuid, p_match_criteria jsonb, p_workflow_template_version_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_add_workflow_step` | `p_workflow_template_version_id uuid, p_step_code text, p_name_ar text, p_sequence_no integer, p_step_type text, p_responsibility text, p_governance_unit_id uuid, p_governance_class_id uuid, p_required_permission_code text, p_is_initial boolean, p_is_terminal boolean, p_entry_conditions jsonb, p_exit_conditions jsonb, p_allowed_outcomes text[]` | `jsonb` | yes |
| `qarar_governance` | `admin_add_workflow_transition` | `p_workflow_template_version_id uuid, p_from_step_id uuid, p_outcome_code text, p_to_step_id uuid, p_transition_type text, p_conditions jsonb` | `jsonb` | yes |
| `qarar_governance` | `admin_approve_policy_version` | `p_policy_version_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_compare_policy_versions` | `p_left_version_id uuid, p_right_version_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_create_governance_unit_class` | `p_code text, p_name_ar text, p_name_en text, p_governance_level text, p_description text` | `jsonb` | yes |
| `qarar_governance` | `admin_create_policy` | `p_code text, p_name_ar text, p_name_en text, p_policy_type text, p_description text, p_owner_user_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_create_policy_idempotent` | `p_code text, p_name_ar text, p_name_en text, p_policy_type text, p_description text, p_owner_user_id uuid, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_create_policy_version` | `p_policy_id uuid, p_version_label text, p_change_summary text` | `jsonb` | yes |
| `qarar_governance` | `admin_create_workflow_template` | `p_code text, p_name_ar text, p_name_en text, p_description text` | `jsonb` | yes |
| `qarar_governance` | `admin_create_workflow_version` | `p_workflow_template_id uuid, p_clone_version_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_get_policy_detail` | `p_policy_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_get_policy_legislative_model` | `p_policy_version_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_import_policy_bundle` | `p_bundle jsonb, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_import_policy_bundle_v4` | `p_bundle jsonb, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_list_governance_exceptions` | `p_status text, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_governance` | `admin_list_governance_unit_classes` | `p_query text, p_is_active boolean, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_governance` | `admin_list_workflow_templates` | `` | `jsonb` | yes |
| `qarar_governance` | `admin_move_policy_item` | `p_policy_item_id uuid, p_parent_item_id uuid, p_sort_order integer` | `jsonb` | yes |
| `qarar_governance` | `admin_remove_empty_policy_version` | `p_policy_version_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_remove_policy_attachment` | `p_attachment_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_remove_policy_item` | `p_policy_item_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_remove_policy_reference` | `p_policy_reference_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_remove_policy_rule` | `p_policy_rule_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_remove_policy_scope` | `p_scope_assignment_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_remove_workflow_step` | `p_step_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_save_policy_reference` | `p_policy_reference_id uuid, p_source_policy_item_id uuid, p_target_policy_id uuid, p_target_policy_version_id uuid, p_target_policy_item_id uuid, p_external_reference text, p_reference_type text, p_citation_text text, p_notes text` | `jsonb` | yes |
| `qarar_governance` | `admin_save_policy_rule` | `p_policy_item_id uuid, p_rule jsonb` | `jsonb` | yes |
| `qarar_governance` | `admin_search_policies` | `p_query text, p_status text, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_governance` | `admin_set_policy_item_scope_override` | `p_policy_item_id uuid, p_scope_assignment_id uuid, p_governance_unit_id uuid, p_is_included boolean, p_reason text, p_priority integer, p_valid_from date, p_valid_to date` | `jsonb` | yes |
| `qarar_governance` | `admin_set_policy_scope` | `p_policy_version_id uuid, p_scope_type text, p_target_id uuid, p_governance_level text, p_include_descendants boolean, p_priority integer, p_valid_from date, p_valid_to date` | `jsonb` | yes |
| `qarar_governance` | `admin_submit_policy_for_review` | `p_policy_version_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_suspend_policy_version` | `p_policy_version_id uuid, p_reason text` | `jsonb` | yes |
| `qarar_governance` | `admin_update_governance_unit_class` | `p_class_id uuid, p_name_ar text, p_name_en text, p_governance_level text, p_description text, p_is_active boolean, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_governance` | `admin_update_policy` | `p_policy_id uuid, p_name_ar text, p_name_en text, p_description text, p_owner_user_id uuid, p_status text, p_owner_governance_unit_id uuid, p_legal_reference text, p_decision_number text` | `jsonb` | yes |
| `qarar_governance` | `admin_update_policy_item` | `p_policy_item_id uuid, p_title_ar text, p_title_en text, p_body_text text, p_sort_order integer, p_governance_mode text, p_topic_category_id uuid, p_match_criteria jsonb, p_workflow_template_version_id uuid, p_is_active boolean` | `jsonb` | yes |
| `qarar_governance` | `admin_update_policy_item_legal_text` | `p_policy_item_id uuid, p_official_text text, p_interpretation_text text, p_source_page_from integer, p_source_page_to integer, p_source_locator text, p_legal_status text, p_amendment_note text, p_requires_executable_rule boolean, p_supersedes_item_id uuid` | `jsonb` | yes |
| `qarar_governance` | `admin_update_policy_version_legal_metadata` | `p_policy_version_id uuid, p_issuing_authority text, p_approval_authority text, p_approval_decision_number text, p_approval_date date, p_issue_reason text, p_supersedes_version_id uuid, p_source_document_hash text` | `jsonb` | yes |
| `qarar_governance` | `admin_update_workflow_step` | `p_step_id uuid, p_name_ar text, p_sequence_no integer, p_responsibility text, p_governance_unit_id uuid, p_governance_class_id uuid, p_required_permission_code text, p_is_initial boolean, p_is_terminal boolean, p_entry_conditions jsonb, p_exit_conditions jsonb, p_allowed_outcomes text[]` | `jsonb` | yes |
| `qarar_governance` | `admin_validate_policy_version_readiness` | `p_policy_version_id uuid` | `jsonb` | yes |
| `qarar_governance` | `approve_custom_workflow` | `p_exception_id uuid, p_approve boolean, p_review_comment text` | `jsonb` | yes |
| `qarar_governance` | `approve_workflow_exception` | `p_exception_id uuid, p_approve boolean, p_review_comment text` | `jsonb` | yes |
| `qarar_governance` | `assert_policy_version_editable` | `p_policy_version_id uuid` | `void` | no |
| `qarar_governance` | `assert_workflow_version_editable` | `p_workflow_template_version_id uuid` | `void` | no |
| `qarar_governance` | `claim_notification_outbox` | `p_worker_id uuid, p_lock_token uuid, p_limit integer, p_lease_seconds integer` | `TABLE(id uuid, organization_id uuid, aggregate_type text, aggregate_id uuid, event_type text, payload jsonb, deduplication_key text, attempts integer, lock_token uuid, lease_expires_at timestamp with time zone)` | yes |
| `qarar_governance` | `complete_topic_workflow_step` | `p_topic_id uuid, p_outcome_code text, p_comment text` | `jsonb` | yes |
| `qarar_governance` | `conditions_match` | `p_conditions jsonb, p_context jsonb` | `boolean` | no |
| `qarar_governance` | `create_topic_exception_request` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_workflow_template_version_id uuid, p_reason text, p_valid_until timestamp with time zone, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_governance` | `eligible_topic_regulation_options` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date` | `TABLE(policy_id uuid, policy_version_id uuid, policy_item_id uuid, scope_assignment_id uuid, workflow_template_version_id uuid, policy_code text, policy_name_ar text, policy_name_en text, version_no integer, version_label text, item_code text, item_title_ar text, item_title_en text, scope_type text, scope_priority integer, governance_mode text, automation_status text, routing_outcome text, score integer)` | yes |
| `qarar_governance` | `enforce_exception_validity` | `` | `trigger` | yes |
| `qarar_governance` | `expire_governance_exceptions` | `p_as_of timestamp with time zone` | `integer` | yes |
| `qarar_governance` | `fail_notification_outbox` | `p_event_id uuid, p_lock_token uuid, p_error text` | `jsonb` | yes |
| `qarar_governance` | `get_policy_form_options` | `` | `jsonb` | yes |
| `qarar_governance` | `get_topic_exception_workflow_options` | `p_governance_unit_id uuid` | `jsonb` | yes |
| `qarar_governance` | `get_topic_governance` | `p_topic_id uuid` | `jsonb` | yes |
| `qarar_governance` | `get_topic_governance_summary` | `p_topic_id uuid` | `jsonb` | yes |
| `qarar_governance` | `get_topic_regulation_options` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date` | `jsonb` | yes |
| `qarar_governance` | `get_topic_regulation_preview` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid` | `jsonb` | yes |
| `qarar_governance` | `get_topic_regulation_route_preview` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid` | `jsonb` | yes |
| `qarar_governance` | `get_topic_regulation_tree` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date` | `jsonb` | yes |
| `qarar_governance` | `get_topic_workflow` | `p_topic_id uuid` | `jsonb` | yes |
| `qarar_governance` | `guard_policy_draft_mutation` | `` | `trigger` | no |
| `qarar_governance` | `guard_policy_legislative_readiness` | `` | `trigger` | yes |
| `qarar_governance` | `guard_workflow_draft_mutation` | `` | `trigger` | no |
| `qarar_governance` | `instantiate_topic_workflow` | `p_topic_id uuid, p_decision_id uuid` | `jsonb` | yes |
| `qarar_governance` | `normalize_voting_step_outcomes` | `` | `trigger` | yes |
| `qarar_governance` | `preview_policy_conditions` | `p_conditions jsonb, p_context jsonb` | `jsonb` | yes |
| `qarar_governance` | `record_unresolved_topic_governance` | `p_topic_id uuid, p_decision_id uuid, p_outcome text` | `jsonb` | yes |
| `qarar_governance` | `recover_stale_notification_outbox` | `` | `jsonb` | yes |
| `qarar_governance` | `reject_topic_workflow_step` | `p_topic_id uuid, p_comment text` | `jsonb` | yes |
| `qarar_governance` | `request_custom_workflow` | `p_topic_id uuid, p_workflow_template_version_id uuid, p_reason text, p_valid_until timestamp with time zone` | `jsonb` | yes |
| `qarar_governance` | `request_workflow_exception` | `p_topic_id uuid, p_workflow_template_version_id uuid, p_reason text, p_valid_until timestamp with time zone` | `jsonb` | yes |
| `qarar_governance` | `requeue_notification_outbox` | `p_event_id uuid, p_reason text` | `jsonb` | yes |
| `qarar_governance` | `resolve_selected_topic_governance` | `p_topic_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid` | `jsonb` | yes |
| `qarar_governance` | `resolve_step_unit` | `p_organization_id uuid, p_origin_unit_id uuid, p_explicit_unit_id uuid, p_governance_class_id uuid` | `uuid` | no |
| `qarar_governance` | `resolve_topic_governance` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_effective_on date, p_topic_id uuid` | `jsonb` | yes |
| `qarar_governance` | `return_topic_workflow_step` | `p_topic_id uuid, p_comment text` | `jsonb` | yes |
| `qarar_governance` | `validate_workflow_template_version` | `p_workflow_template_version_id uuid` | `jsonb` | no |
| `qarar_iam` | `actor_has_permission` | `p_actor_user_id uuid, p_permission_code text, p_target_unit_id uuid` | `boolean` | yes |
| `qarar_iam` | `admin_add_council_member` | `p_council_id uuid, p_user_id uuid, p_role_id uuid, p_membership_title text, p_start_date date, p_end_date date` | `jsonb` | yes |
| `qarar_iam` | `admin_assign_council_leadership` | `p_council_id uuid, p_role_code text, p_user_id uuid, p_effective_date date, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_iam` | `admin_assign_council_leadership_pair` | `p_council_id uuid, p_chair_user_id uuid, p_rapporteur_user_id uuid, p_effective_date date, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_iam` | `admin_assign_role` | `p_user_id uuid, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text, p_start_date date, p_end_date date` | `uuid` | yes |
| `qarar_iam` | `admin_create_delegation` | `p_source_membership_id uuid, p_delegated_to_user_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_reason text` | `uuid` | yes |
| `qarar_iam` | `admin_create_invitation` | `p_email text, p_full_name_ar text, p_role_id uuid, p_governance_unit_id uuid, p_expires_at timestamp with time zone` | `uuid` | yes |
| `qarar_iam` | `admin_create_user_profile` | `p_auth_user_id uuid, p_email text, p_full_name_ar text, p_employee_no text, p_mobile text, p_job_title text` | `uuid` | yes |
| `qarar_iam` | `admin_deactivate_role` | `p_role_id uuid, p_reason text` | `void` | yes |
| `qarar_iam` | `admin_end_council_membership` | `p_membership_id uuid, p_end_date date, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_iam` | `admin_export_permission_matrix` | `` | `jsonb` | yes |
| `qarar_iam` | `admin_finalize_invited_user` | `p_auth_user_id uuid, p_email text, p_full_name_ar text, p_employee_no text, p_mobile text, p_job_title text, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text` | `jsonb` | yes |
| `qarar_iam` | `admin_get_role_detail` | `p_role_id uuid` | `jsonb` | yes |
| `qarar_iam` | `admin_get_user_detail` | `p_user_id uuid` | `jsonb` | yes |
| `qarar_iam` | `admin_list_council_members` | `p_council_id uuid, p_include_ended boolean, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_iam` | `admin_list_iam_approval_requests` | `p_status text` | `jsonb` | yes |
| `qarar_iam` | `admin_list_permissions` | `p_module text, p_active_only boolean` | `jsonb` | yes |
| `qarar_iam` | `admin_list_roles` | `p_query text, p_scope text, p_active_only boolean` | `jsonb` | yes |
| `qarar_iam` | `admin_request_permission_matrix_import` | `p_matrix jsonb, p_justification text` | `uuid` | yes |
| `qarar_iam` | `admin_request_role_permissions_change` | `p_role_id uuid, p_permission_codes text[], p_justification text` | `uuid` | yes |
| `qarar_iam` | `admin_request_user_offboarding` | `p_target_user_id uuid, p_successor_user_id uuid, p_justification text` | `uuid` | yes |
| `qarar_iam` | `admin_review_iam_change` | `p_request_id uuid, p_decision text, p_notes text` | `void` | yes |
| `qarar_iam` | `admin_review_user_offboarding` | `p_request_id uuid, p_decision text, p_notes text` | `jsonb` | yes |
| `qarar_iam` | `admin_revoke_delegation` | `p_delegation_id uuid, p_reason text` | `void` | yes |
| `qarar_iam` | `admin_revoke_invitation` | `p_invitation_id uuid, p_reason text` | `void` | yes |
| `qarar_iam` | `admin_revoke_membership` | `p_membership_id uuid, p_reason text` | `void` | yes |
| `qarar_iam` | `admin_search_users` | `p_query text, p_status text, p_role_id uuid, p_governance_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_iam` | `admin_set_role_permissions` | `p_role_id uuid, p_permission_codes text[]` | `integer` | yes |
| `qarar_iam` | `admin_update_council_membership` | `p_membership_id uuid, p_membership_title text, p_start_date date, p_end_date date, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_iam` | `admin_update_user_profile` | `p_user_id uuid, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text` | `uuid` | yes |
| `qarar_iam` | `admin_update_user_status` | `p_user_id uuid, p_status text, p_reason text` | `void` | yes |
| `qarar_iam` | `admin_upsert_permission` | `p_code text, p_module text, p_action text, p_context_scope text, p_name_ar text, p_name_en text, p_description text, p_is_active boolean` | `uuid` | yes |
| `qarar_iam` | `admin_upsert_role` | `p_role_id uuid, p_code text, p_name_ar text, p_name_en text, p_description text, p_role_scope text, p_is_active boolean` | `uuid` | yes |
| `qarar_iam` | `admin_upsert_sso_domain` | `p_sso_provider_id uuid, p_domain text, p_verified boolean` | `uuid` | yes |
| `qarar_iam` | `admin_upsert_sso_group_mapping` | `p_provider_id uuid, p_external_group text, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text, p_is_active boolean` | `uuid` | yes |
| `qarar_iam` | `admin_upsert_sso_provider` | `p_provider_name text, p_supabase_sso_provider_id uuid, p_metadata_url text, p_entity_id text, p_attribute_mapping jsonb, p_default_role_id uuid, p_default_governance_unit_id uuid, p_provisioning_mode text, p_status text` | `uuid` | yes |
| `qarar_iam` | `assert_elevated_role_has_no_automatic_provisioning` | `p_organization_id uuid, p_role_id uuid` | `void` | yes |
| `qarar_iam` | `assert_permission` | `permission_code text, target_unit_id uuid` | `void` | yes |
| `qarar_iam` | `assert_role_grant_authority` | `p_organization_id uuid, p_role_id uuid, p_operation text` | `void` | yes |
| `qarar_iam` | `assert_role_is_not_automatically_provisionable` | `p_organization_id uuid, p_role_id uuid` | `void` | yes |
| `qarar_iam` | `bootstrap_current_user_profile` | `p_organization_code text, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text` | `uuid` | yes |
| `qarar_iam` | `consume_iam_rate_limit` | `p_operation text, p_limit integer, p_window_seconds integer` | `integer` | yes |
| `qarar_iam` | `current_organization_id` | `` | `uuid` | yes |
| `qarar_iam` | `current_sso_provider_id` | `` | `uuid` | yes |
| `qarar_iam` | `enforce_active_system_administrator` | `` | `trigger` | yes |
| `qarar_iam` | `enforce_delegation_authority_boundary` | `` | `trigger` | yes |
| `qarar_iam` | `enforce_invitation_authority_boundary` | `` | `trigger` | yes |
| `qarar_iam` | `enforce_membership_authority_boundary` | `` | `trigger` | yes |
| `qarar_iam` | `enforce_permission_authority_boundary` | `` | `trigger` | yes |
| `qarar_iam` | `enforce_role_authority_boundary` | `` | `trigger` | yes |
| `qarar_iam` | `enforce_role_permission_authority_boundary` | `` | `trigger` | yes |
| `qarar_iam` | `enforce_single_council_leader` | `` | `trigger` | yes |
| `qarar_iam` | `enforce_sso_group_mapping_authority_boundary` | `` | `trigger` | yes |
| `qarar_iam` | `enforce_sso_provider_authority_boundary` | `` | `trigger` | yes |
| `qarar_iam` | `expire_access_delegations` | `` | `integer` | yes |
| `qarar_iam` | `get_current_user_access_context` | `` | `jsonb` | yes |
| `qarar_iam` | `get_my_account` | `` | `jsonb` | yes |
| `qarar_iam` | `has_active_membership` | `target_unit_id uuid` | `boolean` | yes |
| `qarar_iam` | `has_permission` | `permission_code text, target_unit_id uuid` | `boolean` | yes |
| `qarar_iam` | `has_role_code` | `role_codes text[]` | `boolean` | yes |
| `qarar_iam` | `has_unit_role_code` | `target_unit_id uuid, role_codes text[]` | `boolean` | yes |
| `qarar_iam` | `is_system_admin` | `` | `boolean` | yes |
| `qarar_iam` | `is_system_authority_context` | `` | `boolean` | yes |
| `qarar_iam` | `is_topic_category_in_current_organization` | `target_category_id uuid` | `boolean` | yes |
| `qarar_iam` | `is_unit_in_current_organization` | `target_unit_id uuid` | `boolean` | yes |
| `qarar_iam` | `is_user_in_current_organization` | `target_user_id uuid` | `boolean` | yes |
| `qarar_iam` | `jwt_claim_text` | `claim_name text` | `text` | yes |
| `qarar_iam` | `list_my_sessions` | `` | `jsonb` | yes |
| `qarar_iam` | `lock_iam_authority_boundary` | `p_first_organization_id uuid, p_second_organization_id uuid` | `void` | yes |
| `qarar_iam` | `provision_council_management` | `` | `trigger` | yes |
| `qarar_iam` | `provision_council_permissions_to_governance_admin` | `` | `trigger` | yes |
| `qarar_iam` | `provision_default_role_permissions` | `` | `trigger` | yes |
| `qarar_iam` | `provision_governance_permissions` | `` | `trigger` | yes |
| `qarar_iam` | `provision_operational_permissions` | `` | `trigger` | yes |
| `qarar_iam` | `register_current_sso_login` | `p_full_name_ar text` | `uuid` | yes |
| `qarar_iam` | `register_user_session` | `p_device_id text, p_device_name text, p_platform text, p_app_version text, p_auth_session_id uuid, p_ip_address inet, p_user_agent text` | `uuid` | yes |
| `qarar_iam` | `request_session_revocation` | `p_session_id uuid` | `jsonb` | yes |
| `qarar_iam` | `role_requires_system_administrator` | `p_organization_id uuid, p_role_id uuid` | `boolean` | yes |
| `qarar_iam` | `service_apply_user_status` | `p_actor_user_id uuid, p_user_id uuid, p_status text, p_reason text` | `jsonb` | yes |
| `qarar_iam` | `service_bootstrap_organization_admin` | `p_auth_user_id uuid, p_organization_code text, p_email text, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text, p_approval_reference text` | `jsonb` | yes |
| `qarar_iam` | `service_claim_activation` | `p_token_hash text, p_claim_hash text` | `jsonb` | yes |
| `qarar_iam` | `service_consume_iam_rate_limit` | `p_actor_user_id uuid, p_operation text, p_limit integer, p_window_seconds integer` | `integer` | yes |
| `qarar_iam` | `service_finalize_invited_user` | `p_actor_user_id uuid, p_auth_user_id uuid, p_email text, p_full_name_ar text, p_employee_no text, p_mobile text, p_job_title text, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text` | `jsonb` | yes |
| `qarar_iam` | `service_finish_activation` | `p_invitation_id uuid, p_auth_user_id uuid, p_claim_hash text, p_success boolean` | `jsonb` | yes |
| `qarar_iam` | `service_issue_activation_invitation` | `p_actor_user_id uuid, p_auth_user_id uuid, p_email text, p_full_name_ar text, p_role_id uuid, p_governance_unit_id uuid, p_token_hash text, p_expires_at timestamp with time zone` | `jsonb` | yes |
| `qarar_iam` | `service_preview_activation` | `p_token_hash text` | `jsonb` | yes |
| `qarar_iam` | `service_record_iam_event` | `p_actor_user_id uuid, p_target_user_id uuid, p_action text, p_metadata jsonb` | `uuid` | yes |
| `qarar_iam` | `service_revoke_auth_sessions` | `p_actor_user_id uuid, p_user_id uuid, p_auth_session_id uuid, p_reason text` | `integer` | yes |
| `qarar_iam` | `sync_current_sso_groups` | `p_external_groups text[]` | `integer` | yes |
| `qarar_iam` | `update_my_preferences` | `p_locale text, p_timezone text, p_notification_settings jsonb, p_ui_settings jsonb` | `jsonb` | yes |
| `qarar_iam` | `update_my_profile` | `p_full_name_ar text, p_full_name_en text, p_mobile text, p_job_title text` | `jsonb` | yes |
| `qarar_internal` | `reconcile_qarar_cron_jobs` | `` | `jsonb` | yes |
| `qarar_meetings` | `add_agenda_item` | `p_meeting_id uuid, p_topic_id uuid, p_is_exception boolean, p_exception_reason text` | `jsonb` | yes |
| `qarar_meetings` | `admin_create_meeting_type` | `p_name_ar text, p_description text` | `jsonb` | yes |
| `qarar_meetings` | `admin_list_meeting_types` | `p_query text, p_is_active boolean` | `jsonb` | yes |
| `qarar_meetings` | `admin_update_meeting_type` | `p_meeting_type_id uuid, p_name_ar text, p_description text, p_is_active boolean, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_meetings` | `check_agenda_item_eligibility` | `` | `trigger` | yes |
| `qarar_meetings` | `complete_meeting_session` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_meetings` | `create_meeting` | `p_governance_unit_id uuid, p_meeting_type_id uuid, p_title_ar text, p_scheduled_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_type text, p_location_details text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_meetings` | `detach_ineligible_topic_from_editable_agendas` | `` | `trigger` | yes |
| `qarar_meetings` | `enforce_decision_before_session_completion` | `` | `trigger` | yes |
| `qarar_meetings` | `enforce_governed_agenda_topic` | `` | `trigger` | yes |
| `qarar_meetings` | `enforce_ready_meeting_integrity` | `` | `trigger` | yes |
| `qarar_meetings` | `get_meeting_detail` | `p_meeting_id uuid` | `jsonb` | yes |
| `qarar_meetings` | `get_meeting_readiness` | `p_meeting_id uuid` | `jsonb` | yes |
| `qarar_meetings` | `get_sprint02_form_options` | `` | `jsonb` | yes |
| `qarar_meetings` | `guard_meeting_status_transitions` | `` | `trigger` | yes |
| `qarar_meetings` | `remove_agenda_item` | `p_agenda_item_id uuid, p_reason text` | `jsonb` | yes |
| `qarar_meetings` | `reorder_agenda_items` | `p_meeting_id uuid, p_ordered_item_ids uuid[], p_expected_meeting_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_meetings` | `search_eligible_agenda_topics` | `p_meeting_id uuid, p_query text, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_meetings` | `search_meetings` | `p_query text, p_status text, p_unit_id uuid, p_from_date date, p_to_date date, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_meetings` | `send_meeting_invitations` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_meetings` | `transition_meeting` | `p_meeting_id uuid, p_to_status text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_meetings` | `update_agenda_discussion` | `p_agenda_item_id uuid, p_status text, p_discussion_notes text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_meetings` | `update_meeting` | `p_meeting_id uuid, p_title_ar text, p_scheduled_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_type text, p_location_details text, p_title_en text, p_meeting_type_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_minutes` | `generate_meeting_minutes_draft` | `p_meeting_id uuid` | `jsonb` | yes |
| `qarar_minutes` | `get_meeting_minutes` | `p_meeting_id uuid` | `jsonb` | yes |
| `qarar_minutes` | `on_approval_status_change` | `` | `trigger` | yes |
| `qarar_minutes` | `on_minute_ready` | `` | `trigger` | yes |
| `qarar_minutes` | `respond_meeting_minutes_approval` | `p_approval_id uuid, p_decision text, p_notes text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_minutes` | `save_meeting_minutes_draft` | `p_meeting_id uuid, p_content text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_minutes` | `sign_meeting_minutes_approval` | `p_approval_id uuid, p_signature_strokes jsonb, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_minutes` | `submit_meeting_minutes` | `p_meeting_id uuid, p_content_final text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_topics` | `add_topic_attachment` | `p_topic_id uuid, p_file_name text, p_file_url text, p_mime_type text, p_file_size_bytes bigint, p_description text` | `jsonb` | yes |
| `qarar_topics` | `add_topic_attachment` | `p_topic_id uuid, p_file_name text, p_file_url text, p_mime_type text, p_file_size_bytes bigint, p_description text, p_requirement_code text` | `jsonb` | yes |
| `qarar_topics` | `admin_create_topic_category` | `p_code text, p_name_ar text, p_name_en text, p_description text` | `jsonb` | yes |
| `qarar_topics` | `admin_list_topic_categories` | `p_query text, p_is_active boolean, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_topics` | `admin_update_topic_category` | `p_category_id uuid, p_name_ar text, p_name_en text, p_description text, p_is_active boolean, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_topics` | `apply_governance_snapshot` | `p_topic_id uuid, p_governance_source text, p_routing_status text, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_workflow_template_version_id uuid, p_workflow_instance_id uuid, p_current_workflow_step_id uuid, p_routing_decision_id uuid` | `void` | yes |
| `qarar_topics` | `assert_topic_requirements_ready` | `p_topic_id uuid, p_phase text` | `void` | yes |
| `qarar_topics` | `create_topic` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_topics` | `create_topic_unrouted` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_topics` | `create_topic_with_regulation_bundle` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_references jsonb, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_topics` | `create_topic_with_selected_regulation` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_topics` | `create_topic_with_workflow` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` | yes |
| `qarar_topics` | `fulfill_topic_requirement` | `p_topic_id uuid, p_requirement_code text, p_note text` | `jsonb` | yes |
| `qarar_topics` | `get_topic_detail` | `p_topic_id uuid` | `jsonb` | yes |
| `qarar_topics` | `get_topic_form_options` | `` | `jsonb` | yes |
| `qarar_topics` | `get_topic_meeting_history` | `p_topic_id uuid` | `jsonb` | yes |
| `qarar_topics` | `get_topic_requirements_status` | `p_topic_id uuid` | `jsonb` | yes |
| `qarar_topics` | `get_topic_route_history` | `p_topic_id uuid` | `jsonb` | yes |
| `qarar_topics` | `list_topic_attachments` | `p_topic_id uuid` | `jsonb` | yes |
| `qarar_topics` | `list_topic_regulation_references` | `p_topic_id uuid` | `jsonb` | yes |
| `qarar_topics` | `refer_topic` | `p_topic_id uuid, p_to_unit_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_topics` | `remove_topic_attachment` | `p_attachment_id uuid` | `jsonb` | yes |
| `qarar_topics` | `respond_topic_referral` | `p_referral_id uuid, p_decision text, p_reason text` | `jsonb` | yes |
| `qarar_topics` | `review_topic` | `p_topic_id uuid, p_action text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_topics` | `review_topic_core` | `p_topic_id uuid, p_action text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` | yes |
| `qarar_topics` | `save_topic_regulation_references` | `p_topic_id uuid, p_references jsonb` | `jsonb` | yes |
| `qarar_topics` | `search_my_topics` | `p_query text, p_status text, p_priority text, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_topics` | `search_topic_review_queue` | `p_query text, p_status text, p_priority text, p_category_id uuid, p_governance_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` | yes |
| `qarar_topics` | `sync_topic_unit_from_active_step` | `` | `trigger` | yes |
| `qarar_voting` | `advance_governed_workflow_from_vote` | `` | `trigger` | yes |
| `qarar_voting` | `cancel_expired_workflow_voting_rounds` | `p_workflow_instance_step_id uuid, p_closed_at timestamp with time zone` | `integer` | yes |
| `qarar_voting` | `cancel_voting_round` | `p_voting_round_id uuid, p_reason text` | `jsonb` | yes |
| `qarar_voting` | `cast_vote` | `p_voting_round_id uuid, p_vote_value text, p_vote_note text` | `jsonb` | yes |
| `qarar_voting` | `close_voting_round` | `p_voting_round_id uuid, p_reason text` | `jsonb` | yes |
| `qarar_voting` | `enforce_governed_voting_round` | `` | `trigger` | yes |
| `qarar_voting` | `enforce_topic_requirements_before_vote` | `` | `trigger` | yes |
| `qarar_voting` | `enforce_voting_context` | `` | `trigger` | yes |
| `qarar_voting` | `get_my_open_votes` | `p_meeting_id uuid` | `jsonb` | yes |
| `qarar_voting` | `get_voting_round_detail` | `p_voting_round_id uuid` | `jsonb` | yes |
| `qarar_voting` | `list_meeting_voting_rounds` | `p_meeting_id uuid` | `jsonb` | yes |
| `qarar_voting` | `on_voting_closed` | `` | `trigger` | yes |
| `qarar_voting` | `open_voting_round` | `p_agenda_item_id uuid, p_expected_meeting_updated_at timestamp with time zone` | `jsonb` | yes |
