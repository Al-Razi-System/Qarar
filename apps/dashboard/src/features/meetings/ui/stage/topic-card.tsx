"use client";

import { useState, type ReactNode } from "react";
import { InstructionContent } from "@/shared/content/instruction-content";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import type { AgendaItemFlow, AgendaItemState } from "../../model/agenda-flow";
import { finalSummaryReady } from "../../model/agenda-flow";
import type { AgendaDiscussionItem, Decision, LiveMeetingSession, TopicGovernanceHistory } from "../../model/live-meeting";
import type { MeetingTopicAttachment } from "../../model/meeting";
import { TopicAttachmentsPanel, type DownloadControl } from "../topic-attachments-panel";
import { VoteResultPanel } from "../vote-result-panel";
import { DiscussionSummary, type UpdateDiscussion } from "./discussion-summary";
import { DocumentViewer } from "./document-viewer";
import { hasTopicHistory, TopicHistory } from "./topic-history";
import { TopicContextDialog } from "./topic-context-dialog";

export type ReferenceTab = "instructions" | "attachments" | "history";

type Props = {
  item: AgendaDiscussionItem;
  total: number;
  flow: AgendaItemFlow;
  state: AgendaItemState;
  session: LiveMeetingSession;
  attachments: MeetingTopicAttachment[];
  history?: TopicGovernanceHistory;
  busy: boolean;
  /** Presentation mode shows the card as a member sees it, without the rapporteur's editor. */
  presenting: boolean;
  summaryDraft?: string;
  onSummaryDraftChange: (text: string) => void;
  onUpdateDiscussion: UpdateDiscussion;
  onEditDecision: (decision: Decision) => void;
  /** The member's ballot, placed right under the title while a round is open for them. */
  ballot?: ReactNode;
  /** A member sees the item the council is on; the chair's card scrolls inside its column. */
  className?: string;
  /** The broadcast panel; when given, the card shows it instead of its own choice. */
  panel?: ReferenceTab | null;
  /** Given to the broadcast's controller: choosing a panel broadcasts it. */
  onPanelChange?: (panel: ReferenceTab) => void;
  /** Why this viewer cannot choose a panel (they follow the broadcast). */
  panelLockedReason?: string | null;
  /** The broadcast file and page; when given, the card shows it instead of its own choice. */
  document?: { attachmentId: string | null; page: number } | null;
  /** Given to the broadcast's controller: opening, turning and closing reach every screen. */
  onDocumentChange?: (attachment: MeetingTopicAttachment | null, page: number | null) => void;
  /** Who shows the file, for a viewer who follows the broadcast. */
  controllerName?: string;
  /** The chair's decision on downloading this item's files. */
  downloads?: DownloadControl;
  /** The item's discussion timer, under its badges. */
  timer?: ReactNode;
  /** The decision's assignments, under the decision. */
  assignments?: ReactNode;
};

/**
 * Everything the council needs on one agenda item: its guidance, its files and
 * what earlier councils decided, then the vote and the rapporteur's summary.
 */
