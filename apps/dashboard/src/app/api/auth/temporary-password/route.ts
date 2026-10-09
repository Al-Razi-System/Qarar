import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { qararServiceRpc } from "@/shared/api/qarar-service";
import { getQararSupabaseRuntimeConfig } from "@/shared/config/qarar-runtime";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
import { enforceLoginRateLimit, getLoginRateLimitConfig, isProductionEnvironment } from "@/shared/security/login-rate-limit";
import { logEvent } from "@/shared/observability/logger";

const headers = { "Cache-Control": "no-store, private" };
const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers });

export async function POST(request: Request) {
  const rejected = rejectUntrustedMutation(request);
  if (rejected) return rejected;
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { currentPassword, password } = parsed.value;
  if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 4096 || typeof password !== "string" || password.length < 12 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return reply("أدخل كلمة المرور الحالية وجديدة من 12 إلى 128 حرفًا تشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا.", 400);
  if (password === currentPassword) return reply("اختر كلمة مرور مختلفة عن المؤقتة.", 400);
  const store = await cookies();
  const token = store.get("qarar_temporary_access_token")?.value;
  if (!token) return reply("انتهت جلسة الاستبدال. سجّل الدخول مرة أخرى.", 401);
  const config = getQararSupabaseRuntimeConfig();
  if (!config) return reply("خدمة الحساب غير متاحة مؤقتًا.", 503);
  const traceId = randomUUID(), requestId = randomUUID();
  let userId: string | undefined, reauthToken: string | undefined;
  let claimed = false, attempted = false, completed = false;
  const authHeaders = { apikey: config.anonKey, Authorization: `Bearer ${token}` };
  try {
    const identity = await fetch(`${config.apiUrl}/auth/v1/user`, { headers: authHeaders, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!identity.ok) return reply("انتهت جلسة الاستبدال. سجّل الدخول مرة أخرى.", identity.status >= 500 ? 503 : 401);
    const user = await identity.json() as { id?: string; email?: string };
    if (!user.id || !user.email) return reply("تعذر التحقق من الحساب.", 401);
    userId = user.id;
    const state = await qararServiceRpc<{ must_change_password: boolean; expires_at?: string }>("service_get_temporary_password_state", { p_user_id: userId });
    if (!state?.must_change_password || !state.expires_at || !Number.isFinite(Date.parse(state.expires_at)) || Date.parse(state.expires_at) <= Date.now()) return reply("الاستبدال غير متاح أو انتهت صلاحيته. أعد تسجيل الدخول أو تواصل مع المدير.", 403);
    const limiter = getLoginRateLimitConfig();
    if (!limiter && isProductionEnvironment()) return reply("حماية التحقق غير متاحة الآن.", 503);
    let clientIp: string | undefined;
    if (limiter) {
      const limited = await enforceLoginRateLimit(request, user.email, limiter);
      if (limited.state === "limited") return NextResponse.json({ message: "تجاوزت محاولات التحقق المسموحة. حاول لاحقًا." }, { status: 429, headers: { ...headers, "Retry-After": String(limited.retryAfterSeconds) } });
      if (limited.state !== "allowed") return reply("حماية التحقق غير متاحة الآن.", 503);
      clientIp = limited.clientIp;
    }
    // Verify the supplied current plaintext against Auth. Comparing bcrypt
    // hashes alone cannot detect a provider rehash of the same password.
    const verified = await fetch(`${config.apiUrl}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: config.anonKey, "Content-Type": "application/json", ...(clientIp ? { "X-Qarar-Client-IP": clientIp } : {}) }, body: JSON.stringify({ email: user.email, password: currentPassword }), cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!verified.ok) return reply(verified.status >= 500 ? "تعذر التحقق من كلمة المرور حاليًا." : "كلمة المرور الحالية غير صحيحة.", verified.status >= 500 ? 503 : verified.status === 429 ? 429 : 400);
    const reauth = await verified.json() as { user?: { id?: string }; access_token?: string };
    reauthToken = reauth.access_token;
    if (!reauthToken || reauth.user?.id !== userId) return reply("تعذر التحقق من هوية الحساب.", 403);
    const claim = await qararServiceRpc<{ claimed: boolean }>("service_claim_temporary_password", { p_user_id: userId, p_request_id: requestId });
    if (claim?.claimed !== true) throw new Error("CLAIM_NOT_CONFIRMED");
    claimed = true;
    attempted = true;
    const updated = await fetch(`${config.apiUrl}/auth/v1/user`, { method: "PUT", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ password }), cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!updated.ok) {
      attempted = updated.status >= 500;
      if (attempted) throw new Error("AUTH_UPDATE_UNCERTAIN");
      return reply("تعذر تغيير كلمة المرور. أعد تسجيل الدخول وتحقق من سياسة الأمان.", 400);
    }
    const receipt = await qararServiceRpc<{ completed: boolean }>("service_finish_temporary_password", { p_user_id: userId, p_request_id: requestId });
    if (receipt?.completed !== true) throw new Error("COMPLETION_NOT_CONFIRMED");
    completed = true;
    for (const name of ["qarar_temporary_access_token", "qarar_access_token", "qarar_refresh_token", "qarar_mfa_access_token", "qarar_mfa_refresh_token"]) store.delete(name);
    logEvent("info", "account.temporary_password.completed", { traceId, userId });
    return NextResponse.json({ changed: true, message: "تم تغيير كلمة المرور وإلغاء الجلسات المؤقتة. سجّل الدخول بالكلمة الجديدة." }, { headers });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    logEvent("warn", "account.temporary_password.failed", { traceId, userId, attempted, code: typeof code === "string" ? code : undefined, cause: error instanceof Error ? error.name : "unknown" });
    if (code === "40001" && !attempted) return reply("توجد محاولة استبدال أخرى جارية. انتظر قليلًا ثم حاول مجددًا.", 409);
    return NextResponse.json({ traceId, uncertain: attempted, message: attempted ? "تعذر تأكيد اكتمال الاستبدال. سجّل الدخول بالكلمة الجديدة أولًا؛ الحساب يبقى محميًا حتى اكتمال العملية." : "تعذر التحقق من الحساب الآن. حاول لاحقًا." }, { status: 503, headers });
  } finally {
    if (claimed && !completed && userId) {
      try { await qararServiceRpc("service_release_temporary_password", { p_user_id: userId, p_request_id: requestId }); }
      catch { logEvent("warn", "account.temporary_password.claim_cleanup_failed", { traceId }); }
    }
    if (reauthToken) {
      try {
        const result = await fetch(`${config.apiUrl}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: config.anonKey, Authorization: `Bearer ${reauthToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!result.ok && !completed) logEvent("warn", "account.temporary_password.reauth_cleanup_failed", { traceId, status: result.status });
      } catch { if (!completed) logEvent("warn", "account.temporary_password.reauth_cleanup_failed", { traceId }); }
    }
  }
}
