import { NextResponse } from "next/server";
import { qararRpc, requireQararSession } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const contracts = new Set([
  "search_my_topics", "search_topic_review_queue", "create_topic",
  "get_topic_detail", "get_topic_form_options", "get_topic_route_history",
  "review_topic", "refer_topic", "respond_topic_referral",
  "get_topic_governance", "get_topic_workflow", "act_topic_workflow_step",
  "get_topic_regulation_options", "get_topic_regulation_tree", "get_topic_regulation_preview", "get_topic_regulation_route_preview", "create_topic_with_selected_regulation",
  "create_topic_with_regulation_bundle", "list_topic_regulation_references",
  "get_topic_governance_summary", "request_custom_workflow",
  "create_topic_exception_request", "get_topic_exception_workflow_options",
  "list_topic_attachments", "add_topic_attachment", "remove_topic_attachment",
  "get_topic_requirements_status", "fulfill_topic_requirement", "get_topic_meeting_history",
]);

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  try {
    await requireQararSession();
    const parsedBody = await readJsonObject(request);
    if (!parsedBody.ok) return parsedBody.response;

    const { contract, params } = parsedBody.value;
    if (typeof contract !== "string" || !contracts.has(contract)) {
      return NextResponse.json({ error: { message: "عملية غير مدعومة." } }, { status: 400 });
    }
    if (params !== undefined && !isJsonObject(params)) {
      return NextResponse.json({ error: { message: "معاملات العملية غير صالحة." } }, { status: 400 });
    }
    const data = await qararRpc<unknown>(contract, params ?? {});
    return NextResponse.json({ data });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ العملية.", 500);
    return NextResponse.json({ error: { code: safeError.code, message: safeError.message } }, { status: safeError.status });
  }
}
