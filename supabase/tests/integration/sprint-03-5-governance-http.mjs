import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"

const envText = await readFile(new URL("../../docker/.env", import.meta.url), "utf8")
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) =>
  line && !line.startsWith("#") && line.includes("=")
).map((line) => {
  const separator = line.indexOf("=")
  return [line.slice(0, separator), line.slice(separator + 1)]
}))
const baseUrl = env.SUPABASE_PUBLIC_URL || "http://localhost:54321"
const anonKey = env.ANON_KEY
const serviceKey = env.SERVICE_ROLE_KEY
assert.ok(anonKey && serviceKey, "ANON_KEY and SERVICE_ROLE_KEY are required")

const serviceHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
}
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = `Qarar-${suffix}!Aa1`
const builderEmail = `s035-builder-${suffix}@example.test`
const approverEmail = `s035-approver-${suffix}@example.test`
const noPermissionEmail = `s035-no-permission-${suffix}@example.test`
const created = { authUsers: [], organizationId: null }
const keepFixtures = process.argv.includes("--keep-fixtures")

async function request(path, options = {}, expected = null) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (expected !== null) assert.equal(response.status, expected, `${path}: ${response.status} ${text}`)
  return { response, body }
}

async function rest(path, method = "GET", body, headers = serviceHeaders) {
  const schemaHeaders = path.startsWith("rpc/")
    ? { "Accept-Profile": "api_v1", "Content-Profile": "api_v1" }
    : { "Accept-Profile": "public", "Content-Profile": "public" }
  return request(`/rest/v1/${path}`, {
    method,
    headers: {
      ...headers,
      ...schemaHeaders,
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function rpc(name, body, headers, expected = 200) {
  const result = await rest(`rpc/${name}`, "POST", body, headers)
  assert.equal(result.response.status, expected, `${name}: ${JSON.stringify(result.body)}`)
  return result.body
}

async function createAuthUser(email) {
  const { body } = await request("/auth/v1/admin/users", {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  }, 200)
  created.authUsers.push(body.id)
  return body
}

async function login(email) {
  const { body } = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }, 200)
  return {
    apikey: anonKey,
    Authorization: `Bearer ${body.access_token}`,
    "Content-Type": "application/json",
  }
}

function sql(statement) {
  return execFileSync("docker", [
    "exec", "qarar-supabase-db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "supabase_admin", "-d", "postgres", "-Atqc", statement,
  ], { encoding: "utf8" }).trim()
}

async function cleanup() {
  if (created.organizationId) {
    assert.match(created.organizationId, /^[0-9a-f-]{36}$/)
    sql(`
      set session_replication_role=replica;
      do $cleanup$
      declare owned_table record;
      begin
        for owned_table in
          select n.nspname as schema_name,c.relname as table_name
          from pg_class c
          join pg_namespace n on n.oid=c.relnamespace
          join pg_attribute a on a.attrelid=c.oid
          where c.relkind in ('r','p') and a.attname='organization_id'
            and n.nspname like 'qarar\\_%' escape '\\'
        loop
          execute format('delete from %I.%I where organization_id=$1',
            owned_table.schema_name,owned_table.table_name)
          using '${created.organizationId}'::uuid;
        end loop;
        delete from qarar_core.organizations where id='${created.organizationId}';
      end
      $cleanup$;
      set session_replication_role=origin;
    `)
  }
  for (const id of created.authUsers) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders })
  }
}

