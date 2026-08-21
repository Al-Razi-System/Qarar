import { NextResponse } from "next/server";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const contracts = new Set([
  "search_meetings", "create_meeting", "get_meeting_detail", "update_meeting",
  "transition_meeting", "get_sprint02_form_options",
  "admin_list_meeting_types", "admin_create_meeting_type", "admin_update_meeting_type",
  "search_eligible_agenda_topics", "add_agenda_item", "remove_agenda_item", "reorder_agenda_items",
  "open_meeting_session", "get_meeting_session_detail", "lock_attendance_roster",
  "create_checkin_session", "revoke_checkin_session", "self_check_in",
  "override_attendance", "verify_attendance", "recalculate_meeting_quorum",
  "apply_quorum_failure", "get_attendance_history",
  "open_voting_round", "get_voting_round_detail", "get_my_open_votes",
  "cast_vote", "close_voting_round", "cancel_voting_round",
  "create_decision_from_voting_round", "list_meeting_decisions", "list_meeting_voting_rounds",
  "update_agenda_discussion", "complete_meeting_session",
  "send_meeting_invitations",
  "get_meeting_readiness",
  "get_meeting_minutes", "save_meeting_minutes_draft", "submit_meeting_minutes",
  "respond_meeting_minutes_approval",
]);

export async function POST(request: Request) {
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
    const data = await qararRpc<unknown>(contract, params ?? {});
    return NextResponse.json({ data });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ العملية.", 500);
    return NextResponse.json({ error: { code: safeError.code, message: safeError.message } }, { status: safeError.status });
  }
}
