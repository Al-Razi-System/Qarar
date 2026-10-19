import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { apiError, requestId } from "@/shared/api/response";
import { logEvent } from "@/shared/observability/logger";
import { watchVoting } from "@/features/meetings/server/voting-events";
import { votingSnapshot, votingStream } from "@/features/meetings/server/voting-stream";
import type { MyVote, VotingRound } from "@/features/meetings/model/live-meeting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ meetingId: string }> }) {
  const id = requestId(request); const { meetingId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId)) return apiError("معرّف الاجتماع غير صالح.", 400, "22023", id);
  let keys = [`meeting:${meetingId}`];
  async function read(signal: AbortSignal) {
    const options = { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) };
    // Recheck resource authority on EVERY snapshot, including an idle stream.
    await qararRpc("get_meeting_session_detail", { p_meeting_id: meetingId }, options);
    const [rounds, votes] = await Promise.all([
      qararRpc<VotingRound[]>("list_meeting_voting_rounds", { p_meeting_id: meetingId }, options),
      qararRpc<MyVote[]>("get_my_open_votes", { p_meeting_id: meetingId }, options),
    ]);
    keys = [`meeting:${meetingId}`, ...rounds.filter(round => round.status === "open").map(round => `round:${round.id}`)];
    return votingSnapshot(rounds, votes);
  }
  function failure(error: unknown) {
    const safe = safeAdminError(error, "تعذر تحديث التصويت. جارٍ محاولة إعادة الاتصال.", 503);
    logEvent("warn", "meeting.voting.stream.failed", { request_id: id, status: safe.status, code: safe.code, cause: error instanceof Error ? error.message : String(error) });
    return { safe, terminal: [401, 403, 404].includes(safe.status) || safe.code === "42501" || safe.code === "P0002" };
  }
  try {
    const initial = await read(request.signal);
    return new Response(votingStream({ initial, read, signal: request.signal, subscribe: wake => watchVoting(() => keys, wake),
      onError: error => { const { safe, terminal } = failure(error); return { message: safe.message, terminal }; },
    }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no", "x-request-id": id } });
  } catch (error) {
    const { safe } = failure(error);
    return apiError(safe.message, safe.status, safe.code, id);
  }
}
