"use client";

import { Badge } from "@/shared/ui/badge";
import { Card } from "@/shared/ui/card";
import type { AgendaDiscussionItem, Decision, LiveMeetingSession, VotingRound } from "../../model/live-meeting";
import { deriveMeetingStage, type StagePhase } from "../../model/meeting-stage";
import { CouncilTable } from "./council-table";
import { StageCenter } from "./stage-center";

function phaseBadge(phase: StagePhase): { tone: "live" | "info" | "success" | "neutral"; label: string } {
  if (phase.kind === "discussion") return { tone: "live", label: "قيد المناقشة" };
  if (phase.kind === "voting") return { tone: "info", label: "التصويت مفتوح" };
  if (phase.kind === "result") return { tone: "success", label: "صدرت نتيجة التصويت" };
  return { tone: "neutral", label: "بانتظار البدء" };
}

const headerButton = "min-h-11 rounded-q-control border border-q-on-header/40 bg-transparent px-4 font-sans text-q-ui font-bold text-q-on-header";

type Props = {
  session: LiveMeetingSession;
  agenda: AgendaDiscussionItem[];
  rounds: VotingRound[];
  decisions: Decision[];
  /** The room owns the theme so the whole room, not only the scene, follows it. */
  dark: boolean;
  onToggleTheme: () => void;
  /** Given to whoever runs the session: shows the room on the hall screen without controls. */
  presentation?: { active: boolean; onToggle: () => void };
  /** Hides the current-item strip when the full topic card is shown right under the scene. */
  hideCurrentItem?: boolean;
};

/**
 * The shared scene at the top of the live meeting room: who is at the table,
 * the quorum, and what the council is doing right now. It is read-only and is
 * derived on every refresh from the data the room already loads.
 */
export function RoomStage({ session, agenda, rounds, decisions, dark, onToggleTheme, presentation, hideCurrentItem = false }: Props) {
  const { seats, phase } = deriveMeetingStage(session, agenda, rounds, decisions);

  const manager = session.viewer.can_manage_session;
  const rapporteur = session.viewer.mode === "rapporteur";
  const roleLabel = manager ? "لوحة رئيس المجلس" : rapporteur ? "لوحة مقرر المجلس" : "بوابة عضو المجلس";
  const roleDescription = manager
    ? "أدر الحضور والنصاب وجدول الأعمال من مساحة قيادة واحدة."
    : rapporteur
      ? "شغّل الحضور ووثّق سير المناقشات، بينما تبقى الاعتمادات النهائية للرئيس."
      : `مرحباً ${session.viewer.full_name_ar}، تابع الجلسة وصوّت عند فتح الجولة.`;

  const quorum = session.quorum;
  const quorumOk = quorum?.quorum_status === "met" || (quorum?.actual_percentage ?? 0) >= (quorum?.required_percentage ?? 100);
  const currentItem = "item" in phase ? phase.item : null;
  const badge = phaseBadge(phase);

  return (
    <section aria-label="مشهد الاجتماع" className="overflow-hidden rounded-q-card border border-q-border bg-q-bg font-sans text-q-text">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-q-header p-5 text-q-on-header">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="info">{roleLabel}</Badge>
            <Badge tone="live">جلسة حية</Badge>
          </div>
          <h1 className="m-0 text-q-h2 font-bold">{session.meeting.title_ar}</h1>
          <p className="m-0 mt-1 text-q-caption opacity-80">{roleDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col items-start gap-1">
            <span className="text-q-caption opacity-80">النصاب الحالي</span>
            <Badge tone={quorumOk ? "success" : "warning"}>
              {quorumOk ? "مكتمل" : "غير مكتمل"} · {quorum?.present_members ?? 0} من {quorum?.eligible_members ?? 0} ({quorum?.actual_percentage ?? 0}%)
            </Badge>
          </div>
          <button type="button" onClick={onToggleTheme} aria-pressed={dark} className={headerButton}>
            {dark ? "الوضع الفاتح" : "الوضع الليلي"}
          </button>
          {presentation && (
            <button type="button" onClick={presentation.onToggle} aria-pressed={presentation.active} className={headerButton}>
              {presentation.active ? "إنهاء وضع العرض" : "وضع العرض على الشاشة"}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <CouncilTable seats={seats}><StageCenter phase={phase} /></CouncilTable>

        {currentItem && !hideCurrentItem && (
          <Card live={phase.kind === "discussion"} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-q-caption font-bold text-q-text-2">البند {currentItem.agenda_order} من {agenda.length}{currentItem.workflow_step_name_ar ? ` · ${currentItem.workflow_step_name_ar}` : ""}</p>
              <p className="m-0 mt-1 text-q-h3 font-bold">{currentItem.topic?.title_ar ?? "بند جدول الأعمال"}</p>
            </div>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </Card>
        )}
      </div>
    </section>
  );
}
