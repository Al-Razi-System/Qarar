"use client";
import { Card } from "@/shared/ui/card";

import { useEffect, useEffectEvent, useState } from "react";
import { CheckCircle2, FileCheck2, LoaderCircle, UserCheck, UserMinus, Users, Vote } from "lucide-react";
import { meetingRpc } from "../api/meetings-client";
import type { MeetingDetail, MeetingTopicAttachment } from "../model/meeting";
import { decisionStatusLabel } from "@/features/tasks/model/follow-up";
import { TopicAttachmentsPanel } from "./topic-attachments-panel";

type CompletedMeetingData = {
  attendance: {
    eligible_count: number;
    present_count: number;
    absent_count: number;
    excused_count: number;
    records: Array<{ id: string; full_name_ar: string; status: string }>;
  };
  quorum: { actual_percentage?: number } | null;
  agenda_items: Array<{
    id: string;
    agenda_order: number;
    agenda_status: string;
    discussion_notes: string | null;
    topic: { id: string; topic_no: string; title_ar: string } | null;
    voting_rounds: Array<{ id: string; status: string; result: string | null; approve_count: number; reject_count: number; abstain_count: number }>;
    decisions: Array<{ id: string; decision_no: string; decision_status: string; decision_text: string }>;
  }>;
  minutes: { id: string; status: string; approvals: Array<{ id: string; full_name_ar: string; approval_status: string; signed_at: string | null }> } | null;
};

const attendanceLabels: Record<string, string> = {
  present: "حاضر",
  late: "حاضر متأخر",
  absent: "غائب",
  excused: "معتذر",
  pending: "غير محسوم",
};

const agendaLabels: Record<string, string> = {
  discussed: "تمت المناقشة",
  postponed: "مؤجل",
  under_discussion: "قيد المناقشة",
  pending: "لم يناقش",
};

const voteLabels: Record<string, string> = {
  approved: "موافق عليه",
  rejected: "مرفوض",
  tied: "تعادل",
  no_votes: "دون أصوات",
  no_vote: "دون تصويت",
};

export function CompletedMeetingSummary({ meeting, attachments }: { meeting: MeetingDetail; attachments: MeetingTopicAttachment[] }) {
  const [data, setData] = useState<CompletedMeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await meetingRpc<CompletedMeetingData>("get_completed_meeting_record", { p_meeting_id: meeting.id }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل سجل الاجتماع المكتمل.");
    } finally {
      setLoading(false);
    }
  }

  const loadCompletedMeeting = useEffectEvent(load);
  useEffect(() => {
    const task = window.setTimeout(() => void loadCompletedMeeting(), 0);
    return () => window.clearTimeout(task);
  }, [meeting.id]);

  if (loading) return <section className="grid min-h-40 place-items-center border-t border-q-surface-2 p-5"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-q-primary" size={24} /><p className="mt-2 text-q-caption font-bold text-q-text-3">جارٍ تحميل سجل الاجتماع الكامل…</p></div></section>;
  if (error || !data) return <section className="border-t border-q-surface-2 p-5"><p className="rounded-q-control border border-q-danger bg-q-danger-soft p-3 text-q-caption font-bold text-q-danger">{error ?? "تعذر تحميل سجل الاجتماع."}</p></section>;

  const roundsCount = data.agenda_items.reduce((sum, item) => sum + item.voting_rounds.length, 0);
  const decisionsCount = data.agenda_items.reduce((sum, item) => sum + item.decisions.length, 0);

  return <section className="space-y-5 border-t border-q-surface-2 bg-q-bg p-5" aria-label="سجل الاجتماع المكتمل">
    <div>
      <h3 className="mt-1 text-q-ui font-bold text-q-text">الحضور والموضوعات والتصويت والقرارات</h3>
