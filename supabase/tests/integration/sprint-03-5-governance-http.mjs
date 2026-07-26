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
const created = { authUsers: [], organizationId: null }

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
      delete from qarar_governance.notification_outbox where organization_id='${created.organizationId}';
      delete from qarar_governance.governance_alerts where organization_id='${created.organizationId}';
      delete from qarar_governance.governance_compliance_events where organization_id='${created.organizationId}';
      delete from qarar_governance.workflow_instance_steps where organization_id='${created.organizationId}';
      delete from qarar_governance.workflow_instances where organization_id='${created.organizationId}';
      delete from qarar_governance.topic_governance_mappings where organization_id='${created.organizationId}';
      delete from qarar_governance.regulation_match_decisions where organization_id='${created.organizationId}';
      delete from qarar_governance.governance_exceptions where organization_id='${created.organizationId}';
      delete from qarar_topics.topic_status_history where organization_id='${created.organizationId}';
      delete from qarar_topics.topics where organization_id='${created.organizationId}';
      delete from qarar_topics.topic_number_counters where organization_id='${created.organizationId}';
      delete from qarar_governance.policy_item_scope_overrides where organization_id='${created.organizationId}';
      delete from qarar_governance.policy_item_roles where organization_id='${created.organizationId}';
      delete from qarar_governance.policy_scope_assignments where organization_id='${created.organizationId}';
      delete from qarar_governance.policy_items where organization_id='${created.organizationId}';
      delete from qarar_governance.policy_versions where organization_id='${created.organizationId}';
      delete from qarar_governance.policies where organization_id='${created.organizationId}';
      delete from qarar_governance.workflow_template_transitions where organization_id='${created.organizationId}';
      delete from qarar_governance.workflow_template_steps where organization_id='${created.organizationId}';
      delete from qarar_governance.workflow_template_versions where organization_id='${created.organizationId}';
      delete from qarar_governance.workflow_templates where organization_id='${created.organizationId}';
      delete from qarar_iam.memberships where organization_id='${created.organizationId}';
      delete from qarar_iam.role_permissions where organization_id='${created.organizationId}';
      delete from qarar_iam.permissions where organization_id='${created.organizationId}';
      delete from qarar_iam.roles where organization_id='${created.organizationId}';
      delete from qarar_topics.topic_categories where organization_id='${created.organizationId}';
      delete from qarar_core.governance_units where organization_id='${created.organizationId}';
      delete from qarar_governance.governance_unit_classes where organization_id='${created.organizationId}';
      delete from qarar_core.governance_unit_types where organization_id='${created.organizationId}';
      delete from qarar_iam.users where organization_id='${created.organizationId}';
      delete from qarar_audit.audit_logs where organization_id='${created.organizationId}';
      delete from qarar_core.organizations where id='${created.organizationId}';
    `)
  }
  for (const id of created.authUsers) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders })
  }
}

try {
  const builder = await createAuthUser(builderEmail)
  const approver = await createAuthUser(approverEmail)
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
  ]
  const permissions = (await rest("permissions", "POST", permissionCodes.map((code) => ({
    organization_id: organization.id,
    code,
    module: code.split(".")[0] === "topics" ? "topics" : "governance",
    action: code.split(".").at(-1),
    context_scope: code.startsWith("topics.") ? "governance_unit" : "organization",
    name_ar: code,
  })))).body
  await rest("role_permissions", "POST", permissions.map((permission) => ({
    organization_id: organization.id, role_id: role.id, permission_id: permission.id,
  })))
  await rest("users", "POST", [
    { id: builder.id, organization_id: organization.id, email: builderEmail, full_name_ar: "Builder" },
    { id: approver.id, organization_id: organization.id, email: approverEmail, full_name_ar: "Approver" },
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

  const policy = await rpc("admin_create_policy", {
    p_code: `policy-${suffix}`, p_name_ar: "لائحة اعتماد الخطط",
  }, builderHeaders)
  const version = await rpc("admin_create_policy_version", {
    p_policy_id: policy.id, p_version_label: "1.0",
  }, builderHeaders)
  await rpc("admin_add_policy_item", {
    p_policy_version_id: version.id,
    p_item_code: "1.1",
    p_title_ar: "اعتماد مجلس القسم",
    p_sort_order: 1,
    p_governance_mode: "regulation_required",
    p_topic_category_id: category.id,
    p_workflow_template_version_id: workflow.draft_version_id,
  }, builderHeaders)
  await rpc("admin_set_policy_scope", {
    p_policy_version_id: version.id,
    p_scope_type: "governance_class",
    p_target_id: classId,
    p_priority: 10,
  }, builderHeaders)
  const submitted = await rpc("admin_submit_policy_for_review", {
    p_policy_version_id: version.id,
  }, builderHeaders)
  assert.equal(submitted.legal_status, "under_review")
  const approved = await rpc("admin_approve_policy_version", {
    p_policy_version_id: version.id,
  }, approverHeaders)
  assert.equal(approved.legal_status, "approved")
  const effective = await rpc("admin_activate_policy_version", {
    p_policy_version_id: version.id,
    p_effective_from: new Date().toISOString().slice(0, 10),
  }, approverHeaders)
  assert.equal(effective.legal_status, "effective")

  const preview = await rpc("resolve_topic_governance", {
    p_governance_unit_id: unit.id,
    p_topic_category_id: category.id,
    p_effective_on: new Date().toISOString().slice(0, 10),
  }, builderHeaders)
  assert.equal(preview.outcome, "resolved")
  const topic = await rpc("create_topic_with_workflow", {
    p_title_ar: "اعتماد خطة أكاديمية عبر HTTP",
    p_description: "موضوع متكامل يختبر محرك اللوائح والمسار عبر PostgREST.",
    p_category_id: category.id,
    p_current_unit_id: unit.id,
    p_client_request_id: crypto.randomUUID(),
  }, builderHeaders)
  assert.equal(topic.routing_status, "routing_ready")
  assert.equal(topic.policy_version_id, version.id)

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

  const search = await rpc("admin_search_policies", {
    p_query: `policy-${suffix}`, p_limit: 25, p_offset: 0,
  }, builderHeaders)
  assert.equal(search.total, 1)
  const detail = await rpc("admin_get_policy_detail", { p_policy_id: policy.id }, builderHeaders)
  assert.equal(detail.versions.length, 1)
  assert.equal(detail.versions[0].items.length, 1)
  console.log("Sprint 03.5 governance HTTP flow passed")
} finally {
  await cleanup()
}
