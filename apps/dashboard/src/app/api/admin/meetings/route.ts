import { NextResponse } from "next/server";
import { qararRpc, qararRpcV2 } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
import { apiError, apiSuccess, requestId } from "@/shared/api/response";
import { logEvent } from "@/shared/observability/logger";
import { notifyRoomChange, notifyVotingMutation, roomScopeOf } from "@/features/meetings/server/voting-events";

const contracts = new Set([
  "save_meeting_with_quorum_v2",
  "search_meetings", "create_meeting", "create_meeting_series", "create_meeting_series_from_existing", "list_meeting_series", "update_meeting_series_recurrence", "get_meeting_detail", "get_completed_meeting_record", "list_meeting_topic_attachments", "update_meeting",
  "transition_meeting", "get_sprint02_form_options",
  "admin_list_meeting_types", "admin_create_meeting_type", "admin_update_meeting_type",
  "search_eligible_agenda_topics", "add_agenda_item", "remove_agenda_item", "reorder_agenda_items",
  "get_topic_return_option", "return_topic_to_previous_council",
  "open_meeting_session", "get_meeting_session_start_timing_v2", "get_meeting_session_detail", "list_meeting_member_profiles_v2", "lock_attendance_roster",
  "get_meeting_broadcast_v2", "set_meeting_broadcast_v2", "hand_over_meeting_broadcast_v2",
  "set_meeting_broadcast_document_v2", "set_agenda_item_downloads_v2",
  "list_meeting_item_timers_v2", "set_agenda_item_planned_minutes_v2",
  "list_meeting_referrals_v2", "refer_agenda_item_v2",
  "list_meeting_assignments_v2", "search_meeting_assignment_options_v2", "propose_meeting_assignment_v2", "confirm_meeting_assignment_v2", "withdraw_meeting_assignment_v2",
  "create_checkin_session", "revoke_checkin_session", "self_check_in",
  "override_attendance", "verify_attendance", "recalculate_meeting_quorum",
  "apply_quorum_failure", "get_attendance_history",
  "open_voting_round", "get_voting_round_detail", "get_my_open_votes",
  "cast_vote", "close_voting_round", "cancel_voting_round",
  "create_decision_from_voting_round", "update_meeting_decision_text", "list_meeting_decisions", "list_meeting_voting_rounds",
  "list_pending_rejected_vote_resolutions", "resolve_rejected_vote",
  "update_agenda_discussion", "complete_meeting_session", "save_agenda_topic_instructions",
  "send_meeting_invitations",
  "send_meeting_invitations_v2",
  "get_meeting_readiness",
  "get_meeting_minutes", "save_meeting_minutes_draft", "submit_meeting_minutes",
  "respond_meeting_minutes_approval", "generate_meeting_minutes_draft",
  "sign_meeting_minutes_approval",
]);
const cancellableReadContracts = new Set([
  "search_meetings", "list_meeting_series", "get_meeting_detail", "get_completed_meeting_record", "get_meeting_session_start_timing_v2",
  "list_meeting_topic_attachments", "get_sprint02_form_options", "search_eligible_agenda_topics", "get_meeting_readiness",
  "get_topic_return_option", "list_pending_rejected_vote_resolutions",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AGENDA_CONTEXT_CONTRACTS = new Set([
  "update_agenda_discussion", "set_agenda_item_downloads_v2", "set_agenda_item_planned_minutes_v2",
  "refer_agenda_item_v2", "propose_meeting_assignment_v2", "open_voting_round",
]);
const ROUND_CONTEXT_CONTRACTS = new Set(["cast_vote", "close_voting_round", "cancel_voting_round", "create_decision_from_voting_round", "resolve_rejected_vote"]);

function objectOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function rowsOf(value: unknown, key?: string): Record<string, unknown>[] {
  const nested = key ? objectOf(value)?.[key] : value;
  return Array.isArray(nested) ? nested.map(objectOf).filter((row): row is Record<string, unknown> => Boolean(row)) : [];
}

/**
 * A room id supplied by the browser is only a routing hint. When the write did
 * not itself name/return its meeting, bind that hint to the mutated resource
 * through an authorised read before waking any listeners.
 */
async function headerMatchesMutation(contract: string, meetingId: string, params: Record<string, unknown>, result: unknown) {
  try {
    if (AGENDA_CONTEXT_CONTRACTS.has(contract)) {
      const agendaItemId = params.p_agenda_item_id ?? objectOf(result)?.agenda_item_id ?? objectOf(result)?.id;
      if (typeof agendaItemId !== "string") return false;
      const detail = await qararRpc<unknown>("get_meeting_detail", { p_meeting_id: meetingId });
      return rowsOf(objectOf(detail)?.agenda_items).some(row => row.id === agendaItemId);
    }
    if (ROUND_CONTEXT_CONTRACTS.has(contract)) {
      const roundId = params.p_voting_round_id ?? objectOf(result)?.voting_round_id;
      if (typeof roundId !== "string") return false;
      const rounds = await qararRpc<unknown>("list_meeting_voting_rounds", { p_meeting_id: meetingId });
      return rowsOf(rounds).some(row => row.id === roundId);
    }
    if (contract === "update_meeting_decision_text") {
      const decisionId = params.p_decision_id ?? objectOf(result)?.id;
      const decisions = await qararRpc<unknown>("list_meeting_decisions", { p_meeting_id: meetingId });
      return typeof decisionId === "string" && rowsOf(decisions).some(row => row.id === decisionId);
    }
    if (contract === "confirm_meeting_assignment_v2" || contract === "withdraw_meeting_assignment_v2") {
      const assignmentId = params.p_assignment_id ?? objectOf(result)?.id;
      const assignments = await qararRpcV2<unknown>("list_meeting_assignments_v2", { p_meeting_id: meetingId });
      return typeof assignmentId === "string" && rowsOf(assignments, "assignments").some(row => row.id === assignmentId);
    }
    if (contract === "verify_attendance" || contract === "override_attendance") {
      const attendanceId = params.p_attendance_record_id ?? objectOf(result)?.id;
      const session = objectOf(await qararRpc<unknown>("get_meeting_session_detail", { p_meeting_id: meetingId }));
      return typeof attendanceId === "string" && rowsOf(session?.attendance).some(row => row.id === attendanceId);
    }
    if (contract === "revoke_checkin_session") {
      const checkinId = params.p_session_id ?? params.p_checkin_session_id ?? objectOf(result)?.id;
      const session = objectOf(await qararRpc<unknown>("get_meeting_session_detail", { p_meeting_id: meetingId }));
      return typeof checkinId === "string" && objectOf(session?.checkin_session)?.id === checkinId;
    }
  } catch {
    // The mutation already succeeded. A failed contextual read must not turn it
    // into a false failure; it only suppresses an untrusted fast-path wake-up.
  }
  return false;
}

/**
 * The meeting whose screens a successful write should tell. The live room names
 * itself in a header because many of its writes carry only an item or a round.
 * The header grants nothing: it only asks that meeting's screens to read again,
 * each with its own authority.
 */
async function roomMeetingId(request: Request, params: Record<string, unknown>, result: unknown, hintedContext: Promise<boolean> | null) {
  const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const trusted = params.p_meeting_id ?? data.meeting_id;
  if (typeof trusted === "string" && UUID.test(trusted)) return trusted;
  const hinted = request.headers.get("x-qarar-meeting-id");
  if (typeof hinted !== "string" || !UUID.test(hinted)) return null;
  return hintedContext && await hintedContext ? hinted : null;
}

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
    const call = contract.endsWith("_v2")
      ? qararRpcV2<unknown>(contract, params ?? {})
      : qararRpc<unknown>(contract, params ?? {}, cancellableReadContracts.has(contract) ? { signal: request.signal } : {});
    // Validate an untrusted room hint alongside the mutation, not after it, so
    // binding the event to its resource does not add another network roundtrip
    // to the user's action.
    const hinted = request.headers.get("x-qarar-meeting-id");
    const hintedContext = typeof hinted === "string" && UUID.test(hinted)
      ? headerMatchesMutation(contract, hinted, params ?? {}, null)
      : null;
    const data = await call;
    const meetingId = await roomMeetingId(request, params ?? {}, data, hintedContext);
    notifyVotingMutation(contract, params ?? {}, data, meetingId);
    const scope = roomScopeOf(contract);
    if (scope && meetingId) notifyRoomChange(meetingId, scope);
    return apiSuccess(data, id);
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ العملية.", 500);
    const message = safeError.code === "QUERY_TIMEOUT" && parsedBody.value.contract === "search_meetings"
      ? "استغرق تحميل الاجتماعات وقتًا أطول من المتوقع. أعد المحاولة بعد لحظات."
      : safeError.message;
    logEvent(safeError.status < 500 ? "warn" : "error", "meeting.operation.failed", {
      request_id: id,
      contract: typeof parsedBody.value.contract === "string" ? parsedBody.value.contract : "unknown",
      status: safeError.status,
      code: safeError.code,
      upstreamCode: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(message, safeError.status, safeError.code, id);
  }
}
