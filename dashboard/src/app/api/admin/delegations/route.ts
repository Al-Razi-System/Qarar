import { NextResponse } from "next/server";
import { qararRpc, QararApiError } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  const parsedBody = await readJsonObject(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const body = parsedBody.value;
    const { action, ...params } = body;

    let result;
    if (action === "create_delegation") {
      result = await qararRpc("admin_create_delegation", {
        p_source_membership_id: params.source_membership_id,
        p_delegated_to_user_id: params.delegated_to_user_id,
        p_starts_at: params.starts_at,
        p_ends_at: params.ends_at,
        p_reason: params.reason,
      });
    } else if (action === "revoke_delegation") {
      result = await qararRpc("admin_revoke_delegation", {
        p_delegation_id: params.delegation_id,
        p_reason: params.reason || "إلغاء مبكر للتفويض من الواجهة",
      });
    } else {
      return NextResponse.json({ message: "الإجراء غير مدعوم." }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ عملية التفويض.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}
