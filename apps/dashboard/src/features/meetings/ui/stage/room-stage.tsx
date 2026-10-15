"use client";

import type { AgendaDiscussionItem, Decision, LiveMeetingSession, VotingRound } from "../../model/live-meeting";
import { deriveMeetingStage } from "../../model/meeting-stage";
import { CouncilTable } from "./council-table";
import { StageCenter } from "./stage-center";

type Props = {
  session: LiveMeetingSession;
  agenda: AgendaDiscussionItem[];
  rounds: VotingRound[];
  decisions: Decision[];
  /** The small table beside a member's topic, instead of the room's centre piece. */
  compact?: boolean;
};

/**
 * The shared scene of the live meeting: who is at the table and what the
 * council is doing right now. It is read-only and is derived on every refresh
 * from the data the room already loads.
 */
export function RoomStage({ session, agenda, rounds, decisions, compact = false }: Props) {
  const { seats, phase } = deriveMeetingStage(session, agenda, rounds, decisions);
  return (
    <section aria-label="مشهد الاجتماع" className="font-sans text-q-text">
      <CouncilTable seats={seats} compact={compact}>
        <div key={phase.kind} className="q-enter"><StageCenter phase={phase} compact={compact} /></div>
      </CouncilTable>
    </section>
  );
}
