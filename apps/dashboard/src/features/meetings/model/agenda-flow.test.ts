import { describe, expect, it } from "vitest";
import { activeAgendaItemId, agendaItemState, chairActions, completionBlockers, itemFlow, sortAgenda } from "./agenda-flow";
import type { AgendaDiscussionItem, Decision, LiveMeetingSession, VotingRound } from "./live-meeting";

function session(overrides: Partial<LiveMeetingSession["meeting"]> = {}, quorumStatus = "met"): LiveMeetingSession {
  return {
    viewer: { user_id: "u1", full_name_ar: "الرئيس", mode: "chair", is_roster_member: true, can_manage_session: true, can_operate_attendance: true,
      can_create_checkin: true, can_verify_attendance: true, can_lock_attendance: true, can_record_proceedings: false, can_manage_voting: true,
      can_complete_session: true, can_self_check_in: true, can_vote: true },
    meeting: { id: "m", title_ar: "اجتماع", status: "in_progress", updated_at: "2026-10-10T08:00:00Z", attendance_locked: true, ...overrides },
    attendance: [], my_attendance: null,
    quorum: { eligible_members: 3, present_members: 3, actual_percentage: quorumStatus === "met" ? 100 : 30, required_percentage: 60, quorum_status: quorumStatus },
    open_voting_rounds: [],
  };
}
const item = (patch: Partial<AgendaDiscussionItem> = {}): AgendaDiscussionItem => ({ id: "a1", agenda_order: 1, agenda_status: "pending", requires_voting: true, topic: { id: "t1", title_ar: "الخطة" }, ...patch });
const open: VotingRound = { id: "r1", agenda_item_id: "a1", status: "open", eligible_voter_count: 3, votes_cast_count: 1 };
const approved: VotingRound = { id: "r1", agenda_item_id: "a1", status: "closed", result: "approved", closed_at: "2026-10-10T09:00:00Z" };
const decision: Decision = { id: "d1", decision_no: "ق-1", agenda_item_id: "a1", decision_status: "ready", decision_text: "نص" };
const kinds = (it_: AgendaDiscussionItem, s: LiveMeetingSession, rounds: VotingRound[] = [], decisions: Decision[] = []) =>
  chairActions(it_, s, itemFlow(it_, s, rounds, decisions));

describe("chairActions", () => {
  it("walks one voting item through the meeting in order", () => {
    const s = session();
    expect(kinds(item(), s).actions.map((a) => a.kind)).toEqual(["start"]);
    expect(kinds(item({ agenda_status: "under_discussion" }), s).actions.map((a) => a.label)).toEqual(["إنهاء المناقشة والانتقال للتصويت", "تأجيل البند"]);
    expect(kinds(item({ agenda_status: "discussed", voting_available_now: true }), s).actions).toEqual([{ kind: "open_round", label: "فتح التصويت للأعضاء", disabledReason: undefined }]);
    expect(kinds(item({ agenda_status: "discussed" }), s, [approved]).actions.map((a) => a.kind)).toEqual(["decision"]);
    const done = kinds(item({ agenda_status: "discussed" }), s, [approved], [decision]);
    expect(done.actions).toEqual([]);
    expect(done.note).toBe("ق-1 · تم إنشاء القرار.");
  });

  it("ends a discussion-only item without mentioning a vote", () => {
    expect(kinds(item({ agenda_status: "under_discussion", requires_voting: false }), session()).actions[0].label).toBe("إنهاء المناقشة");
  });

  it("keeps the round open until every eligible member has voted", () => {
    const waiting = kinds(item({ agenda_status: "discussed" }), session(), [open]).actions[0];
    expect(waiting.kind).toBe("close_round");
    expect(waiting.disabledReason).toBe("بانتظار تصويت 2 من الأعضاء المؤهلين قبل الإغلاق.");
    const full = kinds(item({ agenda_status: "discussed" }), session(), [{ ...open, votes_cast_count: 3 }]).actions[0];
    expect(full.disabledReason).toBeUndefined();
  });

  it("counts remaining voters from the participation list when the server returns it", () => {
    const round: VotingRound = { ...open, votes_cast_count: undefined, participation: [{ user_id: "u1", full_name_ar: "أ", has_voted: true }, { user_id: "u2", full_name_ar: "ب", has_voted: false }] };
    expect(itemFlow(item(), session(), [round], []).remainingVoters).toBe(1);
  });

  it("explains why voting cannot open before attendance is locked or without a quorum", () => {
    const ready = item({ agenda_status: "discussed", voting_available_now: true });
    expect(kinds(ready, session({ attendance_locked: false })).actions[0].disabledReason).toBe("ثبّت سجل الحضور أولاً لفتح التصويت.");
    expect(kinds(ready, session({}, "not_met")).actions[0].disabledReason).toBe("النصاب غير مكتمل، فلا يُفتح التصويت.");
  });

  it("offers no decision for a rejected result", () => {
    const rejected = kinds(item({ agenda_status: "discussed" }), session(), [{ ...approved, result: "rejected" }]);
    expect(rejected.actions).toEqual([]);
    expect(rejected.note).toBe("تم توثيق نتيجة التصويت لهذا البند.");
  });
});

