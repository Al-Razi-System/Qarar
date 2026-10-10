"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { liveMeetingRpc } from "../api/live-meeting-client";
import { topicsRpc } from "@/features/topics/api/topics-client";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { cn } from "@/shared/lib/utils";
import type { AgendaDiscussionItem, Attendance, Decision, LiveMeetingSession, MyVote, Notice, PriorRouteRequest, TopicGovernanceHistory, TopicMeetingHistory, VotingRound } from "../model/live-meeting";
import type { MeetingTopicAttachment } from "../model/meeting";
import { AttendanceQrDialog } from "./attendance-qr-dialog";
import { ChairAttendanceConsole } from "./chair-attendance-console";
import { DecisionComposerDialog } from "./decision-composer-dialog";
import { MemberCheckInCard } from "./member-check-in-card";
import { AgendaWorkspace } from "./stage/agenda-workspace";
import type { DiscussionStatus } from "./stage/discussion-summary";
import { MemberVoteCard, type VoteValue } from "./stage/member-vote-card";
import { ReasonDialog } from "./stage/reason-dialog";
import { RoomStage } from "./stage/room-stage";
import { useRoomTheme } from "./stage/use-room-theme";

type MeetingDetail = { agenda_items?: AgendaDiscussionItem[] };
type CheckInToken = { token: string; expires_at: string };
type RoomTab = "my-attendance" | "attendance" | "agenda";
/** An action that the minutes must explain, waiting for its reason. */
type ReasonRequest = { kind: "postpone"; item: AgendaDiscussionItem } | { kind: "manual-attendance"; record: Attendance };

