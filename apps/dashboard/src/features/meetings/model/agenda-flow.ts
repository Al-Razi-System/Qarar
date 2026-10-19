import type { AgendaDiscussionItem, Decision, ItemReferral, LiveMeetingSession, VotingRound } from "./live-meeting";

export type AgendaItemFlow = {
  open: VotingRound | null;
  closed: VotingRound | null;
  decision: Decision | null;
  /** Set when the chair referred the item to another unit instead of a vote. */
  referral: ItemReferral | null;
  /** Eligible members who have not voted in the open round, as far as the server told this viewer. */
  remainingVoters: number;
  hasVoting: boolean;
};

export type AgendaStateTone = "neutral" | "live" | "info" | "success" | "warning" | "danger";
export type AgendaItemState = { label: string; tone: AgendaStateTone };

export type ChairActionKind = "start" | "end" | "postpone" | "open_round" | "close_round" | "decision" | "edit_decision" | "refer";
export type ChairAction = {
  kind: ChairActionKind;
  label: string;
  /** Set when the server would reject the action; shown beside the disabled button. */
  disabledReason?: string;
};

export function sortAgenda(agenda: AgendaDiscussionItem[]) {
  return [...agenda].sort((a, b) => a.agenda_order - b.agenda_order);
}

export function quorumMet(session: LiveMeetingSession) {
  const quorum = session.quorum;
  return quorum?.quorum_status === "met" || (quorum?.actual_percentage ?? 0) >= (quorum?.required_percentage ?? 100);
}

export function latestClosedRound(rounds: VotingRound[], agendaItemId: string) {
  return [...rounds].reverse().find((round) => round.agenda_item_id === agendaItemId && round.status === "closed") ?? null;
}

export function itemFlow(item: AgendaDiscussionItem, session: LiveMeetingSession, rounds: VotingRound[], decisions: Decision[], referrals: ItemReferral[] = []): AgendaItemFlow {
  const open = rounds.find((round) => round.agenda_item_id === item.id && round.status === "open")
    ?? session.open_voting_rounds.find((round) => round.agenda_item_id === item.id)
    ?? null;
  const closed = latestClosedRound(rounds, item.id);
  const decision = decisions.find((row) => row.agenda_item_id === item.id) ?? null;
  const remainingVoters = open?.participation?.length
    ? open.participation.filter((person) => !person.has_voted).length
    : Math.max(0, (open?.eligible_voter_count ?? 0) - (open?.votes_cast_count ?? 0));
  const referral = referrals.find((row) => row.agenda_item_id === item.id) ?? null;
  return { open, closed, decision, referral, remainingVoters, hasVoting: Boolean(item.requires_voting || open || closed) };
}

/** The item the council is on: the one under discussion or being voted, otherwise the first with work left. */
export function activeAgendaItemId(session: LiveMeetingSession, ordered: AgendaDiscussionItem[], rounds: VotingRound[], decisions: Decision[], referrals: ItemReferral[] = []) {
  const inProgress = ordered.find((item) => item.agenda_status === "under_discussion"
    || rounds.some((round) => round.agenda_item_id === item.id && round.status === "open")
    || session.open_voting_rounds.some((round) => round.agenda_item_id === item.id));
  if (inProgress) return inProgress.id;
  const blocked = ordered.find((item) => {
    const closed = latestClosedRound(rounds, item.id);
    return !["discussed", "postponed"].includes(item.agenda_status ?? "pending")
      || (item.discussion_notes ?? "").trim().length < 5
      || (item.requires_voting && item.agenda_status !== "postponed" && !closed && !isReferred(item, referrals))
      || (closed?.result === "approved" && !decisions.some((decision) => decision.agenda_item_id === item.id));
  });
  return blocked?.id ?? null;
}

function isReferred(item: AgendaDiscussionItem, referrals: ItemReferral[]) {
  return referrals.some((row) => row.agenda_item_id === item.id);
}

export function referralNote(referral: ItemReferral) {
  const outcome = referral.status === "accepted" ? "وقبلت الإحالة" : referral.status === "rejected" ? "ورفضت الإحالة" : "بانتظار قبولها";
  return `أُحيل البند إلى ${referral.to_unit_name_ar}، ${outcome}.`;
}

export function voteResultLabel(result?: string | null) {
  if (result === "approved") return "موافقة";
  if (result === "rejected") return "رفض";
  if (result === "no_votes") return "لم يصوّت أحد";
  if (result === "cancelled") return "ملغاة";
  if (result === "tied") return "تعادل";
  return "لم تُحتسب النتيجة";
}

export function agendaItemState(item: AgendaDiscussionItem, flow: AgendaItemFlow): AgendaItemState {
  if (flow.open) return { label: "التصويت مفتوح", tone: "info" };
  if (item.agenda_status === "under_discussion") return { label: "قيد المناقشة", tone: "live" };
  if (item.agenda_status === "postponed") return { label: "مؤجل", tone: "warning" };
  if (flow.referral) return { label: `محال إلى ${flow.referral.to_unit_name_ar}`, tone: "info" };
  if (flow.decision) return { label: "صدر القرار", tone: "success" };
  if (flow.closed?.result === "approved") return { label: "بانتظار صياغة القرار", tone: "warning" };
  if (flow.closed) return { label: `انتهى التصويت: ${voteResultLabel(flow.closed.result)}`, tone: flow.closed.result === "rejected" ? "danger" : "neutral" };
  if (item.agenda_status === "discussed") return item.requires_voting ? { label: "بانتظار التصويت", tone: "warning" } : { label: "تمت المناقشة", tone: "success" };
  return { label: "لم يبدأ", tone: "neutral" };
}

