import { NextResponse } from "next/server";
import { qararRpcV2 } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
type Context = { params: Promise<{ userId: string }> };
function failure(error: unknown) {
  const traceId = crypto.randomUUID(); const safe = safeAdminError(error, "تعذر حفظ أو تحميل نطاق التقديم.", 500);
  if (safe.status >= 500) console.error("user submission scope failure", { traceId, cause: error });
  return NextResponse.json({ message: safe.message, traceId }, { status: safe.code === "40001" ? 409 : safe.code === "42501" ? 403 : safe.status });
}
export async function GET(_request: Request, context: Context) {
  try {
    const { userId } = await context.params;
    if (!uuid(userId)) return NextResponse.json({ message: "المستخدم غير صالح." }, { status: 400 });
    const result = await qararRpcV2("get_user_submission_scope_v2", { p_user_id: userId });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  const origin = rejectUntrustedMutation(request); if (origin) return origin;
  try {
    const { userId } = await context.params;
    const parsed = await readJsonObject(request); if (!parsed.ok) return parsed.response;
    const { revision, homeUnitId, rules, requestId } = parsed.value;
    if (!uuid(userId) || !uuid(requestId) || !Number.isSafeInteger(revision) || Number(revision)<0 || (homeUnitId !== null && !uuid(homeUnitId)) || !Array.isArray(rules) || rules.length>100) return NextResponse.json({ message: "إعداد نطاق التقديم غير صالح." }, { status: 400 });
    const result = await qararRpcV2("save_user_submission_scope_v2", { p_user_id: userId, p_expected_revision: revision, p_home_unit_id: homeUnitId, p_rules: rules, p_request_id: requestId });
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}
