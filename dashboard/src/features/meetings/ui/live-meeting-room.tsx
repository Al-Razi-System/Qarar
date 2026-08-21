"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle, Check, CheckCircle2, Clock, Copy, Fingerprint, LoaderCircle,
  Lock, Play, RefreshCw, Shield, ThumbsDown, ThumbsUp, Users, Vote, XCircle,
} from "lucide-react";

type Notice = { kind: "success" | "error"; text: string };
type Attendance = { id: string; full_name_ar: string; status: string; verification_status?: string; updated_at: string };
type AgendaItem = { id: string; agenda_order: number; topic?: { title_ar: string } };
type AgendaDiscussionItem = AgendaItem & { agenda_status?: string; discussion_notes?: string | null; updated_at?: string };
type VotingRound = { id: string; agenda_item_id: string; status: string; result?: string; approve_count?: number; reject_count?: number; abstain_count?: number };
type Session = {
  meeting: { id: string; title_ar: string; status: string; updated_at: string; attendance_locked: boolean };
  attendance: Attendance[];
  quorum: { eligible_members?: number; present_members?: number; actual_percentage?: number; required_percentage?: number; quorum_status?: string } | null;
  checkin_session?: { status: string; expires_at: string } | null;
  open_voting_rounds: VotingRound[];
};
type MeetingDetail = { agenda_items?: AgendaDiscussionItem[] };
type MyVote = { voting_round_id: string; title_ar: string; has_voted: boolean };
type Decision = { id: string; decision_no: string; agenda_item_id: string; decision_status: string; decision_text: string };

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, params }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}

const attendanceLabels: Record<string, string> = { present: "حاضر", absent: "غائب", excused: "معتذر", late: "متأخر", pending: "بانتظار التحقق" };
const attendanceTone: Record<string, string> = { present: "bg-emerald-50 text-emerald-700", absent: "bg-red-50 text-red-700", excused: "bg-amber-50 text-amber-700", late: "bg-orange-50 text-orange-700", pending: "bg-slate-100 text-slate-600" };

