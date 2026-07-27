import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
})

const api = (client: any) => client.schema("api_v1")

const providerError = async (admin: any, requestId: string | undefined, code: string) => {
  if (!requestId) return
  await api(admin).rpc("service_fail_minute_generation", {
    p_request_id: requestId,
    p_error_code: code,
  })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return json({ error: "missing_authorization" }, 401)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "function_not_configured" }, 503)

  let requestId: string | undefined
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const payload = await request.json() as { meeting_id?: string; client_request_id?: string }
    if (!payload.meeting_id) return json({ error: "meeting_id_required" }, 400)

    const { data: userData, error: userError } = await caller.auth.getUser()
    if (userError || !userData.user) return json({ error: "invalid_token" }, 401)

    const { data: generationRequest, error: requestError } = await api(caller).rpc("request_minute_generation", {
      p_meeting_id: payload.meeting_id,
      p_client_request_id: payload.client_request_id ?? null,
    })
    if (requestError || !generationRequest?.request_id) {
      const message = requestError?.message ?? "generation_request_rejected"
      const status = message.includes("permission denied") ? 403 : message.includes("not found") ? 404 : 422
      return json({ error: "generation_request_rejected" }, status)
    }
    requestId = generationRequest.request_id

    if (generationRequest.status === "succeeded") {
      return json({ request_id: requestId, status: "succeeded", idempotent_replay: true })
    }
    if (generationRequest.status !== "queued") {
      return json({ request_id: requestId, status: generationRequest.status, idempotent_replay: true }, 409)
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) {
      await providerError(admin, requestId, "provider_not_configured")
      return json({ error: "ai_provider_unavailable", request_id: requestId }, 503)
    }

    const model = Deno.env.get("GEMINI_MINUTES_MODEL") ?? "gemini-2.5-flash"
    const prompt = [
      "Write a formal Arabic meeting-minutes draft from the following verified JSON context.",
      "Use only facts in the context. Do not invent attendance, votes, decisions, or approvals.",
      "This output is an editable draft only. It is not an approval, decision, or meeting closure.",
      JSON.stringify(generationRequest.generation_context),
    ].join("\n\n")
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    )
    if (!response.ok) {
      await providerError(admin, requestId, "provider_request_failed")
      return json({ error: "ai_provider_unavailable", request_id: requestId }, 502)
    }
    const generated = await response.json()
    const content = generated?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof content !== "string" || !content.trim()) {
      await providerError(admin, requestId, "provider_empty_response")
      return json({ error: "ai_provider_empty_response", request_id: requestId }, 502)
    }

    const { data: completed, error: completionError } = await api(admin).rpc("service_complete_minute_generation", {
      p_request_id: requestId,
      p_generated_content: content,
      p_provider: "google_gemini",
      p_model: model,
    })
    if (completionError || completed?.status !== "succeeded") {
      await providerError(admin, requestId, completionError ? "draft_persistence_failed" : completed?.error_code ?? "draft_not_saved")
      return json({ error: "draft_not_saved", request_id: requestId }, 409)
    }
    return json({
      request_id: requestId,
      status: "generated",
      minute_id: completed.minute_id,
      revision_id: completed.revision_id,
      revision_no: completed.revision_no,
    }, 201)
  } catch {
    await providerError(admin, requestId, "unexpected_generation_failure")
    return json({ error: "generation_failed", request_id: requestId ?? null }, 500)
  }
})
