import { isAllowedOrigin, resolveAllowedRedirect } from "./security.ts"

const MAX_IAM_ADMIN_BODY_BYTES = 64 * 1024

type JsonPayloadResult =
  | { ok: true; value: Record<string, any> }
  | { ok: false; status: 400 | 413; error: "invalid_request_body" | "request_body_too_large" }

/**
 * Bound JSON parsing before allocating a request body. The function receives
 * privileged administration commands, so Content-Length is treated as an
 * early rejection only; the streamed byte count remains authoritative.
 */
const readJsonPayload = async (request: Request): Promise<JsonPayloadResult> => {
  const contentLength = request.headers.get("content-length")
  if (contentLength) {
    const declared = Number(contentLength)
    if (!Number.isInteger(declared) || declared < 0) {
      return { ok: false, status: 400, error: "invalid_request_body" }
    }
    if (declared > MAX_IAM_ADMIN_BODY_BYTES) {
      return { ok: false, status: 413, error: "request_body_too_large" }
    }
  }

  const reader = request.body?.getReader()
  if (!reader) return { ok: false, status: 400, error: "invalid_request_body" }

  const chunks: Uint8Array[] = []
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_IAM_ADMIN_BODY_BYTES) {
        await reader.cancel()
        return { ok: false, status: 413, error: "request_body_too_large" }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, status: 400, error: "invalid_request_body" }
  } finally {
    reader.releaseLock()
  }

  const payloadBytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    payloadBytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes))
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, status: 400, error: "invalid_request_body" }
    }
    return { ok: true, value: payload as Record<string, any> }
  } catch {
    return { ok: false, status: 400, error: "invalid_request_body" }
  }
}

export type IamAdminDependencies = {
  createCaller: (authorization: string) => any
  admin: any
  sendEmail: (message: { to: string; subject: string; text: string; html: string }) => Promise<void>
  allowedOrigins?: readonly string[]
  originConfigurationValid?: boolean
  isProduction?: boolean
  activationTokenSecret?: string
  logError?: (scope: string, error: unknown) => void
}

const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
const issueActivationToken = async (secret: string, expiresAt: Date) => {
  if (secret.trim().length < 32) throw new Error("activation token secret is not configured")
  const nonce = crypto.getRandomValues(new Uint8Array(32))
  const unsigned = `v1.${Math.floor(expiresAt.getTime() / 1000)}.${base64Url(nonce)}`
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned)))
  return `${unsigned}.${base64Url(signature)}`
}
const activationHexDigest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("")

const corsHeaders = (request: Request, dependencies: IamAdminDependencies) => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
  const origin = request.headers.get("Origin")
  if (isAllowedOrigin(origin, dependencies.allowedOrigins)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

const json = (request: Request, dependencies: IamAdminDependencies, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(request, dependencies), "Content-Type": "application/json" },
})

const api = (client: any) => typeof client.schema === "function" ? client.schema("api_v1") : client

const requirePermission = async (caller: any, code: string) => {
  const { data, error } = await api(caller).rpc("has_permission", { permission_code: code })
  if (error || data !== true) throw Object.assign(new Error(`permission denied: ${code}`), { status: 403 })
}

