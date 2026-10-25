import type { MyVote, VotingRound } from "../model/live-meeting";
import type { RoomChange } from "./voting-events";
export type VotingSnapshot = { rounds: VotingRound[]; votes: MyVote[] };

/** Defence in depth: even a future contract field cannot leak an open ballot. */
export function votingSnapshot(rounds: VotingRound[], votes: MyVote[]): VotingSnapshot {
  return {
    rounds: rounds.map(round => ({ id: round.id, agenda_item_id: round.agenda_item_id, status: round.status,
      result: round.status === "closed" ? round.result : undefined, eligible_voter_count: round.eligible_voter_count,
      votes_cast_count: round.votes_cast_count, closed_at: round.closed_at,
      participation: round.participation?.map(person => ({ user_id: person.user_id, full_name_ar: person.full_name_ar, has_voted: person.has_voted })),
      ...(round.status === "closed" ? { approve_count: round.approve_count, reject_count: round.reject_count, abstain_count: round.abstain_count, tie_break_applied: round.tie_break_applied } : {}),
    })),
    votes: votes.map(vote => ({ voting_round_id: vote.voting_round_id, title_ar: vote.title_ar, has_voted: vote.has_voted })),
  };
}

export function votingStream({ initial, read, subscribe, signal, onError, room, pollMs = 1000, maxMs = 50_000 }: {
  initial: VotingSnapshot; read: (signal: AbortSignal) => Promise<VotingSnapshot>;
  subscribe: (wake: () => void) => () => void; signal: AbortSignal;
  onError: (error: unknown) => { message: string; terminal: boolean };
  /** The room's change signal: a revision and a scope, never meeting data. */
  room?: { revision: () => number; watch: (notify: (change: RoomChange) => void) => () => void };
  pollMs?: number; maxMs?: number;
}) {
  let close = () => {};
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder(); const abort = new AbortController();
      let stopped = false; let reading = false; let queued = false;
      let previous = JSON.stringify(initial);
      const send = (value: string) => { if (!stopped) controller.enqueue(encoder.encode(value)); };
      let unsubscribe = () => {};
      let unwatchRoom = () => {};
      close = () => {
        if (stopped) return;
        stopped = true; abort.abort(); clearInterval(interval); clearTimeout(deadline);
        unsubscribe(); unwatchRoom(); signal.removeEventListener("abort", close); if (!cancelled) controller.close();
      };
      const sendRoom = (change: RoomChange) => send(`event: room\ndata: ${JSON.stringify({ revision: change.revision, scope: change.scope })}\n\n`);
      async function refresh() {
        if (stopped) return;
        if (reading) { queued = true; return; }
        reading = true;
        try {
          const next = JSON.stringify(await read(abort.signal));
          if (next !== previous) { previous = next; send(`event: voting\ndata: ${next}\n\n`); }
          else send(": heartbeat\n\n");
        } catch (error) {
          if (!stopped) { send(`event: voting-error\ndata: ${JSON.stringify(onError(error))}\n\n`); close(); }
        } finally {
          reading = false;
          if (queued && !stopped) { queued = false; void refresh(); }
        }
      }
      const interval = setInterval(() => { void refresh(); }, pollMs);
      const deadline = setTimeout(close, maxMs);
      send(`retry: 1000\nevent: voting\ndata: ${previous}\n\n`);
      if (room) { sendRoom({ revision: room.revision(), scope: "sync" }); unwatchRoom = room.watch(sendRoom); }
      unsubscribe = subscribe(() => { void refresh(); });
      if (stopped) { unsubscribe(); unwatchRoom(); }
      signal.addEventListener("abort", close, { once: true });
      if (signal.aborted) close();
    },
    cancel() { cancelled = true; close(); },
  });
}
