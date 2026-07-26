# Exact api_v1 Contract Reference

This file is generated from the live `qarar_architecture.api_contract_registry` and PostgreSQL
function metadata. Run `npm run docs:api-contracts` after an intentional contract change.

- `authenticated` contracts may be called by signed-in clients, subject to their runtime permission
  and organization checks.
- `service_role` contracts are internal Edge Function contracts. Flutter and browser clients must
  never call them or receive the service-role key.
- The detailed workflow documents remain authoritative for payload semantics, permissions, state
  transitions, and error handling.

| Contract | Module | Audience | Identity arguments | Result |
|---|---|---|---|---|
| `apply_quorum_failure` | `attendance` | `authenticated` | `p_meeting_id uuid, p_action text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` |
| `create_checkin_session` | `attendance` | `authenticated` | `p_meeting_id uuid, p_valid_for_minutes integer` | `jsonb` |
| `get_attendance_history` | `attendance` | `authenticated` | `p_attendance_record_id uuid` | `jsonb` |
| `get_meeting_session_detail` | `attendance` | `authenticated` | `p_meeting_id uuid` | `jsonb` |
| `lock_attendance_roster` | `attendance` | `authenticated` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` |
| `open_meeting_session` | `attendance` | `authenticated` | `p_meeting_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` |
| `override_attendance` | `attendance` | `authenticated` | `p_attendance_record_id uuid, p_status text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` |
| `recalculate_meeting_quorum` | `attendance` | `authenticated` | `p_meeting_id uuid, p_record_snapshot boolean` | `jsonb` |
| `revoke_checkin_session` | `attendance` | `authenticated` | `p_checkin_session_id uuid, p_reason text` | `jsonb` |
| `self_check_in` | `attendance` | `authenticated` | `p_meeting_id uuid, p_token text, p_device_label text` | `jsonb` |
| `verify_attendance` | `attendance` | `authenticated` | `p_attendance_record_id uuid, p_status text, p_note text, p_expected_updated_at timestamp with time zone` | `jsonb` |
| `admin_export_audit_logs` | `audit` | `authenticated` | `p_action text, p_entity_type text, p_actor_user_id uuid, p_result text, p_from timestamp with time zone, p_to timestamp with time zone` | `jsonb` |
| `admin_get_audit_log` | `audit` | `authenticated` | `p_audit_log_id uuid` | `jsonb` |
| `admin_search_audit_logs` | `audit` | `authenticated` | `p_query text, p_action text, p_entity_type text, p_actor_user_id uuid, p_result text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer` | `jsonb` |
| `admin_activate_policy_version` | `governance` | `authenticated` | `p_policy_version_id uuid, p_effective_from date, p_effective_to date` | `jsonb` |
| `admin_activate_workflow_template_version` | `governance` | `authenticated` | `p_workflow_template_version_id uuid` | `jsonb` |
| `admin_add_policy_item` | `governance` | `authenticated` | `p_policy_version_id uuid, p_item_code text, p_title_ar text, p_sort_order integer, p_parent_item_id uuid, p_item_type text, p_title_en text, p_body_text text, p_governance_mode text, p_topic_category_id uuid, p_match_criteria jsonb, p_workflow_template_version_id uuid` | `jsonb` |
| `admin_add_workflow_step` | `governance` | `authenticated` | `p_workflow_template_version_id uuid, p_step_code text, p_name_ar text, p_sequence_no integer, p_step_type text, p_responsibility text, p_governance_unit_id uuid, p_governance_class_id uuid, p_required_permission_code text, p_is_initial boolean, p_is_terminal boolean, p_entry_conditions jsonb, p_exit_conditions jsonb, p_allowed_outcomes text[]` | `jsonb` |
| `admin_add_workflow_transition` | `governance` | `authenticated` | `p_workflow_template_version_id uuid, p_from_step_id uuid, p_outcome_code text, p_to_step_id uuid, p_transition_type text, p_conditions jsonb` | `jsonb` |
| `admin_approve_policy_version` | `governance` | `authenticated` | `p_policy_version_id uuid` | `jsonb` |
| `admin_create_policy` | `governance` | `authenticated` | `p_code text, p_name_ar text, p_name_en text, p_policy_type text, p_description text, p_owner_user_id uuid` | `jsonb` |
| `admin_create_policy_version` | `governance` | `authenticated` | `p_policy_id uuid, p_version_label text, p_change_summary text` | `jsonb` |
| `admin_create_workflow_template` | `governance` | `authenticated` | `p_code text, p_name_ar text, p_name_en text, p_description text` | `jsonb` |
| `admin_create_workflow_version` | `governance` | `authenticated` | `p_workflow_template_id uuid, p_clone_version_id uuid` | `jsonb` |
| `admin_get_policy_detail` | `governance` | `authenticated` | `p_policy_id uuid` | `jsonb` |
| `admin_remove_policy_item` | `governance` | `authenticated` | `p_policy_item_id uuid` | `jsonb` |
| `admin_remove_policy_scope` | `governance` | `authenticated` | `p_scope_assignment_id uuid` | `jsonb` |
| `admin_remove_workflow_step` | `governance` | `authenticated` | `p_step_id uuid` | `jsonb` |
| `admin_search_policies` | `governance` | `authenticated` | `p_query text, p_status text, p_limit integer, p_offset integer` | `jsonb` |
| `admin_set_policy_item_scope_override` | `governance` | `authenticated` | `p_policy_item_id uuid, p_scope_assignment_id uuid, p_governance_unit_id uuid, p_is_included boolean, p_reason text, p_priority integer, p_valid_from date, p_valid_to date` | `jsonb` |
| `admin_set_policy_scope` | `governance` | `authenticated` | `p_policy_version_id uuid, p_scope_type text, p_target_id uuid, p_governance_level text, p_include_descendants boolean, p_priority integer, p_valid_from date, p_valid_to date` | `jsonb` |
| `admin_submit_policy_for_review` | `governance` | `authenticated` | `p_policy_version_id uuid` | `jsonb` |
| `admin_suspend_policy_version` | `governance` | `authenticated` | `p_policy_version_id uuid, p_reason text` | `jsonb` |
| `admin_update_policy` | `governance` | `authenticated` | `p_policy_id uuid, p_name_ar text, p_name_en text, p_description text, p_owner_user_id uuid, p_status text` | `jsonb` |
| `admin_update_policy_item` | `governance` | `authenticated` | `p_policy_item_id uuid, p_title_ar text, p_title_en text, p_body_text text, p_sort_order integer, p_governance_mode text, p_topic_category_id uuid, p_match_criteria jsonb, p_workflow_template_version_id uuid, p_is_active boolean` | `jsonb` |
| `admin_update_workflow_step` | `governance` | `authenticated` | `p_step_id uuid, p_name_ar text, p_sequence_no integer, p_responsibility text, p_governance_unit_id uuid, p_governance_class_id uuid, p_required_permission_code text, p_is_initial boolean, p_is_terminal boolean, p_entry_conditions jsonb, p_exit_conditions jsonb, p_allowed_outcomes text[]` | `jsonb` |
| `approve_workflow_exception` | `governance` | `authenticated` | `p_exception_id uuid, p_approve boolean, p_review_comment text` | `jsonb` |
| `complete_topic_workflow_step` | `governance` | `authenticated` | `p_topic_id uuid, p_outcome_code text, p_comment text` | `jsonb` |
| `get_topic_governance` | `governance` | `authenticated` | `p_topic_id uuid` | `jsonb` |
| `get_topic_workflow` | `governance` | `authenticated` | `p_topic_id uuid` | `jsonb` |
| `reject_topic_workflow_step` | `governance` | `authenticated` | `p_topic_id uuid, p_comment text` | `jsonb` |
| `request_workflow_exception` | `governance` | `authenticated` | `p_topic_id uuid, p_workflow_template_version_id uuid, p_reason text, p_valid_until timestamp with time zone` | `jsonb` |
| `resolve_topic_governance` | `governance` | `authenticated` | `p_governance_unit_id uuid, p_topic_category_id uuid, p_effective_on date, p_topic_id uuid` | `jsonb` |
| `return_topic_workflow_step` | `governance` | `authenticated` | `p_topic_id uuid, p_comment text` | `jsonb` |
| `admin_assign_role` | `iam` | `authenticated` | `p_user_id uuid, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text, p_start_date date, p_end_date date` | `uuid` |
| `admin_create_delegation` | `iam` | `authenticated` | `p_source_membership_id uuid, p_delegated_to_user_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_reason text` | `uuid` |
| `admin_create_invitation` | `iam` | `authenticated` | `p_email text, p_full_name_ar text, p_role_id uuid, p_governance_unit_id uuid, p_expires_at timestamp with time zone` | `uuid` |
| `admin_create_user_profile` | `iam` | `authenticated` | `p_auth_user_id uuid, p_email text, p_full_name_ar text, p_employee_no text, p_mobile text, p_job_title text` | `uuid` |
| `admin_deactivate_role` | `iam` | `authenticated` | `p_role_id uuid, p_reason text` | `void` |
| `admin_export_permission_matrix` | `iam` | `authenticated` | `-` | `jsonb` |
| `admin_get_role_detail` | `iam` | `authenticated` | `p_role_id uuid` | `jsonb` |
| `admin_get_user_detail` | `iam` | `authenticated` | `p_user_id uuid` | `jsonb` |
| `admin_list_permissions` | `iam` | `authenticated` | `p_module text, p_active_only boolean` | `jsonb` |
| `admin_list_roles` | `iam` | `authenticated` | `p_query text, p_scope text, p_active_only boolean` | `jsonb` |
| `admin_request_permission_matrix_import` | `iam` | `authenticated` | `p_matrix jsonb, p_justification text` | `uuid` |
| `admin_request_role_permissions_change` | `iam` | `authenticated` | `p_role_id uuid, p_permission_codes text[], p_justification text` | `uuid` |
| `admin_review_iam_change` | `iam` | `authenticated` | `p_request_id uuid, p_decision text, p_notes text` | `void` |
| `admin_revoke_delegation` | `iam` | `authenticated` | `p_delegation_id uuid, p_reason text` | `void` |
| `admin_revoke_invitation` | `iam` | `authenticated` | `p_invitation_id uuid, p_reason text` | `void` |
| `admin_revoke_membership` | `iam` | `authenticated` | `p_membership_id uuid, p_reason text` | `void` |
| `admin_search_users` | `iam` | `authenticated` | `p_query text, p_status text, p_role_id uuid, p_governance_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` |
| `admin_update_user_profile` | `iam` | `authenticated` | `p_user_id uuid, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text` | `uuid` |
| `admin_upsert_permission` | `iam` | `authenticated` | `p_code text, p_module text, p_action text, p_context_scope text, p_name_ar text, p_name_en text, p_description text, p_is_active boolean` | `uuid` |
| `admin_upsert_role` | `iam` | `authenticated` | `p_role_id uuid, p_code text, p_name_ar text, p_name_en text, p_description text, p_role_scope text, p_is_active boolean` | `uuid` |
| `admin_upsert_sso_domain` | `iam` | `authenticated` | `p_sso_provider_id uuid, p_domain text, p_verified boolean` | `uuid` |
| `admin_upsert_sso_group_mapping` | `iam` | `authenticated` | `p_provider_id uuid, p_external_group text, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text, p_is_active boolean` | `uuid` |
| `admin_upsert_sso_provider` | `iam` | `authenticated` | `p_provider_name text, p_supabase_sso_provider_id uuid, p_metadata_url text, p_entity_id text, p_attribute_mapping jsonb, p_default_role_id uuid, p_default_governance_unit_id uuid, p_provisioning_mode text, p_status text` | `uuid` |
| `bootstrap_current_user_profile` | `iam` | `authenticated` | `p_organization_code text, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text` | `uuid` |
| `get_current_user_access_context` | `iam` | `authenticated` | `-` | `jsonb` |
| `get_my_account` | `iam` | `authenticated` | `-` | `jsonb` |
| `has_permission` | `iam` | `authenticated` | `permission_code text, target_unit_id uuid` | `boolean` |
| `list_my_sessions` | `iam` | `authenticated` | `-` | `jsonb` |
| `register_current_sso_login` | `iam` | `authenticated` | `p_full_name_ar text` | `uuid` |
| `register_user_session` | `iam` | `authenticated` | `p_device_id text, p_device_name text, p_platform text, p_app_version text, p_auth_session_id uuid, p_ip_address inet, p_user_agent text` | `uuid` |
| `request_session_revocation` | `iam` | `authenticated` | `p_session_id uuid` | `jsonb` |
| `service_apply_user_status` | `iam` | `service_role` | `p_actor_user_id uuid, p_user_id uuid, p_status text, p_reason text` | `jsonb` |
| `service_consume_iam_rate_limit` | `iam` | `service_role` | `p_actor_user_id uuid, p_operation text, p_limit integer, p_window_seconds integer` | `integer` |
| `service_finalize_invited_user` | `iam` | `service_role` | `p_actor_user_id uuid, p_auth_user_id uuid, p_email text, p_full_name_ar text, p_employee_no text, p_mobile text, p_job_title text, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text` | `jsonb` |
| `service_record_iam_event` | `iam` | `service_role` | `p_actor_user_id uuid, p_target_user_id uuid, p_action text, p_metadata jsonb` | `uuid` |
| `service_revoke_auth_sessions` | `iam` | `service_role` | `p_actor_user_id uuid, p_user_id uuid, p_auth_session_id uuid, p_reason text` | `integer` |
| `sync_current_sso_groups` | `iam` | `authenticated` | `p_external_groups text[]` | `integer` |
| `update_my_preferences` | `iam` | `authenticated` | `p_locale text, p_timezone text, p_notification_settings jsonb, p_ui_settings jsonb` | `jsonb` |
| `update_my_profile` | `iam` | `authenticated` | `p_full_name_ar text, p_full_name_en text, p_mobile text, p_job_title text` | `jsonb` |
| `add_agenda_item` | `meetings` | `authenticated` | `p_meeting_id uuid, p_topic_id uuid, p_is_exception boolean, p_exception_reason text` | `jsonb` |
| `create_meeting` | `meetings` | `authenticated` | `p_governance_unit_id uuid, p_meeting_type_id uuid, p_title_ar text, p_scheduled_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_type text, p_location_details text, p_title_en text, p_client_request_id uuid` | `jsonb` |
| `get_meeting_detail` | `meetings` | `authenticated` | `p_meeting_id uuid` | `jsonb` |
| `get_sprint02_form_options` | `meetings` | `authenticated` | `-` | `jsonb` |
| `remove_agenda_item` | `meetings` | `authenticated` | `p_agenda_item_id uuid, p_reason text` | `jsonb` |
| `reorder_agenda_items` | `meetings` | `authenticated` | `p_meeting_id uuid, p_ordered_item_ids uuid[], p_expected_meeting_updated_at timestamp with time zone` | `jsonb` |
| `search_eligible_agenda_topics` | `meetings` | `authenticated` | `p_meeting_id uuid, p_query text, p_limit integer, p_offset integer` | `jsonb` |
| `search_meetings` | `meetings` | `authenticated` | `p_query text, p_status text, p_unit_id uuid, p_from_date date, p_to_date date, p_limit integer, p_offset integer` | `jsonb` |
| `transition_meeting` | `meetings` | `authenticated` | `p_meeting_id uuid, p_to_status text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` |
| `update_meeting` | `meetings` | `authenticated` | `p_meeting_id uuid, p_title_ar text, p_scheduled_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_type text, p_location_details text, p_title_en text, p_meeting_type_id uuid, p_expected_updated_at timestamp with time zone` | `jsonb` |
| `create_topic` | `topics` | `authenticated` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` |
| `create_topic_with_workflow` | `topics` | `authenticated` | `p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid` | `jsonb` |
| `get_topic_detail` | `topics` | `authenticated` | `p_topic_id uuid` | `jsonb` |
| `get_topic_form_options` | `topics` | `authenticated` | `-` | `jsonb` |
| `get_topic_route_history` | `topics` | `authenticated` | `p_topic_id uuid` | `jsonb` |
| `refer_topic` | `topics` | `authenticated` | `p_topic_id uuid, p_to_unit_id uuid, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` |
| `respond_topic_referral` | `topics` | `authenticated` | `p_referral_id uuid, p_decision text, p_reason text` | `jsonb` |
| `review_topic` | `topics` | `authenticated` | `p_topic_id uuid, p_action text, p_reason text, p_expected_updated_at timestamp with time zone` | `jsonb` |
| `search_my_topics` | `topics` | `authenticated` | `p_query text, p_status text, p_priority text, p_limit integer, p_offset integer` | `jsonb` |
| `search_topic_review_queue` | `topics` | `authenticated` | `p_query text, p_status text, p_priority text, p_category_id uuid, p_governance_unit_id uuid, p_limit integer, p_offset integer` | `jsonb` |
| `cancel_voting_round` | `voting` | `authenticated` | `p_voting_round_id uuid, p_reason text` | `jsonb` |
| `cast_vote` | `voting` | `authenticated` | `p_voting_round_id uuid, p_vote_value text, p_vote_note text` | `jsonb` |
| `close_voting_round` | `voting` | `authenticated` | `p_voting_round_id uuid, p_reason text` | `jsonb` |
| `get_my_open_votes` | `voting` | `authenticated` | `p_meeting_id uuid` | `jsonb` |
| `get_voting_round_detail` | `voting` | `authenticated` | `p_voting_round_id uuid` | `jsonb` |
| `open_voting_round` | `voting` | `authenticated` | `p_agenda_item_id uuid, p_expected_meeting_updated_at timestamp with time zone` | `jsonb` |