export function LiveMeetingRoom({ meetingId }: { meetingId: string }) {
  const [tab, setTab] = useState<"attendance" | "voting">("attendance");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [agenda, setAgenda] = useState<AgendaDiscussionItem[]>([]);
  const [myVotes, setMyVotes] = useState<MyVote[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [rounds, setRounds] = useState<VotingRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkinToken, setCheckinToken] = useState<string | null>(null);

  useEffect(() => { void load(); }, [meetingId]);

  async function load() {
    setLoading(true);
    try {
      const [live, detail, votes, meetingDecisions, meetingRounds] = await Promise.all([
        rpc<Session>("get_meeting_session_detail", { p_meeting_id: meetingId }),
        rpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId }),
        rpc<MyVote[]>("get_my_open_votes", { p_meeting_id: meetingId }),
        rpc<Decision[]>("list_meeting_decisions", { p_meeting_id: meetingId }),
        rpc<VotingRound[]>("list_meeting_voting_rounds", { p_meeting_id: meetingId }),
      ]);
      setSession(live); setAgenda(detail.agenda_items ?? []); setMyVotes(votes ?? []); setDecisions(meetingDecisions ?? []); setRounds(meetingRounds ?? []);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل الجلسة." }); }
    finally { setLoading(false); }
  }

  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true); setNotice(null);
    try { await action(); setNotice({ kind: "success", text: success }); await load(); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تنفيذ العملية." }); }
    finally { setBusy(false); }
  }

  function verifyAttendance(record: Attendance, status: string) {
    const pendingClaim = record.verification_status === "pending_verification";
    const note = pendingClaim ? null : window.prompt("ملاحظة التحقق اليدوي (5 أحرف على الأقل):", "تم التحقق يدويًا");
    if (!pendingClaim && !note) return;
    void perform(() => rpc("verify_attendance", { p_attendance_record_id: record.id, p_status: status, p_note: note, p_expected_updated_at: record.updated_at }), "تم التحقق من الحضور وإعادة احتساب النصاب.");
  }

  function openRound(item: AgendaItem) {
    if (!session) return;
    void perform(() => rpc("open_voting_round", { p_agenda_item_id: item.id, p_expected_meeting_updated_at: session.meeting.updated_at }), "فُتحت جولة التصويت للموضوع المحدد.");
  }

  function createDecision(round: VotingRound, item: AgendaItem) {
    const text = window.prompt("صياغة القرار المعتمد (10 أحرف على الأقل):", `اعتماد ما ورد في موضوع: ${item.topic?.title_ar ?? "الموضوع"}.`);
    if (!text) return;
    void perform(() => rpc("create_decision_from_voting_round", { p_voting_round_id: round.id, p_decision_text: text, p_requires_approval: true }), "تم إنشاء القرار وإحالته للاعتماد.");
  }

  function updateDiscussion(item: AgendaDiscussionItem, status: "under_discussion" | "discussed" | "postponed") {
    const needsNotes = status !== "under_discussion";
    const promptText = status === "postponed" ? "سبب تأجيل البند:" : "ملخص المناقشة ونتيجتها:";
    const notes = needsNotes ? window.prompt(promptText, item.discussion_notes ?? "") : item.discussion_notes ?? null;
    if (needsNotes && !notes) return;
    void perform(() => rpc("update_agenda_discussion", { p_agenda_item_id: item.id, p_status: status, p_discussion_notes: notes, p_expected_updated_at: item.updated_at }), status === "under_discussion" ? "فُتح البند للمناقشة." : status === "discussed" ? "حُفظ ملخص المناقشة وحُسم البند." : "أُجل البند مع توثيق السبب.");
  }

  function completeSession() {
    if (!session || !window.confirm("سيتم إنهاء الجلسة وقفل المناقشات والانتقال إلى إعداد المحضر. هل تريد المتابعة؟")) return;
    void perform(async () => { await rpc("complete_meeting_session", { p_meeting_id: meetingId, p_expected_updated_at: session.meeting.updated_at }); window.location.assign("/admin/meetings"); }, "انتهت الجلسة وانتقل الاجتماع إلى إعداد المحضر.");
  }

  if (loading) return <div className="grid min-h-[500px] place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={32} /></div>;
  if (!session) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">تعذر الوصول إلى الجلسة. افتحها من صفحة الاجتماعات أولًا.</div>;

  const quorum = session.quorum;
  const quorumOk = quorum?.quorum_status === "met" || (quorum?.actual_percentage ?? 0) >= (quorum?.required_percentage ?? 100);

  return <div className="space-y-5">
    {notice && <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}{notice.text}</div>}

    <section className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${quorumOk ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-center gap-3"><Shield size={20} className={quorumOk ? "text-emerald-600" : "text-amber-600"} /><div><h2 className="text-sm font-black text-[#0a1330]">{session.meeting.title_ar}</h2><p className="text-[11px] text-[#52647a]">النصاب: {quorum?.present_members ?? 0} حاضر من {quorum?.eligible_members ?? 0} · {quorum?.actual_percentage ?? 0}% من المطلوب {quorum?.required_percentage ?? 0}%</p></div></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => void perform(() => rpc("recalculate_meeting_quorum", { p_meeting_id: meetingId, p_record_snapshot: true }), "تم تحديث النصاب.")} disabled={busy} className="rounded-xl border border-[#cbd9e8] bg-white px-3 py-2 text-[11px] font-bold text-[#52647a]"><RefreshCw className="inline" size={14} /> تحديث النصاب</button>{!session.meeting.attendance_locked && <button onClick={() => void perform(() => rpc("lock_attendance_roster", { p_meeting_id: meetingId, p_expected_updated_at: session.meeting.updated_at }), "تم تثبيت سجل الحضور.")} disabled={busy} className="rounded-xl bg-[#0a1330] px-3 py-2 text-[11px] font-bold text-white"><Lock className="inline" size={14} /> تثبيت الحضور</button>}</div>
    </section>

    <div className="flex gap-2"><button onClick={() => setTab("attendance")} className={`rounded-xl px-4 py-2.5 text-xs font-bold ${tab === "attendance" ? "bg-[#0066cc] text-white" : "border bg-white text-[#52647a]"}`}><Users className="ml-1 inline" size={15} />الحضور</button><button onClick={() => setTab("voting")} className={`rounded-xl px-4 py-2.5 text-xs font-bold ${tab === "voting" ? "bg-[#0066cc] text-white" : "border bg-white text-[#52647a]"}`}><Vote className="ml-1 inline" size={15} />التصويت والقرارات</button></div>

    {tab === "attendance" ? <section className="rounded-2xl border border-[#e2e9f1] bg-white"><header className="flex items-center justify-between border-b border-[#edf1f5] px-5 py-4"><div><h3 className="text-sm font-black text-[#0a1330]">سجل الحضور</h3><p className="text-[10px] text-[#7b8ba0]">لا يمكن التعديل بعد تثبيت السجل.</p></div><button onClick={() => void perform(async () => { const result = await rpc<{ token: string }>("create_checkin_session", { p_meeting_id: meetingId, p_valid_for_minutes: 15 }); setCheckinToken(result.token); }, "تم إنشاء رمز حضور صالح لمدة 15 دقيقة.")} disabled={busy || session.meeting.attendance_locked} className="rounded-xl bg-[#0066cc] px-3 py-2 text-[11px] font-bold text-white"><Fingerprint className="ml-1 inline" size={14} />رمز حضور</button></header>
      {checkinToken && <div className="mx-5 mt-3 flex items-center gap-3 rounded-xl bg-blue-50 p-3"><strong className="tracking-widest text-[#0066cc]">{checkinToken}</strong><button onClick={() => void navigator.clipboard.writeText(checkinToken)} title="نسخ" className="text-[#0066cc]"><Copy size={16} /></button><button onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/meetings/check-in?meeting=${meetingId}&token=${encodeURIComponent(checkinToken)}`)} className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-[10px] font-bold text-[#0066cc]">نسخ رابط الحضور</button><span className="text-[10px] text-[#52647a]">يُشارك مع الأعضاء لتسجيل حضورهم الذاتي.</span></div>}
      <div className="divide-y divide-[#eef2f6]">{session.attendance.map((record) => <div key={record.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><span className="flex-1 text-xs font-bold text-[#0a1330]">{record.full_name_ar}</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${attendanceTone[record.status] ?? "bg-slate-100 text-slate-600"}`}>{attendanceLabels[record.status] ?? record.status}</span>{record.verification_status === "pending_verification" && <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">طلب QR بانتظار التحقق</span>}<div className="flex gap-1"><button disabled={busy || session.meeting.attendance_locked} onClick={() => verifyAttendance(record, "present")} className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 disabled:opacity-40" title="حاضر"><CheckCircle2 size={14} /></button><button disabled={busy || session.meeting.attendance_locked} onClick={() => verifyAttendance(record, "excused")} className="rounded-lg bg-amber-50 p-1.5 text-amber-600 disabled:opacity-40" title="معتذر"><Clock size={14} /></button><button disabled={busy || session.meeting.attendance_locked} onClick={() => verifyAttendance(record, "absent")} className="rounded-lg bg-red-50 p-1.5 text-red-600 disabled:opacity-40" title="غائب"><XCircle size={14} /></button></div></div>)}</div>
    </section> : <section className="space-y-4">
      {myVotes.filter((vote) => !vote.has_voted).map((vote) => <div key={vote.voting_round_id} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[#0066cc] bg-[#edf6ff] p-4"><span className="flex-1 text-xs font-black text-[#0a1330]">تصويت مطلوب: {vote.title_ar}</span><button onClick={() => void perform(() => rpc("cast_vote", { p_voting_round_id: vote.voting_round_id, p_vote_value: "approve", p_vote_note: null }), "تم تسجيل موافقتك.")} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white"><ThumbsUp className="ml-1 inline" size={13} />موافق</button><button onClick={() => void perform(() => rpc("cast_vote", { p_voting_round_id: vote.voting_round_id, p_vote_value: "reject", p_vote_note: null }), "تم تسجيل رفضك.")} disabled={busy} className="rounded-lg bg-red-600 px-3 py-2 text-[10px] font-bold text-white"><ThumbsDown className="ml-1 inline" size={13} />رافض</button><button onClick={() => void perform(() => rpc("cast_vote", { p_voting_round_id: vote.voting_round_id, p_vote_value: "abstain", p_vote_note: null }), "تم تسجيل امتناعك.")} disabled={busy} className="rounded-lg bg-slate-600 px-3 py-2 text-[10px] font-bold text-white">ممتنع</button></div>)}
      <div className="rounded-2xl border border-[#e2e9f1] bg-white p-5"><h3 className="mb-2 text-sm font-black text-[#0a1330]">المناقشة والتصويت حسب جدول الأعمال</h3><p className="mb-4 text-[10px] text-[#7b8ba0]">افتح البند، دوّن ملخص المناقشة، ثم افتح التصويت عند الحاجة. لا يمكن إنهاء الجلسة قبل حسم جميع البنود.</p><div className="space-y-3">{agenda.map((item) => { const open = session.open_voting_rounds.find((round) => round.agenda_item_id === item.id); const closed = rounds.find((round) => round.agenda_item_id === item.id && round.status === "closed"); const decision = decisions.find((row) => row.agenda_item_id === item.id); return <div key={item.id} className="rounded-xl border border-[#edf1f5] p-3"><div className="flex flex-wrap items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e7f2ff] text-[10px] font-black text-[#0066cc]">{item.agenda_order}</span><span className="min-w-40 flex-1 text-xs font-bold">{item.topic?.title_ar ?? "موضوع"}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">{item.agenda_status === "discussed" ? "تمت المناقشة" : item.agenda_status === "postponed" ? "مؤجل" : item.agenda_status === "under_discussion" ? "قيد المناقشة" : "لم يبدأ"}</span>{item.agenda_status === "pending" && <button onClick={() => updateDiscussion(item,"under_discussion")} disabled={busy} className="rounded-lg border border-[#bcd7ed] px-3 py-2 text-[10px] font-bold text-[#0066cc]">بدء المناقشة</button>}{item.agenda_status === "under_discussion" && <><button onClick={() => updateDiscussion(item,"discussed")} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white">حسم المناقشة</button><button onClick={() => updateDiscussion(item,"postponed")} disabled={busy} className="rounded-lg bg-amber-500 px-3 py-2 text-[10px] font-bold text-white">تأجيل البند</button></>}{decision ? <span className="rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">{decision.decision_no} · {decision.decision_status}</span> : open ? <button onClick={() => void perform(() => rpc("close_voting_round", { p_voting_round_id: open.id, p_reason: "إغلاق جولة التصويت بعد اكتمال المداولة." }), "أُغلقت الجولة وحُسبت النتيجة.")} disabled={busy} className="rounded-lg bg-[#0a1330] px-3 py-2 text-[10px] font-bold text-white">إغلاق التصويت</button> : closed?.result === "approved" ? <button onClick={() => createDecision(closed, item)} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white">إنشاء القرار</button> : closed ? <span className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">نتيجة التصويت: {closed.result ?? "غير محددة"}</span> : item.agenda_status === "discussed" ? <button onClick={() => openRound(item)} disabled={busy || !session.meeting.attendance_locked || !quorumOk} className="rounded-lg bg-[#0066cc] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-40"><Play className="ml-1 inline" size={12} />فتح تصويت</button> : null}</div>{item.discussion_notes && <p className="mt-3 rounded-lg bg-[#f7f9fc] px-3 py-2 text-[10px] leading-5 text-[#52647a]">ملخص المناقشة: {item.discussion_notes}</p>}</div>; })}</div></div>
      <button onClick={completeSession} disabled={busy || !session.meeting.attendance_locked || !quorumOk || agenda.some((item) => !["discussed","postponed"].includes(item.agenda_status ?? "pending")) || session.open_voting_rounds.length > 0 || rounds.some((round) => round.status === "closed" && round.result === "approved" && !decisions.some((decision) => decision.agenda_item_id === round.agenda_item_id))} className="w-full rounded-2xl bg-[#0a1330] px-5 py-3 text-xs font-black text-white shadow-lg disabled:cursor-not-allowed disabled:bg-[#a9b6c5]">إنهاء الجلسة والانتقال إلى إعداد المحضر</button>
    </section>}
  </div>;
}
