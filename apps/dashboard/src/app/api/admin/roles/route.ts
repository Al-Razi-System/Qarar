import { NextResponse } from "next/server";
import { qararRpc, QararApiError } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || null;
    const scope = searchParams.get("scope") || null;
    const activeOnly = searchParams.get("active_only") === "true";

    const roles = await qararRpc("admin_list_roles", {
      p_query: query,
      p_scope: scope,
      p_active_only: activeOnly,
    });

    return NextResponse.json(roles);
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر جلب الأدوار.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  const parsedBody = await readJsonObject(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const body = parsedBody.value;
    const { action, ...params } = body;

    let result;
    if (action === "upsert_role") {
      result = await qararRpc("admin_upsert_role", {
        p_role_id: params.role_id || null,
        p_code: params.code,
        p_name_ar: params.name_ar,
        p_name_en: params.name_en || null,
        p_description: params.description || null,
        p_role_scope: params.role_scope || "governance_unit",
        p_is_active: params.is_active ?? true,
      });
    } else if (action === "deactivate_role") {
      result = await qararRpc("admin_deactivate_role", {
        p_role_id: params.role_id,
        p_reason: params.reason || "إيقاف إداري من الواجهة",
      });
    } else if (action === "request_permissions_change") {
      result = await qararRpc("admin_request_role_permissions_change", {
        p_role_id: params.role_id,
        p_permission_codes: params.permission_codes,
        p_justification: params.justification,
      });
    } else if (action === "import_matrix") {
      result = await qararRpc("admin_request_permission_matrix_import", {
        p_matrix_json: params.matrix_json,
        p_justification: params.justification,
      });
    } else {
      return NextResponse.json({ message: "إجراء غير مدعوم." }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ العملية.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}
