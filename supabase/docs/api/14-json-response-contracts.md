# JSON Response Contracts

This catalog fixes the frontend-visible shape of every authenticated `api_v1` function returning
`jsonb`. It complements the exact argument/result reference in
[12-contract-reference.md](./12-contract-reference.md). A trailing `?` means nullable. Arrays are
always returned as `[]`, not `null`, unless explicitly marked nullable.

## Shared Shapes

```text
Page<T> = { items: T[], total: int, limit: int, offset: int }
Option = { id: uuid, code: string, name_ar: string, name_en: string? }
UnitOption = Option
PermissionCode = string

AccessContext = {
  user_id: uuid,
  organization_id: uuid,
  organization_code: string,
  is_system_admin: bool,
  sso_provider_id: uuid?,
  roles: {
    role_id: uuid,
    code: string,
    scope: string,
    governance_unit_id: uuid?
  }[],
  permissions: PermissionCode[]
}

Preferences = {
  locale: string,
  timezone: string,
  notification_settings: object,
  ui_settings: object
}

Account = {
  id: uuid,
  organization_id: uuid,
  email: string,
  full_name_ar: string,
  full_name_en: string?,
  employee_no: string?,
  mobile: string?,
  job_title: string?,
  status: string,
  is_system_admin: bool,
  preferences: Preferences,
  access: AccessContext
}

Quorum = {
  id: uuid?,
  meeting_id: uuid,
  required_percentage: number,
  eligible_members: int,
  present_members: int,
  actual_percentage: number,
  quorum_status: string,
  calculated_at: timestamp?,
  calculated_by_user_id: uuid?
}
```

Objects documented as `row + {...}` contain the named backend row fields plus the explicitly listed
frontend enrichments. Clients should decode only fields used by the screen and ignore additive
unknown fields.

## IAM

| Contract | Response |
|---|---|
| `get_current_user_access_context` | `AccessContext` |
| `get_my_account` | `Account` |
| `update_my_profile` | Updated `Account` |
| `update_my_preferences` | Updated `Preferences` |
| `admin_search_users` | `Page<UserSummary>` where `UserSummary={id,email,full_name_ar,employee_no?,mobile?,job_title?,status,is_system_admin,created_at,roles:UserRoleSummary[]}` |
| `admin_get_user_detail` | `{id,email,full_name_ar,full_name_en?,employee_no?,mobile?,job_title?,status,is_system_admin,memberships:MembershipDetail[],identity_links:IdentityLink[]}` |
| `admin_list_permissions` | `PermissionSummary[]`; each item has `{id,code,module,action,context_scope,name_ar,name_en?,is_system_permission,is_active}` |
| `admin_list_roles` | `RoleSummary[]`; each item has `{id,code,name_ar,name_en?,role_scope,is_active,permission_count}` |
| `admin_get_role_detail` | `{id,code,name_ar,name_en?,description?,role_scope,is_active,permissions:PermissionSummary[]}` |
| `admin_export_permission_matrix` | `{schema_version:1,exported_at,organization_id,permissions:object[],roles:object[],assignments:object[]}` |
| `list_my_sessions` | `SessionSummary[]`; ordered by last activity, with session/device/platform/app/status/activity/revocation fields |
| `request_session_revocation` | `{revoked:bool,session_id:uuid}`; application-level record only |

`UserRoleSummary` contains `membership_id`, `role_id`, `role_code`, `role_name_ar`,
`governance_unit_id`, `governance_unit_name_ar`, and `membership_status`.
`MembershipDetail` additionally contains `start_date` and `end_date?`.
`IdentityLink` contains `provider_id`, `provider_name`, `external_email`, `last_login_at?`, and
`status`.

## Topics

```text
TopicSummary = {
  id, topic_no, title_ar, title_en?, priority, status,
  submitted_at?, created_at, updated_at,
  category_id, category_name_ar,
  governance_unit_id, governance_unit_name_ar
}

TopicHistory = {
  id, from_status?, to_status, change_reason?,
  changed_at, changed_by_user_id?, changed_by_name_ar?
}
```

| Contract | Response |
|---|---|
| `get_topic_form_options` | `{categories:Option[],governance_units:UnitOption[],priorities:string[],source_types:string[]}` |
| `search_my_topics` | `Page<TopicSummary>` |
| `search_topic_review_queue` | `Page<TopicSummary + {submitted_by_user_id,submitted_by_name_ar}>` |
| `get_topic_detail` | `Topic row + {category:Option,governance_unit:UnitOption,submitted_by:{id,full_name_ar,full_name_en?},history:TopicHistory[],allowed_review_actions:string[]}` |
| `create_topic` | `{id,topic_no,status,idempotent_replay}` |
| `review_topic` | `{id,topic_no,previous_status,status,action}` |
| `refer_topic` | `{referral_id,topic_id,status,from_unit_id,to_unit_id}` |
| `respond_topic_referral` | `{referral_id,topic_id,status,current_unit_id}` |
| `get_topic_route_history` | `TopicRouteEntry[]`, ordered chronologically as defined in [06-topic-referrals.md](./06-topic-referrals.md) |

## Meetings and Agenda