const requireRateLimit = async (admin: any, actorUserId: string, operation: string, limit = 10, windowSeconds = 600) => {
  const { error } = await api(admin).rpc("service_consume_iam_rate_limit", {
    p_actor_user_id: actorUserId,
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
  const origin = request.headers.get("Origin")
  const invalidProductionCorsConfiguration = dependencies.isProduction === true
    && (dependencies.originConfigurationValid !== true || !dependencies.allowedOrigins?.length)
  if (invalidProductionCorsConfiguration) {
    return json(request, dependencies, { error: "cors_configuration_invalid" }, 503)
  }

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, dependencies.allowedOrigins)) {
      return json(request, dependencies, { error: "cors_origin_forbidden" }, 403)
    }
    return new Response(null, { status: 204, headers: corsHeaders(request, dependencies) })
  }
  // Native clients do not send Origin. A browser-originated request must be
  // explicitly listed before it can reach bearer-token or IAM processing.
  if (origin && !isAllowedOrigin(origin, dependencies.allowedOrigins)) {
    return json(request, dependencies, { error: "cors_origin_forbidden" }, 403)
  }
  if (request.method !== "POST") return json(request, dependencies, { error: "method_not_allowed" }, 405)

  const authorization = request.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ")) return json(request, dependencies, { error: "missing_authorization" }, 401)

  const caller = dependencies.createCaller(authorization)
  const { data: callerData, error: callerError } = await caller.auth.getUser()
  if (callerError || !callerData?.user) return json(request, dependencies, { error: "invalid_token" }, 401)
  const actorUserId = callerData.user.id

  try {
    const parsedPayload = await readJsonPayload(request)
    if (!parsedPayload.ok) {
      return json(request, dependencies, { error: parsedPayload.error }, parsedPayload.status)
    }
    const payload = parsedPayload.value

    if (payload.action === "create_user") {
      await requirePermission(caller, "iam.users.manage")
      await requireRateLimit(dependencies.admin, actorUserId, "iam.create_user")
      const email = payload.email?.trim().toLowerCase()
      if (!email || !payload.full_name_ar?.trim()) return json(request, dependencies, { error: "email_and_full_name_ar_required" }, 400)
      if (!payload.role_id && payload.governance_unit_id) {
        return json(request, dependencies, { error: "role_is_required_when_governance_unit_is_provided" }, 400)
      }

      const bootstrapPassword = `${base64Url(crypto.getRandomValues(new Uint8Array(32)))}aA1!`
      const { data: created, error: createError } = await dependencies.admin.auth.admin.createUser({
        email,
        password: bootstrapPassword,
        email_confirm: false,
        user_metadata: { full_name_ar: payload.full_name_ar.trim() },
      })
      // Provider diagnostics can disclose tenant configuration or account
      // state. They stay in server logs; clients receive only a stable code.
      if (createError || !created?.user) return json(request, dependencies, { error: "auth_user_creation_failed" }, 409)

      const userId = created.user.id
      const { data: finalized, error: finalizeError } = await api(dependencies.admin).rpc("service_finalize_invited_user", {
        p_actor_user_id: actorUserId,
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
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const token = await issueActivationToken(dependencies.activationTokenSecret ?? "", expiresAt)
      const { data: invitation, error: invitationError } = await api(dependencies.admin).rpc("service_issue_activation_invitation", {
        p_actor_user_id: actorUserId,
        p_auth_user_id: userId,
        p_email: email,
        p_full_name_ar: payload.full_name_ar.trim(),
        p_role_id: payload.role_id ?? null,
        p_governance_unit_id: payload.governance_unit_id ?? null,
        p_token_hash: await activationHexDigest(token),
        p_expires_at: expiresAt.toISOString(),
      })
      if (invitationError) {
        await dependencies.admin.auth.admin.deleteUser(userId, false)
        throw new Error(`activation invitation failed: ${invitationError.message}`)
      }
      const appOrigin = dependencies.allowedOrigins?.[0]
      if (!appOrigin) throw new Error("activation application origin is not configured")
      const activationUrl = `${appOrigin}/activate#token=${encodeURIComponent(token)}`
      await dependencies.sendEmail({
        to: email,
        subject: "دعوة تفعيل حساب قرار",
        text: `استخدم رابط التفعيل الآمن خلال سبعة أيام: ${activationUrl}`,
        html: `<p>أكمل تفعيل حسابك في قرار خلال سبعة أيام.</p><p><a href="${activationUrl}">تفعيل الحساب</a></p>`,
      })
      return json(request, dependencies, { ...finalized, ...invitation, account_created: true, invitation_sent: true }, 201)
    }

    if (["update_user_status", "lock_user", "unlock_user"].includes(payload.action)) {
      await requirePermission(caller, "iam.users.manage")
      await requireRateLimit(dependencies.admin, actorUserId, "iam.update_user_status", 30, 600)
      if (!payload.user_id) return json(request, dependencies, { error: "user_id_required" }, 400)
      const status = payload.action === "lock_user" ? "suspended" : payload.action === "unlock_user" ? "active" : payload.status
      if (!["active", "inactive", "suspended"].includes(status)) return json(request, dependencies, { error: "invalid_user_status" }, 400)

      const { data: before, error: getError } = await dependencies.admin.auth.admin.getUserById(payload.user_id)
      if (getError || !before?.user) return json(request, dependencies, { error: "auth_user_not_found" }, 404)
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
      return json(request, dependencies, data)
    }

    if (payload.action === "revoke_session") {
      if (!payload.session_id) return json(request, dependencies, { error: "session_id_required" }, 400)
      const { data: session, error } = await api(caller).rpc("request_session_revocation", { p_session_id: payload.session_id })
      if (error) throw Object.assign(new Error("session revocation request denied"), { status: 403 })
      const { data: revokedCount, error: revokeError } = await api(dependencies.admin).rpc("service_revoke_auth_sessions", {
        p_actor_user_id: actorUserId,
        p_user_id: session.user_id,
        p_auth_session_id: session.auth_session_id,
        p_reason: payload.reason ?? "revoked from session management",
      })
      if (revokeError) throw new Error(revokeError.message)
      return json(request, dependencies, { revoked: true, session_id: payload.session_id, auth_sessions_revoked: revokedCount })
    }

    if (["resend_invitation", "send_password_reset"].includes(payload.action)) {
      await requirePermission(caller, "iam.users.manage")
      if (!payload.user_id) return json(request, dependencies, { error: "user_id_required" }, 400)
      const redirectTo = resolveAllowedRedirect(payload.redirect_to, dependencies.allowedOrigins ?? [])
      if (redirectTo === null) return json(request, dependencies, { error: "invalid_redirect_to" }, 400)
      await requireRateLimit(dependencies.admin, actorUserId, payload.action, 5, 900)
      const user = await getManagedUser(caller, payload.user_id)
      if (payload.action === "resend_invitation") {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        const token = await issueActivationToken(dependencies.activationTokenSecret ?? "", expiresAt)
        const { error: invitationError } = await api(dependencies.admin).rpc("service_issue_activation_invitation", {
          p_actor_user_id: actorUserId, p_auth_user_id: payload.user_id, p_email: user.email,
          p_full_name_ar: user.full_name_ar ?? "", p_role_id: null, p_governance_unit_id: null,
          p_token_hash: await activationHexDigest(token), p_expires_at: expiresAt.toISOString(),
        })
        if (invitationError) throw new Error(`activation invitation failed: ${invitationError.message}`)
        const appOrigin = dependencies.allowedOrigins?.[0]
        if (!appOrigin) throw new Error("activation application origin is not configured")
        const activationUrl = `${appOrigin}/activate#token=${encodeURIComponent(token)}`
        await dependencies.sendEmail({ to: user.email, subject: "دعوة تفعيل حساب قرار",
          text: `استخدم رابط التفعيل الآمن خلال سبعة أيام: ${activationUrl}`,
          html: `<p>أكمل تفعيل حسابك في قرار خلال سبعة أيام.</p><p><a href="${activationUrl}">تفعيل الحساب</a></p>` })
        return json(request, dependencies, { sent: true, user_id: payload.user_id, destination: user.email.replace(/(^.).*(@.*$)/, "$1***$2") })
      }
      const type = payload.action === "resend_invitation" ? "invite" : "recovery"
      const { data, error } = await dependencies.admin.auth.admin.generateLink({
        type,
        email: user.email,
        options: redirectTo ? { redirectTo } : {},
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
        p_metadata: { redirect_to: redirectTo ?? null },
      })
      if (auditError) throw new Error(`audit recording failed: ${auditError.message}`)
      return json(request, dependencies, { sent: true, user_id: payload.user_id, destination: user.email.replace(/(^.).*(@.*$)/, "$1***$2") })
    }

    return json(request, dependencies, { error: "unsupported_action" }, 400)
  } catch (error) {
    const logError = dependencies.logError ?? console.error
    logError("iam-admin", error)
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 400
    // Errors from Auth/RPC providers are intentionally never reflected. They
    // may include SQL, account, or transport details that belong only in the
    // protected server log above.
    return json(request, dependencies, { error: "operation_failed" }, status)
  }
}
