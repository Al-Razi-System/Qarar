"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, FileText, LoaderCircle, ShieldCheck, Users, Vote, X } from "lucide-react";
import { liveMeetingRpc } from "../api/live-meeting-client";
import { topicsRpc } from "@/features/topics/api/topics-client";
import type { AgendaDiscussionItem, Attendance, Decision, LiveMeetingSession, MyVote, Notice, PriorRouteRequest, TopicGovernanceHistory, TopicMeetingHistory, VotingRound } from "../model/live-meeting";
import type { MeetingTopicAttachment } from "../model/meeting";
import { AttendanceQrDialog } from "./attendance-qr-dialog";
import { ChairAttendanceConsole } from "./chair-attendance-console";
import { DecisionComposerDialog } from "./decision-composer-dialog";
import { LiveAgendaConsole } from "./live-agenda-console";
import { MemberCheckInCard } from "./member-check-in-card";
import type { VoteValue } from "./open-vote-card";
import { RoomStage } from "./stage/room-stage";

type MeetingDetail = { agenda_items?: AgendaDiscussionItem[] };
type CheckInToken = { token: string; expires_at: string };

type RoomTab = "my-attendance" | "attendance" | "agenda";

export function LiveMeetingRoom({ meetingId, publicCheckInOrigin }: { meetingId: string; publicCheckInOrigin?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<RoomTab>("attendance");
  const [session, setSession] = useState<LiveMeetingSession | null>(null);
  const [agenda, setAgenda] = useState<AgendaDiscussionItem[]>([]);
  const [myVotes, setMyVotes] = useState<MyVote[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [rounds, setRounds] = useState<VotingRound[]>([]);
  const [topicAttachments, setTopicAttachments] = useState<MeetingTopicAttachment[]>([]);
  const [topicHistory, setTopicHistory] = useState<Record<string, TopicGovernanceHistory>>({});
  const historyLoadedForMeeting = useRef<string | null>(null);
  const loadInFlight = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [checkIn, setCheckIn] = useState<CheckInToken | null>(null);
  const [decisionDraft, setDecisionDraft] = useState<{ round: VotingRound; item: AgendaDiscussionItem } | null>(null);
  const [completeConfirmation, setCompleteConfirmation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshRoom = useEffectEvent((silent: boolean) => load(silent));
  const refreshInterval = checkIn || session?.open_voting_rounds.length ? 3_000 : 10_000;

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    async function refreshAfterCompletion(initial: boolean) {
      await refreshRoom(!initial);
      if (!stopped) timer = window.setTimeout(() => void refreshAfterCompletion(false), refreshInterval);
    }
    void refreshAfterCompletion(true);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [meetingId, refreshInterval]);

  async function load(silent = false) {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    if (!silent) setLoading(true);
    try {
      if (!silent) setLoadError(null);
      const [live, detail, votes, meetingDecisions, meetingRounds, attachments] = await Promise.all([
        liveMeetingRpc<LiveMeetingSession>("get_meeting_session_detail", { p_meeting_id: meetingId }),
        liveMeetingRpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId }),
        liveMeetingRpc<MyVote[]>("get_my_open_votes", { p_meeting_id: meetingId }),
        liveMeetingRpc<Decision[]>("list_meeting_decisions", { p_meeting_id: meetingId }),
        liveMeetingRpc<VotingRound[]>("list_meeting_voting_rounds", { p_meeting_id: meetingId }),
        liveMeetingRpc<MeetingTopicAttachment[]>("list_meeting_topic_attachments", { p_meeting_id: meetingId }),
      ]);
      if (["waiting_for_minutes", "waiting_for_approval", "closed"].includes(live.meeting.status)) {
        router.replace(`/admin/meetings/${meetingId}/minutes`);
        return;
      }
      if (!session) {
        setTab(live.viewer.can_operate_attendance ? "attendance" : live.viewer.is_roster_member ? "my-attendance" : "agenda");
      }
      setSession(live);
      setAgenda(detail.agenda_items ?? []);
      setMyVotes(votes ?? []);
      setDecisions(meetingDecisions ?? []);
      setRounds(meetingRounds ?? []);
      setTopicAttachments(attachments ?? []);
      if (historyLoadedForMeeting.current !== meetingId) {
        const topicIds = [...new Set((detail.agenda_items ?? []).map((item) => item.topic?.id).filter((id): id is string => Boolean(id)))];
        const entries = await Promise.all(topicIds.map(async (topicId) => {
          const [history, priorRoute] = await Promise.all([
            topicsRpc<TopicMeetingHistory[]>("get_topic_meeting_history", { p_topic_id: topicId }).catch(() => []),
            topicsRpc<PriorRouteRequest | null>("get_topic_prior_route_request", { p_topic_id: topicId }).catch(() => null),
          ]);
          return [topicId, { meetings: history.filter((entry) => entry.meeting.id !== meetingId), priorRoute }] as const;
        }));
        setTopicHistory(Object.fromEntries(entries));
        historyLoadedForMeeting.current = meetingId;
      }
    } catch (error) {
      const text = messageOf(error, "تعذر تحميل غرفة الاجتماع.");
      if (!silent) setLoadError(text);
      else setNotice({ kind: "error", text });
    } finally {
      loadInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "success", text: success });
      await load(true);
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: messageOf(error, "تعذر تنفيذ العملية.") });
      return false;
    }
    finally { setBusy(false); }
  }

  async function createCheckInSession() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await liveMeetingRpc<CheckInToken>("create_checkin_session", { p_meeting_id: meetingId, p_valid_for_minutes: 15 });
      setCheckIn(result);
      await load(true);
    } catch (error) { setNotice({ kind: "error", text: messageOf(error, "تعذر إنشاء رمز الحضور.") }); }
    finally { setBusy(false); }
  }

  function verifyAttendance(record: Attendance, status: "present" | "absent" | "excused") {
    const claimedByQr = record.verification_status === "pending_verification";
    const note = !claimedByQr && status === "present" ? window.prompt("سبب اعتماد الحضور يدوياً (5 أحرف على الأقل):", "تحقق مباشر داخل القاعة") : null;
    if (!claimedByQr && status === "present" && !note) return;
    void perform(() => liveMeetingRpc("verify_attendance", { p_attendance_record_id: record.id, p_status: status, p_note: note, p_expected_updated_at: record.updated_at }), status === "present" ? "تم اعتماد حضور العضو وتحديث النصاب." : status === "excused" ? "تم تسجيل اعتذار العضو." : "تم تسجيل غياب العضو.");
  }

  function updateDiscussion(item: AgendaDiscussionItem, status: "under_discussion" | "discussed" | "postponed", notes: string | null) {
    return perform(() => liveMeetingRpc("update_agenda_discussion", { p_agenda_item_id: item.id, p_status: status, p_discussion_notes: notes, p_expected_updated_at: item.updated_at }), status === "under_discussion" ? "بدأت مناقشة البند." : status === "discussed" ? "تم حفظ الملخص النهائي للبند بنجاح." : "أُجل البند مع توثيق السبب.");
  }

  function createDecision(round: VotingRound, item: AgendaDiscussionItem) {
    setDecisionDraft({ round, item });
  }

  function completeSession() {
    if (session) setCompleteConfirmation(true);
  }

  async function confirmCompleteSession() {
    if (!session) return;
    const completed = await perform(() => liveMeetingRpc("complete_meeting_session", { p_meeting_id: meetingId, p_expected_updated_at: session.meeting.updated_at }), "انتهت الجلسة وانتقل الاجتماع إلى إعداد المحضر.");
    if (!completed) return;
    setCompleteConfirmation(false);
    router.push(`/admin/meetings/${meetingId}/minutes`);
  }

  if (loading) return <div className="grid min-h-[520px] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-[#0877d6]" size={34} /><p className="mt-3 text-xs font-bold text-[#718399]">جارٍ تجهيز غرفة الاجتماع...</p></div></div>;
  if (!session) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">{loadError ?? "تعذر تحميل بيانات الجلسة. أعد المحاولة من صفحة الاجتماعات."}</div>;

  const operator = session.viewer.can_operate_attendance;
  const rapporteur = session.viewer.mode === "rapporteur";

  return <div className="space-y-5">
    {notice && <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}{notice.text}</div>}
    <RoomStage session={session} agenda={agenda} rounds={rounds} decisions={decisions} />
    <nav className="flex gap-2 rounded-2xl border border-[#dfe8f0] bg-white p-1.5 shadow-sm" aria-label="أقسام غرفة الاجتماع">
      {session.viewer.is_roster_member && <button onClick={() => setTab("my-attendance")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black transition ${tab === "my-attendance" ? "bg-[#0877d6] text-white shadow-md" : "text-[#5b7187] hover:bg-[#f2f7fb]"}`}><ShieldCheck size={16} />حضوري الشخصي</button>}
      {operator && <button onClick={() => setTab("attendance")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black transition ${tab === "attendance" ? "bg-[#0877d6] text-white shadow-md" : "text-[#5b7187] hover:bg-[#f2f7fb]"}`}><Users size={16} />إدارة الحضور</button>}
      <button onClick={() => setTab("agenda")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black transition ${tab === "agenda" ? "bg-[#0877d6] text-white shadow-md" : "text-[#5b7187] hover:bg-[#f2f7fb]"}`}><Vote size={16} />جدول الأعمال والتصويت{myVotes.some((vote) => !vote.has_voted) && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[9px] text-white">{myVotes.filter((vote) => !vote.has_voted).length}</span>}</button>
    </nav>
    {tab === "my-attendance" ? <MemberCheckInCard meetingId={meetingId} attendance={session.my_attendance} canCheckIn={session.viewer.can_self_check_in} onCompleted={async (text) => { setNotice({ kind: "success", text }); await load(true); }} /> : tab === "attendance" && operator ? <ChairAttendanceConsole session={session} busy={busy} canLock={session.viewer.can_lock_attendance} onOpenQr={() => void createCheckInSession()} onRefreshQuorum={() => void perform(() => liveMeetingRpc("recalculate_meeting_quorum", { p_meeting_id: meetingId, p_record_snapshot: true }), "تم تحديث النصاب.")} onVerify={verifyAttendance} onLock={() => void perform(() => liveMeetingRpc("lock_attendance_roster", { p_meeting_id: meetingId, p_expected_updated_at: session.meeting.updated_at }), "تم تثبيت سجل الحضور واعتماد النصاب.")} /> : <LiveAgendaConsole session={session} agenda={agenda} attachments={topicAttachments} topicHistory={topicHistory} myVotes={myVotes} rounds={rounds} decisions={decisions} busy={busy} onCastVote={(roundId: string, value: VoteValue, note: string | null) => void perform(() => liveMeetingRpc("cast_vote", { p_voting_round_id: roundId, p_vote_value: value, p_vote_note: note }), "تم تسجيل صوتك وملاحظتك بسرية.")} onUpdateDiscussion={updateDiscussion} onOpenRound={(item) => void perform(() => liveMeetingRpc("open_voting_round", { p_agenda_item_id: item.id, p_expected_meeting_updated_at: session.meeting.updated_at }), "فُتحت جولة التصويت لهذا البند.")} onCloseRound={(round) => void perform(() => liveMeetingRpc("close_voting_round", { p_voting_round_id: round.id, p_reason: "إغلاق الجولة بعد اكتمال التصويت." }), "أُغلقت الجولة وحُسبت النتيجة.")} onCreateDecision={createDecision} onComplete={completeSession} />}
    {checkIn && <AttendanceQrDialog meetingId={meetingId} token={checkIn.token} expiresAt={checkIn.expires_at} publicOrigin={publicCheckInOrigin} attendance={session.attendance} viewerUserId={session.viewer.user_id} busy={busy} onVerify={verifyAttendance} onClose={() => setCheckIn(null)} onRenew={() => void createCheckInSession()} />}
    {decisionDraft && <DecisionComposerDialog item={decisionDraft.item} round={decisionDraft.round} busy={busy} error={notice?.kind === "error" ? notice.text : null} isRapporteur={rapporteur} onClose={() => setDecisionDraft(null)} onSubmit={(text) => perform(() => liveMeetingRpc("create_decision_from_voting_round", { p_voting_round_id: decisionDraft.round.id, p_decision_text: text, p_requires_approval: true }), "تم حفظ صياغة القرار وإحالته للاعتماد.")} />}
    {completeConfirmation && <div className="fixed inset-0 z-[80] grid place-items-center bg-[#07162d]/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="complete-session-title"><div className="w-full max-w-lg overflow-hidden rounded-[1.7rem] bg-white shadow-2xl"><header className="flex items-start justify-between gap-4 bg-gradient-to-l from-[#087ee5] to-[#0a315f] p-6 text-white"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15"><FileText size={21} /></span><div><h2 id="complete-session-title" className="text-lg font-black">إنهاء الجلسة وإعداد المحضر</h2><p className="mt-1 text-[10px] text-blue-100">الانتقال من إدارة الجلسة إلى توثيق نسختها النهائية.</p></div></div><button onClick={() => setCompleteConfirmation(false)} disabled={busy} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40" aria-label="إغلاق"><X size={18} /></button></header><div className="space-y-3 p-6"><p className="text-xs font-bold leading-7 text-[#263e57]">سيتم قفل المناقشات والتصويتات، وتغيير حالة الاجتماع إلى «بانتظار المحضر»، ثم فتح مساحة إعداد المحضر مباشرة.</p><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] leading-5 text-blue-800">يمكن للمقرر تجهيز المسودة ومراجعتها، ثم يرسل النسخة النهائية لجميع الحاضرين للتوقيع والمصادقة.</div></div><footer className="flex justify-end gap-2 border-t border-[#e5edf4] bg-[#fbfdff] p-5"><button onClick={() => setCompleteConfirmation(false)} disabled={busy} className="rounded-xl border border-[#d5e1eb] px-5 py-2.5 text-[11px] font-black text-[#536b82]">عودة</button><button onClick={() => void confirmCompleteSession()} disabled={busy} className="flex items-center gap-2 rounded-xl bg-[#0877d6] px-6 py-2.5 text-[11px] font-black text-white disabled:bg-[#a8b8c7]">{busy && <LoaderCircle size={15} className="animate-spin" />}إنهاء الجلسة والانتقال</button></footer></div></div>}
  </div>;
}

function messageOf(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
