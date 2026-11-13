"use client";

import Link from "next/link";
import { Badge } from "@/shared/ui/badge";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { agendaLabel, days, governanceLabel, isGoverned, outcomeCaption, outcomeLabel, shortDate, taskDone, taskStatusLabel, type Activity, type SessionRow } from "../model/performance";

export type ExplorerTab = "sessions" | "topics" | "decisions" | "tasks";
export type ExplorerView = { tab: ExplorerTab; meetingId: string | null; topics: "all" | "governed" | "ungoverned"; tasks: "all" | "open" | "overdue" | "done" };
export const initialView: ExplorerView = { tab: "sessions", meetingId: null, topics: "all", tasks: "all" };

const cell = "px-3 py-3.5 align-top";
const head = "px-3 py-2.5 text-start font-semibold";
const link = "font-semibold text-q-link hover:underline";

const heldTone: Record<SessionRow["outcome"], string> = {
  on_time: "text-q-text", late: "font-semibold text-q-accent-text", missed: "font-semibold text-q-danger",
  overdue: "font-semibold text-q-danger", cancelled: "text-q-text-3", upcoming: "text-q-text-3",
};

function heldText(session: SessionRow) {
  if (session.outcome === "on_time" && session.held_on) return `${shortDate(session.held_on)}، في موعدها`;
  if (session.outcome === "late" && session.held_on) return `${shortDate(session.held_on)}، بعد ${days(session.late_days)}`;
  return outcomeCaption(session);
}

function minutesText(session: SessionRow) {
  if (!session.held_on) return "—";
  if (!session.minutes_approved_on) return session.status === "in_progress" ? "الجلسة جارية" : "لم يُعتمد بعد";
  const gap = Math.round((new Date(session.minutes_approved_on).getTime() - new Date(session.held_on).getTime()) / 86_400_000);
  return gap <= 0 ? "اعتُمد يوم الجلسة" : `اعتُمد بعد ${days(gap)}`;
}

