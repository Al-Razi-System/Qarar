"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { activeAgendaItemId, agendaItemState, chairActions, completionBlockers, itemFlow, sortAgenda, type AgendaItemState, type ChairAction } from "../../model/agenda-flow";
import type { AgendaDiscussionItem, AssignmentUserOption, Decision, LiveMeetingSession, MeetingBroadcast, MeetingAssignment, MeetingAssignments, MeetingItemTimers, MeetingReferrals, NewAssignment, TopicGovernanceHistory, VotingRound } from "../../model/live-meeting";
import type { MeetingTopicAttachment } from "../../model/meeting";
import { AgendaTimeline } from "./agenda-timeline";
import { BroadcastBar } from "./broadcast-bar";
import { ControlDock } from "./control-dock";
import { ItemAssignments, type AssignmentActivity } from "./item-assignments";
import { ItemTimer } from "./item-timer";
import type { UpdateDiscussion } from "./discussion-summary";
import { TopicCard, type ReferenceTab } from "./topic-card";

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
  /** The council table at the centre of the chair's room. */
  stage?: ReactNode;
  /** The small table beside a member's topic. */
  compactStage?: ReactNode;
  /** The viewer's open ballot, placed under the topic's title. */
  ballot?: ReactNode;
  /** The broadcast of the council's screens; null when it is not available. */
  broadcast?: MeetingBroadcast | null;
  /** A handover is on its way to the server. */
  broadcastPending?: boolean;
  /** Why the broadcast could not be changed or read, for the viewer. */
  broadcastError?: string | null;
  /** The controller chose an item or a panel. */
  onBroadcast?: (agendaItemId: string, panel: ReferenceTab) => void;
  onHandOver?: (toRole: "chair" | "rapporteur") => void;
  /** The controller opened, turned or closed a file of an item. */
  onBroadcastDocument?: (attachmentId: string | null, page: number | null, agendaItemId: string) => void;
  /** The chair's download decision for an item, with where it stands. */
  downloads?: { pendingItemId: string | null; errorItemId: string | null; error: string | null; onChange: (agendaItemId: string, allowed: boolean, revision: number) => void };
  /** The items' discussion timers, with the server's time minus this device's. */
  timers?: { data: MeetingItemTimers | null; clockOffsetMs: number };
  /** The chair's planned duration for an item, with where it stands. */
  plannedMinutes?: { pendingItemId: string | null; errorItemId: string | null; error: string | null; onChange: (agendaItemId: string, minutes: number | null, revision: number) => void };
  onUpdateDiscussion: UpdateDiscussion;
  onRequestPostpone: (item: AgendaDiscussionItem) => void;
  /** The meeting's assignments and their actions; without them the room works as before. */
  assignments?: {
    data: MeetingAssignments | null;
    error?: string | null;
    onRetry?: () => void;
    activity: AssignmentActivity;
    onCreate: (agendaItemId: string, input: NewAssignment) => Promise<boolean>;
    onSearchUsers?: (query: string) => Promise<AssignmentUserOption[]>;
    onConfirm: (assignment: MeetingAssignment) => void;
    onWithdraw: (assignment: MeetingAssignment) => void;
  };
  /** The meeting's referrals; without them the room works as before. */
  referrals?: MeetingReferrals | null;
  /** Given to the council's chair: refers the item instead of a vote. */
  onRequestReferral?: (item: AgendaDiscussionItem) => void;
  onOpenRound: (item: AgendaDiscussionItem) => void;
  onCloseRound: (round: VotingRound) => void;
  onCreateDecision: (round: VotingRound, item: AgendaDiscussionItem) => void;
  onEditDecision: (decision: Decision, item: AgendaDiscussionItem, round: VotingRound | null) => void;
  onComplete: () => void;
};

