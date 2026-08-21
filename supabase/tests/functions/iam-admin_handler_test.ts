import test from "node:test"
import assert from "node:assert/strict"
import { createIamAdminHandler } from "../../functions/iam-admin/handler.ts"
import { parseAllowedOrigins } from "../../functions/iam-admin/security.ts"

const request = (body: Record<string, unknown>, authorized = true, origin?: string) => new Request("http://local/iam-admin", {
  method: "POST",
  headers: {
    ...(authorized ? { Authorization: "Bearer test-token" } : {}),
    ...(origin ? { Origin: origin } : {}),
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
})

const build = (options: {
  finalizeError?: string
  createError?: string
  allowedOrigins?: readonly string[]
  originConfigurationValid?: boolean
  isProduction?: boolean
} = {}) => {
  const calls: Array<{ name: string; args?: any }> = []
  const caller = {
    auth: { getUser: async () => ({ data: { user: { id: "actor-id" } }, error: null }) },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args })
      if (name === "has_permission") return { data: true, error: null }
      if (name === "request_session_revocation") return { data: { user_id: "target-id", auth_session_id: "auth-session-id" }, error: null }
      if (name === "admin_get_user_detail") return { data: { id: args.p_user_id, email: "target@example.test" }, error: null }
      return { data: null, error: null }
    },
  }
  const admin = {
    auth: { admin: {
      createUser: async (args: any) => {
        calls.push({ name: "createUser", args })
        return options.createError
          ? { data: { user: null }, error: { message: options.createError } }
          : { data: { user: { id: "new-user" } }, error: null }
      },
      deleteUser: async (id: string) => { calls.push({ name: "deleteUser", args: id }); return { error: null } },
      getUserById: async () => ({ data: { user: { id: "target-id", banned_until: null } }, error: null }),
      updateUserById: async (id: string, args: any) => { calls.push({ name: "updateUserById", args: { id, ...args } }); return { error: null } },
      generateLink: async (args: any) => { calls.push({ name: "generateLink", args }); return { data: { properties: { action_link: "https://safe.test/action" } }, error: null } },
    } },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args })
      if (name === "service_consume_iam_rate_limit") return { data: 1, error: null }
      if (name === "service_finalize_invited_user") return options.finalizeError
        ? { data: null, error: { message: options.finalizeError } }
        : { data: { user_id: "new-user", membership_id: "membership-id" }, error: null }
      if (name === "service_issue_activation_invitation") return { data: { invitation_id: "invitation-id" }, error: null }
      if (name === "service_apply_user_status") return { data: { user_id: args.p_user_id, status: args.p_status, auth_sessions_revoked: 2 }, error: null }
      if (name === "service_revoke_auth_sessions") return { data: 1, error: null }
      if (name === "service_record_iam_event") return { data: "audit-id", error: null }
      return { data: null, error: null }
    },
  }
  const sendEmail = async (message: any) => { calls.push({ name: "sendEmail", args: message }) }
  return {
    handler: createIamAdminHandler({
      createCaller: () => caller,
      admin,
      sendEmail,
      allowedOrigins: options.allowedOrigins ?? ["https://app.test"],
      originConfigurationValid: options.originConfigurationValid ?? true,
      isProduction: options.isProduction ?? false,
      activationTokenSecret: "test-activation-token-secret-with-32-characters",
      logError: () => undefined,
    }),
    calls,
  }
}

test("parses only canonical exact origins from ALLOWED_ORIGINS", () => {
  assert.deepEqual(parseAllowedOrigins("https://app.test, http://localhost:3000"), {
    allowedOrigins: ["https://app.test", "http://localhost:3000"],
    valid: true,
  })
  for (const value of ["", "https://app.test/", "https://*.app.test", "https://user:secret@app.test", "https://app.test/path"]) {
    assert.equal(parseAllowedOrigins(value).valid, false, value)
  }
  assert.equal(parseAllowedOrigins("http://localhost:3000", { requireHttps: true }).valid, false)
})

test("answers CORS preflight only for an exact configured browser origin", async () => {
  const { handler } = build()
  const response = await handler(new Request("http://local/iam-admin", {
    method: "OPTIONS",
    headers: { Origin: "https://app.test" },
  }))
  assert.equal(response.status, 204)
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://app.test")
  assert.equal(response.headers.get("Vary"), "Origin")
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS")
})

test("reflects an exact configured Origin on an authenticated browser response", async () => {
  const { handler } = build()
  const response = await handler(request({ action: "lock_user", user_id: "target-id" }, true, "https://app.test"))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://app.test")
  assert.equal(response.headers.get("Vary"), "Origin")
})

test("rejects a foreign browser Origin before IAM or token processing", async () => {
  const { handler, calls } = build()
  const response = await handler(request({ action: "lock_user", user_id: "target-id" }, true, "https://evil.test"))
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: "cors_origin_forbidden" })
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
  assert.equal(response.headers.get("Vary"), "Origin")
  assert.deepEqual(calls, [])
})

test("rejects foreign CORS preflight without granting it an allow-origin header", async () => {
  const { handler } = build()
  const response = await handler(new Request("http://local/iam-admin", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.test" },
  }))
  assert.equal(response.status, 403)
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
  assert.equal(response.headers.get("Vary"), "Origin")
})

