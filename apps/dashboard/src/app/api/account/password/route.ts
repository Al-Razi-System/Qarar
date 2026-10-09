import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { qararRpc, requireQararSession } from "@/shared/api/qarar-server";
import { getQararSupabaseRuntimeConfig } from "@/shared/config/qarar-runtime";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
import { enforceLoginRateLimit, getLoginRateLimitConfig, isProductionEnvironment } from "@/shared/security/login-rate-limit";
import { logEvent } from "@/shared/observability/logger";

const noStore = { "Cache-Control": "no-store, private" };
const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: noStore });

export async function POST(request: Request) {
  const rejected = rejectUntrustedMutation(request);
  if (rejected) return rejected;
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { currentPassword, password } = parsed.value;
  if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 4096 ||
    typeof password !== "string" || password.length < 12 || password.length > 128 ||
    !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return reply("أدخل كلمة المرور الحالية وجديدة من 12 إلى 128 حرفًا تشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا.", 400);
  }
  if (currentPassword === password) return reply("اختر كلمة مرور مختلفة عن الحالية.", 400);
  const config = getQararSupabaseRuntimeConfig();
  if (!config) return reply("خدمة الحساب غير متاحة مؤقتًا.", 503);
  let reauthToken: string | undefined;
  let updateAttempted = false;
  let changed = false;
  const traceId = randomUUID();
  try {
    await requireQararSession();
    const account = await qararRpc<{ id: string; email: string }>("get_my_account", {});
    const cookieStore = await cookies();
    const token = cookieStore.get("qarar_access_token")?.value;
    if (!token || !account?.id || !account.email) return reply("انتهت الجلسة. سجّل الدخول مرة أخرى.", 401);
    const limiter = getLoginRateLimitConfig();
    if (!limiter && isProductionEnvironment()) return reply("حماية التحقق من كلمة المرور غير متاحة الآن.", 503);
    let clientIp: string | undefined;
    if (limiter) {
      const limited = await enforceLoginRateLimit(request, account.email, limiter);
      if (limited.state === "limited") return NextResponse.json({ message: "تجاوزت محاولات التحقق المسموحة. حاول لاحقًا." }, { status: 429, headers: { ...noStore, "Retry-After": String(limited.retryAfterSeconds) } });
      if (limited.state !== "allowed") return reply("حماية التحقق غير متاحة الآن. حاول لاحقًا.", 503);
      clientIp = limited.clientIp;
    }
    const verified = await fetch(`${config.apiUrl}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: config.anonKey, "Content-Type": "application/json", ...(clientIp ? { "X-Qarar-Client-IP": clientIp } : {}) },
      body: JSON.stringify({ email: account.email, password: currentPassword }), cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!verified.ok) return reply(verified.status >= 500 ? "تعذر التحقق من كلمة المرور حاليًا." : "كلمة المرور الحالية غير صحيحة أو الحساب لا يسمح بالدخول بكلمة مرور.", verified.status >= 500 ? 503 : verified.status === 429 ? 429 : 400);
    const identity = await verified.json() as { user?: { id?: string }; access_token?: string };
    if (typeof identity.access_token === "string") reauthToken = identity.access_token;
    if (!reauthToken || identity.user?.id !== account.id) return reply("تعذر التحقق من هوية الحساب.", 403);
    updateAttempted = true;
    const updated = await fetch(`${config.apiUrl}/auth/v1/user`, {
      method: "PUT", headers: { apikey: config.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password }), cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!updated.ok) return reply("تعذر اعتماد تغيير كلمة المرور. تحقق من سياسة الأمان أو أعد تسجيل الدخول.", updated.status >= 500 ? 503 : 400);
    changed = true;
    let sessionsRevoked = false;
    try {
      const revoked = await fetch(`${config.apiUrl}/auth/v1/logout?scope=global`, {
        method: "POST", headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      sessionsRevoked = revoked.ok;
    } catch { /* Password success must not become a retryable mutation failure. */ }
    for (const name of ["qarar_access_token", "qarar_refresh_token", "qarar_mfa_access_token", "qarar_mfa_refresh_token"]) cookieStore.delete(name);
    logEvent(sessionsRevoked ? "info" : "warn", "account.password.changed", { traceId, userId: account.id, sessionsRevoked });
    return NextResponse.json({ changed: true, sessionsRevoked, message: sessionsRevoked ? "تم تغيير كلمة المرور. سجّل الدخول بالجديدة." : "تم تغيير كلمة المرور، لكن تعذر تأكيد إلغاء الجلسات الأخرى. سجّل الدخول بالجديدة وراجع جلساتك." }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") return reply("انتهت الجلسة. سجّل الدخول مرة أخرى.", 401);
    if (error instanceof Error && error.message === "MFA_REQUIRED") return reply("أكمل التحقق الثنائي قبل تغيير كلمة المرور.", 403);
    logEvent("warn", "account.password.failed", { traceId, updateAttempted, changed, cause: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ message: updateAttempted ? "تعذر تأكيد نتيجة تغيير كلمة المرور. جرّب تسجيل الدخول بالجديدة قبل إعادة التغيير." : "تعذر التحقق من الحساب الآن. حاول لاحقًا.", traceId, uncertain: updateAttempted }, { status: 503, headers: noStore });
  } finally {
    if (reauthToken) {
      try {
        const cleanup = await fetch(`${config.apiUrl}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: config.anonKey, Authorization: `Bearer ${reauthToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!cleanup.ok) logEvent("warn", "account.password.reauth_cleanup_failed", { traceId, status: cleanup.status });
      } catch { logEvent("warn", "account.password.reauth_cleanup_failed", { traceId }); }
    }
  }
}