describe("agenda state and focus", () => {
  it("names each stage in words", () => {
    const s = session();
    const state = (it_: AgendaDiscussionItem, rounds: VotingRound[] = [], decisions: Decision[] = []) => agendaItemState(it_, itemFlow(it_, s, rounds, decisions)).label;
    expect(state(item())).toBe("لم يبدأ");
    expect(state(item({ agenda_status: "under_discussion" }))).toBe("قيد المناقشة");
    expect(state(item({ agenda_status: "discussed" }), [open])).toBe("التصويت مفتوح");
    expect(state(item({ agenda_status: "discussed" }), [approved])).toBe("بانتظار صياغة القرار");
    expect(state(item({ agenda_status: "discussed" }), [approved], [decision])).toBe("صدر القرار");
    expect(state(item({ agenda_status: "postponed" }))).toBe("مؤجل");
  });

  it("focuses the item in progress, otherwise the first with work left", () => {
    const first = item({ agenda_status: "discussed", requires_voting: false, discussion_notes: "ملخص كافٍ" });
    const second = item({ id: "a2", agenda_order: 2, requires_voting: false });
    const third = item({ id: "a3", agenda_order: 3, agenda_status: "under_discussion", requires_voting: false });
    expect(activeAgendaItemId(session(), sortAgenda([second, first]), [], [])).toBe("a2");
    expect(activeAgendaItemId(session(), sortAgenda([third, second, first]), [], [])).toBe("a3");
    expect(activeAgendaItemId(session(), [first], [], [])).toBeNull();
  });
});

describe("completionBlockers", () => {
  it("is empty only when every item is finished, summarised, voted and decided", () => {
    const finished = item({ agenda_status: "discussed", discussion_notes: "الملخص النهائي", updated_at: "2026-10-10T09:30:00Z" });
    expect(completionBlockers(session(), [finished], [approved], [decision])).toEqual([]);
    expect(completionBlockers(session(), [finished], [approved], [])).toEqual(["البند 1 «الخطة»: صياغة القرار المعتمد بعد نتيجة الموافقة."]);
    expect(completionBlockers(session({ attendance_locked: false }), [], [], [])).toEqual(["تثبيت سجل الحضور."]);
  });

  it("asks for the final summary again when it is older than the vote result", () => {
    const stale = item({ agenda_status: "discussed", discussion_notes: "ملاحظات أولية", updated_at: "2026-10-10T08:30:00Z" });
    expect(completionBlockers(session(), [stale], [approved], [decision])).toEqual(["البند 1 «الخطة»: تحديث الملخص النهائي بعد احتساب نتيجة التصويت."]);
  });
});
