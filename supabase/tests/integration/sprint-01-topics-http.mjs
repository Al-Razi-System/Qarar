import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"

const envText = await readFile(new URL("../../docker/.env", import.meta.url), "utf8")
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const separator = line.indexOf("=")
  return [line.slice(0, separator), line.slice(separator + 1)]
}))

const baseUrl = env.SUPABASE_PUBLIC_URL || "http://localhost:54321"
const anonKey = env.ANON_KEY
const serviceKey = env.SERVICE_ROLE_KEY
assert.ok(anonKey && serviceKey, "ANON_KEY and SERVICE_ROLE_KEY are required")

const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = `Qarar-${suffix}!Aa1`
const authorEmail = `sprint01-author-${suffix}@example.test`
const reviewerEmail = `sprint01-reviewer-${suffix}@example.test`
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
    headers: { ...headers, ...schemaHeaders, Prefer: method === "POST" ? "return=representation" : "return=minimal" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
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
  return { apikey: anonKey, Authorization: `Bearer ${body.access_token}`, "Content-Type": "application/json" }
}

async function cleanup() {
  if (created.organizationId) {
    assert.match(created.organizationId, /^[0-9a-f-]{36}$/)
    execFileSync("docker", [
      "exec", "qarar-supabase-db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
      "-U", "supabase_admin", "-d", "postgres", "-c",
      `set session_replication_role=replica;
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
       set session_replication_role=origin;`,
    ], { stdio: "inherit" })
  }
  for (const id of created.authUsers) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders })
  }
}