/**
 * The meeting itself. The chair and the rapporteur see one fixed screen in three
 * columns (agenda, council table, the item on screen); the chair steers it from
 * the dock under the table. A member follows the item the council is on: its
 * topic and ballot first, the table beside it, and no navigation of their own.
 */
export function AgendaWorkspace({ session, agenda, attachments, topicHistory, rounds, decisions, busy, presenting, stage, compactStage, ballot, broadcast = null, broadcastPending = false, broadcastError = null, onBroadcast, onHandOver, onBroadcastDocument, downloads, timers, plannedMinutes, assignments, referrals, onRequestReferral, onUpdateDiscussion, onRequestPostpone, onOpenRound, onCloseRound, onCreateDecision, onEditDecision, onComplete }: Props) {
  const ordered = sortAgenda(agenda);
  const referred = referrals?.referrals ?? [];
  const currentId = activeAgendaItemId(session, ordered, rounds, decisions, referred);
  const [picked, setPicked] = useState<{ whileCurrent: string | null; itemId: string } | null>(null);
  const [summaryDrafts, setSummaryDrafts] = useState<Record<string, string>>({});
  const [assignmentEditorItemId, setAssignmentEditorItemId] = useState<string | null>(null);

  // When the council moves on (a decision saved, the next discussion started),
  // the controller's broadcast moves with it, as the chair's own pick did before.
  const lastCurrentId = useRef(currentId);
  const followCouncil = useEffectEvent((nextId: string) => {
    if (broadcast?.active && broadcast.viewer_controls && broadcast.agenda_item_id && broadcast.agenda_item_id !== nextId) {
      onBroadcast?.(nextId, "instructions");
    }
  });
  useEffect(() => {
    if (lastCurrentId.current === currentId) return;
    lastCurrentId.current = currentId;
    if (currentId) followCouncil(currentId);
  }, [currentId]);

  if (ordered.length === 0) {
    return <Card className="text-center"><h2 className="m-0 text-q-h3 font-bold">لا توجد بنود في جدول الأعمال</h2><p className="m-0 mt-1 text-q-ui text-q-text-2">تُضاف البنود من صفحة الاجتماع قبل بدء الجلسة.</p></Card>;
  }

  // A member follows the meeting; only who runs it may look at another item.
  const follower = session.viewer.mode === "member" && !session.viewer.can_manage_voting;
  // While the session runs, the broadcast decides what every screen shows; only its controller chooses.
  const live = broadcast?.active ? broadcast : null;
  const controls = Boolean(live?.viewer_controls);
  const broadcastItemId = live?.agenda_item_id && ordered.some((item) => item.id === live.agenda_item_id) ? live.agenda_item_id : null;
  const pickedId = !live && !follower && picked && picked.whileCurrent === currentId && ordered.some((item) => item.id === picked.itemId) ? picked.itemId : null;
  const selected = ordered.find((item) => item.id === (live ? broadcastItemId ?? currentId : pickedId ?? currentId)) ?? ordered[ordered.length - 1];
  const controllerName = live?.controller_role === "rapporteur" ? "مقرر المجلس" : "رئيس المجلس";
  const flows = Object.fromEntries(ordered.map((item) => [item.id, itemFlow(item, session, rounds, decisions, referred)]));
  const states: Record<string, AgendaItemState> = Object.fromEntries(ordered.map((item) => [item.id, agendaItemState(item, flows[item.id])]));
  const flow = flows[selected.id];
  const manager = session.viewer.can_manage_voting;
  const blockers = manager ? completionBlockers(session, ordered, rounds, decisions, referred) : [];
  // Only the council's chair decides on downloads and referrals; the broadcast tells the room who that is.
  const viewerIsChair = Boolean(live && (live.can_hand_over || live.can_take_back));
  const { actions, note } = chairActions(selected, session, flow, { canRefer: viewerIsChair && Boolean(referrals && onRequestReferral) });

  function run(action: ChairAction) {
    if (action.kind === "start") void onUpdateDiscussion(selected, "under_discussion", selected.discussion_notes ?? null);
    else if (action.kind === "end") void onUpdateDiscussion(selected, "discussed", selected.discussion_notes ?? null);
    else if (action.kind === "postpone") onRequestPostpone(selected);
    else if (action.kind === "refer") onRequestReferral?.(selected);
    else if (action.kind === "open_round") onOpenRound(selected);
    else if (action.kind === "close_round" && flow.open) onCloseRound(flow.open);
    else if (action.kind === "decision" && flow.closed) onCreateDecision(flow.closed, selected);
    else if (action.kind === "edit_decision" && flow.decision) onEditDecision(flow.decision, selected, flow.closed);
  }

  const itemFiles = attachments.filter((attachment) => attachment.topic_id === selected.topic?.id);
  const downloadControl = downloads && itemFiles.length > 0 ? {
    allowed: itemFiles.every((file) => file.download_allowed !== false),
    canChange: viewerIsChair,
    pending: downloads.pendingItemId === selected.id,
    error: downloads.errorItemId === selected.id ? downloads.error : null,
    onChange: (allowed: boolean) => downloads.onChange(selected.id, allowed, itemFiles[0]?.download_revision ?? 0),
  } : undefined;

  const selectedTimer = timers?.data?.timers.find((entry) => entry.agenda_item_id === selected.id);
  const timer = timers?.data ? (
    <ItemTimer
      timer={selectedTimer}
      clockOffsetMs={timers.clockOffsetMs}
      plan={viewerIsChair && plannedMinutes && !presenting ? {
        pending: plannedMinutes.pendingItemId === selected.id,
        error: plannedMinutes.errorItemId === selected.id ? plannedMinutes.error : null,
        onChange: (minutes) => plannedMinutes.onChange(selected.id, minutes, selectedTimer?.revision ?? 0),
      } : undefined}
    />
  ) : null;

  const assignmentList = assignments?.error ? <InlineMessage tone="error">{assignments.error}<Button variant="secondary" onClick={assignments.onRetry}>إعادة تحميل التكليفات</Button></InlineMessage> : assignments?.data ? (
    <ItemAssignments
      key={`assignments-${selected.id}`}
      editorOpen={assignmentEditorItemId === selected.id}
      onEditorChange={(open) => setAssignmentEditorItemId(open ? selected.id : null)}
      addFromDock={manager && !presenting}
      assignments={assignments.data.assignments.filter((row) => row.agenda_item_id === selected.id)}
      viewer={assignments.data.viewer}
      options={presenting ? null : assignments.data.options}
      activity={assignments.activity}
      onCreate={(input) => assignments.onCreate(selected.id, input)}
      onSearchUsers={assignments.onSearchUsers}
      onConfirm={assignments.onConfirm}
      onWithdraw={assignments.onWithdraw}
    />
  ) : assignments ? <p role="status" className="m-0 text-q-caption text-q-text-2">جارٍ تحميل التكليفات…</p> : null;
  const decisionTools = flow.decision && !presenting && assignments ? <div className="flex flex-wrap items-center gap-2">
    {assignments.error ? <><span className="text-q-caption text-q-danger">{assignments.error}</span><Button variant="secondary" onClick={assignments.onRetry}>إعادة تحميل التكليفات</Button></> : assignments.data && (assignments.data.viewer.can_issue || assignments.data.viewer.can_propose) && assignments.data.options && <Button variant="secondary" disabled={busy} onClick={() => setAssignmentEditorItemId(selected.id)}>{assignments.data.viewer.can_issue ? "إضافة تكليف" : "اقتراح تكليف"}</Button>}
  </div> : null;

  const topic = (
    <TopicCard
      item={selected}
      total={ordered.length}
      flow={flow}
      state={states[selected.id]}
      session={session}
      attachments={itemFiles}
      history={selected.topic?.id ? topicHistory[selected.topic.id] : undefined}
      busy={busy}
      presenting={presenting}
      summaryDraft={summaryDrafts[selected.id]}
      onSummaryDraftChange={(text) => setSummaryDrafts((drafts) => ({ ...drafts, [selected.id]: text }))}
      onUpdateDiscussion={onUpdateDiscussion}
      onEditDecision={(decision) => onEditDecision(decision, selected, flow.closed)}
      ballot={presenting ? undefined : ballot}
      panel={live ? live.panel : undefined}
      onPanelChange={controls && onBroadcast ? (panel) => onBroadcast(selected.id, panel) : undefined}
      panelLockedReason={live && !controls ? `يعرض ${controllerName} هذا القسم على كل الشاشات.` : null}
      document={live ? { attachmentId: live.attachment_id ?? null, page: live.page ?? 1 } : undefined}
      onDocumentChange={controls && onBroadcastDocument
        ? (attachment, page) => onBroadcastDocument(attachment?.id ?? null, page, attachment?.agenda_item_id ?? selected.id)
        : undefined}
      controllerName={controllerName}
      downloads={downloadControl}
      timer={timer}
      assignments={assignmentList}
    />
  );
  const timeline = (
    <AgendaTimeline
      items={ordered}
      states={states}
      currentId={currentId}
      selectedId={selected.id}
      onSelect={live
        ? controls && onBroadcast ? (itemId) => onBroadcast(itemId, live.panel) : undefined
        : follower ? undefined : (itemId) => setPicked({ whileCurrent: currentId, itemId })}
    />
  );
  const bar = live && !presenting && onHandOver
    ? <BroadcastBar broadcast={live} pending={broadcastPending} error={broadcastError} onHandOver={onHandOver} />
    : null;

  if (follower) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        {bar}
        <div className="grid min-h-0 items-start gap-4 lg:flex-1 lg:overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
          <div className="min-w-0">{topic}</div>
          <aside aria-label="طاولة المجلس وجدول الأعمال" className="flex min-w-0 flex-col gap-4">
            {compactStage && (
              <Card className="flex flex-col gap-2 p-3">
                <h3 className="m-0 px-1 text-q-ui font-bold">طاولة المجلس</h3>
                {compactStage}
              </Card>
            )}
            {timeline}
          </aside>
        </div>
      </div>
    );
  }

  // The chair's cockpit. Its columns follow the room's own width, not the
  // window's, so the app's sidebar never squeezes them: the agenda becomes a
  // rail of numbers when space is short, and the table shrinks to the height
  // left above the dock instead of sliding under it.
  const settled = ordered.filter((item) => states[item.id]?.tone === "success" || item.agenda_status === "postponed").length;
  return (
    <div className="@container/room h-full min-h-0">
      <div className={cn(
        "grid gap-4 @3xl/room:h-full @3xl/room:min-h-0 @3xl/room:grid-cols-[4.5rem_minmax(0,1fr)_minmax(19rem,22rem)] @6xl/room:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)_minmax(20rem,25rem)]",
        presenting && manager && "pb-64 @3xl/room:pb-0",
      )}>
        <div className="order-3 min-w-0 @3xl/room:order-none @3xl/room:min-h-0 @3xl/room:overflow-y-auto">{timeline}</div>
        <div className="@container order-1 flex min-w-0 flex-col gap-3 @3xl/room:order-none @3xl/room:min-h-0">
          {bar}
          {stage && <div className="min-h-0 @3xl/room:flex-1">{stage}</div>}
          {manager && <ControlDock pinned={presenting} item={selected} actions={actions} note={note} busy={busy} blockers={blockers} onAction={run} onComplete={onComplete} decisionTools={decisionTools} progress={{ done: settled, total: ordered.length }} />}
        </div>
        <div className="order-2 min-w-0 @3xl/room:order-none @3xl/room:min-h-0 @3xl/room:overflow-y-auto">{topic}</div>
      </div>
    </div>
  );
}
