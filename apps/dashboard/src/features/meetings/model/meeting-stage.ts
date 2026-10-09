import type { SeatStatus } from "@/shared/ui/member-seat";
import type { AgendaDiscussionItem, Attendance, Decision, LiveMeetingSession, VotingRound } from "./live-meeting";

export type StageSeat = {
  id: string;
  name: string;
  status: SeatStatus;
  /** Shown under the name while the seat is idle. Only the viewer's own role is known to the client. */
  roleLabel?: string;
  chair: boolean;
};

export type StagePhase =
  | { kind: "attendance"; present: number; total: number }
  | { kind: "idle"; item: AgendaDiscussionItem | null }
  | { kind: "discussion"; item: AgendaDiscussionItem }
  /** `cast` and `eligible` are null when the server did not return them to this viewer. */
  | { kind: "voting"; item: AgendaDiscussionItem | null; cast: number | null; eligible: number | null }
  | { kind: "result"; item: AgendaDiscussionItem; round: VotingRound }
  | { kind: "finished" };

export type MeetingStage = { seats: StageSeat[]; phase: StagePhase };

const FINISHED_AGENDA_STATES = ["discussed", "postponed"];

function latestClosedRound(rounds: VotingRound[], agendaItemId: string) {
  return [...rounds].reverse().find((round) => round.agenda_item_id === agendaItemId && round.status === "closed");
}

function attendanceSeatStatus(record: Attendance): SeatStatus {
  if (record.status === "excused") return "excused";
  if (record.status === "absent") return "absent";
  const attended = record.status === "present" || record.status === "late";
  const verified = record.verification_status === undefined || record.verification_status === "verified";
  return attended && verified ? "present" : "pending";
}

function isUnfinished(item: AgendaDiscussionItem, rounds: VotingRound[], decisions: Decision[]) {
  const closed = latestClosedRound(rounds, item.id);
  return !FINISHED_AGENDA_STATES.includes(item.agenda_status ?? "pending")
    || (item.requires_voting === true && !closed)
    || (closed?.result === "approved" && !decisions.some((decision) => decision.agenda_item_id === item.id));
}

/**
 * Derives the council-table scene from data the room has already loaded.
 * It is a pure read model: it never invents a count, a name or a vote that the
 * server did not return to this viewer.
 */
export function deriveMeetingStage(
  session: LiveMeetingSession,
  agenda: AgendaDiscussionItem[],
  rounds: VotingRound[],
  decisions: Decision[],
): MeetingStage {
  const ordered = [...agenda].sort((a, b) => a.agenda_order - b.agenda_order);
  const openRound = rounds.find((round) => round.status === "open") ?? session.open_voting_rounds[0] ?? null;
  const participation = new Map((openRound?.participation ?? []).map((person) => [person.user_id, person.has_voted]));

  const viewerRole = session.viewer.mode === "chair" ? "الرئيس · أنت" : session.viewer.mode === "rapporteur" ? "المقرر · أنت" : "أنت";
  const seats: StageSeat[] = session.attendance.map((record) => {
    const base = attendanceSeatStatus(record);
    const voted = participation.get(record.user_id);
    const isViewer = record.user_id === session.viewer.user_id;
    return {
      id: record.id,
      name: record.full_name_ar,
      status: base === "present" && voted !== undefined ? (voted ? "voted" : "waiting") : base,
      roleLabel: isViewer ? viewerRole : undefined,
      chair: isViewer && session.viewer.mode === "chair",
    };
  });

  return { seats, phase: derivePhase(session, ordered, rounds, decisions, openRound, seats) };
}

function derivePhase(
  session: LiveMeetingSession,
  ordered: AgendaDiscussionItem[],
  rounds: VotingRound[],
  decisions: Decision[],
  openRound: VotingRound | null,
  seats: StageSeat[],
): StagePhase {
  if (!session.meeting.attendance_locked) {
    const present = seats.filter((seat) => seat.status === "present").length;
    return { kind: "attendance", present, total: seats.length };
  }

  if (openRound) {
    return {
      kind: "voting",
      item: ordered.find((item) => item.id === openRound.agenda_item_id) ?? null,
      cast: openRound.votes_cast_count ?? null,
      eligible: openRound.eligible_voter_count ?? null,
    };
  }

  const discussing = ordered.find((item) => item.agenda_status === "under_discussion");
  const current = discussing ?? ordered.find((item) => isUnfinished(item, rounds, decisions));
  if (!current) return ordered.length === 0 ? { kind: "idle", item: null } : { kind: "finished" };

  const closed = latestClosedRound(rounds, current.id);
  if (closed) return { kind: "result", item: current, round: closed };
  if (discussing) return { kind: "discussion", item: discussing };
  return { kind: "idle", item: current };
}
