"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Download, FileCheck2, Gavel, History, MessageSquareText, Paperclip, Play, Save, Vote } from "lucide-react";
import type { AgendaDiscussionItem, Decision, LiveMeetingSession, MyVote, TopicGovernanceHistory, VotingRound } from "../model/live-meeting";
import type { MeetingTopicAttachment } from "../model/meeting";
import { OpenVoteCard, type VoteValue } from "./open-vote-card";
import { TopicAttachmentsPanel } from "./topic-attachments-panel";
import { VoteResultPanel } from "./vote-result-panel";
import { TopicInstructions } from "@/features/governance-v2/ui/topic-instructions";

type DiscussionStatus = "under_discussion" | "discussed" | "postponed";
type UpdateDiscussion = (item: AgendaDiscussionItem, status: DiscussionStatus, notes: string | null) => Promise<boolean>;

export function LiveAgendaConsole({ session, agenda, attachments, topicHistory, myVotes, rounds, decisions, busy, onCastVote, onUpdateDiscussion, onOpenRound, onCloseRound, onCreateDecision, onComplete }: {
  session: LiveMeetingSession; agenda: AgendaDiscussionItem[]; attachments: MeetingTopicAttachment[]; topicHistory: Record<string, TopicGovernanceHistory>; myVotes: MyVote[]; rounds: VotingRound[]; decisions: Decision[]; busy: boolean;
  onCastVote: (roundId: string, value: VoteValue, note: string | null) => void; onUpdateDiscussion: UpdateDiscussion;
  onOpenRound: (item: AgendaDiscussionItem) => void; onCloseRound: (round: VotingRound) => void;
  onCreateDecision: (round: VotingRound, item: AgendaDiscussionItem) => void; onComplete: () => void;
}) {
  const manager = session.viewer.can_manage_voting;
  const recorder = session.viewer.mode === "rapporteur";
  const ordered = [...agenda].sort((a, b) => a.agenda_order - b.agenda_order);
  const pendingVotes = myVotes.filter((vote) => !vote.has_voted);
  const quorumOk = session.quorum?.quorum_status === "met" || (session.quorum?.actual_percentage ?? 0) >= (session.quorum?.required_percentage ?? 100);
  const workflowActiveItemId = ordered.find((item) => item.agenda_status === "under_discussion"
    || rounds.some((round) => round.agenda_item_id === item.id && round.status === "open")
    || session.open_voting_rounds.some((round) => round.agenda_item_id === item.id))?.id ?? null;
  const blockedItemId = ordered.find((item) => {
    const closed = latestClosedRound(rounds, item.id);
    return !["discussed", "postponed"].includes(item.agenda_status ?? "pending")
      || (item.discussion_notes ?? "").trim().length < 5
      || (item.requires_voting && !closed)
      || (closed?.result === "approved" && !decisions.some((decision) => decision.agenda_item_id === item.id));
  })?.id ?? null;
  const activeItemId = workflowActiveItemId ?? blockedItemId;
  const [expandedOverride, setExpandedOverride] = useState<{ activeItemId: string | null; itemId: string | null } | null>(null);
  const expandedItemId = expandedOverride?.activeItemId === activeItemId ? expandedOverride.itemId : activeItemId;
  const completionBlockers = getCompletionBlockers(session, ordered, rounds, decisions, quorumOk);
  const canComplete = completionBlockers.length === 0;

  return <div className="space-y-5">
    {pendingVotes.map((vote) => <OpenVoteCard key={vote.voting_round_id} vote={vote} busy={busy} onCast={onCastVote} />)}
    <section className="overflow-hidden rounded-[1.6rem] border border-[#dce6ef] bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7edf3] bg-[#fbfdff] px-5 py-4 sm:px-6"><div><p className="text-[9px] font-black text-[#f28c28]">الجلسة حسب ترتيب جدول الأعمال</p><h2 className="mt-1 text-base font-black text-[#0a1b35]">المناقشات والنتائج والتصويت</h2><p className="mt-1 text-[10px] text-[#73869a]">{manager ? "أنه المناقشة، افتح التصويت، ثم راجع الملخص النهائي بعد احتساب النتيجة." : recorder ? "دوّن ملاحظات المناقشة، ثم أكمل الملخص النهائي بعد إغلاق التصويت." : "تابع البنود بالترتيب وشارك في التصويت عند فتحه."}</p></div><span className="rounded-full bg-[#eaf4fd] px-3 py-1.5 text-[10px] font-black text-[#0877d6]">{ordered.length} بنود</span></header>
      <div className="space-y-3 p-4 sm:p-6">{ordered.length === 0 ? <EmptyAgenda /> : ordered.map((item) => <AgendaCard key={item.id} item={item} attachments={attachments.filter((attachment) => attachment.topic_id === item.topic?.id)} history={item.topic?.id ? topicHistory[item.topic.id] : undefined} session={session} rounds={rounds} decisions={decisions} busy={busy} quorumOk={quorumOk} expanded={expandedItemId === item.id} onToggle={() => setExpandedOverride({ activeItemId, itemId: expandedItemId === item.id ? null : item.id })} onUpdate={onUpdateDiscussion} onOpenRound={onOpenRound} onCloseRound={onCloseRound} onCreateDecision={onCreateDecision} />)}</div>
      {manager && <footer className="space-y-3 border-t border-[#e7edf3] bg-[#f8fbfe] p-5">
        {!canComplete && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950" role="status">
          <div className="flex items-center gap-2"><AlertCircle size={17} className="shrink-0 text-amber-600" /><h3 className="text-[11px] font-black">لا يمكن إنهاء الجلسة قبل استكمال الإجراءات التالية</h3></div>
          <ul className="mt-2 space-y-1.5 pr-6 text-[10px] font-bold leading-5">{completionBlockers.map((blocker) => <li key={blocker} className="list-disc">{blocker}</li>)}</ul>
        </div>}
        <button onClick={onComplete} disabled={busy || !canComplete} title={!canComplete ? completionBlockers.join("، ") : "إنهاء الجلسة"} className="w-full rounded-xl bg-[#0877d6] px-5 py-3 text-xs font-black text-white shadow-lg transition hover:bg-[#0668bd] disabled:cursor-not-allowed disabled:bg-[#aab5c1]">إنهاء الجلسة والانتقال إلى إعداد المحضر</button>
      </footer>}
    </section>
  </div>;
}