test("keeps native bearer calls without Origin working", async () => {
  const { handler } = build()
  const response = await handler(request({ action: "lock_user", user_id: "target-id" }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
})

test("fails closed in production when ALLOWED_ORIGINS is absent or invalid", async () => {
  const { handler } = build({ allowedOrigins: [], originConfigurationValid: false, isProduction: true })
  const response = await handler(request({ action: "lock_user", user_id: "target-id" }))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: "cors_configuration_invalid" })
})

test("rejects requests without bearer authentication", async () => {
  const { handler } = build()
  const response = await handler(request({ action: "create_user" }, false))
  assert.equal(response.status, 401)
})

test("bounds and validates privileged IAM JSON request bodies", async () => {
  const { handler } = build()
  const arrayResponse = await handler(new Request("http://local/iam-admin", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: "[]",
  }))
  assert.equal(arrayResponse.status, 400)
  assert.deepEqual(await arrayResponse.json(), { error: "invalid_request_body" })

  const largeResponse = await handler(new Request("http://local/iam-admin", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "create_user", padding: "x".repeat(64 * 1024) }),
  }))
  assert.equal(largeResponse.status, 413)
  assert.deepEqual(await largeResponse.json(), { error: "request_body_too_large" })
})

test("creates an inactive Auth user and sends a one-time activation invitation", async () => {
  const { handler, calls } = build()
  const response = await handler(request({ action: "create_user", email: "new@example.test", full_name_ar: "New", role_id: "role", governance_unit_id: "unit" }))
  assert.equal(response.status, 201)
  assert.equal((await response.json()).membership_id, "membership-id")
  assert.ok(calls.some((call) => call.name === "createUser" && call.args.email_confirm === false))
  assert.ok(calls.some((call) => call.name === "service_finalize_invited_user"))
  assert.ok(calls.some((call) => call.name === "service_issue_activation_invitation"))
  assert.ok(calls.some((call) => call.name === "sendEmail" && call.args.html.includes("/activate#token=v1.")))
})

test("deletes Auth user when atomic application provisioning fails", async () => {
  const { handler, calls } = build({ finalizeError: "invalid role" })
  const response = await handler(request({ action: "create_user", email: "new@example.test", full_name_ar: "New", role_id: "bad", governance_unit_id: "unit" }))
  assert.equal(response.status, 400)
  assert.ok(calls.some((call) => call.name === "deleteUser" && call.args === "new-user"))
})

test("does not reflect provider diagnostics to IAM callers", async () => {
  const { handler } = build({ createError: "tenant database host: internal.example.test" })
  const response = await handler(request({
    action: "create_user",
    email: "new@example.test",
    full_name_ar: "New",
    temporary_password: "Qarar-Strong!2026",
  }))
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: "auth_user_creation_failed" })
})

test("locks Auth user and applies suspended application status", async () => {
  const { handler, calls } = build()
  const response = await handler(request({ action: "lock_user", user_id: "target-id", reason: "security" }))
  assert.equal(response.status, 200)
  assert.ok(calls.some((call) => call.name === "updateUserById" && call.args.ban_duration === "876000h"))
  assert.ok(calls.some((call) => call.name === "service_apply_user_status" && call.args.p_status === "suspended"))
})

test("revokes the selected Auth session through the service RPC", async () => {
  const { handler, calls } = build()
  const response = await handler(request({ action: "revoke_session", session_id: "app-session-id" }))
  assert.equal(response.status, 200)
  assert.ok(calls.some((call) => call.name === "service_revoke_auth_sessions" && call.args.p_auth_session_id === "auth-session-id"))
})

test("resend_invitation revokes the old invitation and sends a new custom activation link", async () => {
  const { handler, calls } = build()
  const response = await handler(request({ action: "resend_invitation", user_id: "target-id" }))
  assert.equal(response.status, 200)
  assert.ok(calls.some((call) => call.name === "service_issue_activation_invitation"))
  assert.ok(calls.some((call) => call.name === "sendEmail" && call.args.html.includes("/activate#token=v1.")))
  assert.ok(!calls.some((call) => call.name === "generateLink"))
})

for (const [action, linkType, auditAction] of [
  ["send_password_reset", "recovery", "iam.password_reset.sent"],
] as const) {
  test(`${action} generates, sends, and audits a secure link`, async () => {
    const { handler, calls } = build()
    const response = await handler(request({ action, user_id: "target-id", redirect_to: "https://app.test/callback?flow=managed" }))
    assert.equal(response.status, 200)
    assert.ok(calls.some((call) => call.name === "generateLink" && call.args.type === linkType && call.args.options.redirectTo === "https://app.test/callback?flow=managed"))
    assert.ok(calls.some((call) => call.name === "sendEmail" && call.args.to === "target@example.test"))
    assert.ok(calls.some((call) => call.name === "service_record_iam_event" && call.args.p_action === auditAction && call.args.p_metadata.redirect_to === "https://app.test/callback?flow=managed"))
  })
}

for (const redirectTo of [
  "https://app.test.evil/callback",
  "https://operator:secret@app.test/callback",
  "javascript:alert(1)",
]) {
  test(`rejects an unsafe Auth redirect without forwarding it: ${redirectTo}`, async () => {
    const { handler, calls } = build()
    const response = await handler(request({ action: "send_password_reset", user_id: "target-id", redirect_to: redirectTo }))
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: "invalid_redirect_to" })
    assert.ok(!calls.some((call) => call.name === "generateLink" || call.name === "sendEmail" || call.name === "service_record_iam_event"))
  })
}
