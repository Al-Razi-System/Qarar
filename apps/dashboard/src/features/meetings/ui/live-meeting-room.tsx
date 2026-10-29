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
import type { AgendaDiscussionItem, AssignmentUserOption, Attendance, Decision, LiveMeetingSession, MeetingAssignment, MeetingAssignments, MeetingItemTimers, MeetingReferrals, NewAssignment, MemberProfiles, MyVote, Notice, PriorRouteRequest, TopicGovernanceHistory, TopicMeetingHistory, VotingRound } from "../model/live-meeting";
import type { MeetingTopicAttachment } from "../model/meeting";
import { AttendanceQrDialog } from "./attendance-qr-dialog";
import { ChairAttendanceConsole } from "./chair-attendance-console";
import { QuorumDecisionGate } from "./quorum-decision-gate";
import { DecisionComposerDialog } from "./decision-composer-dialog";
import { MemberCheckInCard } from "./member-check-in-card";
import { AgendaWorkspace } from "./stage/agenda-workspace";
import type { DiscussionStatus } from "./stage/discussion-summary";
import { MemberVoteCard, type VoteValue } from "./stage/member-vote-card";
import { ReasonDialog } from "./stage/reason-dialog";
import { NEW_ASSIGNMENT_KEY, type AssignmentActivity } from "./stage/item-assignments";
import { ReferralDialog } from "./stage/referral-dialog";
import { RejectedVoteResolutionDialog, type PendingRejectedVoteResolution } from "./rejected-vote-resolution-dialog";
import { RoomStage } from "./stage/room-stage";
import { RoomTopBar } from "./stage/room-top-bar";
import { useMeetingBroadcast } from "./stage/use-meeting-broadcast";
import { useRoomTheme } from "./stage/use-room-theme";
import { useLiveVoting } from "./use-live-voting";

type MeetingDetail = { agenda_items?: AgendaDiscussionItem[]; status_history?: Array<{ to_status: string; changed_at: string }> };

/** When the session was opened: the last move of the meeting into "in_progress". */
/** How often the room is still read while its channel reports every change. */
const ROOM_FALLBACK_MS = 30_000;

function sessionStartedAt(detail: MeetingDetail) {
  return [...(detail.status_history ?? [])].reverse().find((entry) => entry.to_status === "in_progress")?.changed_at ?? null;
}
type CheckInToken = { token: string; expires_at: string };
type RoomTab = "my-attendance" | "attendance" | "agenda";
/** An action that the minutes must explain, waiting for its reason. */
type ReasonRequest = { kind: "postpone"; item: AgendaDiscussionItem } | { kind: "manual-attendance"; record: Attendance };
type PendingRejectedVoteResolutions = { items: PendingRejectedVoteResolution[]; can_resolve: boolean };

