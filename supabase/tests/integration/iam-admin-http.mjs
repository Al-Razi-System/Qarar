import assert from "node:assert/strict"
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
const adminEmail = `iam-http-admin-${suffix}@example.test`
const userEmail = `iam-http-user-${suffix}@example.test`
const rollbackEmail = `iam-http-rollback-${suffix}@example.test`
const password = `Qarar-${suffix}!Aa1`
const created = { authUsers: [], organizationId: null, unitTypeId: null, unitId: null, roleId: null }

async function request(path, options = {}, expected = null) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (expected !== null) assert.equal(response.status, expected, `${path}: ${response.status} ${text}`)
  return { response, body }
}

async function rest(path, method = "GET", body) {
  const schemaHeaders = path.startsWith("rpc/")
    ? { "Accept-Profile": "api_v1", "Content-Profile": "api_v1" }
    : { "Accept-Profile": "public", "Content-Profile": "public" }
  return request(`/rest/v1/${path}`, {
    method,
    headers: { ...serviceHeaders, ...schemaHeaders, Prefer: method === "POST" ? "return=representation" : "return=minimal" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function createAuthUser(email, confirmed = true) {
  const { body } = await request("/auth/v1/admin/users", {
    method: "POST", headers: serviceHeaders,
    body: JSON.stringify({ email, password, email_confirm: confirmed }),
  }, 200)
  created.authUsers.push(body.id)
  return body
}

async function listAuthUsers() {
  const { body } = await request("/auth/v1/admin/users?page=1&per_page=1000", { headers: serviceHeaders }, 200)
  return body.users ?? body
}

function jwtPayload(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))
}

async function cleanup() {
  if (created.organizationId) {
    await rest(`memberships?organization_id=eq.${created.organizationId}`, "DELETE")
    await rest(`users?organization_id=eq.${created.organizationId}`, "DELETE")
    await rest(`roles?organization_id=eq.${created.organizationId}`, "DELETE")
    await rest(`governance_units?organization_id=eq.${created.organizationId}`, "DELETE")
    await rest(`governance_unit_types?organization_id=eq.${created.organizationId}`, "DELETE")
    await rest(`organizations?id=eq.${created.organizationId}`, "DELETE")
  }
  for (const id of created.authUsers) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders })
  }
}