try {
  const author = await createAuthUser(authorEmail)
  const reviewer = await createAuthUser(reviewerEmail)
  const organization = (await rest("organizations", "POST", { code: `S01-${suffix}`, name_ar: "Sprint 01 HTTP" })).body[0]
  created.organizationId = organization.id
  const unitType = (await rest("governance_unit_types", "POST", {
    organization_id: organization.id, code: `TYPE-${suffix}`, name_ar: "Council",
  })).body[0]
  const unit = (await rest("governance_units", "POST", {
    organization_id: organization.id, unit_type_id: unitType.id, code: `UNIT-${suffix}`, name_ar: "Main Council",
  })).body[0]
  const category = (await rest("topic_categories", "POST", {
    organization_id: organization.id, code: `CAT-${suffix}`, name_ar: "Policy",
  })).body[0]
  const authorRole = (await rest("roles", "POST", {
    organization_id: organization.id, code: `AUTHOR-${suffix}`, name_ar: "Author", role_scope: "governance_unit",
  })).body[0]
  const reviewerRole = (await rest("roles", "POST", {
    organization_id: organization.id, code: `REVIEWER-${suffix}`, name_ar: "Reviewer", role_scope: "governance_unit",
  })).body[0]
  const permissions = (await rest("permissions", "POST", [
    { organization_id: organization.id, code: "topics.create", module: "topics", action: "create", context_scope: "governance_unit", name_ar: "Create" },
    { organization_id: organization.id, code: "topics.read", module: "topics", action: "read", context_scope: "governance_unit", name_ar: "Read" },
    { organization_id: organization.id, code: "topics.review", module: "topics", action: "review", context_scope: "governance_unit", name_ar: "Review" },
  ])).body
  const permissionByCode = Object.fromEntries(permissions.map((permission) => [permission.code, permission.id]))
  await rest("role_permissions", "POST", [
    { organization_id: organization.id, role_id: authorRole.id, permission_id: permissionByCode["topics.create"] },
    { organization_id: organization.id, role_id: reviewerRole.id, permission_id: permissionByCode["topics.read"] },
    { organization_id: organization.id, role_id: reviewerRole.id, permission_id: permissionByCode["topics.review"] },
  ])
  await rest("users", "POST", [
    { id: author.id, organization_id: organization.id, email: authorEmail, full_name_ar: "HTTP Author" },
    { id: reviewer.id, organization_id: organization.id, email: reviewerEmail, full_name_ar: "HTTP Reviewer" },
  ])
  await rest("memberships", "POST", [
    { organization_id: organization.id, user_id: author.id, governance_unit_id: unit.id, role_id: authorRole.id },
    { organization_id: organization.id, user_id: reviewer.id, governance_unit_id: unit.id, role_id: reviewerRole.id },
  ])

  const authorHeaders = await login(authorEmail)
  const reviewerHeaders = await login(reviewerEmail)
  const options = await rest("rpc/get_topic_form_options", "POST", {}, authorHeaders)
  assert.equal(options.response.status, 200, JSON.stringify(options.body))
  assert.equal(options.body.governance_units.length, 1)
  assert.equal(options.body.categories.length, 1)
  const clientRequestId = crypto.randomUUID()
  const createResult = await rest("rpc/create_topic", "POST", {
    p_title_ar: "HTTP production topic",
    p_description: "A complete topic created through the real PostgREST contract",
    p_category_id: category.id,
    p_current_unit_id: unit.id,
    p_priority: "high",
    p_client_request_id: clientRequestId,
  }, authorHeaders)
  assert.equal(createResult.response.status, 200, JSON.stringify(createResult.body))
  assert.match(createResult.body.topic_no, /^TOP-\d{4}-000001$/)
  const replay = await rest("rpc/create_topic", "POST", {
    p_title_ar: "HTTP production topic",
    p_description: "A complete topic created through the real PostgREST contract",
    p_category_id: category.id,
    p_current_unit_id: unit.id,
    p_priority: "high",
    p_client_request_id: clientRequestId,
  }, authorHeaders)
  assert.equal(replay.body.id, createResult.body.id)
  assert.equal(replay.body.idempotent_replay, true)
  const myTopics = await rest("rpc/search_my_topics", "POST", { p_limit: 25, p_offset: 0 }, authorHeaders)
  assert.equal(myTopics.body.total, 1)

  const directInsert = await rest("topics", "POST", {
    organization_id: organization.id, topic_no: "BYPASS", title_ar: "Bypass",
    submitted_by_user_id: author.id,
  }, authorHeaders)
  assert.ok(directInsert.response.status >= 400, "direct topic insert was not blocked")

  const queue = await rest("rpc/search_topic_review_queue", "POST", {
    p_query: createResult.body.topic_no, p_limit: 25, p_offset: 0,
  }, reviewerHeaders)
  assert.equal(queue.response.status, 200, JSON.stringify(queue.body))
  assert.equal(queue.body.total, 1)
  const queueTopic = queue.body.items[0]
  const detail = await rest("rpc/get_topic_detail", "POST", { p_topic_id: createResult.body.id }, reviewerHeaders)
  assert.equal(detail.response.status, 200, JSON.stringify(detail.body))
  assert.ok(detail.body.allowed_review_actions.includes("approve"))
  assert.equal(detail.body.history.length, 1)

  const reviewed = await rest("rpc/review_topic", "POST", {
    p_topic_id: createResult.body.id,
    p_action: "approve",
    p_reason: "Ready for governance",
    p_expected_updated_at: queueTopic.updated_at,
  }, reviewerHeaders)
  assert.equal(reviewed.response.status, 200, JSON.stringify(reviewed.body))
  assert.equal(reviewed.body.status, "approved")

  const history = (await rest(`topic_status_history?topic_id=eq.${createResult.body.id}&select=to_status,change_reason&order=changed_at.asc`)).body
  assert.equal(history.length, 2)
  assert.ok(history.some((entry) => entry.to_status === "approved"))
  const audit = (await rest(`audit_logs?entity_id=eq.${createResult.body.id}&select=action`)).body
  assert.deepEqual(new Set(audit.map((entry) => entry.action)), new Set(["topics.create", "topics.review.approve"]))

  console.log("ok - HTTP form options, idempotent creation, and my-topics contracts completed")
  console.log("ok - HTTP direct table insertion was blocked")
  console.log("ok - HTTP reviewer queue, detail, approval, history, and audit completed end to end")
} finally {
  await cleanup()
}