export function LiveMeetingRoom({ meetingId, publicCheckInOrigin }: { meetingId: string; publicCheckInOrigin?: string }) {
  // Every call names this room, so a successful write tells its other screens at once.
  function roomRpc<T>(contract: string, params: Record<string, unknown> = {}, options: { signal?: AbortSignal } = {}) {
    return liveMeetingRpc<T>(contract, params, { ...options, meetingId });
  }
  const router = useRouter();
  const theme = useRoomTheme();
  const roomRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<RoomTab>("attendance");
  const [presenting, setPresenting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [assignments, setAssignments] = useState<MeetingAssignments | null>(null);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [assignmentActivity, setAssignmentActivity] = useState<AssignmentActivity>({ key: null, errorKey: null, error: null });
  const [referrals, setReferrals] = useState<MeetingReferrals | null>(null);
  const [referralItem, setReferralItem] = useState<AgendaDiscussionItem | null>(null);
  const [itemTimers, setItemTimers] = useState<{ data: MeetingItemTimers | null; clockOffsetMs: number }>({ data: null, clockOffsetMs: 0 });
  const [plannedState, setPlannedState] = useState<{ pendingItemId: string | null; errorItemId: string | null; error: string | null }>({ pendingItemId: null, errorItemId: null, error: null });
  const [downloadState, setDownloadState] = useState<{ pendingItemId: string | null; errorItemId: string | null; error: string | null }>({ pendingItemId: null, errorItemId: null, error: null });
  const [sessionRecord, setSession] = useState<LiveMeetingSession | null>(null);
  const [agenda, setAgenda] = useState<AgendaDiscussionItem[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [roomVotes, setMyVotes] = useState<MyVote[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [roomRounds, setRounds] = useState<VotingRound[]>([]);
  const [rejectedVoteResolutions, setRejectedVoteResolutions] = useState<PendingRejectedVoteResolution[]>([]);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const voting = useLiveVoting(meetingId, sessionRecord?.meeting.status === "in_progress");
  const rounds = voting.snapshot?.rounds ?? roomRounds;
  const myVotes = voting.snapshot?.votes ?? roomVotes;
  const session = sessionRecord && voting.snapshot ? { ...sessionRecord, open_voting_rounds: rounds.filter(round => round.status === "open") } : sessionRecord;
  const [topicAttachments, setTopicAttachments] = useState<MeetingTopicAttachment[]>([]);
  const [topicHistory, setTopicHistory] = useState<Record<string, TopicGovernanceHistory>>({});
  const historyLoadedForMeeting = useRef<string | null>(null);
  // The member cards are reloaded only when the roster or someone's attendance changes.
  const profilesLoadedFor = useRef<string | null>(null);
  const [profiles, setProfiles] = useState<MemberProfiles | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const loadInFlight = useRef(false);
  const loadFinished = useRef<Promise<void> | null>(null);
  const queuedRoomRefresh = useRef(false);
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
  const refreshRoomAfterSignal = useEffectEvent((silent: boolean) => load(silent, false, true));
  const votingStructure = voting.snapshot?.rounds.map(round => `${round.id}:${round.status}`).join("|") ?? null;
  const previousVotingStructure = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousVotingStructure.current;
    previousVotingStructure.current = votingStructure;
    if (votingStructure !== null && previous !== null && previous !== votingStructure) void refreshRoomAfterSignal(true);
  }, [votingStructure]);
  // Another screen changed the room: read it again now, not at the next periodic read.
  useEffect(() => {
    if (voting.roomTick > 0) void refreshRoomAfterSignal(true);
  }, [voting.roomTick]);
  // While the channel is connected the periodic read is only a safety net.
  const refreshInterval = voting.connected ? ROOM_FALLBACK_MS : checkIn || session?.open_voting_rounds.length ? 3_000 : 10_000;

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

  // While the session runs, every screen follows the broadcast of whoever controls it.
  const live = useMeetingBroadcast(meetingId, session?.meeting.status === "in_progress", { tick: voting.broadcastTick, connected: voting.connected });

  // Leaving full screen with the browser's own key also leaves presentation mode.
  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement) setPresenting(false);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function load(silent = false, afterMutation = false, queueIfBusy = false): Promise<void> {
    if (loadInFlight.current) {
      // A poll may predate the mutation: never mistake it for its fresh result.
      if (afterMutation) {
        await loadFinished.current;
        return load(silent, true);
      }
      // A room signal describes a confirmed change. Coalesce signals while an
      // older read is running, then read once more as soon as it finishes.
      if (queueIfBusy) queuedRoomRefresh.current = true;
      return;
    }
    loadInFlight.current = true;
    let finish!: () => void;
    loadFinished.current = new Promise<void>((resolve) => { finish = resolve; });
    if (!silent) setLoading(true);
    try {
      if (!silent) setLoadError(null);
      const [live, detail, votes, meetingDecisions, meetingRounds, attachments, pendingRejections] = await Promise.all([
        roomRpc<LiveMeetingSession>("get_meeting_session_detail", { p_meeting_id: meetingId }),
        roomRpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId }),
        roomRpc<MyVote[]>("get_my_open_votes", { p_meeting_id: meetingId }),
        roomRpc<Decision[]>("list_meeting_decisions", { p_meeting_id: meetingId }),
        roomRpc<VotingRound[]>("list_meeting_voting_rounds", { p_meeting_id: meetingId }),
        roomRpc<MeetingTopicAttachment[]>("list_meeting_topic_attachments", { p_meeting_id: meetingId }),
        roomRpc<PendingRejectedVoteResolutions>("list_pending_rejected_vote_resolutions", { p_meeting_id: meetingId }),
      ]);
      if (["waiting_for_minutes", "waiting_for_approval", "closed"].includes(live.meeting.status)) {
        router.replace(`/admin/meetings/${meetingId}/minutes`);
        return;
      }
      if (!session) {
        // Open where the viewer has work: the roster until it is locked, one's own
        // check-in until it is confirmed, otherwise the meeting itself.
        const checkedIn = live.my_attendance?.verification_status === "verified";
        setTab(live.viewer.can_operate_attendance && !live.meeting.attendance_locked ? "attendance"
          : live.viewer.is_roster_member && !checkedIn && !live.meeting.attendance_locked ? "my-attendance" : "agenda");
      }
      setSession(live);
      setAgenda(detail.agenda_items ?? []);
      setStartedAt(sessionStartedAt(detail));
      setMyVotes(votes ?? []);
      setDecisions(meetingDecisions ?? []);
      setRounds(meetingRounds ?? []);
      setTopicAttachments(attachments ?? []);
      setRejectedVoteResolutions(Array.isArray(pendingRejections?.items) ? pendingRejections.items : []);
      // The timers are read with every refresh; without them the room works as before.
      await roomRpc<MeetingItemTimers>("list_meeting_item_timers_v2", { p_meeting_id: meetingId })
        .then((data) => setItemTimers({ data, clockOffsetMs: Date.parse(data.server_now) - Date.now() }))
        .catch(() => setItemTimers((current) => current));
      // Referrals too: without them the room shows no referral and offers none.
      await roomRpc<MeetingReferrals>("list_meeting_referrals_v2", { p_meeting_id: meetingId })
        .then(setReferrals)
        .catch(() => setReferrals((current) => current));
      // And assignments: without them the decision shows no assignment section.
      await refreshAssignments();
      const rosterKey = `${meetingId}|${live.attendance.map((record) => `${record.user_id}:${record.status}:${record.verification_status ?? ""}`).join(",")}`;
      if (profilesLoadedFor.current !== rosterKey) {
        profilesLoadedFor.current = rosterKey;
        try {
          setProfiles(await roomRpc<MemberProfiles>("list_meeting_member_profiles_v2", { p_meeting_id: meetingId }));
          setProfilesError(null);
        } catch (error) {
          // The table still works without the cards; the failure is shown in the card the viewer opens.
          profilesLoadedFor.current = null;
          setProfilesError(messageOf(error, "تعذر تحميل بطاقات الأعضاء. أعد المحاولة بعد قليل."));
        }
      }
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
      finish();
      if (!silent) setLoading(false);
      if (queuedRoomRefresh.current) {
        queuedRoomRefresh.current = false;
        void load(true);
      }
    }
  }

  async function refreshAssignments() {
    try {
      setAssignments(await roomRpc<MeetingAssignments>("list_meeting_assignments_v2", { p_meeting_id: meetingId }));
      setAssignmentsError(null);
    } catch (error) {
      setAssignmentsError(messageOf(error, "تعذر تحميل التكليفات. أعد المحاولة لعرضها وإضافتها."));
    }
  }

  async function castVote(roundId: string, value: VoteValue, note: string | null) {
    setNotice(null);
    try {
      const result = await roomRpc<{ accepted: boolean }>("cast_vote", { p_voting_round_id: roundId, p_vote_value: value, p_vote_note: note }, { signal: AbortSignal.timeout(20_000) });
      if (result.accepted !== true) throw new Error("Vote acknowledgement missing");
      voting.acknowledge(roundId);
      setMyVotes(current => current.map(vote => vote.voting_round_id === roundId ? { ...vote, has_voted: true } : vote));
      setNotice({ kind: "success", text: "تم تسجيل صوتك وملاحظتك بسرية." });
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: messageOf(error, "لم يتأكد تسجيل صوتك. تحقّق من حالة التصويت قبل إعادة المحاولة.") });
      return false;
    }
  }

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "success", text: success });
      await load(true, true);
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
      const result = await roomRpc<CheckInToken>("create_checkin_session", { p_meeting_id: meetingId, p_valid_for_minutes: 15 });
      setCheckIn(result);
      await load(true, true);
    } catch (error) { setNotice({ kind: "error", text: messageOf(error, "تعذر إنشاء رمز الحضور.") }); }
    finally { setBusy(false); }
  }

  function submitAttendance(record: Attendance, status: "present" | "absent" | "excused", note: string | null) {
    return perform(() => roomRpc("verify_attendance", { p_attendance_record_id: record.id, p_status: status, p_note: note, p_expected_updated_at: record.updated_at }), status === "present" ? "تم اعتماد حضور العضو وتحديث النصاب." : status === "excused" ? "تم تسجيل اعتذار العضو." : "تم تسجيل غياب العضو.");
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

  async function updateDiscussion(item: AgendaDiscussionItem, status: DiscussionStatus, notes: string | null) {
    // Saving the rapporteur's summary owns its feedback inside the summary card.
    // Do not duplicate the same failure at the top of the room.
    if (status === item.agenda_status) {
      setBusy(true);
      setNotice(null);
      try {
        await roomRpc("update_agenda_discussion", { p_agenda_item_id: item.id, p_status: status, p_discussion_notes: notes, p_expected_updated_at: item.updated_at });
        await load(true, true);
        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    }
    return perform(() => roomRpc("update_agenda_discussion", { p_agenda_item_id: item.id, p_status: status, p_discussion_notes: notes, p_expected_updated_at: item.updated_at }), status === "under_discussion" ? "بدأت مناقشة البند." : status === "discussed" ? "تم حفظ الملخص النهائي للبند بنجاح." : "أُجل البند مع توثيق السبب.");
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
      return perform(() => roomRpc("update_meeting_decision_text", { p_decision_id: decision.id, p_decision_text: text, p_expected_updated_at: decision.updated_at }), "تم حفظ التعديل على نص القرار.");
    }
    if (!round) return Promise.resolve(false);
    return perform(() => roomRpc("create_decision_from_voting_round", { p_voting_round_id: round.id, p_decision_text: text, p_requires_approval: true }), "تم حفظ صياغة القرار وإحالته للاعتماد.");
  }

  async function resolveRejectedVote(resolution: "final_reject" | "return_previous", reason: string) {
    const item = rejectedVoteResolutions[0];
    if (!item) return;
    setBusy(true);
    setResolutionError(null);
    setNotice(null);
    try {
      await roomRpc("resolve_rejected_vote", {
        p_voting_round_id: item.voting_round_id,
        p_resolution: resolution,
        p_reason: reason || null,
        p_idempotency_key: crypto.randomUUID(),
        p_expected_version: item.expected_version,
      });
      setNotice({
        kind: "success",
        text: resolution === "return_previous"
          ? `تم توثيق قرار إعادة الموضوع إلى ${item.destination_unit_name_ar}.`
          : "تم توثيق الرفض النهائي وإغلاق مسار الموضوع.",
      });
      await load(true, true);
    } catch (error) {
      setResolutionError(messageOf(error, "تعذر توثيق قرار الرئيس. تحقّق من حالة التصويت ثم أعد المحاولة."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCompleteSession() {
    if (!session) return;
    const completed = await perform(() => roomRpc("complete_meeting_session", { p_meeting_id: meetingId, p_expected_updated_at: session.meeting.updated_at }), "انتهت الجلسة وانتقل الاجتماع إلى إعداد المحضر.");
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

  async function runAssignment(key: string, action: () => Promise<unknown>, fallback: string) {
    setAssignmentActivity({ key, errorKey: null, error: null });
    try {
      await action();
      await load(true, true);
      setAssignmentActivity({ key: null, errorKey: null, error: null });
      return true;
    } catch (error) {
      setAssignmentActivity({ key: null, errorKey: key, error: messageOf(error, fallback) });
      await load(true, true);
      return false;
    }
  }

  const assignmentActions = {
    onSearchUsers: async (query: string) => {
      const result = await roomRpc<{ users: AssignmentUserOption[] }>("search_meeting_assignment_options_v2", { p_meeting_id: meetingId, p_query: query, p_limit: 20 });
      return result.users;
    },
    onCreate: (agendaItemId: string, input: NewAssignment) => runAssignment(NEW_ASSIGNMENT_KEY, async () => {
      const selections = input.targets.map((target) => ({ kind: target.kind, id: target.id, scope_unit_id: target.scopeUnitId ?? null }));
      const preview = await roomRpc<{ blockers: Array<{ unit_name_ar?: string | null; reason: string }> }>("preview_meeting_assignment_targets_v2", { p_agenda_item_id: agendaItemId, p_selections: selections });
      if (preview.blockers.length > 0) {
        throw new Error(preview.blockers.map((blocker) => `${blocker.unit_name_ar ?? "جهة مختارة"}: ${blocker.reason}`).join(" · "));
      }
      await roomRpc("propose_meeting_assignment_batch_v2", {
        p_agenda_item_id: agendaItemId, p_title: input.title, p_description: null,
        p_selections: selections, p_due_date: input.dueDate, p_follow_up_user_id: input.followUpId,
        p_requires_evidence: input.requiresEvidence, p_client_request_id: input.clientRequestId,
      });
    }, "تعذر حفظ التكليف."),
    onConfirm: (assignment: MeetingAssignment) => void runAssignment(assignment.id, () => assignment.assignment_batch_id
      ? roomRpc("confirm_meeting_assignment_batch_v2", { p_batch_id: assignment.assignment_batch_id, p_expected_revision: assignment.revision })
      : roomRpc("confirm_meeting_assignment_v2", { p_assignment_id: assignment.id, p_expected_revision: assignment.revision }), "تعذر اعتماد التكليف."),
    onWithdraw: (assignment: MeetingAssignment) => void runAssignment(assignment.id, () => assignment.assignment_batch_id
      ? roomRpc("withdraw_meeting_assignment_batch_v2", { p_batch_id: assignment.assignment_batch_id, p_expected_revision: assignment.revision })
      : roomRpc("withdraw_meeting_assignment_v2", { p_assignment_id: assignment.id, p_expected_revision: assignment.revision }), "تعذر سحب التكليف."),
  };

  function submitReferral(toUnitId: string, reason: string) {
    if (!referralItem) return Promise.resolve(false);
    // The item as the room last read it: a change from another screen is refused, not overwritten.
    const item = agenda.find((row) => row.id === referralItem.id) ?? referralItem;
    return perform(
      () => roomRpc("refer_agenda_item_v2", { p_agenda_item_id: item.id, p_to_unit_id: toUnitId, p_reason: reason, p_expected_updated_at: item.updated_at }),
      "أُحيل البند، وينتظر قبول الجهة المحال إليها.",
    );
  }

  async function setPlannedMinutes(agendaItemId: string, minutes: number | null, revision: number) {
    setPlannedState({ pendingItemId: agendaItemId, errorItemId: null, error: null });
    try {
      await roomRpc("set_agenda_item_planned_minutes_v2", { p_agenda_item_id: agendaItemId, p_minutes: minutes, p_expected_revision: revision });
      await load(true, true);
      setPlannedState({ pendingItemId: null, errorItemId: null, error: null });
    } catch (error) {
      setPlannedState({ pendingItemId: null, errorItemId: agendaItemId, error: messageOf(error, "تعذر حفظ مدة البند.") });
      await load(true, true);
    }
  }

  async function setItemDownloads(agendaItemId: string, allowed: boolean, revision: number) {
    setDownloadState({ pendingItemId: agendaItemId, errorItemId: null, error: null });
    try {
      await roomRpc("set_agenda_item_downloads_v2", { p_agenda_item_id: agendaItemId, p_allowed: allowed, p_expected_revision: revision });
      await load(true, true);
      setDownloadState({ pendingItemId: null, errorItemId: null, error: null });
    } catch (error) {
      setDownloadState({ pendingItemId: null, errorItemId: agendaItemId, error: messageOf(error, "تعذر حفظ إذن التنزيل.") });
      await load(true, true);
    }
  }

  function toggleFullscreen() {
    // A member may fill the screen with the meeting; the browser may refuse, and the room still works.
    if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => undefined);
    else void roomRef.current?.requestFullscreen?.()?.catch(() => undefined);
  }

  if (loading) return <div className="grid min-h-96 place-items-center font-sans"><p role="status" className="m-0 text-q-ui font-bold text-q-text-2">جارٍ تجهيز غرفة الاجتماع…</p></div>;
  if (!session) return <div className="flex flex-col items-start gap-3 font-sans"><InlineMessage tone="error">{loadError ?? "تعذر تحميل بيانات الجلسة. أعد المحاولة من صفحة الاجتماعات."}</InlineMessage><Button variant="secondary" onClick={() => void load()}>إعادة المحاولة</Button></div>;

  const operator = session.viewer.can_operate_attendance;
  const rapporteur = session.viewer.mode === "rapporteur";
  const pendingVotes = myVotes.filter((vote) => !vote.has_voted);
  const hasActiveVoting = rounds.some((round) => round.status === "open") || pendingVotes.length > 0 || session.open_voting_rounds.length > 0;
  const activeVotingError = hasActiveVoting ? voting.error : null;
  const dialogError = notice?.kind === "error" ? notice.text : null;
  // Once the roster is locked a member has nothing else to open: their screen follows the broadcast.
  const followsBroadcast = Boolean(live.broadcast?.active && !live.broadcast.viewer_controls)
    && session.viewer.mode === "member" && !session.viewer.can_manage_voting && session.meeting.attendance_locked;
  const activeTab: RoomTab = presenting || followsBroadcast ? "agenda" : tab;
  const tabs: Array<{ value: RoomTab; label: string; count?: number }> = followsBroadcast ? [] : [
    ...(session.viewer.is_roster_member ? [{ value: "my-attendance" as const, label: "حضوري الشخصي" }] : []),
    ...(operator ? [{ value: "attendance" as const, label: "إدارة الحضور" }] : []),
    { value: "agenda", label: "جدول الأعمال والتصويت", count: pendingVotes.length },
  ];

  const ballots = pendingVotes.slice(0, 1).map((vote) => <MemberVoteCard key={vote.voting_round_id} vote={vote} busy={busy || Boolean(activeVotingError)} unavailableReason={activeVotingError} onCast={castVote} />);
  const steering = session.viewer.mode !== "member" || session.viewer.can_manage_voting;
  const stageProps = { session, agenda, rounds, decisions, referrals: referrals?.referrals, profiles, profilesError };

  return (
    <div
      ref={roomRef}
      data-theme={theme.dark ? "dark" : undefined}
      className={cn(
        "flex flex-col gap-3 bg-q-bg font-sans text-q-text",
        (theme.dark || presenting) && "rounded-q-card bg-q-bg p-3 sm:p-4",
        // One fixed screen for whoever steers the meeting; the columns scroll inside it.
        steering && activeTab === "agenda" && "lg:h-[calc(100dvh-9.5rem)]",
        (presenting || fullscreen) && "h-dvh overflow-hidden p-3 sm:p-4 lg:h-dvh",
      )}
    >
      {notice && <InlineMessage tone={notice.kind === "success" ? "success" : "error"} className="shrink-0 border border-q-border text-q-ui">{notice.text}</InlineMessage>}
      {activeVotingError && <InlineMessage tone="error">{activeVotingError}<Button variant="secondary" onClick={voting.reconnect}>إعادة الاتصال بالتصويت</Button></InlineMessage>}

      <RoomTopBar
        session={session}
        startedAt={startedAt}
        dark={theme.dark}
        onToggleTheme={theme.toggle}
        presentation={session.viewer.can_manage_session ? { active: presenting, onToggle: togglePresentation } : undefined}
        fullscreen={session.viewer.can_manage_session ? undefined : { active: fullscreen, onToggle: toggleFullscreen }}
      />

      {presenting && pendingVotes.length > 0 && <InlineMessage tone="info">لديك تصويت مفتوح. أنهِ وضع العرض لتسجيل صوتك دون أن يظهر على الشاشة.</InlineMessage>}
      {!presenting && activeTab !== "agenda" && ballots}

      {!presenting && tabs.length > 1 && (
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

      <QuorumDecisionGate session={session} busy={busy} onChoose={async (action, reason) => {
        const saved = await perform(() => roomRpc("apply_quorum_failure", { p_meeting_id: meetingId, p_action: action, p_reason: reason, p_expected_updated_at: session.meeting.updated_at }), action === "postpone" ? "أُجل الاجتماع لعدم اكتمال النصاب." : "سُجل قرار المتابعة بنصاب غير مكتمل وسيظهر في القرارات والمحضر.");
        if (saved && action === "postpone") router.push("/admin/meetings");
        return saved;
      }} />

      {activeTab === "my-attendance" ? (
        <MemberCheckInCard meetingId={meetingId} attendance={session.my_attendance} canCheckIn={session.viewer.can_self_check_in} onCompleted={async (text) => { setNotice({ kind: "success", text }); await load(true, true); }} />
      ) : activeTab === "attendance" && operator ? (
        <ChairAttendanceConsole
          session={session}
          busy={busy}
          canLock={session.viewer.can_lock_attendance}
          onOpenQr={() => void createCheckInSession()}
          onRefreshQuorum={() => void perform(() => roomRpc("recalculate_meeting_quorum", { p_meeting_id: meetingId, p_record_snapshot: true }), "تم تحديث النصاب.")}
          onVerify={verifyAttendance}
          onLock={() => void perform(() => roomRpc("lock_attendance_roster", { p_meeting_id: meetingId, p_expected_updated_at: session.meeting.updated_at }), "تم تثبيت سجل الحضور واعتماد النصاب.")}
        />
      ) : (
        <div className={cn("min-h-0 flex-1", (presenting || fullscreen) && "overflow-y-auto")}><AgendaWorkspace
          stage={<RoomStage {...stageProps} />}
          compactStage={<RoomStage {...stageProps} compact />}
          ballot={ballots.length ? <div className="flex flex-col gap-3">{ballots}</div> : undefined}
          session={session}
          agenda={agenda}
          attachments={topicAttachments}
          topicHistory={topicHistory}
          rounds={rounds}
          decisions={decisions}
          busy={busy}
          presenting={presenting}
          broadcast={live.broadcast}
          broadcastPending={live.pending}
          broadcastError={live.error}
          onBroadcast={live.choose}
          onHandOver={(toRole) => void live.handOver(toRole)}
          onBroadcastDocument={live.openDocument}
          timers={itemTimers}
          plannedMinutes={{ ...plannedState, onChange: (itemId, minutes, revision) => void setPlannedMinutes(itemId, minutes, revision) }}
          downloads={{ ...downloadState, onChange: (itemId, allowed, revision) => void setItemDownloads(itemId, allowed, revision) }}
          onUpdateDiscussion={updateDiscussion}
          onRequestPostpone={(item) => { setNotice(null); setReasonRequest({ kind: "postpone", item }); }}
          referrals={referrals}
          assignments={{ data: assignments, error: assignmentsError, onRetry: () => void refreshAssignments(), activity: assignmentActivity, ...assignmentActions }}
          onRequestReferral={(item) => { setNotice(null); setReferralItem(item); }}
          onOpenRound={(item) => void perform(() => roomRpc("open_voting_round", { p_agenda_item_id: item.id, p_expected_meeting_updated_at: session.meeting.updated_at }), "فُتحت جولة التصويت لهذا البند.")}
          onCloseRound={(round) => void perform(() => roomRpc("close_voting_round", { p_voting_round_id: round.id, p_reason: "إغلاق الجولة بعد اكتمال التصويت." }), "أُغلقت الجولة وحُسبت النتيجة.")}
          onCreateDecision={(round, item) => { setNotice(null); setDecisionDraft({ round, item }); }}
          onEditDecision={(decision, item, round) => { setNotice(null); setDecisionDraft({ round, item, decision }); }}
          onComplete={() => { setNotice(null); setCompleteConfirmation(true); }}
        /></div>
      )}

      {checkIn && <AttendanceQrDialog meetingId={meetingId} token={checkIn.token} expiresAt={checkIn.expires_at} publicOrigin={publicCheckInOrigin} attendance={session.attendance} viewerUserId={session.viewer.user_id} busy={busy} onVerify={verifyAttendance} onClose={() => setCheckIn(null)} onRenew={() => void createCheckInSession()} />}

      {decisionDraft && <DecisionComposerDialog key={decisionDraft.decision?.id ?? decisionDraft.item.id} item={decisionDraft.item} round={decisionDraft.round} decision={decisionDraft.decision} busy={busy} error={dialogError} isRapporteur={rapporteur} onClose={() => setDecisionDraft(null)} onSubmit={submitDecision} />}

      {rejectedVoteResolutions[0] && (
        <RejectedVoteResolutionDialog
          item={rejectedVoteResolutions[0]}
          pending={busy}
          error={resolutionError}
          onSubmit={(resolution, reason) => void resolveRejectedVote(resolution, reason)}
        />
      )}

      {referralItem && (
        <ReferralDialog
          topicTitle={referralItem.topic?.title_ar ?? "البند"}
          destinations={referrals?.destinations ?? []}
          busy={busy}
          error={dialogError}
          onClose={() => setReferralItem(null)}
          onSubmit={submitReferral}
        />
      )}
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

function messageOf(error: unknown, fallback: string) { return error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : fallback; }
