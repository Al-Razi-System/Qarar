import { describe, expect, it } from "vitest";
import type { AgendaDiscussionItem, Attendance, LiveMeetingSession, VotingRound } from "./live-meeting";
import { deriveMeetingStage } from "./meeting-stage";

function seat(id: string, name: string, status = "present", verification = "verified"): Attendance {
  return { id: `att-${id}`, user_id: id, full_name_ar: name, status, verification_status: verification, updated_at: "2026-10-10T08:00:00Z" };
}

function sessionOf(overrides: { mode?: "chair" | "rapporteur" | "member"; locked?: boolean; attendance?: Attendance[]; open?: VotingRound[] } = {}): LiveMeetingSession {
  const mode = overrides.mode ?? "member";
  return {
    viewer: {
      user_id: "u1", full_name_ar: "د. منصور", mode, is_roster_member: true,
      can_manage_session: mode === "chair", can_operate_attendance: mode !== "member", can_create_checkin: false,
      can_verify_attendance: false, can_lock_attendance: false, can_record_proceedings: false,
      can_manage_voting: mode === "chair", can_complete_session: mode === "chair", can_self_check_in: true, can_vote: true,
    },
    meeting: { id: "m1", title_ar: "اجتماع مجلس الكلية", status: "in_progress", updated_at: "2026-10-10T08:00:00Z", attendance_locked: overrides.locked ?? true },
    attendance: overrides.attendance ?? [seat("u1", "د. منصور"), seat("u2", "د. هدى"), seat("u3", "د. خالد")],
    my_attendance: null,
    quorum: null,
    open_voting_rounds: overrides.open ?? [],
  };
}

const item = (id: string, order: number, extra: Partial<AgendaDiscussionItem> = {}): AgendaDiscussionItem => ({
  id, agenda_order: order, agenda_status: "pending", topic: { id: `t-${id}`, title_ar: `موضوع ${order}` }, ...extra,
});

describe("deriveMeetingStage seats", () => {
  it("maps attendance to seat states and never counts an unverified claim as present", () => {
    const stage = deriveMeetingStage(sessionOf({
      attendance: [
        seat("u1", "د. منصور"), seat("u2", "د. هدى", "late"), seat("u3", "د. خالد", "present", "pending_verification"),
        seat("u4", "د. ريم", "pending", "unclaimed"), seat("u5", "د. سعاد", "excused"), seat("u6", "د. طارق", "absent"),
      ],
    }), [], [], []);
    expect(stage.seats.map((s) => s.status)).toEqual(["present", "present", "pending", "pending", "excused", "absent"]);
  });

  it("labels only the viewer's own seat, and marks the chair only when the viewer is the chair", () => {
    const asChair = deriveMeetingStage(sessionOf({ mode: "chair" }), [], [], []);
    expect(asChair.seats[0]).toMatchObject({ roleLabel: "الرئيس · أنت", chair: true });
    expect(asChair.seats[1]).toMatchObject({ roleLabel: undefined, chair: false });
    const asMember = deriveMeetingStage(sessionOf({ mode: "member" }), [], [], []);
    expect(asMember.seats[0]).toMatchObject({ roleLabel: "أنت", chair: false });
  });

  it("shows who voted and who has not when the server returned participation, without any direction", () => {
    const open: VotingRound = {
      id: "r1", agenda_item_id: "a1", status: "open", eligible_voter_count: 3, votes_cast_count: 1,
      participation: [
        { user_id: "u1", full_name_ar: "د. منصور", has_voted: true },
        { user_id: "u2", full_name_ar: "د. هدى", has_voted: false },
        { user_id: "u3", full_name_ar: "د. خالد", has_voted: false },
      ],
    };
    const stage = deriveMeetingStage(sessionOf({ mode: "chair" }), [item("a1", 1, { agenda_status: "under_discussion" })], [open], []);
    expect(stage.seats.map((s) => s.status)).toEqual(["voted", "waiting", "waiting"]);
    expect(JSON.stringify(stage)).not.toMatch(/approve|reject|abstain/);
  });

  it("leaves seats untouched when the server did not return participation to this viewer", () => {
    const open: VotingRound = { id: "r1", agenda_item_id: "a1", status: "open", participation: [] };
    const stage = deriveMeetingStage(sessionOf(), [item("a1", 1)], [open], []);
    expect(stage.seats.every((s) => s.status === "present")).toBe(true);
    expect(stage.phase).toEqual({ kind: "voting", item: expect.objectContaining({ id: "a1" }), cast: null, eligible: null });
  });
});

describe("deriveMeetingStage phase", () => {
  it("stays on attendance until the roster is locked", () => {
    const stage = deriveMeetingStage(sessionOf({ locked: false, attendance: [seat("u1", "أ"), seat("u2", "ب", "pending", "unclaimed")] }), [item("a1", 1, { agenda_status: "under_discussion" })], [], []);
    expect(stage.phase).toEqual({ kind: "attendance", present: 1, total: 2 });
  });

  it("waits on the first unfinished item in agenda order", () => {
    const agenda = [item("a2", 2), item("a1", 1, { agenda_status: "discussed" })];
    expect(deriveMeetingStage(sessionOf(), agenda, [], []).phase).toEqual({ kind: "idle", item: expect.objectContaining({ id: "a2" }) });
  });

  it("shows the item under discussion", () => {
    const agenda = [item("a1", 1, { agenda_status: "under_discussion" }), item("a2", 2)];
    expect(deriveMeetingStage(sessionOf(), agenda, [], []).phase).toEqual({ kind: "discussion", item: expect.objectContaining({ id: "a1" }) });
  });

  it("reports the vote count only as returned for an open round", () => {
    const open: VotingRound = { id: "r1", agenda_item_id: "a1", status: "open", eligible_voter_count: 9, votes_cast_count: 6 };
    const phase = deriveMeetingStage(sessionOf({ mode: "chair" }), [item("a1", 1)], [open], []).phase;
    expect(phase).toMatchObject({ kind: "voting", cast: 6, eligible: 9 });
  });

  it("shows the latest closed round of the current item until its decision exists", () => {
    const first: VotingRound = { id: "r1", agenda_item_id: "a1", status: "closed", result: "tied", approve_count: 4, reject_count: 4, abstain_count: 1 };
    const second: VotingRound = { id: "r2", agenda_item_id: "a1", status: "closed", result: "approved", approve_count: 7, reject_count: 1, abstain_count: 1 };
    const agenda = [item("a1", 1, { agenda_status: "discussed", requires_voting: true }), item("a2", 2)];
    const pending = deriveMeetingStage(sessionOf(), agenda, [first, second], []).phase;
    expect(pending).toMatchObject({ kind: "result", round: { id: "r2" } });
    const decided = deriveMeetingStage(sessionOf(), agenda, [first, second], [{ id: "d1", decision_no: "DEC-1", agenda_item_id: "a1", decision_status: "draft", decision_text: "نص" }]).phase;
    expect(decided).toEqual({ kind: "idle", item: expect.objectContaining({ id: "a2" }) });
  });

  it("distinguishes an empty agenda from a finished one", () => {
    expect(deriveMeetingStage(sessionOf(), [], [], []).phase).toEqual({ kind: "idle", item: null });
    expect(deriveMeetingStage(sessionOf(), [item("a1", 1, { agenda_status: "discussed" })], [], []).phase).toEqual({ kind: "finished" });
  });
});
