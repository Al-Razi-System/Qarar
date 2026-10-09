import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
import { logEvent } from "@/shared/observability/logger";

const headers = { "Cache-Control": "no-store, private" };
function failure(error: unknown, message: string) {
  const traceId = randomUUID();
  const safe = safeAdminError(error, message, 503);
  logEvent("warn", "account.profile.failed", { traceId, code: safe.code, status: safe.status, cause: error instanceof Error ? error.message : "unknown" });
  return NextResponse.json({ message: safe.message, traceId }, { status: safe.status, headers });
}
export async function GET() {
  try {
    return NextResponse.json(await qararRpc("get_my_account", {}), { headers });
  } catch (error) { return failure(error, "تعذر تحميل حسابك. حاول مرة أخرى."); }
}
export async function PATCH(request: Request) {
  const rejected = rejectUntrustedMutation(request);
  if (rejected) return rejected;
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { full_name_ar: name, mobile, job_title: jobTitle } = parsed.value;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 200 ||
    (mobile !== undefined && (typeof mobile !== "string" || mobile.length > 40)) ||
    (jobTitle !== undefined && (typeof jobTitle !== "string" || jobTitle.length > 200))) {
    return NextResponse.json({ message: "أدخل اسمًا صحيحًا، وتحقق من طول الجوال والمسمى الوظيفي." }, { status: 400, headers });
  }
  try {
    const account = await qararRpc<{ id: string; full_name_ar: string }>("update_my_profile", {
      p_full_name_ar: name.trim(), p_full_name_en: null,
      p_mobile: typeof mobile === "string" ? mobile.trim() : null,
      p_job_title: typeof jobTitle === "string" ? jobTitle.trim() : null,
    });
    if (!account?.id || !account.full_name_ar) throw new Error("invalid self-profile response");
    return NextResponse.json({ saved: true, account }, { headers });
  } catch (error) { return failure(error, "تعذر حفظ بيانات حسابك. بقيت مدخلاتك محفوظة في الصفحة."); }
}
