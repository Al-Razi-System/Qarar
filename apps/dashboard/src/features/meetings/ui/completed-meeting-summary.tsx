"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { CheckCircle2, FileCheck2, LoaderCircle, UserCheck, UserMinus, Users, Vote } from "lucide-react";
import { meetingRpc } from "../api/meetings-client";
import type { MeetingDetail, MeetingTopicAttachment } from "../model/meeting";
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

  if (loading) return <section className="grid min-h-40 place-items-center border-t border-[#edf1f5] p-5"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-[#0877d6]" size={24} /><p className="mt-2 text-[10px] font-bold text-[#718399]">جارٍ تحميل سجل الاجتماع الكامل…</p></div></section>;
  if (error || !data) return <section className="border-t border-[#edf1f5] p-5"><p className="rounded-xl border border-red-200 bg-red-50 p-3 text-[10px] font-bold text-red-800">{error ?? "تعذر تحميل سجل الاجتماع."}</p></section>;

  const roundsCount = data.agenda_items.reduce((sum, item) => sum + item.voting_rounds.length, 0);
  const decisionsCount = data.agenda_items.reduce((sum, item) => sum + item.decisions.length, 0);

  return <section className="space-y-5 border-t border-[#edf1f5] bg-[#fbfdff] p-5" aria-label="سجل الاجتماع المكتمل">
    <div>
      <p className="text-[10px] font-black text-[#f17822]">السجل النهائي للاجتماع</p>
      <h3 className="mt-1 text-sm font-black text-[#0a1330]">الحضور والموضوعات والتصويت والقرارات</h3>
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
      <article className="overflow-hidden rounded-2xl border border-[#dfe8f1] bg-white">
        <header className="flex items-center justify-between border-b border-[#e8eff5] bg-[#f6faff] px-4 py-3"><h4 className="text-xs font-black text-[#18324e]">كشف الحضور</h4><span className="text-[9px] font-bold text-[#6f8297]">النصاب {data.quorum?.actual_percentage ?? 0}%</span></header>
        <div className="max-h-80 divide-y divide-[#edf2f6] overflow-y-auto">{data.attendance.records.length ? data.attendance.records.map((record) => <div key={record.id} className="flex items-center gap-3 px-4 py-3"><span className={`h-2.5 w-2.5 rounded-full ${record.status === "present" || record.status === "late" ? "bg-emerald-500" : record.status === "absent" ? "bg-red-500" : "bg-amber-500"}`} /><strong className="min-w-0 flex-1 truncate text-[11px] text-[#233b54]">{record.full_name_ar}</strong><span className="text-[9px] font-black text-[#718399]">{attendanceLabels[record.status] ?? record.status}</span></div>) : <p className="p-5 text-center text-[10px] text-[#718399]">لا توجد سجلات حضور محفوظة.</p>}</div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-[#dfe8f1] bg-white">
        <header className="flex items-center justify-between border-b border-[#e8eff5] bg-[#f6faff] px-4 py-3"><h4 className="text-xs font-black text-[#18324e]">نتائج موضوعات الاجتماع</h4><span className="text-[9px] font-bold text-[#6f8297]">{data.agenda_items.length} موضوع</span></header>
        <div className="divide-y divide-[#edf2f6]">{data.agenda_items.map((item) => {
          const finalRound = [...item.voting_rounds].reverse().find((round) => round.status === "closed") ?? item.voting_rounds.at(-1);
          const decision = item.decisions.at(-1);
          return <div key={item.id} className="space-y-3 p-4">
            <div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#e5f2ff] text-[11px] font-black text-[#0877d6]">{item.agenda_order}</span><div className="min-w-0 flex-1"><strong className="block text-xs leading-5 text-[#142d47]">{item.topic?.title_ar ?? "موضوع الاجتماع"}</strong><p className="mt-0.5 text-[9px] text-[#7a8b9d]">{item.topic?.topic_no ?? "—"} · {agendaLabels[item.agenda_status ?? "pending"] ?? item.agenda_status}</p></div></div>
            {item.discussion_notes && <p className="rounded-xl bg-[#f7fafc] px-3 py-2 text-[10px] leading-5 text-[#536a81]"><strong className="text-[#27445f]">ملخص المناقشة: </strong>{item.discussion_notes}</p>}
            {item.topic?.id && <TopicAttachmentsPanel meetingId={meeting.id} attachments={attachments.filter((attachment) => attachment.topic_id === item.topic?.id)} compact />}
            {finalRound && <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-[#e2eaf2] p-2 text-center"><VoteStat label="النتيجة" value={voteLabels[finalRound.result ?? ""] ?? finalRound.result ?? "—"} /><VoteStat label="موافق" value={finalRound.approve_count ?? 0} /><VoteStat label="غير موافق" value={finalRound.reject_count ?? 0} /><VoteStat label="ممتنع" value={finalRound.abstain_count ?? 0} /></div>}
            {decision && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-800"><CheckCircle2 size={13} />{decision.decision_no} · {decision.decision_status}</div><p className="mt-1.5 text-[10px] leading-5 text-emerald-900">{decision.decision_text}</p></div>}
          </div>;
        })}</div>
      </article>
    </div>
  </section>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone: "blue" | "green" | "red" | "amber" | "violet" | "slate" }) {
  const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700", slate: "bg-slate-100 text-slate-700" };
  return <div className="rounded-2xl border border-[#e0e8f0] bg-white p-3"><span className={`grid h-8 w-8 place-items-center rounded-xl ${colors[tone]}`}><Icon size={15} /></span><strong className="mt-2 block text-xl font-black text-[#102a44]">{value}</strong><span className="text-[9px] font-bold text-[#77889b]">{label}</span></div>;
}

function VoteStat({ label, value }: { label: string; value: string | number }) {
  return <div><strong className="block text-[10px] text-[#18324e]">{value}</strong><span className="text-[8px] font-bold text-[#8291a2]">{label}</span></div>;
}
