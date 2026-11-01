import { NextResponse } from "next/server";
import { qararRpc, qararRpcV2 } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
import { randomUUID } from "node:crypto";
import { logEvent } from "@/shared/observability/logger";

const operations = {
  roleDetail: "admin_get_role_detail",
  upsertRole: "admin_upsert_role",
  reactivateRole: "admin_upsert_role",
  deactivateRole: "admin_deactivate_role",
  upsertPermission: "admin_upsert_permission",
  requestRoleChange: "admin_request_role_permissions_change",
  saveRolePermissions: "set_role_permissions_direct_v2",
  reviewIamChange: "admin_review_iam_change",
  requestOffboarding: "admin_request_user_offboarding",
  reviewOffboarding: "admin_review_user_offboarding",
} as const;

export async function GET() {
  try {
    const result = await qararRpc("admin_list_iam_approval_requests", {
      p_status: "pending",
    });
    return NextResponse.json(result ?? { iam_changes: [], offboarding: [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تحميل طلبات الاعتماد.");
    return NextResponse.json(
      { message: safeError.message },
      { status: safeError.status },
    );
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
    let parameters = payload;
    if (operation === "reactivateRole") {
      const role = await qararRpc<{
        id: string;
        code: string;
        name_ar: string;
        name_en?: string;
        description?: string;
        role_scope: string;
        is_active: boolean;
      }>("admin_get_role_detail", { p_role_id: payload.p_role_id });
      if (role.is_active)
        return NextResponse.json(
          { message: "الدور نشط بالفعل. أعد تحميل البيانات." },
          { status: 409 },
        );
      parameters = {
        p_role_id: role.id,
        p_code: role.code,
        p_name_ar: role.name_ar,
        p_name_en: role.name_en ?? null,
        p_description: role.description ?? null,
        p_role_scope: role.role_scope,
        p_is_active: true,
      };
    } else if (operation === "upsertRole") {
      if (
        "p_code" in payload ||
        typeof payload.p_name_ar !== "string" ||
        !payload.p_name_ar.trim()
      ) {
        return NextResponse.json(
          { message: "اكتب اسم الدور دون إدخال رمز تقني." },
          { status: 400 },
        );
      }
      const existing = payload.p_role_id
        ? await qararRpc<{
            code: string;
            name_en?: string;
            role_scope: string;
            is_active: boolean;
          }>("admin_get_role_detail", { p_role_id: payload.p_role_id })
        : null;
      const scope =
        existing?.role_scope ?? payload.p_role_scope ?? "governance_unit";
      if (
        !existing &&
        !["governance_unit", "organization", "execution"].includes(
          String(scope),
        )
      ) {
        return NextResponse.json(
          { message: "اختر نطاقًا صالحًا للدور." },
          { status: 400 },
        );
      }
      parameters = {
        p_role_id: payload.p_role_id || null,
        p_code: existing?.code ?? `role_${randomUUID().replaceAll("-", "")}`,
        p_name_ar: payload.p_name_ar.trim(),
        p_name_en: existing?.name_en ?? null,
        p_description:
          typeof payload.p_description === "string"
            ? payload.p_description.trim() || null
            : null,
        p_role_scope: scope,
        p_is_active: existing ? existing.is_active : true,
      };
    }
    const result = operation === "saveRolePermissions"
      ? await qararRpcV2(rpcName, parameters)
      : await qararRpc(rpcName, parameters);
    return NextResponse.json(result ?? { success: true });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ العملية.");
    const traceId = randomUUID();
    logEvent("error", "iam.administrative_operation.failed", {
      traceId,
      cause: error instanceof Error ? error.message : String(error),
      code: safeError.code,
    });
    const status =
      safeError.code === "42501"
        ? 403
        : safeError.code === "40001" || safeError.code === "23505"
          ? 409
          : safeError.status;
    return NextResponse.json(
      { message: safeError.message, traceId },
      { status },
    );
  }
}
