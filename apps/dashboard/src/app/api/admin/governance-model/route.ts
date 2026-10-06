import { NextResponse } from "next/server";
import { QararApiError, qararRpcV2, requireQararSession } from "@/shared/api/qarar-server";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

type V2Envelope<T> = {
  ok: boolean;
  data?: T;
  error_code?: string;
  message_ar?: string;
  field_errors?: unknown[];
  trace_id: string;
};

function envelopeResponse<T>(envelope: V2Envelope<T>) {
  if (envelope.ok) return NextResponse.json({ data: envelope.data, traceId: envelope.trace_id }, { headers: { "Cache-Control": "no-store" } });
  const status = envelope.error_code === "MODEL_PERMISSION_DENIED" ? 403
    : envelope.error_code === "MODEL_BUNDLE_NOT_FOUND" ? 404
      : envelope.error_code === "MODEL_VERSION_CONFLICT" ? 409
        : envelope.error_code === "MODEL_SERVER_FAILURE" ? 500 : 400;
  return NextResponse.json({ error: { code: envelope.error_code ?? "MODEL_SERVER_FAILURE", message: envelope.message_ar ?? "تعذر تنفيذ العملية.", fieldErrors: envelope.field_errors ?? [], traceId: envelope.trace_id } }, { status, headers: { "Cache-Control": "no-store" } });
}

function unexpected(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "انتهت الجلسة. سجل الدخول مرة أخرى." } }, { status: 401 });
  if (error instanceof QararApiError) return NextResponse.json({ error: { code: error.code ?? "UPSTREAM_ERROR", message: "تعذر الاتصال بخدمة الحوكمة حالياً." } }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
  return NextResponse.json({ error: { code: "UNEXPECTED_ERROR", message: "حدث خطأ غير متوقع أثناء تنفيذ العملية." } }, { status: 500 });
}

export async function GET() {
  try {
    await requireQararSession();
    const envelope = await qararRpcV2<V2Envelope<unknown>>("get_governance_authoring_options_v2", {});
    return envelopeResponse(envelope);
  } catch (error) { return unexpected(error); }
}

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;
  try {
    await requireQararSession();
    const parsed = await readJsonObject(request);
    if (!parsed.ok) return parsed.response;
    const { bundleId, expectedLockVersion, clientRequestId, bundle } = parsed.value;
    if (typeof clientRequestId !== "string" || !/^[0-9a-f-]{36}$/i.test(clientRequestId) || !isJsonObject(bundle)) {
      return NextResponse.json({ error: { code: "INVALID_DRAFT", message: "بيانات المسودة أو مفتاح الطلب غير صالح." } }, { status: 400 });
    }
    if (bundleId !== null && bundleId !== undefined && typeof bundleId !== "string") {
      return NextResponse.json({ error: { code: "INVALID_DRAFT", message: "معرف المسودة غير صالح." } }, { status: 400 });
    }
    if (expectedLockVersion !== null && expectedLockVersion !== undefined && (!Number.isInteger(expectedLockVersion) || Number(expectedLockVersion) < 1)) {
      return NextResponse.json({ error: { code: "INVALID_DRAFT", message: "نسخة المسودة غير صالحة." } }, { status: 400 });
    }
    const envelope = await qararRpcV2<V2Envelope<unknown>>("save_governance_bundle_draft_v2", {
      p_bundle_id: bundleId ?? null,
      p_expected_lock_version: expectedLockVersion ?? null,
      p_client_request_id: clientRequestId,
      p_bundle: bundle,
    });
    return envelopeResponse(envelope);
  } catch (error) { return unexpected(error); }
}
