import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgendaDiscussionItem, Attendance, LiveMeetingSession, VotingRound } from "../../model/live-meeting";
import { MAX_ORBIT_SEATS } from "./council-table";
import { RoomStage } from "./room-stage";

function member(index: number, status = "present", verification = "verified"): Attendance {
  return { id: `att-${index}`, user_id: `u${index}`, full_name_ar: `عضو ${index}`, status, verification_status: verification, updated_at: "2026-10-10T08:00:00Z" };
}

function sessionOf(mode: "chair" | "rapporteur" | "member", attendance: Attendance[], locked = true): LiveMeetingSession {
  return {
    viewer: {
      user_id: "u1", full_name_ar: "عضو 1", mode, is_roster_member: true,
      can_manage_session: mode === "chair", can_operate_attendance: mode !== "member", can_create_checkin: false,
      can_verify_attendance: false, can_lock_attendance: false, can_record_proceedings: mode === "rapporteur",
      can_manage_voting: mode === "chair", can_complete_session: mode === "chair", can_self_check_in: true, can_vote: true,
    },
    meeting: { id: "m1", title_ar: "اجتماع مجلس الكلية الثالث", status: "in_progress", updated_at: "2026-10-10T08:00:00Z", attendance_locked: locked },
    attendance,
    my_attendance: null,
    quorum: { eligible_members: 3, present_members: 3, actual_percentage: 100, required_percentage: 60, quorum_status: "met" },
    open_voting_rounds: [],
  };
}

const agenda: AgendaDiscussionItem[] = [
  { id: "a1", agenda_order: 1, agenda_status: "under_discussion", workflow_step_name_ar: "توصية مجلس الكلية", topic: { id: "t1", title_ar: "اعتماد الخطة الدراسية" } },
  { id: "a2", agenda_order: 2, agenda_status: "pending", topic: { id: "t2", title_ar: "تشكيل لجنة المناقشة" } },
];
const three = [member(1), member(2), member(3)];

describe("RoomStage", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps the meeting title as a heading, the role label and the quorum", () => {
    render(<RoomStage session={sessionOf("chair", three)} agenda={agenda} rounds={[]} decisions={[]} />);
    expect(screen.getByRole("heading", { name: "اجتماع مجلس الكلية الثالث" })).toBeInTheDocument();
    expect(screen.getByText("لوحة رئيس المجلس")).toBeInTheDocument();
    expect(screen.getByText(/مكتمل · 3 من 3 \(100%\)/)).toBeInTheDocument();
  });

  it.each([["rapporteur", "لوحة مقرر المجلس"], ["member", "بوابة عضو المجلس"]] as const)("labels the %s view", (mode, label) => {
    render(<RoomStage session={sessionOf(mode, three)} agenda={agenda} rounds={[]} decisions={[]} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("seats every member and shows the item under discussion", () => {
    render(<RoomStage session={sessionOf("member", three)} agenda={agenda} rounds={[]} decisions={[]} />);
    const seats = within(screen.getByRole("list", { name: "أعضاء المجلس" })).getAllByRole("listitem");
    expect(seats).toHaveLength(3);
    expect(within(seats[0]).getByText("أنت")).toBeInTheDocument();
    expect(screen.getAllByText("قيد المناقشة").length).toBeGreaterThan(0);
    expect(screen.getByText("البند 1 من 2 · توصية مجلس الكلية")).toBeInTheDocument();
  });

  it("shows participation to a monitor and never a direction", () => {
    const open: VotingRound = {
      id: "r1", agenda_item_id: "a1", status: "open", eligible_voter_count: 3, votes_cast_count: 1,
      participation: [{ user_id: "u1", full_name_ar: "عضو 1", has_voted: true }, { user_id: "u2", full_name_ar: "عضو 2", has_voted: false }, { user_id: "u3", full_name_ar: "عضو 3", has_voted: false }],
    };
    render(<RoomStage session={sessionOf("chair", three)} agenda={agenda} rounds={[open]} decisions={[]} />);
    expect(screen.getByRole("img", { name: "صوّت 1 من 3" })).toBeInTheDocument();
    expect(screen.getByText("صوّت")).toBeInTheDocument();
    expect(screen.getAllByText("لم يصوّت بعد")).toHaveLength(2);
    expect(screen.queryByText(/غير موافق|ممتنع/)).not.toBeInTheDocument();
  });

  it("gives a member no count and no per-seat state the server did not return", () => {
    const open: VotingRound = { id: "r1", agenda_item_id: "a1", status: "open", participation: [] };
    render(<RoomStage session={sessionOf("member", three)} agenda={agenda} rounds={[open]} decisions={[]} />);
    expect(screen.getAllByText("التصويت مفتوح").length).toBeGreaterThan(0);
    expect(screen.queryByRole("img", { name: /صوّت \d+ من \d+/ })).not.toBeInTheDocument();
    expect(screen.queryByText("لم يصوّت بعد")).not.toBeInTheDocument();
  });

  it("announces the frozen result with its counts after the round closes", () => {
    const closed: VotingRound = { id: "r1", agenda_item_id: "a1", status: "closed", result: "approved", approve_count: 2, reject_count: 1, abstain_count: 0 };
    render(<RoomStage session={sessionOf("member", three)} agenda={agenda} rounds={[closed]} decisions={[]} />);
    expect(screen.getByText("موافقة")).toBeInTheDocument();
    expect(screen.getByText("موافق 2")).toBeInTheDocument();
    expect(screen.getByText("غير موافق 1")).toBeInTheDocument();
  });

  it("shows attendance progress before the roster is locked and an explicit empty roster", () => {
    const { rerender } = render(<RoomStage session={sessionOf("chair", [member(1), member(2, "pending", "unclaimed")], false)} agenda={agenda} rounds={[]} decisions={[]} />);
    expect(screen.getByText("تثبيت الحضور")).toBeInTheDocument();
    expect(screen.getByText("لم يثبت حضوره")).toBeInTheDocument();
    rerender(<RoomStage session={sessionOf("chair", [], false)} agenda={[]} rounds={[]} decisions={[]} />);
    expect(screen.getByText("لم يُسجَّل أعضاء في سجل حضور هذا الاجتماع بعد.")).toBeInTheDocument();
  });

  it("lists a large council as a grid instead of an overlapping orbit", () => {
    const many = Array.from({ length: MAX_ORBIT_SEATS + 1 }, (_, index) => member(index + 1));
    render(<RoomStage session={sessionOf("member", many)} agenda={agenda} rounds={[]} decisions={[]} />);
    const seats = within(screen.getByRole("list", { name: "أعضاء المجلس" })).getAllByRole("listitem");
    expect(seats).toHaveLength(MAX_ORBIT_SEATS + 1);
    expect(seats[0].style.left).toBe("");
  });

  it("switches the scene to night mode and remembers the choice", async () => {
    const view = render(<RoomStage session={sessionOf("member", three)} agenda={agenda} rounds={[]} decisions={[]} />);
    const scene = screen.getByRole("region", { name: "مشهد الاجتماع" });
    expect(scene).not.toHaveAttribute("data-theme");
    await userEvent.click(screen.getByRole("button", { name: "الوضع الليلي" }));
    expect(scene).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "الوضع الفاتح" })).toHaveAttribute("aria-pressed", "true");
    view.unmount();
    render(<RoomStage session={sessionOf("member", three)} agenda={agenda} rounds={[]} decisions={[]} />);
    expect(screen.getByRole("region", { name: "مشهد الاجتماع" })).toHaveAttribute("data-theme", "dark");
  });
});