<p className="text-q-caption font-bold text-q-text-2">السجل النهائي للاجتماع</p>
    </div>

    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Metric icon={Users} label="الأعضاء" value={data.attendance.eligible_count} tone="blue" />
      <Metric icon={UserCheck} label="الحضور" value={data.attendance.present_count} tone="green" />
      <Metric icon={UserMinus} label="الغياب" value={data.attendance.absent_count} tone="red" />
      <Metric icon={UserMinus} label="المعتذرون" value={data.attendance.excused_count} tone="amber" />
      <Metric icon={Vote} label="جولات التصويت" value={roundsCount} tone="violet" />
      <Metric icon={FileCheck2} label="القرارات" value={decisionsCount} tone="slate" />
    </div>

    <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
      <article className="overflow-hidden rounded-q-control border border-q-border bg-q-surface">
        <header className="flex items-center justify-between border-b border-q-border bg-q-surface-2 px-4 py-3"><h4 className="text-q-caption font-bold text-q-text">كشف الحضور</h4><span className="text-q-caption font-bold text-q-text-2">النصاب {data.quorum?.actual_percentage ?? 0}%</span></header>
        <div className="max-h-80 divide-y divide-q-border overflow-y-auto">{data.attendance.records.length ? data.attendance.records.map((record) => <div key={record.id} className="flex items-center gap-3 px-4 py-3"><span className={`h-2.5 w-2.5 rounded-full ${record.status === "present" || record.status === "late" ? "bg-q-success-soft" : record.status === "absent" ? "bg-q-danger-soft" : "bg-q-warning-soft"}`} /><strong className="min-w-0 flex-1 truncate text-q-caption text-q-text">{record.full_name_ar}</strong><span className="text-q-caption font-bold text-q-text-3">{attendanceLabels[record.status] ?? record.status}</span></div>) : <p className="p-5 text-center text-q-caption text-q-text-3">لا توجد سجلات حضور محفوظة.</p>}</div>
      </article>

      <article className="overflow-hidden rounded-q-control border border-q-border bg-q-surface">
        <header className="flex items-center justify-between border-b border-q-border bg-q-surface-2 px-4 py-3"><h4 className="text-q-caption font-bold text-q-text">نتائج موضوعات الاجتماع</h4><span className="text-q-caption font-bold text-q-text-2">{data.agenda_items.length} موضوع</span></header>
        <div className="divide-y divide-q-border">{data.agenda_items.map((item) => {
          const finalRound = [...item.voting_rounds].reverse().find((round) => round.status === "closed") ?? item.voting_rounds.at(-1);
          const decision = item.decisions.at(-1);
          return <div key={item.id} className="space-y-3 p-4">
            <div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-q-control bg-q-surface-2 text-q-caption font-bold text-q-primary">{item.agenda_order}</span><div className="min-w-0 flex-1"><strong className="block text-q-caption leading-5 text-q-text">{item.topic?.title_ar ?? "موضوع الاجتماع"}</strong><p className="mt-0.5 text-q-caption text-q-text-2">{item.topic?.topic_no ?? "—"} · {agendaLabels[item.agenda_status ?? "pending"] ?? item.agenda_status}</p></div></div>
            {item.discussion_notes && <p className="rounded-q-control bg-q-surface-2 px-3 py-2 text-q-caption leading-5 text-q-text-2"><strong className="text-q-text">ملخص المناقشة: </strong>{item.discussion_notes}</p>}
            {item.topic?.id && <TopicAttachmentsPanel meetingId={meeting.id} attachments={attachments.filter((attachment) => attachment.topic_id === item.topic?.id)} compact />}
            {finalRound && <div className="grid grid-cols-4 gap-1.5 rounded-q-control border border-q-border p-2 text-center"><VoteStat label="النتيجة" value={voteLabels[finalRound.result ?? ""] ?? finalRound.result ?? "—"} /><VoteStat label="موافق" value={finalRound.approve_count ?? 0} /><VoteStat label="غير موافق" value={finalRound.reject_count ?? 0} /><VoteStat label="ممتنع" value={finalRound.abstain_count ?? 0} /></div>}
            {decision && <Card className="rounded-q-card border border-q-success bg-q-surface-2 p-3"><div className="flex items-center gap-1.5 text-q-caption font-bold text-q-success"><CheckCircle2 size={13} />{decision.decision_no} · {decisionStatusLabel(decision.decision_status).label}</div><p className="mt-1.5 text-q-caption leading-5 text-q-success">{decision.decision_text}</p></Card>}
          </div>;
        })}</div>
      </article>
    </div>
  </section>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone: "blue" | "green" | "red" | "amber" | "violet" | "slate" }) {
  const colors = { blue: "bg-q-surface-2 text-q-link", green: "bg-q-success-soft text-q-success", red: "bg-q-danger-soft text-q-danger", amber: "bg-q-warning-soft text-q-warning", violet: "bg-q-surface-2 text-q-link", slate: "bg-q-surface-2 text-q-text-2" };
  return <Card className="rounded-q-card border border-q-border bg-q-surface p-3"><span className={`grid h-8 w-8 place-items-center rounded-q-control ${colors[tone]}`}><Icon size={15} /></span><strong className="mt-2 block text-q-h3 font-bold text-q-text">{value}</strong><span className="text-q-caption font-bold text-q-text-2">{label}</span></Card>;
}

function VoteStat({ label, value }: { label: string; value: string | number }) {
  return <div><strong className="block text-q-caption text-q-text">{value}</strong><span className="text-q-caption font-bold text-q-text-2">{label}</span></div>;
}
