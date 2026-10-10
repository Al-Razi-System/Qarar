"use client";

import { useState } from "react";
import { Card } from "@/shared/ui/card";
import { activeAgendaItemId, agendaItemState, chairActions, completionBlockers, itemFlow, sortAgenda, type AgendaItemState, type ChairAction } from "../../model/agenda-flow";
import type { AgendaDiscussionItem, Decision, LiveMeetingSession, TopicGovernanceHistory, VotingRound } from "../../model/live-meeting";
import type { MeetingTopicAttachment } from "../../model/meeting";
import { AgendaTimeline } from "./agenda-timeline";
import { ControlDock } from "./control-dock";
import type { UpdateDiscussion } from "./discussion-summary";
import { TopicCard } from "./topic-card";

type Props = {
  session: LiveMeetingSession;
  agenda: AgendaDiscussionItem[];
  attachments: MeetingTopicAttachment[];
  topicHistory: Record<string, TopicGovernanceHistory>;
  rounds: VotingRound[];
  decisions: Decision[];
  busy: boolean;
  /** Presentation mode: the shared view only, with every control hidden. */
  presenting: boolean;
  onUpdateDiscussion: UpdateDiscussion;
  onRequestPostpone: (item: AgendaDiscussionItem) => void;
  onOpenRound: (item: AgendaDiscussionItem) => void;
  onCloseRound: (round: VotingRound) => void;
  onCreateDecision: (round: VotingRound, item: AgendaDiscussionItem) => void;
  onEditDecision: (decision: Decision, item: AgendaDiscussionItem, round: VotingRound | null) => void;
  onComplete: () => void;
};

/**
 * The agenda side of the live room: the timeline, the item on screen and, for
 * the chair, the control dock. The item on screen follows the meeting unless
 * the viewer picks another one, and returns to following when the meeting moves on.
 */
export function AgendaWorkspace({ session, agenda, attachments, topicHistory, rounds, decisions, busy, presenting, onUpdateDiscussion, onRequestPostpone, onOpenRound, onCloseRound, onCreateDecision, onEditDecision, onComplete }: Props) {
  const ordered = sortAgenda(agenda);
  const currentId = activeAgendaItemId(session, ordered, rounds, decisions);
  const [picked, setPicked] = useState<{ whileCurrent: string | null; itemId: string } | null>(null);
  const [summaryDrafts, setSummaryDrafts] = useState<Record<string, string>>({});

  if (ordered.length === 0) {
    return <Card className="text-center"><h2 className="m-0 text-q-h3 font-bold">لا توجد بنود في جدول الأعمال</h2><p className="m-0 mt-1 text-q-ui text-q-text-2">تُضاف البنود من صفحة الاجتماع قبل بدء الجلسة.</p></Card>;
  }

  const pickedId = picked && picked.whileCurrent === currentId && ordered.some((item) => item.id === picked.itemId) ? picked.itemId : null;
  const selected = ordered.find((item) => item.id === (pickedId ?? currentId)) ?? ordered[ordered.length - 1];
  const flows = Object.fromEntries(ordered.map((item) => [item.id, itemFlow(item, session, rounds, decisions)]));
  const states: Record<string, AgendaItemState> = Object.fromEntries(ordered.map((item) => [item.id, agendaItemState(item, flows[item.id])]));
  const flow = flows[selected.id];
  const manager = session.viewer.can_manage_voting && !presenting;
  const blockers = manager ? completionBlockers(session, ordered, rounds, decisions) : [];
  const { actions, note } = chairActions(selected, session, flow);

  function run(action: ChairAction) {
    if (action.kind === "start") void onUpdateDiscussion(selected, "under_discussion", selected.discussion_notes ?? null);
    else if (action.kind === "end") void onUpdateDiscussion(selected, "discussed", selected.discussion_notes ?? null);
    else if (action.kind === "postpone") onRequestPostpone(selected);
    else if (action.kind === "open_round") onOpenRound(selected);
    else if (action.kind === "close_round" && flow.open) onCloseRound(flow.open);
    else if (action.kind === "decision" && flow.closed) onCreateDecision(flow.closed, selected);
    else if (action.kind === "edit_decision" && flow.decision) onEditDecision(flow.decision, selected, flow.closed);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <AgendaTimeline items={ordered} states={states} currentId={currentId} selectedId={selected.id} onSelect={(itemId) => setPicked({ whileCurrent: currentId, itemId })} />
        <TopicCard
          item={selected}
          total={ordered.length}
          flow={flow}
          state={states[selected.id]}
          session={session}
          attachments={attachments.filter((attachment) => attachment.topic_id === selected.topic?.id)}
          history={selected.topic?.id ? topicHistory[selected.topic.id] : undefined}
          busy={busy}
          presenting={presenting}
          summaryDraft={summaryDrafts[selected.id]}
          onSummaryDraftChange={(text) => setSummaryDrafts((drafts) => ({ ...drafts, [selected.id]: text }))}
          onUpdateDiscussion={onUpdateDiscussion}
          onEditDecision={(decision) => onEditDecision(decision, selected, flow.closed)}
        />
      </div>
      {manager && blockers.length > 0 && (
        <Card role="region" aria-label="قبل إنهاء الجلسة" className="flex flex-col gap-2">
          <h3 className="m-0 text-q-ui font-bold">قبل إنهاء الجلسة</h3>
          <ul className="m-0 flex list-disc flex-col gap-1 ps-5 text-q-ui text-q-text-2">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        </Card>
      )}
      {manager && <ControlDock item={selected} actions={actions} note={note} busy={busy} blockers={blockers} onAction={run} onComplete={onComplete} />}
    </div>
  );
}