export function TopicCard({ item, total, flow, state, session, attachments, history, busy, presenting, summaryDraft, onSummaryDraftChange, onUpdateDiscussion, onEditDecision, ballot, className, panel, onPanelChange, panelLockedReason, document, onDocumentChange, controllerName, downloads, timer, assignments }: Props) {
  const [chosenTab, setChosenTab] = useState<ReferenceTab | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [localDocument, setLocalDocument] = useState<{ attachmentId: string | null; page: number } | null>(null);
  // Without a broadcast the card keeps its own open file; with one, the broadcast decides.
  const shownDocument = document !== undefined ? document : localDocument;
  const openFile = shownDocument?.attachmentId ? attachments.find((attachment) => attachment.id === shownDocument.attachmentId) ?? null : null;
  const steersDocument = document === undefined || Boolean(onDocumentChange);
  function changeDocument(attachment: MeetingTopicAttachment | null, page: number | null) {
    if (document === undefined) setLocalDocument(attachment ? { attachmentId: attachment.id, page: page ?? 1 } : null);
    else onDocumentChange?.(attachment, page);
  }
  const instructions = item.discussion_instructions?.trim() ?? "";
  const tabs: Array<{ value: ReferenceTab; label: string }> = [
    ...(instructions ? [{ value: "instructions" as const, label: "التعليمات" }] : []),
    ...(attachments.length ? [{ value: "attachments" as const, label: `المرفقات (${attachments.length})` }] : []),
    ...(hasTopicHistory(history) ? [{ value: "history" as const, label: "القرارات السابقة" }] : []),
  ];
  const wanted = panel !== undefined ? panel : chosenTab;
  const tab = tabs.some((entry) => entry.value === wanted) ? wanted : tabs[0]?.value ?? null;
  const locked = Boolean(panelLockedReason);
  function choose(next: ReferenceTab) {
    if (onPanelChange) onPanelChange(next);
    else setChosenTab(next);
  }

  const manager = session.viewer.can_manage_voting && !presenting;
  const role = presenting ? "member" : session.viewer.mode;
  const decision = flow.decision;
  const canEditDecision = Boolean(decision?.can_edit_text) && !presenting;

  const materials = <>
    {tab === "instructions" && <section aria-label="تعليمات المناقشة" className="q-instructions rounded-q-control border-s-4 border-q-primary bg-q-surface-2 p-4">
      <h3 className="m-0 text-q-ui font-bold text-q-link">تعليمات المناقشة</h3>
      <InstructionContent value={instructions} />
    </section>}
    {tab === "attachments" && <div className="flex min-h-0 flex-col gap-3">
      {openFile && shownDocument && <DocumentViewer meetingId={session.meeting.id} attachment={openFile} page={shownDocument.page} controls={steersDocument} controllerName={controllerName} onPage={(page) => changeDocument(openFile, page)} onClose={() => changeDocument(null, null)} expanded={expanded} />}
      <TopicAttachmentsPanel meetingId={session.meeting.id} attachments={attachments} compact={!expanded}
        onView={steersDocument ? (attachment) => changeDocument(attachment, 1) : undefined}
        viewingId={openFile?.id ?? null} downloads={presenting ? undefined : downloads} followsBroadcast={!steersDocument} />
    </div>}
    {tab === "history" && history && <TopicHistory history={history} />}
  </>;

  return (
    <Card live={state.tone === "live"} role="region" aria-label="الموضوع المعروض" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-q-caption font-bold">
          <span className={state.tone === "live" ? "text-q-live" : "text-q-text-2"}>البند {item.agenda_order} من {total}</span>
          {item.topic?.category_name_ar && <span className="text-q-link">{item.topic.category_name_ar}</span>}
          {item.topic?.topic_no && <span dir="ltr" className="font-normal text-q-text-2">{item.topic.topic_no}</span>}
        </div>
        <h2 className="m-0 break-words text-q-h3 font-bold">{item.topic?.title_ar ?? "بند جدول الأعمال"}</h2>
        {item.topic?.submitted_by_name_ar && <p className="m-0 text-q-caption text-q-text-2">مقدم من {item.topic.submitted_by_name_ar}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={state.tone}>{state.label}</Badge>
          {item.workflow_step_name_ar && <Badge tone="neutral">{item.workflow_step_name_ar}</Badge>}
          {flow.decision && <Badge tone="success">{flow.decision.decision_no}</Badge>}
        </div>
        {timer}
        {item.topic?.context && <Button variant="secondary" className="self-start" onClick={() => setContextOpen(true)}>تفاصيل الموضوع ومساره</Button>}
      </header>
      {contextOpen && item.topic?.context && <TopicContextDialog title={item.topic.title_ar} context={item.topic.context} onClose={() => setContextOpen(false)} />}

      {ballot}

      {decision && (
        <section aria-label="القرار" className="flex flex-col gap-2 rounded-q-control border border-q-border bg-q-surface-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-q-ui font-bold">القرار {decision.decision_no}</h3>
            {canEditDecision && <Button variant="secondary" disabled={busy} onClick={() => onEditDecision(decision)}>تعديل القرار</Button>}
          </div>
          <p className="m-0 whitespace-pre-line text-q-body">{decision.decision_text}</p>
          {decision.quorum_continuation && <p className="m-0 text-q-caption font-bold text-q-warning">اتُخذ هذا القرار في اجتماع بنصاب غير مكتمل. السبب: {decision.quorum_continuation.reason}</p>}
          {canEditDecision && <p className="m-0 text-q-caption text-q-text-2">هذا النص الرسمي للقرار؛ يعدّله الرئيس والمقرر إلى اعتماد المحضر. ملخص المناقشة مستقل عنه.</p>}
        </section>
      )}
      {decision && assignments}
      <DiscussionSummary key={item.id} item={item} votingFinished={Boolean(flow.closed)} finalNeedsConfirmation={!finalSummaryReady(item, flow.closed)} role={role} busy={busy} draft={summaryDraft} onDraftChange={onSummaryDraftChange} onUpdate={onUpdateDiscussion} />

      {tabs.length === 0 ? (
        <p className="m-0 rounded-q-control bg-q-surface-2 p-3 text-q-ui text-q-text-2">لا تعليمات ولا مرفقات ولا قرارات سابقة مسجلة لهذا الموضوع.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tabs.length > 1 && tab && (
            <div className="flex flex-col gap-1">
              <SegmentedControl label="مواد الموضوع" options={tabs} value={tab} onChange={choose} disabled={locked} />
              {locked && <p className="m-0 text-q-caption text-q-text-2">{panelLockedReason}</p>}
            </div>
          )}
          {tab && <Button variant="secondary" className="self-start" onClick={() => setExpanded(true)}>
            {tab === "instructions" ? "تكبير التعليمات" : tab === "attachments" ? "تكبير المرفقات" : "تكبير القرارات السابقة"}
          </Button>}
          {!expanded && materials}
          {expanded && <Dialog size="full" title={`${tab === "instructions" ? "تعليمات المناقشة" : tab === "attachments" ? "مرفقات الموضوع" : "القرارات السابقة"} — ${item.topic?.title_ar ?? "بند جدول الأعمال"}`} onClose={() => setExpanded(false)}
            footer={<Button variant="secondary" onClick={() => setExpanded(false)}>إغلاق العرض الموسع</Button>}>
            {locked && <p className="m-0 text-q-caption text-q-text-2">{panelLockedReason}</p>}
            {materials}
          </Dialog>}
        </div>
      )}

      {flow.hasVoting && (
        <section aria-label="التصويت على البند" className="flex flex-col gap-3 border-t border-q-border pt-4">
          {flow.closed && <VoteResultPanel round={flow.closed} />}
          {!manager && !flow.closed && (
            <p className="m-0 text-q-ui text-q-text-2">
              {flow.open ? "التصويت مفتوح الآن؛ يسجّل كل عضو صوته من بطاقة التصويت على شاشته." : "يُفتح التصويت بعد أن ينهي رئيس المجلس المناقشة."}
            </p>
          )}
        </section>
      )}

    </Card>
  );
}
