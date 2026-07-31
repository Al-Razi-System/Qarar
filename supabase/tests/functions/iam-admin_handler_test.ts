import test from "node:test"
import assert from "node:assert/strict"
import { createIamAdminHandler } from "../../functions/iam-admin/handler.ts"

const request = (body: Record<string, unknown>, authorized = true) => new Request("http://local/iam-admin", {
  method: "POST",
  headers: authorized ? { Authorization: "Bearer test-token", "Content-Type": "application/json" } : { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

const build = (options: { finalizeError?: string } = {}) => {
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
      createUser: async (args: any) => { calls.push({ name: "createUser", args }); return { data: { user: { id: "new-user" } }, error: null } },
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
      if (name === "service_apply_user_status") return { data: { user_id: args.p_user_id, status: args.p_status, auth_sessions_revoked: 2 }, error: null }
      if (name === "service_revoke_auth_sessions") return { data: 1, error: null }
      if (name === "service_record_iam_event") return { data: "audit-id", error: null }
      return { data: null, error: null }
    },
  }
  const sendEmail = async (message: any) => { calls.push({ name: "sendEmail", args: message }) }
  return { handler: createIamAdminHandler({ createCaller: () => caller, admin, sendEmail }), calls }
}

test("rejects requests without bearer authentication", async () => {
  const { handler } = build()
  const response = await handler(request({ action: "create_user" }, false))
  assert.equal(response.status, 401)
})

test("rejects creating a user with a weak temporary password", async () => {
  const { handler, calls } = build()
  const response = await handler(request({ action: "create_user", email: "new@example.test", full_name_ar: "New", temporary_password: "weak-password" }))
  assert.equal(response.status, 400)
  assert.ok(!calls.some((call) => call.name === "createUser"))
})

test("creates a confirmed Auth user and finalizes the profile atomically", async () => {
  const { handler, calls } = build()
  const response = await handler(request({ action: "create_user", email: "new@example.test", full_name_ar: "New", temporary_password: "Qarar-Strong!2026", role_id: "role", governance_unit_id: "unit" }))
  assert.equal(response.status, 201)
  assert.equal((await response.json()).membership_id, "membership-id")
  assert.ok(calls.some((call) => call.name === "createUser" && call.args.email_confirm === true))
  assert.ok(calls.some((call) => call.name === "service_finalize_invited_user"))
})

test("deletes Auth user when atomic application provisioning fails", async () => {
  const { handler, calls } = build({ finalizeError: "invalid role" })
  const response = await handler(request({ action: "create_user", email: "new@example.test", full_name_ar: "New", temporary_password: "Qarar-Strong!2026", role_id: "bad", governance_unit_id: "unit" }))
  assert.equal(response.status, 400)
  assert.ok(calls.some((call) => call.name === "deleteUser" && call.args === "new-user"))
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

for (const [action, linkType, auditAction] of [
  ["resend_invitation", "invite", "iam.invitation.resent"],
  ["send_password_reset", "recovery", "iam.password_reset.sent"],
] as const) {
  test(`${action} generates, sends, and audits a secure link`, async () => {
    const { handler, calls } = build()
    const response = await handler(request({ action, user_id: "target-id", redirect_to: "https://app.test/callback" }))
    assert.equal(response.status, 200)
    assert.ok(calls.some((call) => call.name === "generateLink" && call.args.type === linkType))
    assert.ok(calls.some((call) => call.name === "sendEmail" && call.args.to === "target@example.test"))
    assert.ok(calls.some((call) => call.name === "service_record_iam_event" && call.args.p_action === auditAction))
  })
}