function AgendaCard({ item, attachments, history, session, rounds, decisions, busy, quorumOk, expanded, onToggle, onUpdate, onOpenRound, onCloseRound, onCreateDecision }: {
  item: AgendaDiscussionItem; attachments: MeetingTopicAttachment[]; history?: TopicGovernanceHistory; session: LiveMeetingSession; rounds: VotingRound[]; decisions: Decision[]; busy: boolean; quorumOk: boolean; expanded: boolean;
  onToggle: () => void;
  onUpdate: UpdateDiscussion; onOpenRound: (item: AgendaDiscussionItem) => void; onCloseRound: (round: VotingRound) => void;
  onCreateDecision: (round: VotingRound, item: AgendaDiscussionItem) => void;
}) {
  const [notes, setNotes] = useState(item.discussion_notes ?? "");
  const [editingPhase, setEditingPhase] = useState<"preliminary" | "final" | null>(null);
  const [savedPhase, setSavedPhase] = useState<"preliminary" | "final" | null>(null);
  const manager = session.viewer.can_manage_voting;
  const recorder = session.viewer.mode === "rapporteur";
  const chair = session.viewer.mode === "chair";
  const open = rounds.find((round) => round.agenda_item_id === item.id && round.status === "open")
    ?? session.open_voting_rounds.find((round) => round.agenda_item_id === item.id);
  const closed = [...rounds].reverse().find((round) => round.agenda_item_id === item.id && round.status === "closed");
  const decision = decisions.find((row) => row.agenda_item_id === item.id);
  const remainingVoters = open?.participation?.filter((person) => !person.has_voted).length
    ?? Math.max(0, (open?.eligible_voter_count ?? 0) - (open?.votes_cast_count ?? 0));
  const state = agendaState(item.agenda_status);
  const valid = notes.trim().length >= 5;
  const changed = notes.trim() !== (item.discussion_notes ?? "").trim();
  const votingFinished = Boolean(closed);
  const hasVoting = Boolean(item.requires_voting || open || closed);
  const summaryPhase = votingFinished ? "final" : "preliminary";
  const editorOpen = editingPhase === summaryPhase || !(item.discussion_notes ?? "").trim();
  const canEditSummary = recorder && ["under_discussion", "discussed"].includes(item.agenda_status ?? "");
  const showSummary = recorder || chair || (Boolean(item.discussion_notes) && (votingFinished || !item.requires_voting || item.agenda_status === "postponed"));

  function postpone() {
    const reason = window.prompt("سبب تأجيل البند (5 أحرف على الأقل):", item.discussion_notes ?? "");
    if (reason && reason.trim().length >= 5) onUpdate(item, "postponed", reason.trim());
  }

  async function saveSummary() {
    const saved = await onUpdate(item, item.agenda_status as DiscussionStatus, notes.trim());
    if (!saved) return;
    setSavedPhase(summaryPhase);
    setEditingPhase(null);
  }

  const headerTone = agendaHeaderTone(item.agenda_status, Boolean(open), Boolean(closed));

  return <article className={`overflow-hidden rounded-[1.35rem] border transition ${item.agenda_status === "under_discussion" ? "border-blue-300 bg-white shadow-[0_12px_38px_rgba(8,119,214,.10)]" : "border-[#dfe8f0] bg-white"}`}>
    <div className={`flex flex-wrap items-center gap-3 border-r-4 p-4 transition sm:px-5 ${headerTone} ${expanded ? "border-b border-b-[#e6edf4]" : ""}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-black ${item.agenda_status === "under_discussion" ? "bg-[#0877d6] text-white" : "bg-[#eaf4fd] text-[#0877d6]"}`}>{item.agenda_order}</span>
      <div className="min-w-44 flex-1"><h3 className="text-sm font-black leading-6 text-[#172a42]">{item.topic?.title_ar ?? "موضوع الاجتماع"}</h3><div className="mt-1.5 flex flex-wrap gap-1.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black ${state.tone}`}>{state.label}</span><VotingRequirement item={item} open={Boolean(open)} closed={closed} />{closed?.result === "approved" && !decision && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black text-amber-800">بانتظار صياغة القرار</span>}{decision && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">{decision.decision_no}</span>}</div></div>
      <div className="flex items-center gap-2">
        {manager && item.agenda_status === "pending" && <button onClick={() => onUpdate(item, "under_discussion", item.discussion_notes ?? null)} disabled={busy} className="flex items-center gap-1 rounded-xl bg-[#0877d6] px-4 py-2.5 text-[10px] font-black text-white shadow-sm transition hover:bg-[#0668bd]"><Play size={13} />بدء المناقشة</button>}
        <button type="button" onClick={onToggle} aria-expanded={expanded} title={expanded ? "طي تفاصيل الموضوع" : "عرض تفاصيل الموضوع"} className="flex items-center gap-1 rounded-xl border border-[#cdddea] bg-white/90 px-3 py-2.5 text-[10px] font-black text-[#31506d] shadow-sm transition hover:border-[#8cbce5] hover:text-[#0877d6]">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{expanded ? "طي" : "عرض"}
        </button>
      </div>
    </div>
    {expanded && item.discussion_instructions?.trim() && <div className="px-4 sm:px-5"><TopicInstructions title="تعليمات المناقشة" text={item.discussion_instructions}/></div>}
    {expanded && attachments.length > 0 && <div className="border-b border-[#e6edf4] bg-white p-4 sm:px-5"><TopicAttachmentsPanel meetingId={session.meeting.id} attachments={attachments} /></div>}
    {expanded && history && (history.meetings.length > 0 || (history.priorRoute?.steps.length ?? 0) > 0) && <TopicHistoryPanel history={history} />}
    {expanded && showSummary && (item.agenda_status === "under_discussion" || item.agenda_status === "discussed" || Boolean(item.discussion_notes)) && <div className="bg-white/80 p-4"><div className="mb-2 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><MessageSquareText size={16} className="text-[#0877d6]" /><div><h4 className="text-[11px] font-black text-[#172a42]">{votingFinished ? "ملخص النتائج والتوصيات النهائي" : "ملاحظات المناقشة الأولية"}</h4><p className="text-[9px] text-[#7a8da1]">{recorder ? votingFinished ? "أكمل النتيجة النهائية بعد التصويت لتغذية مسودة المحضر." : "يمكن حفظ ملاحظات أولية الآن، ولا تعيق فتح التصويت." : chair ? "نسخة متابعة للرئيس؛ التحرير من اختصاص مقرر المجلس." : "النتيجة النهائية المعتمدة لهذا البند."}</p></div></div>{recorder && changed && <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-700">غير محفوظ</span>}</div>
      {recorder && editorOpen ? <textarea value={notes} onChange={(event) => { setNotes(event.target.value); setSavedPhase(null); }} disabled={!canEditSummary} placeholder={votingFinished ? "اكتب خلاصة المناقشة ونتيجة التصويت والتوصية النهائية..." : "دوّن ملاحظات المناقشة الأولية إن وجدت..."} className="min-h-28 w-full resize-y rounded-xl border border-[#d8e4ee] bg-white p-3 text-[11px] leading-6 text-[#243a52] outline-none focus:border-[#0877d6] focus:ring-2 focus:ring-blue-100 disabled:bg-[#f6f8fa]" /> : <div className="min-h-20 rounded-xl border border-[#d8e4ee] bg-[#f8fbfe] p-3 text-[11px] leading-6 text-[#243a52]">{notes || item.discussion_notes || "لم يحفظ المقرر ملاحظات بعد، وهذا لا يمنع فتح التصويت."}</div>}
      {canEditSummary && <div className="mt-3 flex flex-wrap items-center gap-2">{editorOpen ? <button onClick={() => void saveSummary()} disabled={busy || !valid || !changed} className="flex items-center gap-1 rounded-xl bg-[#0877d6] px-3 py-2 text-[10px] font-black text-white transition hover:bg-[#0668bd] disabled:opacity-40"><Save size={13} />{votingFinished ? "حفظ الملخص النهائي" : "حفظ ملاحظات المقرر"}</button> : <button onClick={() => setEditingPhase(summaryPhase)} className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-[10px] font-black text-blue-700">تعديل الملخص</button>}{savedPhase === summaryPhase && !editorOpen && <span role="status" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700"><CheckCircle2 size={13} />تم الحفظ بنجاح</span>}</div>}
    </div>}
    {hasVoting && expanded && <div className="border-t border-[#dbe8f3] bg-gradient-to-l from-[#f7fbff] to-white p-4 sm:p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[9px] font-black text-[#0877d6]">التصويت والقرار</p><h4 className="mt-1 text-[11px] font-black text-[#172a42]">{open ? "الجولة مفتوحة للأعضاء" : closed ? `انتهى التصويت: ${voteResultLabel(closed.result)}` : item.agenda_status === "under_discussion" ? "الخطوة التالية: إنهاء المناقشة" : "الجولة جاهزة للفتح"}</h4></div><VoteProgress discussed={item.agenda_status === "discussed"} open={Boolean(open)} closed={Boolean(closed)} /></div>
      {manager && open && <div className="mb-3"><VoteResultPanel round={open} live /></div>}
      {closed && <div className="mb-3"><VoteResultPanel round={closed} /></div>}
      {manager ? <div className="flex flex-wrap gap-2 rounded-xl border border-[#e1eaf2] bg-white p-3">{item.agenda_status === "under_discussion" && !open && !closed ? <><button onClick={() => onUpdate(item, "discussed", item.discussion_notes ?? null)} disabled={busy} className="flex items-center gap-1 rounded-xl bg-[#0877d6] px-3 py-2 text-[10px] font-black text-white"><CheckCircle2 size={13} />إنهاء المناقشة والانتقال للتصويت</button><button onClick={postpone} disabled={busy} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-[10px] font-black text-amber-700">تأجيل البند</button></> : open ? <div className="flex flex-1 flex-wrap items-center gap-2"><button onClick={() => onCloseRound(open)} disabled={busy || remainingVoters > 0} title={remainingVoters > 0 ? `بانتظار تصويت ${remainingVoters} من الأعضاء المؤهلين` : "إغلاق الجولة واحتساب النتيجة"} className="rounded-xl bg-[#0877d6] px-4 py-2.5 text-[10px] font-black text-white shadow-sm transition hover:bg-[#0668bd] disabled:cursor-not-allowed disabled:bg-[#aab8c7]">إغلاق التصويت واحتساب النتيجة</button>{remainingVoters > 0 && <span className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">بانتظار {remainingVoters} {remainingVoters === 1 ? "عضو" : "أعضاء"} قبل الإغلاق</span>}</div> : closed?.result === "approved" && !decision ? <button onClick={() => onCreateDecision(closed, item)} disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-black text-white shadow-sm transition hover:bg-emerald-700">صياغة القرار المعتمد</button> : decision ? <span className="rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-700">{decision.decision_no} · تم إنشاء القرار</span> : closed ? <span className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">تم توثيق نتيجة التصويت لهذا البند.</span> : item.voting_available_now ? <button onClick={() => onOpenRound(item)} disabled={busy || !session.meeting.attendance_locked || !quorumOk} title={!session.meeting.attendance_locked ? "ثبّت سجل الحضور أولًا" : !quorumOk ? "النصاب غير مكتمل" : "فتح جولة تصويت"} className="flex items-center gap-1 rounded-xl bg-[#0877d6] px-3 py-2 text-[10px] font-black text-white disabled:bg-[#aab8c7]"><Vote size={13} />فتح التصويت للأعضاء</button> : <span className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">أنه المناقشة أولًا لتفعيل خطوة التصويت.</span>}</div> : !closed && <p className="rounded-xl border border-[#e1eaf2] bg-white px-3 py-2 text-[10px] font-bold text-[#60758a]">{open ? "التصويت مفتوح الآن؛ استخدم بطاقة التصويت الظاهرة أعلى الصفحة." : "بانتظار رئيس المجلس لإنهاء المناقشة وفتح الجولة."}</p>}
    </div>}
    {expanded && !item.requires_voting && manager && item.agenda_status === "under_discussion" && <div className="flex flex-wrap gap-2 border-t border-[#e7edf3] bg-[#f8fbfe] p-4"><button onClick={() => onUpdate(item, "discussed", item.discussion_notes ?? null)} disabled={busy} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black text-white">إنهاء المناقشة</button><button onClick={postpone} disabled={busy} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-[10px] font-black text-amber-700">تأجيل مع السبب</button></div>}
  </article>;
}

function EmptyAgenda() { return <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-[#cddbe8] bg-[#f9fbfd] text-center"><div><FileCheck2 className="mx-auto text-[#9db3c7]" size={30} /><h3 className="mt-3 text-sm font-black text-[#31475e]">لا توجد بنود في جدول الأعمال</h3></div></div>; }

function TopicHistoryPanel({ history }: { history: TopicGovernanceHistory }) {
  return <section className="border-b border-[#dce8f2] bg-[#f7fbff] p-4 sm:px-5" aria-label="سجل الموضوع في المجالس السابقة">
    <div className="mb-3 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><History size={17} /></span><div><h4 className="text-[12px] font-black text-[#173652]">ما سبق على الموضوع قبل هذا الاجتماع</h4><p className="mt-1 text-[9px] leading-5 text-[#6d8297]">القرارات والتصويت والمحاضر المرتبطة بالموضوع؛ لتكون أمام المجلس أثناء المناقشة.</p></div></div>
    <div className="space-y-3">
      {(history.priorRoute?.steps ?? []).map((step) => <article key={step.id} className="rounded-xl border border-[#cfe2f3] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h5 className="text-[11px] font-black text-[#173652]">{step.responsible_unit_name_ar || step.step_title}</h5><p className="mt-1 text-[9px] text-[#75899d]">{step.meeting_reference || "اجتماع سابق خارج النظام"} · {dateLabel(step.meeting_date)}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">{decisionTypeLabel(step.decision_type)}</span></div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2"><div className="rounded-lg bg-emerald-50/70 p-3"><p className="flex items-center gap-1 text-[9px] font-black text-emerald-700"><Gavel size={12} />القرار أو التوصية</p><p className="mt-1 text-[10px] font-bold leading-5 text-[#35546a]">{step.decision_text}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-[9px] font-black text-slate-600">سبب احتساب المرحلة مكتملة</p><p className="mt-1 text-[10px] leading-5 text-[#526a81]">{step.bypass_reason}</p></div></div>
        {step.attachments.length > 0 && <div className="mt-3"><p className="mb-2 flex items-center gap-1 text-[9px] font-black text-[#526a81]"><Paperclip size={12} />محضر المجلس والمرفقات ({step.attachments.length})</p><div className="flex flex-wrap gap-2">{step.attachments.map((file) => <a key={file.id} href={file.file_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#d8e5ef] bg-white px-3 py-2 text-[9px] font-black text-[#0877d6] hover:bg-blue-50"><Download size={12} /><span className="truncate">{file.file_name}</span></a>)}</div></div>}
      </article>)}
      {history.meetings.map((entry) => <article key={entry.agenda_item_id} className="rounded-xl border border-[#dce6ef] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h5 className="text-[11px] font-black text-[#173652]">{entry.meeting.title}</h5><p className="mt-1 text-[9px] text-[#75899d]">{entry.meeting.meeting_no || "اجتماع سابق"} · {entry.meeting.unit_name || "المجلس المختص"} · {dateLabel(entry.meeting.scheduled_date)}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black text-blue-700">اجتماع سابق داخل النظام</span></div>
        {entry.discussion_notes && <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-[9px] font-black text-slate-600">ملخص المناقشة والتوصيات</p><p className="mt-1 text-[10px] leading-5 text-[#526a81]">{entry.discussion_notes}</p></div>}
        <div className="mt-3 grid gap-2 lg:grid-cols-2"><div><p className="mb-1 text-[9px] font-black text-[#61758c]">نتائج التصويت</p>{entry.voting_rounds.length ? entry.voting_rounds.map((round) => <div key={round.id} className="mb-1 rounded-lg border border-[#e4ecf3] p-2.5 text-[9px] text-[#536980]"><strong>{voteResultLabel(round.result)}</strong><span className="mr-2">موافق {round.approve_count ?? 0} · رافض {round.reject_count ?? 0} · ممتنع {round.abstain_count ?? 0}</span></div>) : <p className="rounded-lg bg-slate-50 p-2.5 text-[9px] text-[#7b8da0]">لا توجد جولة تصويت مسجلة.</p>}</div><div><p className="mb-1 text-[9px] font-black text-[#61758c]">القرارات الصادرة</p>{entry.decisions.length ? entry.decisions.map((decision) => <div key={decision.id} className="mb-1 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5"><strong className="text-[9px] text-emerald-800">{decision.decision_no}</strong><p className="mt-1 text-[10px] leading-5 text-[#35546a]">{decision.decision_text}</p></div>) : <p className="rounded-lg bg-slate-50 p-2.5 text-[9px] text-[#7b8da0]">لا يوجد قرار صادر.</p>}</div></div>
      </article>)}
    </div>
  </section>;
}

function dateLabel(value?: string) { return value ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "دون تاريخ"; }
function decisionTypeLabel(value: string) { return ({ approved: "موافقة", recommended: "توصية بالموافقة", rejected: "رفض", deferred: "تأجيل", returned: "إعادة للاستكمال" } as Record<string, string>)[value] ?? "قرار موثق"; }
function agendaState(status?: string) { if (status === "under_discussion") return { label: "قيد المناقشة", tone: "bg-blue-100 text-blue-700" }; if (status === "discussed") return { label: "تمت المناقشة", tone: "bg-emerald-100 text-emerald-700" }; if (status === "postponed") return { label: "مؤجل", tone: "bg-amber-100 text-amber-700" }; return { label: "لم يبدأ", tone: "bg-slate-100 text-slate-600" }; }
function agendaHeaderTone(status: string | undefined, open: boolean, closed: boolean) { if (open || status === "under_discussion") return "border-r-[#0877d6] bg-gradient-to-l from-[#edf7ff] to-white"; if (closed || status === "discussed") return "border-r-emerald-500 bg-gradient-to-l from-emerald-50/80 to-white"; if (status === "postponed") return "border-r-amber-500 bg-gradient-to-l from-amber-50/80 to-white"; return "border-r-slate-300 bg-gradient-to-l from-slate-50 to-white"; }
function VotingRequirement({ item, open, closed }: { item: AgendaDiscussionItem; open: boolean; closed?: VotingRound }) { if (closed) return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">التصويت مغلق · {voteFinalStatusLabel(closed.result)}</span>; if (open) return <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black text-blue-700">التصويت مفتوح الآن</span>; if (item.voting_available_now) return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">جاهز لفتح التصويت</span>; if (item.requires_voting) return <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">يتطلب تصويتًا في المسار</span>; return <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">عرض ومناقشة</span>; }
function VoteProgress({ discussed, open, closed }: { discussed: boolean; open: boolean; closed: boolean }) { const active = closed ? 3 : open ? 2 : discussed ? 1 : 0; return <div className="flex items-center gap-1" aria-label="مراحل التصويت">{["إنهاء المناقشة", "فتح الجولة", "احتساب النتيجة"].map((label, index) => <span key={label} title={label} className={`h-2.5 w-8 rounded-full ${index <= active ? "bg-[#0877d6]" : "bg-[#d8e5f0]"}`} />)}</div>; }
function voteResultLabel(result?: string | null) { return result === "approved" ? "موافق" : result === "rejected" ? "غير موافق" : result === "no_votes" ? "لم يصوت أحد" : result === "tied" ? "تعادل" : "لم تُحتسب النتيجة"; }
function voteFinalStatusLabel(result?: string) { return result === "approved" ? "النتيجة: موافقة" : result === "rejected" ? "النتيجة: رفض" : result === "no_votes" ? "دون أصوات" : result === "cancelled" ? "ملغي" : "تعادل"; }

function latestClosedRound(rounds: VotingRound[], agendaItemId: string) {
  return [...rounds].reverse().find((round) => round.agenda_item_id === agendaItemId && round.status === "closed");
}

function getCompletionBlockers(session: LiveMeetingSession, agenda: AgendaDiscussionItem[], rounds: VotingRound[], decisions: Decision[], quorumOk: boolean) {
  const blockers: string[] = [];
  if (!session.meeting.attendance_locked) blockers.push("تثبيت سجل الحضور.");
  if (!quorumOk) blockers.push("اكتمال النصاب النظامي للاجتماع.");

  agenda.forEach((item) => {
    const label = `البند ${item.agenda_order} «${item.topic?.title_ar ?? "موضوع الاجتماع"}»`;
    const open = rounds.some((round) => round.agenda_item_id === item.id && round.status === "open")
      || session.open_voting_rounds.some((round) => round.agenda_item_id === item.id);
    const closed = latestClosedRound(rounds, item.id);
    if (!["discussed", "postponed"].includes(item.agenda_status ?? "pending")) blockers.push(`${label}: إنهاء المناقشة أو تأجيل البند بسبب موثق.`);
    if ((item.discussion_notes ?? "").trim().length < 5) blockers.push(`${label}: حفظ ملخص النتائج والتوصيات.`);
    else if (closed?.closed_at && item.updated_at && new Date(item.updated_at).getTime() < new Date(closed.closed_at).getTime()) blockers.push(`${label}: تحديث الملخص النهائي بعد احتساب نتيجة التصويت.`);
    if (item.requires_voting && open) blockers.push(`${label}: إغلاق جولة التصويت المفتوحة واحتساب النتيجة.`);
    else if (item.requires_voting && !closed) blockers.push(`${label}: إجراء التصويت وإغلاق الجولة.`);
    if (closed?.result === "approved" && !decisions.some((decision) => decision.agenda_item_id === item.id)) blockers.push(`${label}: صياغة القرار المعتمد بعد نتيجة الموافقة.`);
  });

  return blockers;
}