try {
  const builder = await createAuthUser(builderEmail)
  const approver = await createAuthUser(approverEmail)
  const noPermission = await createAuthUser(noPermissionEmail)
  const organization = (await rest("organizations", "POST", {
    code: `S035-${suffix}`, name_ar: "Sprint 03.5 HTTP",
  })).body[0]
  created.organizationId = organization.id
  const unitType = (await rest("governance_unit_types", "POST", {
    organization_id: organization.id, code: `TYPE-${suffix}`, name_ar: "Council",
  })).body[0]
  const unit = (await rest("governance_units", "POST", {
    organization_id: organization.id, unit_type_id: unitType.id,
    code: `UNIT-${suffix}`, name_ar: "Governance Council",
  })).body[0]
  const category = (await rest("topic_categories", "POST", {
    organization_id: organization.id, code: `CAT-${suffix}`, name_ar: "Governed Topic",
  })).body[0]
  const votingCategory = (await rest("topic_categories", "POST", {
    organization_id: organization.id, code: `VOTE-${suffix}`, name_ar: "Voting Topic",
  })).body[0]
  const customRouteCategory = (await rest("topic_categories", "POST", {
    organization_id: organization.id, code: `CUSTOM-${suffix}`, name_ar: "Custom Route Topic",
  })).body[0]
  const noMatchCategory = (await rest("topic_categories", "POST", {
    organization_id: organization.id, code: `NOMATCH-${suffix}`, name_ar: "No Matching Regulation Topic",
  })).body[0]
  const role = (await rest("roles", "POST", {
    organization_id: organization.id, code: `GOV-${suffix}`,
    name_ar: "Governance Manager", role_scope: "governance_unit",
  })).body[0]
  const permissionCodes = [
    "topics.create", "topics.read", "topics.review",
    "governance.policies.read", "governance.policies.manage",
    "governance.policies.approve", "governance.workflows.manage",
    "governance.exceptions.request", "governance.exceptions.approve",
    "governance.compliance.read", "governance.alerts.manage",
    "meetings.manage", "agenda.manage", "attendance.read", "attendance.manage",
    "attendance.check_in", "attendance.verify", "attendance.lock",
    "quorum.read", "quorum.manage",
    "voting.read", "voting.manage", "voting.cast",
  ]
  const permissions = []
  for (const code of permissionCodes) {
    const permissionResult = await rest("permissions", "POST", {
      organization_id: organization.id,
      code,
      module: code.split(".")[0],
      action: code.split(".").at(-1),
      context_scope: code.startsWith("governance.") ? "organization" : "governance_unit",
      name_ar: code,
    })
    if (permissionResult.response.status === 201) {
      permissions.push(permissionResult.body[0])
      continue
    }
    assert.equal(
      permissionResult.response.status,
      409,
      `permission bootstrap failed for ${code}: ${JSON.stringify(permissionResult.body)}`,
    )
    const existingPermission = await rest(
      `permissions?organization_id=eq.${organization.id}&code=eq.${encodeURIComponent(code)}`,
      "GET",
    )
    assert.equal(existingPermission.response.status, 200)
    assert.equal(existingPermission.body.length, 1, `existing permission lookup failed for ${code}`)
    permissions.push(existingPermission.body[0])
  }
  await rest("role_permissions", "POST", permissions.map((permission) => ({
    organization_id: organization.id, role_id: role.id, permission_id: permission.id,
  })))
  await rest("users", "POST", [
    { id: builder.id, organization_id: organization.id, email: builderEmail, full_name_ar: "Builder" },
    { id: approver.id, organization_id: organization.id, email: approverEmail, full_name_ar: "Approver" },
    { id: noPermission.id, organization_id: organization.id, email: noPermissionEmail, full_name_ar: "No Permission" },
  ])
  await rest("memberships", "POST", [
    { organization_id: organization.id, user_id: builder.id, governance_unit_id: unit.id, role_id: role.id },
    { organization_id: organization.id, user_id: approver.id, governance_unit_id: unit.id, role_id: role.id },
  ])

  const classId = crypto.randomUUID()
  sql(`
    insert into qarar_governance.governance_unit_classes(
      id,organization_id,code,name_ar,governance_level
    ) values(
      '${classId}','${organization.id}','department_council','Department Council','department'
    );
    update qarar_core.governance_units set governance_class_id='${classId}' where id='${unit.id}';
  `)

  const builderHeaders = await login(builderEmail)
  const approverHeaders = await login(approverEmail)
  const noPermissionHeaders = await login(noPermissionEmail)
  const deniedPolicySearch = await rest("rpc/admin_search_policies", "POST", {
    p_query: null,
    p_status: null,
    p_limit: 25,
    p_offset: 0,
  }, noPermissionHeaders)
  assert.ok(deniedPolicySearch.response.status >= 400, "a user without governance permissions listed policies")
  const workflow = await rpc("admin_create_workflow_template", {
    p_code: `route-${suffix}`, p_name_ar: "مسار اعتماد القسم",
  }, builderHeaders)
  const step = await rpc("admin_add_workflow_step", {
    p_workflow_template_version_id: workflow.draft_version_id,
    p_step_code: "department_approval",
    p_name_ar: "اعتماد مجلس القسم",
    p_sequence_no: 1,
    p_step_type: "approval",
    p_responsibility: "final_approve",
    p_governance_class_id: classId,
    p_required_permission_code: "topics.review",
    p_is_initial: true,
    p_is_terminal: true,
    p_allowed_outcomes: ["completed"],
  }, builderHeaders)
  assert.ok(step.id)
  const activatedWorkflow = await rpc("admin_activate_workflow_template_version", {
    p_workflow_template_version_id: workflow.draft_version_id,
  }, builderHeaders)
  assert.equal(activatedWorkflow.status, "active")

  const policyRequestId = crypto.randomUUID()
  const policy = await rpc("admin_create_policy_idempotent", {
    p_code: `policy-${suffix}`, p_name_ar: "لائحة اعتماد الخطط",
    p_client_request_id: policyRequestId,
  }, builderHeaders)
  const policyReplay = await rpc("admin_create_policy_idempotent", {
    p_code: `policy-${suffix}`, p_name_ar: "Ù„Ø§Ø¦Ø­Ø© Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø®Ø·Ø·",
    p_client_request_id: policyRequestId,
  }, builderHeaders)
  assert.equal(policyReplay.id, policy.id)
  assert.equal(policyReplay.idempotent_replay, true)
  const version = await rpc("admin_create_policy_version", {
    p_policy_id: policy.id, p_version_label: "1.0",
  }, builderHeaders)
  const policyItem = await rpc("admin_add_policy_item", {
    p_policy_version_id: version.id,
    p_item_code: "1.1",
    p_title_ar: "اعتماد مجلس القسم",
    p_sort_order: 1,
    p_governance_mode: "regulation_required",
    p_topic_category_id: category.id,
    p_workflow_template_version_id: workflow.draft_version_id,
  }, builderHeaders)
  const policyScope = await rpc("admin_set_policy_scope", {
    p_policy_version_id: version.id,
    p_scope_type: "governance_class",
    p_target_id: classId,
    p_priority: 10,
  }, builderHeaders)
  const submitted = await rpc("admin_submit_policy_for_review", {
    p_policy_version_id: version.id,
  }, builderHeaders)
  assert.equal(submitted.legal_status, "under_review")
  const selfApproval = await rest("rpc/admin_approve_policy_version", "POST", {
    p_policy_version_id: version.id,
  }, builderHeaders)
  assert.ok(selfApproval.response.status >= 400, "the submitting user approved their own policy version")
  const approved = await rpc("admin_approve_policy_version", {
    p_policy_version_id: version.id,
  }, approverHeaders)
  assert.equal(approved.legal_status, "approved")
  const effective = await rpc("admin_activate_policy_version", {
    p_policy_version_id: version.id,
    p_effective_from: new Date().toISOString().slice(0, 10),
  }, approverHeaders)
  assert.equal(effective.legal_status, "effective")

  const options = await rpc("get_topic_regulation_options", {
    p_governance_unit_id: unit.id,
    p_topic_category_id: category.id,
    p_priority: "medium",
    p_source_type: "new",
    p_effective_on: new Date().toISOString().slice(0, 10),
  }, builderHeaders)
  assert.equal(options.total, 1)
  assert.equal(options.items[0].selection.policy_id, policy.id)
  assert.equal(options.items[0].selection.policy_item_id, policyItem.id)
  assert.equal(options.items[0].selection.scope_assignment_id, policyScope.id)
  assert.equal(options.items[0].can_start_workflow, true)
  const topicClientRequestId = crypto.randomUUID()
  const topic = await rpc("create_topic_with_selected_regulation", {
    p_title_ar: "اعتماد خطة أكاديمية عبر HTTP",
    p_description: "موضوع متكامل يختبر محرك اللوائح والمسار عبر PostgREST.",
    p_category_id: category.id,
    p_current_unit_id: unit.id,
    p_policy_id: policy.id,
    p_policy_version_id: version.id,
    p_policy_item_id: policyItem.id,
    p_scope_assignment_id: policyScope.id,
    p_client_request_id: topicClientRequestId,
  }, builderHeaders)
  assert.equal(topic.routing_status, "routing_ready")
  assert.equal(topic.policy_version_id, version.id)
  const topicReplay = await rpc("create_topic_with_selected_regulation", {
    p_title_ar: "اعتماد خطة أكاديمية عبر HTTP",
    p_description: "موضوع متكامل يختبر محرك اللوائح والمسار عبر PostgREST.",
    p_category_id: category.id,
    p_current_unit_id: unit.id,
    p_policy_id: policy.id,
    p_policy_version_id: version.id,
    p_policy_item_id: policyItem.id,
    p_scope_assignment_id: policyScope.id,
    p_client_request_id: topicClientRequestId,
  }, builderHeaders)
  assert.equal(topicReplay.idempotent_replay, true)
  assert.equal(topicReplay.topic_id ?? topicReplay.id, topic.topic_id)

  const governance = await rpc("get_topic_governance", { p_topic_id: topic.topic_id }, builderHeaders)
  assert.equal(governance.governance_source, "regulated")
  assert.equal(governance.policy_item_id, topic.policy_item_id)
  const route = await rpc("get_topic_workflow", { p_topic_id: topic.topic_id }, builderHeaders)
  assert.equal(route.steps.length, 1)
  assert.equal(route.steps[0].assigned_unit_id, unit.id)
  assert.equal(route.steps[0].snapshot.responsibility, "final_approve")
  const actionKey = crypto.randomUUID()
  const completed = await rpc("act_topic_workflow_step", {
    p_topic_id: topic.topic_id,
    p_outcome_code: "completed",
    p_comment: "HTTP governed approval complete",
    p_idempotency_key: actionKey,
    p_expected_version: 0,
  }, approverHeaders)
  assert.equal(completed.workflow_status, "completed")
  const replay = await rpc("act_topic_workflow_step", {
    p_topic_id: topic.topic_id,
    p_outcome_code: "completed",
    p_comment: "HTTP governed approval complete",
    p_idempotency_key: actionKey,
    p_expected_version: 0,
  }, approverHeaders)
  assert.equal(replay.idempotent_replay, true)
  assert.equal(replay.topic_id, completed.topic_id)
  assert.equal(replay.completed_step_id, completed.completed_step_id)
  assert.equal(replay.next_step_id, completed.next_step_id)
  assert.equal(replay.workflow_status, completed.workflow_status)
  assert.equal(replay.version, completed.version)
  const staleRetry = await rest("rpc/act_topic_workflow_step", "POST", {
    p_topic_id: topic.topic_id,
    p_outcome_code: "completed",
    p_comment: "A different retry key must not replay a completed step.",
    p_idempotency_key: crypto.randomUUID(),
    p_expected_version: 0,
  }, approverHeaders)
  assert.ok(staleRetry.response.status >= 400, "stale workflow retry was accepted")

  const competingPolicy = await rpc("admin_create_policy", {
    p_code: `competing-${suffix}`, p_name_ar: "Competing regulation option",
  }, builderHeaders)
  const competingVersion = await rpc("admin_create_policy_version", {
    p_policy_id: competingPolicy.id, p_version_label: "1.0",
  }, builderHeaders)
  await rpc("admin_add_policy_item", {
    p_policy_version_id: competingVersion.id,
    p_item_code: "competing_item",
    p_title_ar: "Competing governed item",
    p_sort_order: 1,
    p_governance_mode: "regulation_required",
    p_topic_category_id: category.id,
    p_workflow_template_version_id: workflow.draft_version_id,
  }, builderHeaders)
  await rpc("admin_set_policy_scope", {
    p_policy_version_id: competingVersion.id,
    p_scope_type: "governance_class",
    p_target_id: classId,
    p_priority: 10,
  }, builderHeaders)
  await rpc("admin_submit_policy_for_review", {
    p_policy_version_id: competingVersion.id,
  }, builderHeaders)
  await rpc("admin_approve_policy_version", {
    p_policy_version_id: competingVersion.id,
  }, approverHeaders)
  await rpc("admin_activate_policy_version", {
    p_policy_version_id: competingVersion.id,
    p_effective_from: new Date().toISOString().slice(0, 10),
  }, approverHeaders)
  const competingOptions = await rpc("get_topic_regulation_options", {
    p_governance_unit_id: unit.id,
    p_topic_category_id: category.id,
    p_priority: "medium",
    p_source_type: "new",
    p_effective_on: new Date().toISOString().slice(0, 10),
  }, builderHeaders)
  assert.equal(competingOptions.total, 2)
  assert.equal(new Set(competingOptions.items.map((item) => item.selection.policy_id)).size, 2)

  const votingWorkflow = await rpc("admin_create_workflow_template", {
    p_code: `vote-route-${suffix}`, p_name_ar: "مسار تصويت المجلس",
  }, builderHeaders)
  const votingStep = await rpc("admin_add_workflow_step", {
    p_workflow_template_version_id: votingWorkflow.draft_version_id,
    p_step_code: "council_vote",
    p_name_ar: "تصويت المجلس",
    p_sequence_no: 1,
    p_step_type: "voting",
    p_responsibility: "final_approve",
    p_governance_class_id: classId,
    p_required_permission_code: "topics.review",
    p_is_initial: true,
    p_is_terminal: true,
    p_allowed_outcomes: ["approved", "rejected", "tie", "no_vote"],
  }, builderHeaders)
  assert.ok(votingStep.id)
  await rpc("admin_activate_workflow_template_version", {
    p_workflow_template_version_id: votingWorkflow.draft_version_id,
  }, builderHeaders)

  const noMatchOptions = await rpc("get_topic_regulation_options", {
    p_governance_unit_id: unit.id,
    p_topic_category_id: noMatchCategory.id,
    p_priority: "medium",
    p_source_type: "new",
    p_effective_on: new Date().toISOString().slice(0, 10),
  }, builderHeaders)
  assert.equal(noMatchOptions.total, 0)
  const noMatchException = await rpc("create_topic_exception_request", {
    p_title_ar: "موضوع بلا لائحة مطابقة",
    p_description: "يختبر إنشاء طلب استثناء عندما لا توجد لائحة نافذة تطابق الموضوع.",
    p_category_id: noMatchCategory.id,
    p_current_unit_id: unit.id,
    p_workflow_template_version_id: votingWorkflow.draft_version_id,
    p_reason: "لا توجد لائحة نافذة مطابقة لهذا النوع من الموضوعات.",
    p_valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    p_priority: "medium",
    p_source_type: "new",
    p_title_en: null,
    p_client_request_id: crypto.randomUUID(),
  }, builderHeaders)
  assert.equal(noMatchException.status, "pending")
  assert.equal(noMatchException.routing_status, "routing_exception_pending")
  const noMatchSummary = await rpc("get_topic_governance_summary", {
    p_topic_id: noMatchException.topic_id,
  }, builderHeaders)
  assert.equal(noMatchSummary.exception.status, "pending")
  assert.equal(noMatchSummary.exception.workflow_name_ar, "مسار تصويت المجلس")
  const selfExceptionApproval = await rest("rpc/approve_custom_workflow", "POST", {
    p_exception_id: noMatchException.exception_id,
    p_approve: true,
    p_review_comment: "Attempted self approval must fail.",
  }, builderHeaders)
  assert.ok(selfExceptionApproval.response.status >= 400, "the requesting user approved their own exception")
  const approvedNoMatchException = await rpc("approve_custom_workflow", {
    p_exception_id: noMatchException.exception_id,
    p_approve: true,
    p_review_comment: "Approve no-match temporary route.",
  }, approverHeaders)
  assert.equal(approvedNoMatchException.status, "approved")
  const approvedNoMatchSummary = await rpc("get_topic_governance_summary", {
    p_topic_id: noMatchException.topic_id,
  }, builderHeaders)
  assert.equal(approvedNoMatchSummary.exception.status, "approved")
  assert.equal(approvedNoMatchSummary.topic.routing_status, "routing_ready")

  const incompleteVotingWorkflow = await rpc("admin_create_workflow_template", {
    p_code: `incomplete-vote-${suffix}`, p_name_ar: "Incomplete voting route",
  }, builderHeaders)
  await rpc("admin_add_workflow_step", {
    p_workflow_template_version_id: incompleteVotingWorkflow.draft_version_id,
    p_step_code: "incomplete_vote",
    p_name_ar: "Incomplete council vote",
    p_sequence_no: 1,
    p_step_type: "voting",
    p_responsibility: "final_approve",
    p_governance_class_id: classId,
    p_required_permission_code: "topics.review",
    p_is_initial: true,
    p_is_terminal: true,
    p_allowed_outcomes: ["approved"],
  }, builderHeaders)
  const incompleteVotingActivation = await rest("rpc/admin_activate_workflow_template_version", "POST", {
    p_workflow_template_version_id: incompleteVotingWorkflow.draft_version_id,
  }, builderHeaders)
  assert.ok(incompleteVotingActivation.response.status >= 400, "incomplete voting template was activated")

  const votingPolicy = await rpc("admin_create_policy", {
    p_code: `vote-policy-${suffix}`, p_name_ar: "لائحة التصويت الحوكمية",
  }, builderHeaders)
  const votingVersion = await rpc("admin_create_policy_version", {
    p_policy_id: votingPolicy.id, p_version_label: "1.0",
  }, builderHeaders)
  const votingPolicyItem = await rpc("admin_add_policy_item", {
    p_policy_version_id: votingVersion.id,
    p_item_code: "1.1",
    p_title_ar: "حسم الموضوع بالتصويت",
    p_sort_order: 1,
    p_governance_mode: "regulation_required",
    p_topic_category_id: votingCategory.id,
    p_workflow_template_version_id: votingWorkflow.draft_version_id,
  }, builderHeaders)
  const votingPolicyScope = await rpc("admin_set_policy_scope", {
    p_policy_version_id: votingVersion.id,
    p_scope_type: "governance_class",
    p_target_id: classId,
    p_priority: 20,
  }, builderHeaders)
  await rpc("admin_submit_policy_for_review", {
    p_policy_version_id: votingVersion.id,
  }, builderHeaders)
  await rpc("admin_approve_policy_version", {
    p_policy_version_id: votingVersion.id,
  }, approverHeaders)
  await rpc("admin_activate_policy_version", {
    p_policy_version_id: votingVersion.id,
    p_effective_from: new Date().toISOString().slice(0, 10),
  }, approverHeaders)

  const customRoutePolicy = await rpc("admin_create_policy", {
    p_code: `custom-route-${suffix}`, p_name_ar: "Custom route policy",
  }, builderHeaders)
  const customRouteVersion = await rpc("admin_create_policy_version", {
    p_policy_id: customRoutePolicy.id, p_version_label: "1.0",
  }, builderHeaders)
  const customRoutePolicyItem = await rpc("admin_add_policy_item", {
    p_policy_version_id: customRouteVersion.id,
    p_item_code: "1.1",
    p_title_ar: "Custom route request",
    p_sort_order: 1,
    p_governance_mode: "custom_route_allowed",
    p_topic_category_id: customRouteCategory.id,
  }, builderHeaders)
  const customRoutePolicyScope = await rpc("admin_set_policy_scope", {
    p_policy_version_id: customRouteVersion.id,
    p_scope_type: "governance_class",
    p_target_id: classId,
    p_priority: 20,
  }, builderHeaders)
  await rpc("admin_submit_policy_for_review", {
    p_policy_version_id: customRouteVersion.id,
  }, builderHeaders)
  await rpc("admin_approve_policy_version", {
    p_policy_version_id: customRouteVersion.id,
  }, approverHeaders)
  await rpc("admin_activate_policy_version", {
    p_policy_version_id: customRouteVersion.id,
    p_effective_from: new Date().toISOString().slice(0, 10),
  }, approverHeaders)
  const customRouteOptions = await rpc("get_topic_regulation_options", {
    p_governance_unit_id: unit.id,
    p_topic_category_id: customRouteCategory.id,
    p_priority: "medium",
    p_source_type: "new",
    p_effective_on: new Date().toISOString().slice(0, 10),
  }, builderHeaders)
  assert.equal(customRouteOptions.total, 1)
  assert.equal(customRouteOptions.items[0].selection.policy_item_id, customRoutePolicyItem.id)
  assert.equal(customRouteOptions.items[0].selection.scope_assignment_id, customRoutePolicyScope.id)
  assert.equal(customRouteOptions.items[0].routing_outcome, "custom_route_required")
  const customRouteTopic = await rpc("create_topic_with_selected_regulation", {
    p_title_ar: "Custom route expiry test",
    p_description: "Exercise the expiry guard for a temporary governed route.",
    p_category_id: customRouteCategory.id,
    p_current_unit_id: unit.id,
    p_policy_id: customRoutePolicy.id,
    p_policy_version_id: customRouteVersion.id,
    p_policy_item_id: customRoutePolicyItem.id,
    p_scope_assignment_id: customRoutePolicyScope.id,
    p_client_request_id: crypto.randomUUID(),
  }, builderHeaders)
  assert.equal(customRouteTopic.routing_status, "routing_exception_pending")
  const missingExpiry = await rest("rpc/request_custom_workflow", "POST", {
    p_topic_id: customRouteTopic.topic_id,
    p_workflow_template_version_id: votingWorkflow.draft_version_id,
    p_reason: "Temporary route must include an expiry date.",
    p_valid_until: null,
  }, builderHeaders)
  assert.ok(missingExpiry.response.status >= 400, "temporary route without expiry was accepted")
  const expiringRequest = await rpc("request_custom_workflow", {
    p_topic_id: customRouteTopic.topic_id,
    p_workflow_template_version_id: votingWorkflow.draft_version_id,
    p_reason: "Temporary route expires during execution for this test.",
    p_valid_until: new Date(Date.now() + 2500).toISOString(),
  }, builderHeaders)
  const approvedTemporaryRoute = await rpc("approve_custom_workflow", {
    p_exception_id: expiringRequest.id,
    p_approve: true,
    p_review_comment: "Approve the temporary route before it expires.",
  }, approverHeaders)
  assert.equal(approvedTemporaryRoute.status, "approved")
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const expiredAction = await rest("rpc/act_topic_workflow_step", "POST", {
    p_topic_id: customRouteTopic.topic_id,
    p_outcome_code: "approved",
    p_comment: "An expired temporary route must not execute.",
    p_idempotency_key: crypto.randomUUID(),
    p_expected_version: 0,
  }, approverHeaders)
  assert.ok(expiredAction.response.status >= 400, "expired temporary route executed a workflow step")
  sql("select qarar_governance.expire_governance_exceptions()")
  assert.equal(sql(`select status from qarar_governance.governance_exceptions where id='${expiringRequest.id}'`), "expired")
  const renewalRequest = await rpc("request_custom_workflow", {
    p_topic_id: customRouteTopic.topic_id,
    p_workflow_template_version_id: votingWorkflow.draft_version_id,
    p_reason: "Renew the expired temporary route after independent review.",
    p_valid_until: new Date(Date.now() + 86_400_000).toISOString(),
  }, builderHeaders)
  const renewedTemporaryRoute = await rpc("approve_custom_workflow", {
    p_exception_id: renewalRequest.id,
    p_approve: true,
    p_review_comment: "Approve the independent renewal of the temporary route.",
  }, approverHeaders)
  assert.equal(renewedTemporaryRoute.renewed, true)

  const voteScenarios = [
    { result: "approved", votes: ["approve", "approve"], outcome: "approved", workflow: "completed" },
    { result: "rejected", votes: ["reject", "reject"], outcome: "rejected", workflow: "rejected" },
    { result: "tied", votes: ["approve", "reject"], outcome: "tie", workflow: "completed" },
    { result: "no_votes", votes: [], outcome: "no_vote", workflow: "completed" },
  ]
  for (const scenario of voteScenarios) {
    const scenarioOptions = await rpc("get_topic_regulation_options", {
      p_governance_unit_id: unit.id,
      p_topic_category_id: votingCategory.id,
      p_priority: "medium",
      p_source_type: "new",
      p_effective_on: new Date().toISOString().slice(0, 10),
    }, builderHeaders)
    assert.equal(scenarioOptions.total, 1)
    assert.equal(scenarioOptions.items[0].selection.policy_item_id, votingPolicyItem.id)
    assert.equal(scenarioOptions.items[0].selection.scope_assignment_id, votingPolicyScope.id)
    scenario.topic = await rpc("create_topic_with_selected_regulation", {
      p_title_ar: `موضوع نتيجة ${scenario.result}`,
      p_description: `موضوع متكامل لاختبار انتقال المسار تلقائيًا عند نتيجة ${scenario.result}.`,
      p_category_id: votingCategory.id,
      p_current_unit_id: unit.id,
      p_policy_id: votingPolicy.id,
      p_policy_version_id: votingVersion.id,
      p_policy_item_id: votingPolicyItem.id,
      p_scope_assignment_id: votingPolicyScope.id,
      p_client_request_id: crypto.randomUUID(),
    }, builderHeaders)
    assert.equal(scenario.topic.routing_status, "routing_ready")
    const reviewableTopic = await rpc("get_topic_detail", {
      p_topic_id: scenario.topic.topic_id,
    }, approverHeaders)
    const topicApproval = await rpc("review_topic", {
      p_topic_id: scenario.topic.topic_id,
      p_action: "approve",
      p_reason: null,
      p_expected_updated_at: reviewableTopic.updated_at,
    }, approverHeaders)
    assert.equal(topicApproval.status, "approved")
    const initialRoute = await rpc("get_topic_workflow", {
      p_topic_id: scenario.topic.topic_id,
    }, builderHeaders)
    scenario.workflowStepId = initialRoute.current_step_id
    assert.ok(scenario.workflowStepId)
  }

  const meeting = (await rest("meetings", "POST", {
    organization_id: organization.id,
    meeting_no: `VOTE-${suffix}`,
    governance_unit_id: unit.id,
    title_ar: "اجتماع اختبار ربط التصويت بالمسار",
    scheduled_date: "2026-08-15",
    created_by_user_id: builder.id,
    status: "draft",
  })).body[0]
  const agendaItems = []
  for (const scenario of voteScenarios) {
    agendaItems.push(await rpc("add_agenda_item", {
      p_meeting_id: meeting.id,
      p_topic_id: scenario.topic.topic_id,
      p_is_exception: false,
      p_exception_reason: null,
    }, builderHeaders))
  }
  let meetingDetail = await rpc("get_meeting_detail", {
    p_meeting_id: meeting.id,
  }, builderHeaders)
  await rpc("transition_meeting", {
    p_meeting_id: meeting.id,
    p_to_status: "scheduled",
    p_reason: "Sprint 03.5 governed voting integration",
    p_expected_updated_at: meetingDetail.updated_at,
  }, builderHeaders)
  meetingDetail = await rpc("get_meeting_detail", {
    p_meeting_id: meeting.id,
  }, builderHeaders)
  await rpc("transition_meeting", {
    p_meeting_id: meeting.id,
    p_to_status: "ready_to_start",
    p_reason: "Sprint 03.5 governed voting integration",
    p_expected_updated_at: meetingDetail.updated_at,
  }, builderHeaders)
  meetingDetail = await rpc("get_meeting_detail", {
    p_meeting_id: meeting.id,
  }, builderHeaders)

  const openedMeeting = await rpc("open_meeting_session", {
    p_meeting_id: meeting.id,
    p_expected_updated_at: meetingDetail.updated_at,
  }, builderHeaders)
  const checkin = await rpc("create_checkin_session", {
    p_meeting_id: meeting.id, p_valid_for_minutes: 15,
  }, builderHeaders)
  await rpc("self_check_in", {
    p_meeting_id: meeting.id,
    p_token: checkin.token,
    p_device_label: "Sprint 03.5 voting approver",
  }, approverHeaders)
  let session = await rpc("get_meeting_session_detail", {
    p_meeting_id: meeting.id,
  }, builderHeaders)
  for (const attendance of session.attendance) {
    const verifierHeaders = attendance.user_id === builder.id
      ? approverHeaders
      : builderHeaders
    await rpc("verify_attendance", {
      p_attendance_record_id: attendance.id,
      p_status: "present",
      p_note: "Sprint 03.5 governed voting verification",
      p_expected_updated_at: attendance.updated_at,
    }, verifierHeaders)
  }
  session = await rpc("get_meeting_session_detail", {
    p_meeting_id: meeting.id,
  }, builderHeaders)
  assert.equal(session.quorum.quorum_status, "met")
  await rpc("lock_attendance_roster", {
    p_meeting_id: meeting.id,
    p_expected_updated_at: session.meeting.updated_at,
  }, builderHeaders)

  for (let index = 0; index < voteScenarios.length; index += 1) {
    const scenario = voteScenarios[index]
    session = await rpc("get_meeting_session_detail", {
      p_meeting_id: meeting.id,
    }, builderHeaders)
    const round = await rpc("open_voting_round", {
      p_agenda_item_id: agendaItems[index].id,
      p_expected_meeting_updated_at: session.meeting.updated_at,
    }, builderHeaders)

    const boundStep = sql(`
      select workflow_instance_step_id
      from qarar_voting.voting_rounds
      where id='${round.voting_round_id}'
    `)
    assert.equal(boundStep, scenario.workflowStepId)

    if (index === 0) {
      const manual = await rest("rpc/act_topic_workflow_step", "POST", {
        p_topic_id: scenario.topic.topic_id,
        p_outcome_code: "approved",
        p_comment: "Manual bypass must fail",
        p_idempotency_key: crypto.randomUUID(),
        p_expected_version: 0,
      }, approverHeaders)
      assert.ok(manual.response.status >= 400, "manual voting-step completion was not blocked")
    }

    if (scenario.votes[0]) {
      await rpc("cast_vote", {
        p_voting_round_id: round.voting_round_id,
        p_vote_value: scenario.votes[0],
        p_vote_note: `Builder ${scenario.votes[0]}`,
      }, builderHeaders)
    }
    if (scenario.votes[1]) {
      await rpc("cast_vote", {
        p_voting_round_id: round.voting_round_id,
        p_vote_value: scenario.votes[1],
        p_vote_note: `Approver ${scenario.votes[1]}`,
      }, approverHeaders)
    }
    const closed = await rpc("close_voting_round", {
      p_voting_round_id: round.voting_round_id,
      p_reason: `Close ${scenario.result} governed vote`,
    }, builderHeaders)
    assert.equal(closed.result, scenario.result)

    const governedRoute = await rpc("get_topic_workflow", {
      p_topic_id: scenario.topic.topic_id,
    }, builderHeaders)
    assert.equal(governedRoute.status, scenario.workflow)
    assert.equal(governedRoute.steps[0].outcome_code, scenario.outcome)
  }

  const search = await rpc("admin_search_policies", {
    p_query: `policy-${suffix}`, p_limit: 25, p_offset: 0,
  }, builderHeaders)
  assert.equal(search.total, 2)
  const detail = await rpc("admin_get_policy_detail", { p_policy_id: policy.id }, builderHeaders)
  assert.equal(detail.versions.length, 1)
  assert.equal(detail.versions[0].items.length, 1)
  console.log("Sprint 03.5 governance and four-result voting workflow HTTP flow passed")
} finally {
  if (keepFixtures) {
    console.log(JSON.stringify({
      message: "Regulation demo fixtures retained",
      organization_id: created.organizationId,
      builder_email: builderEmail,
      approver_email: approverEmail,
      password,
    }, null, 2))
  } else {
    await cleanup()
  }
}
