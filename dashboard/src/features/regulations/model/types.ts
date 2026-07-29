export type PolicyItem = {
  id: string; policy_version_id: string; item_code: string; item_type: string;
  title_ar: string; title_en?: string | null; body_text?: string | null;
  sort_order: number; parent_item_id?: string | null; governance_mode: string;
  topic_category_id?: string | null; match_criteria: Record<string, unknown>;
  workflow_template_version_id?: string | null; is_active: boolean;
};
export type PolicyScope = {
  id: string; policy_version_id: string; scope_type: string; target_id?: string | null;
  governance_level?: string | null; include_descendants: boolean; priority: number;
  valid_from?: string | null; valid_to?: string | null; is_active: boolean;
};
export type PolicyVersion = {
  id: string; version_no: number; version_label?: string | null; legal_status: string;
  automation_status: string; automation_readiness_pct: number; effective_from?: string | null;
  effective_to?: string | null; change_summary?: string | null; items: PolicyItem[];
  scopes: PolicyScope[]; submitted_at?: string | null; approved_at?: string | null;
  submitted_by_user_id?: string | null; approved_by_user_id?: string | null;
  activated_by_user_id?: string | null; activated_at?: string | null;
};
export type Policy = {
  id: string; code: string; name_ar: string; name_en?: string | null; policy_type: string;
  status: string; description?: string | null; owner_user_id?: string | null;
  updated_at: string; version_count?: number; latest_version_no?: number; versions?: PolicyVersion[];
};
export type WorkflowStep = {
  id: string; workflow_template_version_id: string; step_code: string; name_ar: string;
  sequence_no: number; step_type: string; responsibility: string;
  governance_unit_id?: string | null; governance_class_id?: string | null;
  required_permission_code?: string | null; is_initial: boolean; is_terminal: boolean;
  allowed_outcomes: string[];
};
export type WorkflowTransition = {
  id: string; from_step_id: string; to_step_id?: string | null; outcome_code: string;
  transition_type: string;
};
export type WorkflowVersion = {
  id: string; version_no: number; status: string; validation_status: string;
  steps: WorkflowStep[]; transitions: WorkflowTransition[];
};
export type WorkflowTemplate = {
  id: string; code: string; name_ar: string; name_en?: string | null;
  description?: string | null; status: string; versions: WorkflowVersion[];
};
export type ReferenceOption = { id: string; code: string; name_ar: string; [key: string]: unknown };
export type GovernanceException = {
  id: string; topic_id: string; topic_title_ar: string; exception_type: string; status: string;
  reason: string; valid_until: string; requested_at: string; workflow_name_ar?: string | null;
};
