import { NextResponse } from "next/server";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const operations = {
  roleDetail: "admin_get_role_detail",
  upsertRole: "admin_upsert_role",
  deactivateRole: "admin_deactivate_role",
  upsertPermission: "admin_upsert_permission",
  requestRoleChange: "admin_request_role_permissions_change",
  reviewIamChange: "admin_review_iam_change",
  requestOffboarding: "admin_request_user_offboarding",
  reviewOffboarding: "admin_review_user_offboarding",
} as const;

export async function GET() {
  try {
    const result = await qararRpc("admin_list_iam_approval_requests", { p_status: "pending" });
    return NextResponse.json(result ?? { iam_changes: [], offboarding: [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تحميل طلبات الاعتماد.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  const parsedBody = await readJsonObject(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const { operation, payload } = parsedBody.value;
    const rpcName = operations[operation as keyof typeof operations];
    if (!rpcName || !isJsonObject(payload)) {
      return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
    }
    const result = await qararRpc(rpcName, payload);
    return NextResponse.json(result ?? { success: true });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ العملية.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}
