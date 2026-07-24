export type IamAdminDependencies = {
  createCaller: (authorization: string) => any
  admin: any
  sendEmail: (message: { to: string; subject: string; text: string; html: string }) => Promise<void>
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
})

const api = (client: any) => typeof client.schema === "function" ? client.schema("api_v1") : client

const requirePermission = async (caller: any, code: string) => {
  const { data, error } = await api(caller).rpc("has_permission", { permission_code: code })
  if (error || data !== true) throw Object.assign(new Error(`permission denied: ${code}`), { status: 403 })
}

const requireRateLimit = async (caller: any, operation: string, limit = 10, windowSeconds = 600) => {
  const { error } = await api(caller).rpc("consume_iam_rate_limit", {
    p_operation: operation,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) throw Object.assign(new Error("rate limit exceeded"), { status: 429 })
}

const getManagedUser = async (caller: any, userId: string) => {
  const { data, error } = await api(caller).rpc("admin_get_user_detail", { p_user_id: userId })
  if (error || !data?.email) throw Object.assign(new Error("managed user not found"), { status: 404 })
  return data
}

export const createIamAdminHandler = (dependencies: IamAdminDependencies) => async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const authorization = request.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ")) return json({ error: "missing_authorization" }, 401)

  const caller = dependencies.createCaller(authorization)
  const { data: callerData, error: callerError } = await caller.auth.getUser()
  if (callerError || !callerData?.user) return json({ error: "invalid_token" }, 401)
  const actorUserId = callerData.user.id

  try {
    const payload = await request.json() as Record<string, any>

    if (payload.action === "create_user") {
      await requirePermission(caller, "iam.users.manage")
      await requireRateLimit(caller, "iam.create_user")
      const email = payload.email?.trim().toLowerCase()
      if (!email || !payload.full_name_ar?.trim()) return json({ error: "email_and_full_name_ar_required" }, 400)
      if ((payload.role_id && !payload.governance_unit_id) || (!payload.role_id && payload.governance_unit_id)) {
        return json({ error: "role_and_governance_unit_must_be_provided_together" }, 400)
      }

      const { data: invited, error: inviteError } = await dependencies.admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: payload.redirect_to,
        data: { full_name_ar: payload.full_name_ar.trim() },
      })
      if (inviteError || !invited?.user) return json({ error: "auth_user_creation_failed", detail: inviteError?.message }, 409)

      const userId = invited.user.id
      const { data: finalized, error: finalizeError } = await api(caller).rpc("admin_finalize_invited_user", {
        p_auth_user_id: userId,
        p_email: email,
        p_full_name_ar: payload.full_name_ar.trim(),
        p_employee_no: payload.employee_no ?? null,
        p_mobile: payload.mobile ?? null,
        p_job_title: payload.job_title ?? null,
        p_role_id: payload.role_id ?? null,
        p_governance_unit_id: payload.governance_unit_id ?? null,
        p_membership_title: payload.membership_title ?? null,
      })
      if (finalizeError) {
        await dependencies.admin.auth.admin.deleteUser(userId, false)
        throw new Error(`application provisioning failed: ${finalizeError.message}`)
      }
      return json({ ...finalized, invitation_sent: true }, 201)
    }

    if (["update_user_status", "lock_user", "unlock_user"].includes(payload.action)) {
      await requirePermission(caller, "iam.users.manage")
      await requireRateLimit(caller, "iam.update_user_status", 30, 600)
      if (!payload.user_id) return json({ error: "user_id_required" }, 400)
      const status = payload.action === "lock_user" ? "suspended" : payload.action === "unlock_user" ? "active" : payload.status
      if (!["active", "inactive", "suspended"].includes(status)) return json({ error: "invalid_user_status" }, 400)

      const { data: before, error: getError } = await dependencies.admin.auth.admin.getUserById(payload.user_id)
      if (getError || !before?.user) return json({ error: "auth_user_not_found" }, 404)
      const wasBanned = before.user.banned_until && new Date(before.user.banned_until).getTime() > Date.now()
      const { error: authError } = await dependencies.admin.auth.admin.updateUserById(payload.user_id, {
        ban_duration: status === "active" ? "none" : "876000h",
      })
      if (authError) throw new Error(`Auth status update failed: ${authError.message}`)

      const { data, error } = await api(dependencies.admin).rpc("service_apply_user_status", {
        p_actor_user_id: actorUserId,
        p_user_id: payload.user_id,
        p_status: status,
        p_reason: payload.reason ?? null,
      })
      if (error) {
        await dependencies.admin.auth.admin.updateUserById(payload.user_id, {
          ban_duration: wasBanned ? "876000h" : "none",
        })
        throw new Error(`application status update failed: ${error.message}`)
      }
      return json(data)
    }

    if (payload.action === "revoke_session") {
      if (!payload.session_id) return json({ error: "session_id_required" }, 400)
      const { data: session, error } = await api(caller).rpc("request_session_revocation", { p_session_id: payload.session_id })
      if (error) throw Object.assign(new Error(error.message), { status: 403 })
      const { data: revokedCount, error: revokeError } = await api(dependencies.admin).rpc("service_revoke_auth_sessions", {
        p_actor_user_id: actorUserId,
        p_user_id: session.user_id,
        p_auth_session_id: session.auth_session_id,
        p_reason: payload.reason ?? "revoked from session management",
      })
      if (revokeError) throw new Error(revokeError.message)
      return json({ revoked: true, session_id: payload.session_id, auth_sessions_revoked: revokedCount })
    }

    if (["resend_invitation", "send_password_reset"].includes(payload.action)) {
      await requirePermission(caller, "iam.users.manage")
      await requireRateLimit(caller, payload.action, 5, 900)
      if (!payload.user_id) return json({ error: "user_id_required" }, 400)
      const user = await getManagedUser(caller, payload.user_id)
      const type = payload.action === "resend_invitation" ? "invite" : "recovery"
      const { data, error } = await dependencies.admin.auth.admin.generateLink({
        type,
        email: user.email,
        options: { redirectTo: payload.redirect_to },
      })
      if (error || !data?.properties?.action_link) throw new Error(`link generation failed: ${error?.message ?? "missing link"}`)
      const title = type === "invite" ? "Qarar account invitation" : "Qarar password reset"
      const action = type === "invite" ? "complete your account setup" : "reset your password"
      await dependencies.sendEmail({
        to: user.email,
        subject: title,
        text: `Use this secure link to ${action}: ${data.properties.action_link}`,
        html: `<p>Use the secure link below to ${action}.</p><p><a href="${data.properties.action_link}">${title}</a></p>`,
      })
      const { error: auditError } = await api(dependencies.admin).rpc("service_record_iam_event", {
        p_actor_user_id: actorUserId,
        p_target_user_id: payload.user_id,
        p_action: type === "invite" ? "iam.invitation.resent" : "iam.password_reset.sent",
        p_metadata: { redirect_to: payload.redirect_to ?? null },
      })
      if (auditError) throw new Error(`audit recording failed: ${auditError.message}`)
      return json({ sent: true, user_id: payload.user_id, destination: user.email.replace(/(^.).*(@.*$)/, "$1***$2") })
    }

    return json({ error: "unsupported_action" }, 400)
  } catch (error) {
    console.error("iam-admin", error)
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 400
    return json({ error: "operation_failed", detail: error instanceof Error ? error.message : String(error) }, status)
  }
}
