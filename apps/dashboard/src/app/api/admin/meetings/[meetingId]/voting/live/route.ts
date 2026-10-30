import { createHash } from "node:crypto";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { apiError, requestId } from "@/shared/api/response";
import { logEvent } from "@/shared/observability/logger";
import { roomRevision, watchRemoteMeetingEvents, watchRoom, watchVoting } from "@/features/meetings/server/voting-events";
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
    const room = await qararRpc<{ updated_at?: string; agenda_items?: Array<{ id?: string; updated_at?: string; agenda_status?: string }> }>("get_meeting_detail", { p_meeting_id: meetingId }, options);
    const roomRevision = createHash("sha256").update(JSON.stringify({
      meeting: room.updated_at ?? null,
      agenda: (room.agenda_items ?? []).map(item => [item.id, item.updated_at, item.agenda_status]),
    })).digest("base64url");
    const [rounds, votes] = await Promise.all([
      qararRpc<VotingRound[]>("list_meeting_voting_rounds", { p_meeting_id: meetingId }, options),
      qararRpc<MyVote[]>("get_my_open_votes", { p_meeting_id: meetingId }, options),
    ]);
    keys = [`meeting:${meetingId}`, ...rounds.filter(round => round.status === "open").map(round => `round:${round.id}`)];
    return votingSnapshot(rounds, votes, roomRevision);
  }
  function failure(error: unknown) {
    const safe = safeAdminError(error, "تعذر تحديث التصويت. جارٍ محاولة إعادة الاتصال.", 503);
    logEvent("warn", "meeting.voting.stream.failed", { request_id: id, status: safe.status, code: safe.code, cause: error instanceof Error ? error.message : String(error) });
    return { safe, terminal: [401, 403, 404].includes(safe.status) || safe.code === "42501" || safe.code === "P0002" };
  }
  try {
    const initialRoomRevision = roomRevision(meetingId);
    const initial = await read(request.signal);
    // Writes through this server wake the stream at once; the slower periodic
    // read covers writes that reach the database another way.
    return new Response(votingStream({ initial, read, signal: request.signal, subscribe: wake => {
      const stopVoting = watchVoting(() => keys, wake);
      const stopRemote = watchRemoteMeetingEvents(meetingId);
      return () => { stopVoting(); stopRemote(); };
    // Redis invalidation provides the immediate path. The database poll is a
    // recovery net only; running three authorised RPCs every second for every
    // open screen exhausted the local PostgREST pool and made room loads stall.
    }, pollMs: 10_000, maxMs: 5 * 60_000,
      room: { initialRevision: initialRoomRevision, revision: () => roomRevision(meetingId), watch: notify => watchRoom(meetingId, notify) },
      onError: error => { const { safe, terminal } = failure(error); return { message: safe.message, terminal }; },
    }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no", "x-request-id": id } });
  } catch (error) {
    const { safe } = failure(error);
    return apiError(safe.message, safe.status, safe.code, id);
  }
}
