import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AgendaDiscussionItem, LiveMeetingSession, VotingRound } from "../../model/live-meeting";
import { AgendaWorkspace } from "./agenda-workspace";
import { MemberVoteCard } from "./member-vote-card";
import { ReasonDialog } from "./reason-dialog";

function sessionOf(mode: "chair" | "rapporteur" | "member", locked = true): LiveMeetingSession {
  return {
    viewer: { user_id: "viewer", full_name_ar: "مشارك", mode, is_roster_member: true,
      can_manage_session: mode === "chair", can_operate_attendance: mode !== "member", can_create_checkin: false,
      can_verify_attendance: false, can_lock_attendance: false, can_record_proceedings: mode === "rapporteur",
      can_manage_voting: mode === "chair", can_complete_session: mode === "chair", can_self_check_in: true, can_vote: true },
    meeting: { id: "meeting", title_ar: "اجتماع الاختبار", status: "in_progress", updated_at: "2026-10-09", attendance_locked: locked },
    attendance: [], my_attendance: null,
    quorum: { eligible_members: 3, present_members: 3, actual_percentage: 100, required_percentage: 60, quorum_status: "met" },
    open_voting_rounds: [],
  };
}

const first: AgendaDiscussionItem = { id: "a1", agenda_order: 1, agenda_status: "under_discussion", requires_voting: true, topic: { id: "t1", title_ar: "خطة البرنامج" } };
const second: AgendaDiscussionItem = { id: "a2", agenda_order: 2, agenda_status: "pending", requires_voting: false, topic: { id: "t2", title_ar: "تشكيل اللجنة" } };

function setup(mode: "chair" | "rapporteur" | "member", overrides: Partial<Parameters<typeof AgendaWorkspace>[0]> = {}) {
  const handlers = {
    onUpdateDiscussion: vi.fn(async () => true), onRequestPostpone: vi.fn(), onOpenRound: vi.fn(), onCloseRound: vi.fn(), onCreateDecision: vi.fn(), onComplete: vi.fn(),
  };
  const props = { session: sessionOf(mode), agenda: [second, first], attachments: [], topicHistory: {}, rounds: [], decisions: [], busy: false, presenting: false, ...handlers, ...overrides };
  return { handlers, props, view: render(<AgendaWorkspace {...props} />) };
}

