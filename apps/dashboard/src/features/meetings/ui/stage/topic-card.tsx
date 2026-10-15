"use client";

import { useState, type ReactNode } from "react";
import { InstructionContent } from "@/shared/content/instruction-content";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import type { AgendaItemFlow, AgendaItemState } from "../../model/agenda-flow";
import type { AgendaDiscussionItem, Decision, LiveMeetingSession, TopicGovernanceHistory } from "../../model/live-meeting";
import type { MeetingTopicAttachment } from "../../model/meeting";
import { TopicAttachmentsPanel } from "../topic-attachments-panel";
import { VoteResultPanel } from "../vote-result-panel";
import { DiscussionSummary, type UpdateDiscussion } from "./discussion-summary";
import { hasTopicHistory, TopicHistory } from "./topic-history";

type ReferenceTab = "instructions" | "attachments" | "history";

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
};

/**
 * Everything the council needs on one agenda item: its guidance, its files and
 * what earlier councils decided, then the vote and the rapporteur's summary.
 */
export function TopicCard({ item, total, flow, state, session, attachments, history, busy, presenting, summaryDraft, onSummaryDraftChange, onUpdateDiscussion, onEditDecision, ballot, className }: Props) {
  const [chosenTab, setChosenTab] = useState<ReferenceTab | null>(null);
  const instructions = item.discussion_instructions?.trim() ?? "";
  const tabs: Array<{ value: ReferenceTab; label: string }> = [
    ...(instructions ? [{ value: "instructions" as const, label: "التعليمات" }] : []),
    ...(attachments.length ? [{ value: "attachments" as const, label: `المرفقات (${attachments.length})` }] : []),
    ...(hasTopicHistory(history) ? [{ value: "history" as const, label: "القرارات السابقة" }] : []),
  ];
  const tab = tabs.some((entry) => entry.value === chosenTab) ? chosenTab : tabs[0]?.value ?? null;

  const manager = session.viewer.can_manage_voting && !presenting;
  const role = presenting ? "member" : session.viewer.mode;
  const decision = flow.decision;
  const canEditDecision = Boolean(decision?.can_edit_text) && !presenting;

  return (
    <Card live={state.tone === "live"} role="region" aria-label="الموضوع المعروض" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-q-caption font-bold">
          <span className={state.tone === "live" ? "text-q-live" : "text-q-text-2"}>البند {item.agenda_order} من {total}</span>
          {item.topic?.category_name_ar && <span className="text-q-link">{item.topic.category_name_ar}</span>}
          {item.topic?.topic_no && <span dir="ltr" className="font-normal text-q-text-2">{item.topic.topic_no}</span>}
        </div>
        <h2 className="m-0 text-q-h2 font-bold">{item.topic?.title_ar ?? "بند جدول الأعمال"}</h2>
        {item.topic?.submitted_by_name_ar && <p className="m-0 text-q-caption text-q-text-2">مقدم من {item.topic.submitted_by_name_ar}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={state.tone}>{state.label}</Badge>
          {item.workflow_step_name_ar && <Badge tone="neutral">{item.workflow_step_name_ar}</Badge>}
          {flow.decision && <Badge tone="success">{flow.decision.decision_no}</Badge>}
        </div>
      </header>

      {ballot}

      {tabs.length === 0 ? (
        <p className="m-0 rounded-q-control bg-q-surface-2 p-3 text-q-ui text-q-text-2">لا تعليمات ولا مرفقات ولا قرارات سابقة مسجلة لهذا الموضوع.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tabs.length > 1 && tab && <SegmentedControl label="مواد الموضوع" options={tabs} value={tab} onChange={setChosenTab} />}
          {tab === "instructions" && (
            <section aria-label="تعليمات المناقشة" className="q-instructions rounded-q-control border-s-4 border-q-primary bg-q-surface-2 p-4">
              <h3 className="m-0 text-q-ui font-bold text-q-link">تعليمات المناقشة</h3>
              <InstructionContent value={instructions} />
            </section>
          )}
          {tab === "attachments" && <TopicAttachmentsPanel meetingId={session.meeting.id} attachments={attachments} />}
          {tab === "history" && history && <TopicHistory history={history} />}
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

      {decision && (
        <section aria-label="القرار" className="flex flex-col gap-2 rounded-q-control border border-q-border bg-q-surface-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-q-ui font-bold">القرار {decision.decision_no}</h3>
            {canEditDecision && <Button variant="secondary" disabled={busy} onClick={() => onEditDecision(decision)}>تعديل القرار</Button>}
          </div>
          <p className="m-0 whitespace-pre-line text-q-body">{decision.decision_text}</p>
          {canEditDecision && <p className="m-0 text-q-caption text-q-text-2">يعدّل النص رئيس المجلس والمقرر إلى اعتماد المحضر.</p>}
        </section>
      )}

      <DiscussionSummary key={item.id} item={item} votingFinished={Boolean(flow.closed)} role={role} busy={busy} draft={summaryDraft} onDraftChange={onSummaryDraftChange} onUpdate={onUpdateDiscussion} />
    </Card>
  );
}