export function LiveMeetingRoom({ meetingId, publicCheckInOrigin }: { meetingId: string; publicCheckInOrigin?: string }) {
  const router = useRouter();
  const theme = useRoomTheme();
  const roomRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<RoomTab>("attendance");
  const [presenting, setPresenting] = useState(false);
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
  /** The decision dialog: drafting from an approved round, or editing a saved decision's text. */
  const [decisionDraft, setDecisionDraft] = useState<{ round: VotingRound | null; item: AgendaDiscussionItem; decision?: Decision } | null>(null);
  const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(null);
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

  // Leaving full screen with the browser's own key also leaves presentation mode.
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) setPresenting(false);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

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

  function submitAttendance(record: Attendance, status: "present" | "absent" | "excused", note: string | null) {
    return perform(() => liveMeetingRpc("verify_attendance", { p_attendance_record_id: record.id, p_status: status, p_note: note, p_expected_updated_at: record.updated_at }), status === "present" ? "تم اعتماد حضور العضو وتحديث النصاب." : status === "excused" ? "تم تسجيل اعتذار العضو." : "تم تسجيل غياب العضو.");
  }

  function verifyAttendance(record: Attendance, status: "present" | "absent" | "excused") {
    const claimedByQr = record.verification_status === "pending_verification";
    // Marking a member present without their own check-in must carry a documented reason.
    if (!claimedByQr && status === "present") {
      setNotice(null);
      setReasonRequest({ kind: "manual-attendance", record });
      return;
    }
    void submitAttendance(record, status, null);
  }

  function updateDiscussion(item: AgendaDiscussionItem, status: DiscussionStatus, notes: string | null) {
    return perform(() => liveMeetingRpc("update_agenda_discussion", { p_agenda_item_id: item.id, p_status: status, p_discussion_notes: notes, p_expected_updated_at: item.updated_at }), status === "under_discussion" ? "بدأت مناقشة البند." : status === "discussed" ? "تم حفظ الملخص النهائي للبند بنجاح." : "أُجل البند مع توثيق السبب.");
  }

  function submitReason(reason: string) {
    if (!reasonRequest) return Promise.resolve(false);
    // The current copy of the item, so the concurrency check uses its latest timestamp.
    if (reasonRequest.kind === "postpone") return updateDiscussion(agenda.find((item) => item.id === reasonRequest.item.id) ?? reasonRequest.item, "postponed", reason);
    return submitAttendance(session?.attendance.find((record) => record.id === reasonRequest.record.id) ?? reasonRequest.record, "present", reason);
  }

  function submitDecision(text: string) {
    if (!decisionDraft) return Promise.resolve(false);
    const { round, decision } = decisionDraft;
    if (decision) {
      // The token of the text the editor started from, not of a newer polled copy:
      // if someone else saved meanwhile, the server refuses instead of overwriting them.
      return perform(() => liveMeetingRpc("update_meeting_decision_text", { p_decision_id: decision.id, p_decision_text: text, p_expected_updated_at: decision.updated_at }), "تم حفظ التعديل على نص القرار.");
    }
    if (!round) return Promise.resolve(false);
    return perform(() => liveMeetingRpc("create_decision_from_voting_round", { p_voting_round_id: round.id, p_decision_text: text, p_requires_approval: true }), "تم حفظ صياغة القرار وإحالته للاعتماد.");
  }

  async function confirmCompleteSession() {
    if (!session) return;
    const completed = await perform(() => liveMeetingRpc("complete_meeting_session", { p_meeting_id: meetingId, p_expected_updated_at: session.meeting.updated_at }), "انتهت الجلسة وانتقل الاجتماع إلى إعداد المحضر.");
    if (!completed) return;
    setCompleteConfirmation(false);
    router.push(`/admin/meetings/${meetingId}/minutes`);
  }

  function togglePresentation() {
    const next = !presenting;
    setPresenting(next);
    // Full screen is a convenience; presentation mode works when the browser refuses it.
    if (next) void roomRef.current?.requestFullscreen?.()?.catch(() => undefined);
    else if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => undefined);
  }

  if (loading) return <div className="grid min-h-96 place-items-center font-sans"><p role="status" className="m-0 text-q-ui font-bold text-q-text-2">جارٍ تجهيز غرفة الاجتماع…</p></div>;
  if (!session) return <div className="flex flex-col items-start gap-3 font-sans"><InlineMessage tone="error">{loadError ?? "تعذر تحميل بيانات الجلسة. أعد المحاولة من صفحة الاجتماعات."}</InlineMessage><Button variant="secondary" onClick={() => void load()}>إعادة المحاولة</Button></div>;

  const operator = session.viewer.can_operate_attendance;
  const rapporteur = session.viewer.mode === "rapporteur";
  const pendingVotes = myVotes.filter((vote) => !vote.has_voted);
  const dialogError = notice?.kind === "error" ? notice.text : null;
  const activeTab: RoomTab = presenting ? "agenda" : tab;
  const tabs: Array<{ value: RoomTab; label: string; count?: number }> = [
    ...(session.viewer.is_roster_member ? [{ value: "my-attendance" as const, label: "حضوري الشخصي" }] : []),
    ...(operator ? [{ value: "attendance" as const, label: "إدارة الحضور" }] : []),
    { value: "agenda", label: "جدول الأعمال والتصويت", count: pendingVotes.length },
  ];

  return (
    <div
      ref={roomRef}
      data-theme={theme.dark ? "dark" : undefined}
      className={cn("flex flex-col gap-4 font-sans", (theme.dark || presenting) && "rounded-q-card bg-q-bg p-3 text-q-text sm:p-5", presenting && "overflow-y-auto")}
    >
      {notice && !presenting && <InlineMessage tone={notice.kind === "success" ? "success" : "error"} className="sticky top-2 z-40 border border-q-border text-q-ui shadow-lg">{notice.text}</InlineMessage>}

      <RoomStage
        session={session}
        agenda={agenda}
        rounds={rounds}
        decisions={decisions}
        dark={theme.dark}
        onToggleTheme={theme.toggle}
        hideCurrentItem={activeTab === "agenda"}
        presentation={session.viewer.can_manage_session ? { active: presenting, onToggle: togglePresentation } : undefined}
      />

      {presenting
        ? pendingVotes.length > 0 && <InlineMessage tone="info">لديك تصويت مفتوح. أنهِ وضع العرض لتسجيل صوتك دون أن يظهر على الشاشة.</InlineMessage>
        : pendingVotes.map((vote) => <MemberVoteCard key={vote.voting_round_id} vote={vote} busy={busy} onCast={(roundId: string, value: VoteValue, note: string | null) => void perform(() => liveMeetingRpc("cast_vote", { p_voting_round_id: roundId, p_vote_value: value, p_vote_note: note }), "تم تسجيل صوتك وملاحظتك بسرية.")} />)}

      {!presenting && (
        <nav aria-label="أقسام غرفة الاجتماع" className="flex flex-wrap gap-1 rounded-q-card border border-q-border bg-q-surface p-1">
          {tabs.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => setTab(entry.value)}
              aria-current={activeTab === entry.value ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-q-control px-4 text-q-ui font-bold transition-colors",
                activeTab === entry.value ? "bg-q-primary text-q-on-primary" : "bg-transparent text-q-text hover:bg-q-surface-2",
              )}
            >
              {entry.label}
              {entry.count ? <Badge tone="danger">{entry.count}</Badge> : null}
            </button>
          ))}
        </nav>
      )}

      {activeTab === "my-attendance" ? (
        <MemberCheckInCard meetingId={meetingId} attendance={session.my_attendance} canCheckIn={session.viewer.can_self_check_in} onCompleted={async (text) => { setNotice({ kind: "success", text }); await load(true); }} />
      ) : activeTab === "attendance" && operator ? (
        <ChairAttendanceConsole
          session={session}
          busy={busy}
          canLock={session.viewer.can_lock_attendance}
          onOpenQr={() => void createCheckInSession()}
          onRefreshQuorum={() => void perform(() => liveMeetingRpc("recalculate_meeting_quorum", { p_meeting_id: meetingId, p_record_snapshot: true }), "تم تحديث النصاب.")}
          onVerify={verifyAttendance}
          onLock={() => void perform(() => liveMeetingRpc("lock_attendance_roster", { p_meeting_id: meetingId, p_expected_updated_at: session.meeting.updated_at }), "تم تثبيت سجل الحضور واعتماد النصاب.")}
        />
      ) : (
        <AgendaWorkspace
          session={session}
          agenda={agenda}
          attachments={topicAttachments}
          topicHistory={topicHistory}
          rounds={rounds}
          decisions={decisions}
          busy={busy}
          presenting={presenting}
          onUpdateDiscussion={updateDiscussion}
          onRequestPostpone={(item) => { setNotice(null); setReasonRequest({ kind: "postpone", item }); }}
          onOpenRound={(item) => void perform(() => liveMeetingRpc("open_voting_round", { p_agenda_item_id: item.id, p_expected_meeting_updated_at: session.meeting.updated_at }), "فُتحت جولة التصويت لهذا البند.")}
          onCloseRound={(round) => void perform(() => liveMeetingRpc("close_voting_round", { p_voting_round_id: round.id, p_reason: "إغلاق الجولة بعد اكتمال التصويت." }), "أُغلقت الجولة وحُسبت النتيجة.")}
          onCreateDecision={(round, item) => { setNotice(null); setDecisionDraft({ round, item }); }}
          onEditDecision={(decision, item, round) => { setNotice(null); setDecisionDraft({ round, item, decision }); }}
          onComplete={() => { setNotice(null); setCompleteConfirmation(true); }}
        />
      )}

      {checkIn && <AttendanceQrDialog meetingId={meetingId} token={checkIn.token} expiresAt={checkIn.expires_at} publicOrigin={publicCheckInOrigin} attendance={session.attendance} viewerUserId={session.viewer.user_id} busy={busy} onVerify={verifyAttendance} onClose={() => setCheckIn(null)} onRenew={() => void createCheckInSession()} />}

      {decisionDraft && <DecisionComposerDialog key={decisionDraft.decision?.id ?? decisionDraft.item.id} item={decisionDraft.item} round={decisionDraft.round} decision={decisionDraft.decision} busy={busy} error={dialogError} isRapporteur={rapporteur} onClose={() => setDecisionDraft(null)} onSubmit={submitDecision} />}

      {reasonRequest?.kind === "postpone" && (
        <ReasonDialog
          title="تأجيل البند"
          description={`يُؤجَّل «${reasonRequest.item.topic?.title_ar ?? "البند"}» ويُسجَّل السبب في المحضر.`}
          label="سبب تأجيل البند"
          initialValue={reasonRequest.item.discussion_notes ?? ""}
          confirmLabel="تأجيل البند وتوثيق السبب"
          busy={busy}
          error={dialogError}
          onClose={() => setReasonRequest(null)}
          onSubmit={submitReason}
        />
      )}
      {reasonRequest?.kind === "manual-attendance" && (
        <ReasonDialog
          title="اعتماد الحضور يدوياً"
          description={`لم يسجّل ${reasonRequest.record.full_name_ar} حضوره برمز الحضور، فيلزم سبب موثق لاعتماده حاضراً.`}
          label="سبب اعتماد الحضور يدوياً"
          initialValue="تحقق مباشر داخل القاعة"
          confirmLabel="اعتماد العضو حاضراً"
          busy={busy}
          error={dialogError}
          onClose={() => setReasonRequest(null)}
          onSubmit={submitReason}
        />
      )}

      {completeConfirmation && (
        <Dialog
          title="إنهاء الجلسة وإعداد المحضر"
          description="الانتقال من إدارة الجلسة إلى توثيق نسختها النهائية."
          onClose={() => setCompleteConfirmation(false)}
          closeDisabled={busy}
          footer={<>
            {dialogError && <InlineMessage tone="error" className="w-full">{dialogError}</InlineMessage>}
            <Button variant="ghost" onClick={() => setCompleteConfirmation(false)} disabled={busy}>عودة</Button>
            <Button onClick={() => void confirmCompleteSession()} pending={busy} pendingLabel="جارٍ إنهاء الجلسة…">إنهاء الجلسة والانتقال</Button>
          </>}
        >
          <p className="m-0 text-q-body">سيتم قفل المناقشات والتصويتات، وتغيير حالة الاجتماع إلى «بانتظار المحضر»، ثم فتح مساحة إعداد المحضر مباشرة.</p>
          <InlineMessage tone="info">يمكن للمقرر تجهيز المسودة ومراجعتها، ثم يرسل النسخة النهائية لجميع الحاضرين للتوقيع والمصادقة.</InlineMessage>
        </Dialog>
      )}
    </div>
  );
}

function messageOf(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