```text
MeetingSummary = {
  id, meeting_no, title_ar, title_en?, status,
  scheduled_date, start_time, end_time,
  location_type,
  governance_unit_id, governance_unit_name_ar,
  meeting_type_id, meeting_type_name_ar,
  agenda_item_count, created_at, updated_at
}

AgendaItem = {
  id, agenda_order, agenda_status,
  is_exception, exception_reason?,
  voting_status, voting_result,
  updated_at,
  topic: {id,topic_no,title_ar,status}
}
```

| Contract | Response |
|---|---|
| `get_sprint02_form_options` | `{meeting_types:Option[],meeting_units:UnitOption[],referral_units:UnitOption[],location_types:string[]}` |
| `search_meetings` | `Page<MeetingSummary>` |
| `get_meeting_detail` | `Meeting row + {governance_unit:UnitOption,meeting_type:Option,agenda_items:AgendaItem[],status_history:MeetingStatusHistory[]}` |
| `create_meeting` | `{id,meeting_no,status,idempotent_replay}` |
| `update_meeting` | Updated meeting detail |
| `transition_meeting` | `{id,meeting_no,previous_status,status}` |
| `search_eligible_agenda_topics` | `Page<{id,topic_no,title_ar,priority,status,updated_at}>` |
| `add_agenda_item` | `{id,meeting_id,topic_id,agenda_order,is_exception}` |
| `reorder_agenda_items` | Updated `AgendaItem[]` |
| `remove_agenda_item` | `{removed:true,agenda_item_id}` |

## Attendance and Quorum

```text
AttendanceRecord = {
  id, meeting_id, user_id, membership_id,
  attendance_status, verification_status,
  check_in_method?, self_checked_in_at?, check_in_at?, check_out_at?,
  remarks?, verified_by_user_id?, verified_at?, verification_note?,
  created_at, updated_at
}

MeetingSessionDetail = {
  meeting: {
    id, meeting_no, title_ar, status, quorum_status, updated_at,
    attendance_locked, attendance_locked_at?, attendance_locked_by_user_id?
  },
  attendance: (AttendanceRecord + {full_name_ar,status})[],
  quorum: Quorum?,
  checkin_session: {
    id,status,starts_at,expires_at,created_by_user_id,created_at
  }?,
  open_voting_rounds: VotingRound[]
}
```

| Contract | Response |
|---|---|
| `open_meeting_session` | `MeetingSessionDetail` |
| `get_meeting_session_detail` | `MeetingSessionDetail` |
| `create_checkin_session` | `{checkin_session_id,meeting_id,token,expires_at}` |
| `revoke_checkin_session` | `{checkin_session_id,status}` |
| `self_check_in` | `{attendance_record_id,verification_status,self_checked_in_at}` |
| `verify_attendance` | Updated `AttendanceRecord` |
| `get_attendance_history` | `{id,from_status?,to_status,remarks?,changed_by_user_id?,changed_by_name_ar?,changed_at}[]` |
| `lock_attendance_roster` | `{meeting_id,attendance_locked:true,attendance_locked_at,quorum:Quorum}` |
| `override_attendance` | `{attendance_record_id,status,quorum:Quorum}` |
| `recalculate_meeting_quorum` | `Quorum` |
| `apply_quorum_failure` | `{meeting_id,status,quorum:Quorum}` |

## Voting

```text
VotingRound = {
  id, meeting_id, agenda_item_id, round_number, status,
  calculation_rule, eligible_voter_count,
  approve_count?, reject_count?, abstain_count?,
  result?, opened_by_user_id, opened_at,
  closed_by_user_id?, closed_at?, close_reason?
}
```

| Contract | Response |
|---|---|
| `open_voting_round` | `{voting_round_id,meeting_id,agenda_item_id,round_number,status,eligible_voter_count}` |
| `get_my_open_votes` | `{voting_round_id,meeting_id,agenda_item_id,topic_id,topic_no,title_ar,opened_at,has_voted}[]` |
| `cast_vote` | `{vote_id,voting_round_id,accepted:true,voted_at}` |
| `close_voting_round` | `{voting_round_id,status,result,eligible_voter_count,approve_count,reject_count,abstain_count}` |
| `cancel_voting_round` | `{voting_round_id,status,result}` |
| `get_voting_round_detail` | `VotingRound + {has_voted,my_vote?,eligible_members:EligibleMember[]?,votes:VoteDetail[]?}` |

`eligible_members` and `votes` are `null` for ordinary members and arrays for callers with
`voting.manage`, as described in [07-session-attendance-voting.md](./07-session-attendance-voting.md).

## Audit

```text
AuditItem = {
  id, action, entity_type, entity_id?,
  actor_user_id?, actor_name_ar?, actor_email?,
  result, previous_data?, new_data?, metadata, occurred_at
}
```

| Contract | Response |
|---|---|
| `admin_search_audit_logs` | `Page<AuditItem>` |
| `admin_get_audit_log` | Complete `AuditItem` |
| `admin_export_audit_logs` | `{schema_version,exported_at,organization_id,items:AuditItem[]}` |

## Decoder Rule

Use the table above to create immutable DTOs. Required identity/state fields must fail decoding when
absent or of the wrong type. Nullable fields accept only `null` or the documented type. Additive
unknown fields must be ignored to preserve forward compatibility within `api_v1`.
