import { NextResponse } from "next/server";
import { qararRpc, qararRpcV2 } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
import { apiError, apiSuccess, requestId } from "@/shared/api/response";
import { logEvent } from "@/shared/observability/logger";

const contracts = new Set([
  "search_meetings", "create_meeting", "create_meeting_series", "create_meeting_series_from_existing", "list_meeting_series", "update_meeting_series_recurrence", "get_meeting_detail", "get_completed_meeting_record", "list_meeting_topic_attachments", "update_meeting",
  "transition_meeting", "get_sprint02_form_options",
  "admin_list_meeting_types", "admin_create_meeting_type", "admin_update_meeting_type",
  "search_eligible_agenda_topics", "add_agenda_item", "remove_agenda_item", "reorder_agenda_items",
  "open_meeting_session", "get_meeting_session_detail", "lock_attendance_roster",
  "create_checkin_session", "revoke_checkin_session", "self_check_in",
  "override_attendance", "verify_attendance", "recalculate_meeting_quorum",
  "apply_quorum_failure", "get_attendance_history",
  "open_voting_round", "get_voting_round_detail", "get_my_open_votes",
  "cast_vote", "close_voting_round", "cancel_voting_round",
  "create_decision_from_voting_round", "update_meeting_decision_text", "list_meeting_decisions", "list_meeting_voting_rounds",
  "update_agenda_discussion", "complete_meeting_session",
  "send_meeting_invitations",
  "send_meeting_invitations_v2",
  "get_meeting_readiness",
  "get_meeting_minutes", "save_meeting_minutes_draft", "submit_meeting_minutes",
  "respond_meeting_minutes_approval", "generate_meeting_minutes_draft",
  "sign_meeting_minutes_approval",
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
    const data = await (contract.endsWith("_v2") ? qararRpcV2<unknown>(contract, params ?? {}) : qararRpc<unknown>(contract, params ?? {}));
    return apiSuccess(data, id);
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ العملية.", 500);
    logEvent(safeError.status < 500 ? "warn" : "error", "meeting.operation.failed", {
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