function Table({ columns, empty, children, count }: { columns: string[]; empty: string; count: number; children: React.ReactNode }) {
  if (count === 0) return <p className="m-0 border-t border-q-border p-6 text-q-ui text-q-text-2">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-q-ui">
        <thead><tr className="bg-q-surface-2 text-q-text">{columns.map((column, index) => <th key={column} scope="col" className={`${head} ${index === 0 ? "ps-6" : ""} ${index === columns.length - 1 ? "pe-6" : ""}`}>{column}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Everything behind a council's figures: its sessions, the topics they listed, the decisions issued and the tasks created. */
export function CouncilExplorer({ sessions, activity, view, onChange }: {
  sessions: SessionRow[]; activity: Activity | null; view: ExplorerView; onChange: (view: ExplorerView) => void;
}) {
  const inMeeting = <T extends { meeting_id: string | null }>(rows: T[]) => (view.meetingId ? rows.filter((row) => row.meeting_id === view.meetingId) : rows);
  // Newest first: the follower acts on the latest sessions.
  const ledger = inMeeting(sessions.filter((session) => session.outcome !== "upcoming")).slice().reverse();
  const topics = inMeeting(activity?.topics ?? []).filter((topic) => view.topics === "all" || isGoverned(topic.governance_source) === (view.topics === "governed"));
  const decisions = inMeeting(activity?.decisions ?? []);
  const tasks = inMeeting(activity?.tasks ?? []).filter((task) =>
    view.tasks === "all" || (view.tasks === "done" ? taskDone(task.status) : view.tasks === "overdue" ? task.overdue : !taskDone(task.status)));
  const picked = view.meetingId ? sessions.find((session) => session.meeting_id === view.meetingId) : null;
  const tabs: Array<{ value: ExplorerTab; label: string }> = [
    { value: "sessions", label: `الجلسات ${ledger.length}` },
    { value: "topics", label: `الموضوعات ${inMeeting(activity?.topics ?? []).length}` },
    { value: "decisions", label: `القرارات ${decisions.length}` },
    { value: "tasks", label: `التكليفات ${inMeeting(activity?.tasks ?? []).length}` },
  ];

  return (
    <section aria-label="تفاصيل عمل المجلس" className="overflow-hidden rounded-q-card border border-q-border bg-q-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <SegmentedControl label="ما تريد استعراضه" options={tabs} value={view.tab} onChange={(tab) => onChange({ ...view, tab })} className="flex-wrap" />
        {view.tab === "topics" && <SegmentedControl label="تصفية الموضوعات" value={view.topics} onChange={(value) => onChange({ ...view, topics: value })}
          options={[{ value: "all", label: "الكل" }, { value: "governed", label: "محوكمة" }, { value: "ungoverned", label: "غير محوكمة" }]} />}
        {view.tab === "tasks" && <SegmentedControl label="تصفية التكليفات" value={view.tasks} onChange={(value) => onChange({ ...view, tasks: value })} className="flex-wrap"
          options={[{ value: "all", label: "الكل" }, { value: "open", label: "مفتوحة" }, { value: "overdue", label: "متأخرة" }, { value: "done", label: "منجزة" }]} />}
      </div>
      {picked && (
        <div className="flex flex-wrap items-center gap-3 border-t border-q-border bg-q-bg px-6 py-2 text-q-ui text-q-text-2">
          <span>تعرض ما يخص: <span className="font-semibold text-q-text">{picked.title_ar}</span></span>
          <button type="button" onClick={() => onChange({ ...view, meetingId: null })} className="min-h-11 cursor-pointer border-0 bg-transparent font-sans text-q-ui font-semibold text-q-link hover:underline">عرض كل الجلسات</button>
        </div>
      )}
      {!activity && view.tab !== "sessions" && <div className="border-t border-q-border p-4"><InlineMessage tone="error">تعذر تحميل التفاصيل الآن. حدّث الصفحة للمحاولة مرة أخرى.</InlineMessage></div>}

      {view.tab === "sessions" && (
        <Table count={ledger.length} empty="لم يحِن موعد أي جلسة بعد." columns={["الجلسة", "الموعد المخطط", "الانعقاد", "الحضور", "المحضر", "القرارات", "ما دار فيها"]}>
          {ledger.map((session) => (
            <tr key={session.meeting_id} className="border-t border-q-border">
              <td className={`${cell} ps-6`}><Link href={session.link} className={link}>{session.title_ar}</Link></td>
              <td className={cell}>{shortDate(session.planned_on)}</td>
              <td className={`${cell} ${heldTone[session.outcome]}`}>{heldText(session)}</td>
              <td className={cell}>{session.recorded ? `${session.present ?? 0} من ${session.recorded}` : "—"}</td>
              <td className={cell}>{minutesText(session)}</td>
              <td className={cell}>{session.held_on ? session.decisions : "—"}</td>
              <td className={`${cell} pe-6`}>
                {session.held_on
                  ? <button type="button" aria-label={`موضوعات ${session.title_ar}`} onClick={() => onChange({ ...view, tab: "topics", topics: "all", meetingId: session.meeting_id })} className="cursor-pointer border-0 bg-transparent p-0 font-sans text-q-ui font-semibold text-q-link hover:underline">موضوعاتها</button>
                  : "—"}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {view.tab === "topics" && activity && (
        <Table count={topics.length} empty="لا موضوعات بهذه التصفية." columns={["الموضوع", "الجلسة", "الحوكمة", "في الجلسة", "ما تقرر"]}>
          {topics.map((topic) => (
            <tr key={`${topic.id}-${topic.meeting_id}`} className="border-t border-q-border">
              <td className={`${cell} ps-6`}><Link href={topic.link} className={link}>{topic.title_ar}</Link>{topic.topic_no && <div className="text-q-caption text-q-text-3">{topic.topic_no}</div>}</td>
              <td className={cell}>{topic.meeting_title_ar}<div className="text-q-caption text-q-text-3">{shortDate(topic.meeting_date)}</div></td>
              <td className={cell}><Badge tone={isGoverned(topic.governance_source) ? "info" : "warning"}>{governanceLabel(topic.governance_source)}</Badge></td>
              <td className={cell}>{agendaLabel(topic.agenda_status)}</td>
              <td className={`${cell} pe-6`}>{topic.decision_no ? <>{outcomeLabel(topic.outcome_kind)}<div className="text-q-caption text-q-text-3">{topic.decision_no}</div></> : "لم يصدر قرار"}</td>
            </tr>
          ))}
        </Table>
      )}

      {view.tab === "decisions" && activity && (
        <Table count={decisions.length} empty="لم يصدر قرار." columns={["القرار", "الموضوع", "النتيجة", "الجلسة", "التنفيذ"]}>
          {decisions.map((decision) => (
            <tr key={decision.id} className="border-t border-q-border">
              <td className={`${cell} max-w-md ps-6`}>
                {decision.link ? <Link href={decision.link} className={link}>{decision.decision_no ?? "قرار"}</Link> : <span className="font-semibold">{decision.decision_no ?? "قرار"}</span>}
                <div className="line-clamp-2 text-q-caption text-q-text-2">{decision.decision_text}</div>
              </td>
              <td className={cell}>{decision.topic_title_ar ?? "—"}</td>
              <td className={cell}>{outcomeLabel(decision.outcome_kind)}{decision.type_name_ar && <div className="text-q-caption text-q-text-3">{decision.type_name_ar}</div>}</td>
              <td className={cell}>{decision.meeting_title_ar ?? "—"}<div className="text-q-caption text-q-text-3">{shortDate(decision.issued_at.slice(0, 10))}</div></td>
              <td className={`${cell} pe-6`}>
                {decision.tasks === 0 ? "لا يحتاج تنفيذًا" : (
                  <button type="button" aria-label={`تكليفات ${decision.decision_no ?? "القرار"}`} onClick={() => onChange({ ...view, tab: "tasks", tasks: "all" })} className="cursor-pointer border-0 bg-transparent p-0 text-start font-sans text-q-ui font-semibold text-q-link hover:underline">
                    {decision.tasks_done === decision.tasks ? "نُفّذ كاملًا" : `أُنجز ${decision.tasks_done} من ${decision.tasks}`}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {view.tab === "tasks" && activity && (
        <Table count={tasks.length} empty="لا تكليفات بهذه التصفية." columns={["التكليف", "المكلَّف", "الموعد", "الحالة", "القرار"]}>
          {tasks.map((task) => (
            <tr key={task.id} className="border-t border-q-border">
              <td className={`${cell} ps-6`}><Link href={task.link} className={link}>{task.title_ar}</Link>{task.action_no && <div className="text-q-caption text-q-text-3">{task.action_no}</div>}</td>
              <td className={cell}>{[task.assignee_name_ar, task.assignee_unit_ar].filter(Boolean).join("، ") || "—"}</td>
              <td className={cell}>{task.due_date ? shortDate(task.due_date) : "بلا موعد"}</td>
              <td className={cell}><Badge tone={taskDone(task.status) ? "success" : task.overdue ? "danger" : "neutral"}>{task.overdue ? "متأخر" : taskStatusLabel(task.status)}</Badge></td>
              <td className={`${cell} pe-6`}>{task.decision_no ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
