import { NextResponse } from "next/server";
import { qararRpc, qararRpcV2, requireQararSession } from "@/shared/api/qarar-server";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
type Envelope = { ok: boolean; data?: unknown; error_code?: string; message_ar?: string; trace_id: string };
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function reply(value: Envelope) {
  return NextResponse.json(value.ok ? { data: value.data } : { error: { message: value.message_ar ?? "تعذر إتمام العملية.", traceId: value.trace_id } },
    { status: value.ok ? 200 : value.error_code === "MODEL_PERMISSION_DENIED" ? 403 : value.error_code === "MODEL_VERSION_CONFLICT" ? 409 : value.error_code === "MODEL_SERVER_FAILURE" ? 500 : 400, headers: { "Cache-Control": "no-store" } });
}
function failure(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") return NextResponse.json({ error: { message: "انتهت الجلسة؛ سجل الدخول مجددًا." } }, { status: 401 });
  const traceId = crypto.randomUUID();
  console.error("typed-topics failure", { traceId, cause: error });
  return NextResponse.json({ error: { message: "تعذر الاتصال بخدمة الموضوعات.", traceId } }, { status: 502 });
}
export async function GET(request: Request) {
  try {
    await requireQararSession(); const query = new URL(request.url).searchParams;
    const unit = query.get("unitId"), version = query.get("versionId");
    if ((unit !== null && !uuid(unit)) || (version !== null && (!uuid(version) || !unit))) return NextResponse.json({ error: { message: "المجلس أو التصنيف غير صالح." } }, { status: 400 });
    if (!unit) return NextResponse.json({ data: await qararRpc("get_topic_form_options", {}) }, { headers: { "Cache-Control": "no-store" } });
    return reply(await qararRpcV2<Envelope>(version ? "prepare_typed_topic_v2" : "list_effective_topic_types_v2", version ? { p_version_id: version, p_unit_id: unit } : { p_origin_governance_unit_id: unit }));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const origin = rejectUntrustedMutation(request); if (origin) return origin;
  try {
    await requireQararSession(); const parsed = await readJsonObject(request); if (!parsed.ok) return parsed.response;
    const { title, description, versionId, unitId, requestId } = parsed.value;
    if (!uuid(versionId) || !uuid(unitId) || !uuid(requestId) || typeof title !== "string" || title.trim().length < 5 || title.length > 300 || typeof description !== "string" || description.trim().length < 10 || description.length > 10000) return NextResponse.json({ error: { message: "أكمل المجلس والتصنيف وعنوان الموضوع ووصفه." } }, { status: 400 });
    return reply(await qararRpcV2<Envelope>("create_topic_from_type_v2", { p_title_ar: title.trim(), p_description: description.trim(), p_topic_type_version_id: versionId, p_current_unit_id: unitId, p_client_request_id: requestId }));
  } catch (error) { return failure(error); }
}