try {
  const admin = await createAuthUser(adminEmail)
  const organization = (await rest("organizations", "POST", { code: `HTTP-${suffix}`, name_ar: "HTTP IAM Test" })).body[0]
  created.organizationId = organization.id
  const unitType = (await rest("governance_unit_types", "POST", { organization_id: organization.id, code: `TYPE-${suffix}`, name_ar: "Test type" })).body[0]
  created.unitTypeId = unitType.id
  const unit = (await rest("governance_units", "POST", { organization_id: organization.id, unit_type_id: unitType.id, code: `UNIT-${suffix}`, name_ar: "Test unit" })).body[0]
  created.unitId = unit.id
  const role = (await rest("roles", "POST", { organization_id: organization.id, code: `ROLE-${suffix}`, name_ar: "Test role", role_scope: "governance_unit" })).body[0]
  created.roleId = role.id
  await rest("users", "POST", { id: admin.id, organization_id: organization.id, email: adminEmail, full_name_ar: "HTTP Admin", is_system_admin: true })

  const login = await request("/auth/v1/token?grant_type=password", {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password }),
  }, 200)
  const callerHeaders = { apikey: anonKey, Authorization: `Bearer ${login.body.access_token}`, "Content-Type": "application/json" }

  const success = await request("/functions/v1/iam-admin", {
    method: "POST", headers: callerHeaders,
    body: JSON.stringify({ action: "create_user", email: userEmail, full_name_ar: "HTTP Created User", role_id: role.id, governance_unit_id: unit.id }),
  }, 201)
  created.authUsers.push(success.body.user_id)
  assert.equal(success.body.invitation_sent, true)
  const profile = (await rest(`users?id=eq.${success.body.user_id}&select=id,email,status`)).body
  assert.deepEqual(profile, [{ id: success.body.user_id, email: userEmail, status: "active" }])
  const membership = (await rest(`memberships?user_id=eq.${success.body.user_id}&select=role_id,governance_unit_id,membership_status`)).body
  assert.deepEqual(membership, [{ role_id: role.id, governance_unit_id: unit.id, membership_status: "active" }])
  assert.ok((await listAuthUsers()).some((user) => user.id === success.body.user_id && user.email === userEmail))

  const messages = await fetch("http://localhost:8025/api/v1/messages").then((response) => response.json())
  assert.ok(messages.messages.some((message) => JSON.stringify(message).includes(userEmail)), "invitation email was not captured by Mailpit")

  await request(`/auth/v1/admin/users/${success.body.user_id}`, {
    method: "PUT", headers: serviceHeaders,
    body: JSON.stringify({ password, email_confirm: true }),
  }, 200)
  const userLogin = await request("/auth/v1/token?grant_type=password", {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: userEmail, password }),
  }, 200)
  const authSessionId = jwtPayload(userLogin.body.access_token).session_id
  assert.ok(authSessionId, "Auth access token has no session_id")
  const appSession = (await rest("user_sessions", "POST", {
    organization_id: organization.id, user_id: success.body.user_id, auth_session_id: authSessionId,
    device_id: `http-${suffix}`, device_name: "HTTP integration test",
  })).body[0]
  const revoked = await request("/functions/v1/iam-admin", {
    method: "POST", headers: callerHeaders,
    body: JSON.stringify({ action: "revoke_session", session_id: appSession.id, reason: "HTTP integration test" }),
  }, 200)
  assert.equal(revoked.body.auth_sessions_revoked, 1)
  const refreshAfterRevoke = await request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: userLogin.body.refresh_token }),
  })
  assert.ok(refreshAfterRevoke.response.status >= 400, "revoked Auth session still refreshed")
  const appSessionAfter = (await rest(`user_sessions?id=eq.${appSession.id}&select=revoked_at`)).body[0]
  assert.ok(appSessionAfter.revoked_at)

  const secondLogin = await request("/auth/v1/token?grant_type=password", {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: userEmail, password }),
  }, 200)
  await request("/functions/v1/iam-admin", {
    method: "POST", headers: callerHeaders,
    body: JSON.stringify({ action: "lock_user", user_id: success.body.user_id, reason: "HTTP integration test" }),
  }, 200)
  const lockedAuth = (await request(`/auth/v1/admin/users/${success.body.user_id}`, { headers: serviceHeaders }, 200)).body
  assert.ok(new Date(lockedAuth.banned_until).getTime() > Date.now())
  assert.equal((await rest(`users?id=eq.${success.body.user_id}&select=status`)).body[0].status, "suspended")
  const refreshAfterLock = await request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: secondLogin.body.refresh_token }),
  })
  assert.ok(refreshAfterLock.response.status >= 400, "locked user session still refreshed")
  await request("/functions/v1/iam-admin", {
    method: "POST", headers: callerHeaders,
    body: JSON.stringify({ action: "unlock_user", user_id: success.body.user_id }),
  }, 200)
  assert.equal((await rest(`users?id=eq.${success.body.user_id}&select=status`)).body[0].status, "active")

  const failed = await request("/functions/v1/iam-admin", {
    method: "POST", headers: callerHeaders,
    body: JSON.stringify({ action: "create_user", email: rollbackEmail, full_name_ar: "Rollback User", role_id: "99999999-9999-9999-9999-999999999999", governance_unit_id: unit.id }),
  })
  assert.equal(failed.response.status, 400, JSON.stringify(failed.body))
  assert.equal((await rest(`users?email=eq.${encodeURIComponent(rollbackEmail)}&select=id`)).body.length, 0)
  assert.equal((await listAuthUsers()).some((user) => user.email === rollbackEmail), false, "Auth rollback did not delete the invited user")

  console.log("ok - HTTP create flow created Auth user, invitation email, profile, and role membership")
  console.log("ok - HTTP session revocation invalidated the real Auth refresh-token chain")
  console.log("ok - HTTP lock/unlock synchronized Supabase Auth and the application profile")
  console.log("ok - HTTP failure rolled back both application data and the invited Auth user")
} finally {
  await cleanup()
}
