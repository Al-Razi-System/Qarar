const baseUrl = process.env.QARAR_BASE_URL ?? "http://localhost:3000";
const email = process.env.QARAR_ADMIN_EMAIL;
const password = process.env.QARAR_ADMIN_PASSWORD;
const policyId = "007538e1-6a2e-4b94-aa5a-47f825c6e3eb";
const universityCouncilId = "10000000-0000-0000-0000-000000000001";

if (!email || !password) throw new Error("Admin credentials are required.");

const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Login failed (${login.status}).`);
const cookies = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");

async function rpc(contract, params = {}) {
  const response = await fetch(`${baseUrl}/api/admin/regulations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${contract}: ${payload.error?.message ?? response.statusText}`);
  return payload.data;
}

const workflowCode = "university-council-regulation-approval";
const templates = await rpc("admin_list_workflow_templates");
const existingWorkflow = templates.find((template) => template.code === workflowCode);
let workflowVersionId = existingWorkflow?.versions.find((version) => version.status === "active")?.id;

const stepDefinitions = [
  {
    code: "legal_review", name: "المراجعة القانونية", sequence: 1,
    type: "review", responsibility: "review", initial: true, terminal: false,
    outcomes: ["approved", "rejected"], permission: "governance.policies.manage",
  },
  {
    code: "council_discussion", name: "مناقشة مجلس الجامعة", sequence: 2,
    type: "discussion", responsibility: "discuss", initial: false, terminal: false,
    outcomes: ["approved", "rejected"], permission: "governance.workflows.manage",
  },
  {
    code: "final_approval", name: "الاعتماد النهائي", sequence: 3,
    type: "approval", responsibility: "final_approve", initial: false, terminal: false,
    outcomes: ["approved", "rejected"], permission: "governance.policies.approve",
  },
  {
    code: "publication", name: "النشر والنفاذ", sequence: 4,
    type: "execution", responsibility: "execute", initial: false, terminal: true,
    outcomes: ["completed"], permission: "governance.policies.manage",
  },
];

if (!workflowVersionId) {
  const created = await rpc("admin_create_workflow_template", {
    p_code: workflowCode,
    p_name_ar: "مسار مراجعة واعتماد لائحة مجلس الجامعة",
    p_name_en: "University Council Regulation Approval",
    p_description: "مسار مستقل لمراجعة النص القانوني ومناقشته واعتماده ثم نشره للتنفيذ مع أثر تدقيقي كامل.",
  });
  workflowVersionId = created.draft_version_id;
  const steps = [];
  for (const definition of stepDefinitions) {
    const result = await rpc("admin_add_workflow_step", {
    p_workflow_template_version_id: workflowVersionId,
    p_step_code: definition.code,
    p_name_ar: definition.name,
    p_sequence_no: definition.sequence,
    p_step_type: definition.type,
    p_responsibility: definition.responsibility,
    p_governance_unit_id: universityCouncilId,
    p_governance_class_id: null,
    p_required_permission_code: definition.permission,
    p_is_initial: definition.initial,
    p_is_terminal: definition.terminal,
    p_entry_conditions: {},
    p_exit_conditions: {},
    p_allowed_outcomes: definition.outcomes,
    });
    steps.push({ ...definition, id: result.id });
  }

  for (let index = 0; index < steps.length - 1; index += 1) {
    await rpc("admin_add_workflow_transition", {
    p_workflow_template_version_id: workflowVersionId,
    p_from_step_id: steps[index].id,
    p_outcome_code: "approved",
    p_to_step_id: steps[index + 1].id,
    p_transition_type: "forward",
    p_conditions: {},
    });
    await rpc("admin_add_workflow_transition", {
    p_workflow_template_version_id: workflowVersionId,
    p_from_step_id: steps[index].id,
    p_outcome_code: "rejected",
    p_to_step_id: null,
    p_transition_type: "reject",
    p_conditions: {},
    });
  }

  await rpc("admin_activate_workflow_template_version", {
    p_workflow_template_version_id: workflowVersionId,
  });
}

const detail = await rpc("admin_get_policy_detail", { p_policy_id: policyId });
const version = detail.versions[0];
const governedArticles = version.items.filter((item) => {
  const match = /^ART-(\d+)$/.exec(item.item_code);
  return match && Number(match[1]) >= 7;
});

for (const item of governedArticles) {
  await rpc("admin_update_policy_item", {
    p_policy_item_id: item.id,
    p_title_ar: item.title_ar,
    p_title_en: item.title_en ?? null,
    p_body_text: item.body_text,
    p_sort_order: item.sort_order,
    p_governance_mode: "regulation_required",
    p_topic_category_id: item.topic_category_id ?? null,
    p_match_criteria: item.match_criteria ?? {},
    p_workflow_template_version_id: workflowVersionId,
    p_is_active: true,
  });
}

const model = await rpc("admin_get_policy_legislative_model", { p_policy_version_id: version.id });
let boundRules = 0;
for (const item of model.items) {
  for (const rule of item.rules ?? []) {
    await rpc("admin_save_policy_rule", {
      p_policy_item_id: item.id,
      p_rule: {
        id: rule.id,
        code: rule.rule_code,
        name_ar: rule.name_ar,
        description: rule.description,
        rule_type: rule.rule_type,
        status: rule.status,
        priority: rule.priority,
        valid_from: rule.valid_from,
        valid_to: rule.valid_to,
        applies_when: rule.applies_when ?? {},
        effect_payload: rule.effect_payload ?? {},
        requires_workflow: true,
        conditions: (rule.conditions ?? []).map((row) => ({
          code: row.condition_code,
          field_path: row.field_path,
          operator: row.operator,
          expected_value: row.expected_value,
          failure_action: row.failure_action,
          failure_message_ar: row.failure_message_ar,
        })),
        requirements: (rule.requirements ?? []).map((row) => ({
          code: row.requirement_code,
          name_ar: row.name_ar,
          requirement_type: row.requirement_type,
          timing: row.timing,
          is_mandatory: row.is_mandatory,
          validation_spec: row.validation_spec ?? {},
        })),
        authorities: (rule.authorities ?? []).map((row) => ({
          governance_unit_id: row.governance_unit_id,
          governance_class_id: row.governance_class_id,
          responsibility: row.responsibility,
          authority_action: row.authority_action,
          required_permission_code: row.required_permission_code,
          is_final: row.is_final,
        })),
        actions: (rule.actions ?? []).map((row) => ({
          code: row.action_code,
          label_ar: row.label_ar,
          action_type: row.action_type,
          requires_reason: row.requires_reason,
          is_terminal: row.is_terminal,
          result_payload: row.result_payload ?? {},
        })),
        workflow_bindings: [{
          workflow_template_version_id: workflowVersionId,
          binding_type: "primary",
          selection_conditions: {},
          priority: 100,
        }],
      },
    });
    boundRules += 1;
  }
}

const readiness = await rpc("admin_validate_policy_version_readiness", {
  p_policy_version_id: version.id,
});
console.log(JSON.stringify({ workflow_version_id: workflowVersionId, governed_articles: governedArticles.length, bound_rules: boundRules, readiness }, null, 2));
