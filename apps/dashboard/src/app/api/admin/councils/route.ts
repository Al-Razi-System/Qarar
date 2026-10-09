import { NextResponse } from "next/server";
import { qararRpc, qararRpcV2, QararApiError } from "@/shared/api/qarar-server";
import { apiError, apiSuccess, requestId } from "@/shared/api/response";
import { readJsonObject } from "@/shared/security/json-body";
import { safeAdminError } from "@/shared/security/admin-error";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
import { logEvent } from "@/shared/observability/logger";

const contracts = new Set([
  "admin_get_council_organizational_tree_v2",
  "get_council_form_options",
  "admin_search_councils",
  "admin_get_council_detail",
  "admin_get_councils_tree",
  "admin_create_council",
  "admin_create_council_v2",
  "admin_create_organizational_unit_v2",
  "admin_list_organizational_units_v2",
  "admin_create_organizational_unit_type_v2",
  "admin_update_organizational_unit_v2",
  "admin_update_council",
  "admin_move_council",
  "admin_validate_council_administrative_readiness",
  "admin_activate_council",
  "admin_deactivate_council",
  "admin_archive_council",
  "admin_list_council_members",
  "admin_add_council_member",
  "admin_update_council_membership",
  "admin_end_council_membership",
  "admin_assign_council_leadership",
]);

type RequestBody = { contract?: unknown; params?: unknown };

export async function POST(request: Request) {
  const id = requestId(request);
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;
  const parsed = await readJsonObject(request, { maxBytes: 64 * 1024 });
  if (!parsed.ok) return parsed.response;
  try {
    const body = parsed.value as RequestBody;
    const contract = typeof body.contract === "string" ? body.contract : "";
    if (!contracts.has(contract)) return apiError("العقد المطلوب غير مسموح.", 400, "INVALID_CONTRACT", id);
    const params = body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? body.params as Record<string, unknown>
      : {};
    return apiSuccess(await (contract.endsWith("_v2") ? qararRpcV2<unknown>(contract, params) : qararRpc<unknown>(contract, params)), id);
  } catch (error) {
    logEvent(error instanceof QararApiError && error.status < 500 ? "warn" : "error", "council.operation.failed", {
      request_id: id,
      cause: error instanceof Error ? error.message : "UNKNOWN_FAILURE",
      ...(error instanceof QararApiError ? { code: error.code, status: error.status } : {}),
    });
    if (error instanceof QararApiError) {
      const safe = safeAdminError(error, "تعذر تنفيذ عملية المجلس.");
      return apiError(safe.message, safe.status, safe.code, id);
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "انتهت الجلسة. سجل الدخول مرة أخرى." } }, { status: 401 });
    }
    return apiError("حدث خطأ غير متوقع أثناء إدارة المجلس.", 500, "INTERNAL_ERROR", id);
  }
}
