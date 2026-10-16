import { NextResponse } from "next/server";
import { qararRpcV2 } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
import { apiError, apiSuccess, requestId } from "@/shared/api/response";
import { logEvent } from "@/shared/observability/logger";

const contracts = new Set([
  "list_my_tasks_v2", "get_task_v2", "start_task_v2", "update_task_progress_v2",
  "submit_task_completion_v2", "verify_task_completion_v2", "return_task_v2",
]);

export async function POST(request: Request) {
  const id = requestId(request);
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  const parsedBody = await readJsonObject(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const { contract, params } = parsedBody.value;
    if (typeof contract !== "string" || !contracts.has(contract)) {
      return NextResponse.json({ error: { message: "عملية غير مدعومة." } }, { status: 400 });
    }
    if (params !== undefined && !isJsonObject(params)) {
      return NextResponse.json({ error: { message: "معاملات العملية غير صالحة." } }, { status: 400 });
    }
    return apiSuccess(await qararRpcV2<unknown>(contract, params ?? {}), id);
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ العملية.", 500);
    logEvent(safeError.status < 500 ? "warn" : "error", "task.operation.failed", {
      request_id: id,
      contract: typeof parsedBody.value.contract === "string" ? parsedBody.value.contract : "unknown",
      status: safeError.status,
      code: safeError.code,
      upstreamCode: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(safeError.message, safeError.status, safeError.code, id);
  }
}