/**
 * What the chair can do next on one agenda item, in the order the meeting runs.
 * It mirrors the server rules so a button the server would reject is shown
 * disabled with the reason, never enabled.
 */
export function chairActions(
  item: AgendaDiscussionItem,
  session: LiveMeetingSession,
  flow: AgendaItemFlow,
  /** Only the council's chair refers an item; nobody else is offered it. */
  options: { canRefer?: boolean } = {},
): { actions: ChairAction[]; note: string | null } {
  const status = item.agenda_status ?? "pending";
  const actions: ChairAction[] = [];
  let note: string | null = null;
  const refer: ChairAction = { kind: "refer", label: "إحالة البند" };

  if (!session.meeting.attendance_locked || (!quorumMet(session) && !session.meeting.quorum_continuation)) {
    return { actions: [], note: session.meeting.attendance_locked ? "بانتظار اختيار رئيس المجلس: تأجيل الاجتماع أو المتابعة بنصاب غير مكتمل." : "ثبّت سجل الحضور قبل بدء المناقشة." };
  }

  if (status === "pending") actions.push({ kind: "start", label: "بدء المناقشة" });

  if (flow.referral) {
    note = referralNote(flow.referral);
  } else if (status === "under_discussion" && !flow.open && !flow.closed) {
    actions.push({ kind: "end", label: flow.hasVoting ? "إنهاء المناقشة والانتقال للتصويت" : "إنهاء المناقشة" });
    actions.push({ kind: "postpone", label: "تأجيل البند" });
    if (options.canRefer) actions.push(refer);
  } else if (flow.open) {
    actions.push({
      kind: "close_round",
      label: "إغلاق التصويت واحتساب النتيجة",
      disabledReason: flow.remainingVoters > 0 ? `بانتظار تصويت ${flow.remainingVoters} من الأعضاء المؤهلين قبل الإغلاق.` : undefined,
    });
  } else if (flow.closed?.result === "approved" && !flow.decision) {
    actions.push({ kind: "decision", label: "صياغة القرار المعتمد" });
  } else if (flow.decision) {
    if (flow.decision.can_edit_text) actions.push({ kind: "edit_decision", label: "تعديل القرار" });
    note = `${flow.decision.decision_no} · تم إنشاء القرار.`;
  } else if (flow.closed) {
    note = flow.closed.result === "tied" ? "تعادلت الأصوات، فبقي الموضوع في مرحلته من مساره." : "تم توثيق نتيجة التصويت لهذا البند.";
  } else if (status === "discussed" && flow.hasVoting) {
    // Every item is decided by the members' vote once its discussion ends. When the
    // topic's route cannot take a vote, the server says why and the chair may postpone.
    const unavailable = !item.voting_available_now;
    actions.push({
      kind: "open_round",
      label: "فتح التصويت للأعضاء",
      disabledReason: unavailable
        ? item.voting_unavailable_reason ?? "لا يُفتح التصويت على هذا البند الآن."
        : !session.meeting.attendance_locked ? "ثبّت سجل الحضور أولاً لفتح التصويت." : !quorumMet(session) && !session.meeting.quorum_continuation ? "النصاب غير مكتمل؛ يلزم قرار الرئيس أولًا." : undefined,
    });
    if (unavailable) actions.push({ kind: "postpone", label: "تأجيل البند" });
    if (options.canRefer) actions.push(refer);
  } else if (status === "postponed") {
    note = "أُجّل هذا البند بسبب موثق.";
  } else if (status === "discussed") {
    note = "اكتملت مناقشة هذا البند.";
  }

  return { actions, note };
}

/** Everything that still stops the chair from ending the session, in agenda order. */
export function completionBlockers(session: LiveMeetingSession, ordered: AgendaDiscussionItem[], rounds: VotingRound[], decisions: Decision[], referrals: ItemReferral[] = []) {
  const blockers: string[] = [];
  if (!session.meeting.attendance_locked) blockers.push("تثبيت سجل الحضور.");
  if (!quorumMet(session) && !session.meeting.quorum_continuation) blockers.push("اكتمال النصاب أو قرار الرئيس بالمتابعة بنصاب غير مكتمل.");

  ordered.forEach((item) => {
    const label = `البند ${item.agenda_order} «${item.topic?.title_ar ?? "موضوع الاجتماع"}»`;
    const open = rounds.some((round) => round.agenda_item_id === item.id && round.status === "open")
      || session.open_voting_rounds.some((round) => round.agenda_item_id === item.id);
    const closed = latestClosedRound(rounds, item.id);
    if (!["discussed", "postponed"].includes(item.agenda_status ?? "pending")) blockers.push(`${label}: إنهاء المناقشة أو تأجيل البند بسبب موثق.`);
    if ((item.discussion_notes ?? "").trim().length < 5) blockers.push(`${label}: حفظ ملخص النتائج والتوصيات.`);
    else if (closed?.closed_at && item.updated_at && new Date(item.updated_at).getTime() < new Date(closed.closed_at).getTime()) blockers.push(`${label}: تحديث الملخص النهائي بعد احتساب نتيجة التصويت.`);
    if (item.requires_voting && open) blockers.push(`${label}: إغلاق جولة التصويت المفتوحة واحتساب النتيجة.`);
    else if (item.requires_voting && item.agenda_status !== "postponed" && !closed && !isReferred(item, referrals)) blockers.push(`${label}: إجراء التصويت وإغلاق الجولة.`);
    if (closed?.result === "approved" && !decisions.some((decision) => decision.agenda_item_id === item.id)) blockers.push(`${label}: صياغة القرار المعتمد بعد نتيجة الموافقة.`);
  });

  return blockers;
}