describe("AgendaWorkspace", () => {
  it("shows the item in progress with its guidance, and no guidance block for a topic without any", () => {
    const { props, view } = setup("member", { agenda: [{ ...first, discussion_instructions: "ابدأ بعرض مبررات البرنامج" }, second] });
    expect(screen.getByRole("heading", { name: "خطة البرنامج" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "تعليمات المناقشة" })).toHaveTextContent("ابدأ بعرض مبررات البرنامج");
    view.rerender(<AgendaWorkspace {...props} agenda={[first, second]} />);
    expect(screen.queryByRole("region", { name: "تعليمات المناقشة" })).not.toBeInTheDocument();
    expect(screen.getByText("لا تعليمات ولا مرفقات ولا قرارات سابقة مسجلة لهذا الموضوع.")).toBeInTheDocument();
  });

  it("lists the agenda in order and lets the viewer open another item", async () => {
    setup("member");
    const items = within(screen.getByRole("navigation", { name: "جدول الأعمال" })).getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual(["1خطة البرنامجقيد المناقشة", "2تشكيل اللجنةلم يبدأ"]);
    expect(items[0]).toHaveAttribute("aria-current", "true");
    await userEvent.click(items[1]);
    expect(screen.getByRole("heading", { name: "تشكيل اللجنة" })).toBeInTheDocument();
  });

  it("gives the chair the next step of the item on screen and asks for a reason before postponing", async () => {
    const { handlers } = setup("chair");
    const dock = screen.getByRole("region", { name: "شريط تحكم رئيس المجلس" });
    await userEvent.click(within(dock).getByRole("button", { name: "إنهاء المناقشة والانتقال للتصويت" }));
    expect(handlers.onUpdateDiscussion).toHaveBeenCalledWith(first, "discussed", null);
    await userEvent.click(within(dock).getByRole("button", { name: "تأجيل البند" }));
    expect(handlers.onRequestPostpone).toHaveBeenCalledWith(first);
    expect(handlers.onUpdateDiscussion).toHaveBeenCalledTimes(1);
  });

  it("starts the discussion of the item the chair opened, not of another one", async () => {
    const { handlers } = setup("chair", { agenda: [{ ...first, agenda_status: "discussed", requires_voting: false, discussion_notes: "ملخص كافٍ" }, second] });
    await userEvent.click(screen.getByRole("button", { name: "بدء المناقشة" }));
    expect(handlers.onUpdateDiscussion).toHaveBeenCalledWith(second, "under_discussion", null);
  });

  it("disables a step the server would reject and writes the reason beside it", () => {
    const open: VotingRound = { id: "r1", agenda_item_id: "a1", status: "open", eligible_voter_count: 3, votes_cast_count: 1 };
    const { handlers } = setup("chair", { agenda: [{ ...first, agenda_status: "discussed" }], rounds: [open] });
    expect(screen.getByRole("button", { name: "إغلاق التصويت واحتساب النتيجة" })).toBeDisabled();
    expect(screen.getByText("بانتظار تصويت 2 من الأعضاء المؤهلين قبل الإغلاق.")).toBeInTheDocument();
    expect(screen.getByLabelText("متابعة المشاركة في التصويت")).toHaveTextContent("1 من 3 صوّتوا");
    expect(handlers.onCloseRound).not.toHaveBeenCalled();
  });

  it("keeps ending the session disabled and lists what is left", () => {
    setup("chair");
    expect(screen.getByRole("button", { name: "إنهاء الجلسة والانتقال إلى إعداد المحضر" })).toBeDisabled();
    const left = screen.getByRole("region", { name: "قبل إنهاء الجلسة" });
    expect(within(left).getByText("البند 1 «خطة البرنامج»: إنهاء المناقشة أو تأجيل البند بسبب موثق.")).toBeInTheDocument();
  });

  it("opens the decision composer from an approved result and ends the session when nothing is left", async () => {
    const closed: VotingRound = { id: "r1", agenda_item_id: "a1", status: "closed", result: "approved", approve_count: 3, reject_count: 0, abstain_count: 0, closed_at: "2026-10-09T09:00:00Z" };
    const done = { ...first, agenda_status: "discussed", discussion_notes: "الملخص النهائي", updated_at: "2026-10-09T10:00:00Z" };
    const { handlers, props, view } = setup("chair", { agenda: [done], rounds: [closed] });
    expect(screen.getByLabelText("النتيجة النهائية للتصويت")).toHaveTextContent("100%");
    await userEvent.click(screen.getByRole("button", { name: "صياغة القرار المعتمد" }));
    expect(handlers.onCreateDecision).toHaveBeenCalledWith(closed, done);
    view.rerender(<AgendaWorkspace {...props} decisions={[{ id: "d1", decision_no: "ق-1", agenda_item_id: "a1", decision_status: "ready", decision_text: "نص القرار" }]} />);
    await userEvent.click(screen.getByRole("button", { name: "إنهاء الجلسة والانتقال إلى إعداد المحضر" }));
    expect(handlers.onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows no controls to a member, a rapporteur or the hall screen", () => {
    const member = setup("member");
    expect(screen.queryByRole("region", { name: "شريط تحكم رئيس المجلس" })).not.toBeInTheDocument();
    member.view.unmount();
    const rapporteur = setup("rapporteur");
    expect(screen.queryByRole("region", { name: "شريط تحكم رئيس المجلس" })).not.toBeInTheDocument();
    rapporteur.view.unmount();
    setup("chair", { presenting: true });
    expect(screen.queryByRole("region", { name: "شريط تحكم رئيس المجلس" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "قبل إنهاء الجلسة" })).not.toBeInTheDocument();
  });

  it("does not show a member who voted when the server returned no participation", () => {
    setup("member", { agenda: [{ ...first, agenda_status: "discussed" }], rounds: [{ id: "r1", agenda_item_id: "a1", status: "open", participation: [] }] });
    expect(screen.queryByLabelText("متابعة المشاركة في التصويت")).not.toBeInTheDocument();
    expect(screen.getByText(/التصويت مفتوح الآن/)).toBeInTheDocument();
  });

  it("shows a member who voted, without a direction, once the server returns participation", () => {
    const open: VotingRound = { id: "r1", agenda_item_id: "a1", status: "open", eligible_voter_count: 2, participation: [{ user_id: "u1", full_name_ar: "د. هدى", has_voted: true }, { user_id: "u2", full_name_ar: "د. خالد", has_voted: false }] };
    setup("member", { agenda: [{ ...first, agenda_status: "discussed" }], rounds: [open] });
    const panel = screen.getByLabelText("متابعة المشاركة في التصويت");
    expect(panel).toHaveTextContent("1 من 2 صوّتوا");
    expect(panel).not.toHaveTextContent(/موافق|ممتنع/);
  });

  it("lets only the rapporteur write the summary and keeps unsaved text when the item on screen changes", async () => {
    const { handlers } = setup("rapporteur");
    const field = screen.getByLabelText("ملاحظات المناقشة الأولية");
    await userEvent.type(field, "نقاش أولي");
    const items = within(screen.getByRole("navigation", { name: "جدول الأعمال" })).getAllByRole("button");
    await userEvent.click(items[1]);
    await userEvent.click(items[0]);
    expect(screen.getByLabelText("ملاحظات المناقشة الأولية")).toHaveValue("نقاش أولي");
    await userEvent.click(screen.getByRole("button", { name: "حفظ ملاحظات المقرر" }));
    expect(handlers.onUpdateDiscussion).toHaveBeenCalledWith(first, "under_discussion", "نقاش أولي");
  });

  it("shows the chair the summary read-only and hides a preliminary one from members", () => {
    const noted = { ...first, discussion_notes: "ملاحظات أولية للمقرر" };
    const chair = setup("chair", { agenda: [noted] });
    expect(screen.getByText("ملاحظات أولية للمقرر")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    chair.view.unmount();
    setup("member", { agenda: [noted] });
    expect(screen.queryByText("ملاحظات أولية للمقرر")).not.toBeInTheDocument();
  });

  it("states an empty agenda", () => {
    setup("chair", { agenda: [] });
    expect(screen.getByRole("heading", { name: "لا توجد بنود في جدول الأعمال" })).toBeInTheDocument();
  });
});

describe("MemberVoteCard", () => {
  it("casts the chosen vote once with the trimmed note", async () => {
    const onCast = vi.fn();
    render(<MemberVoteCard vote={{ voting_round_id: "r1", title_ar: "خطة البرنامج", has_voted: false }} busy={false} onCast={onCast} />);
    expect(screen.getByText("تصويت مفتوح لك الآن")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("ملاحظة مع التصويت"), "  مع تحفظ  ");
    await userEvent.click(screen.getByRole("button", { name: "موافق" }));
    expect(onCast).toHaveBeenCalledWith("r1", "approve", "مع تحفظ");
  });

  it("blocks every choice while a vote is being recorded", () => {
    render(<MemberVoteCard vote={{ voting_round_id: "r1", title_ar: "خطة البرنامج", has_voted: false }} busy onCast={vi.fn()} />);
    for (const name of ["موافق", "غير موافق", "ممتنع"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  });
});

describe("ReasonDialog", () => {
  it("requires five characters, keeps the text on failure and closes on success", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { rerender } = render(<ReasonDialog title="تأجيل البند" description="يُسجَّل السبب في المحضر." label="سبب تأجيل البند" confirmLabel="تأجيل" busy={false} onClose={onClose} onSubmit={onSubmit} />);
    const confirm = screen.getByRole("button", { name: "تأجيل" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("سبب تأجيل البند"), "استكمال الدراسة");
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith("استكمال الدراسة");
    expect(onClose).not.toHaveBeenCalled();
    rerender(<ReasonDialog title="تأجيل البند" description="يُسجَّل السبب في المحضر." label="سبب تأجيل البند" confirmLabel="تأجيل" busy={false} error="تغيّر البند، حدّث الصفحة." onClose={onClose} onSubmit={onSubmit} />);
    expect(screen.getByRole("alert")).toHaveTextContent("تغيّر البند، حدّث الصفحة.");
    expect(screen.getByLabelText("سبب تأجيل البند")).toHaveValue("استكمال الدراسة");
    await userEvent.click(screen.getByRole("button", { name: "تأجيل" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
