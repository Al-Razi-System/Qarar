import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AgendaDiscussionItem, Decision, LiveMeetingSession, MeetingBroadcast, VotingRound } from "../../model/live-meeting";
import { DecisionComposerDialog } from "../decision-composer-dialog";
import { AgendaWorkspace } from "./agenda-workspace";
import { MemberVoteCard } from "./member-vote-card";
import { ReasonDialog } from "./reason-dialog";
import { ReferralDialog } from "./referral-dialog";

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
    onUpdateDiscussion: vi.fn(async () => true), onRequestPostpone: vi.fn(), onOpenRound: vi.fn(), onCloseRound: vi.fn(), onCreateDecision: vi.fn(), onEditDecision: vi.fn(), onComplete: vi.fn(),
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

  it("lists the agenda in order and lets whoever runs the meeting open another item", async () => {
    setup("chair");
    const items = within(screen.getByRole("navigation", { name: "جدول الأعمال" })).getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual(["1 · خطة البرنامجقيد المناقشة", "2 · تشكيل اللجنةلم يبدأ"]);
    expect(items[0]).toHaveAttribute("aria-current", "true");
    await userEvent.click(items[1]);
    expect(screen.getByRole("heading", { name: "تشكيل اللجنة" })).toBeInTheDocument();
  });

  it("keeps a member on the item the council is on, with the ballot under its title", () => {
    setup("member", { ballot: <p>ورقة التصويت</p> });
    const timeline = screen.getByRole("navigation", { name: "جدول الأعمال" });
    expect(within(timeline).queryAllByRole("button")).toHaveLength(0);
    expect(within(timeline).getByText("1 · خطة البرنامج").closest("[aria-current]")).toHaveAttribute("aria-current", "step");
    const topic = screen.getByRole("region", { name: "الموضوع المعروض" });
    expect(within(topic).getByRole("heading", { name: "خطة البرنامج" })).toBeInTheDocument();
    expect(within(topic).getByText("ورقة التصويت")).toBeInTheDocument();
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
    expect(handlers.onCloseRound).not.toHaveBeenCalled();
  });

  it("keeps ending the session disabled and lists what is left on request", async () => {
    setup("chair");
    expect(screen.getByRole("button", { name: "إنهاء الجلسة والانتقال إلى إعداد المحضر" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "قبل إنهاء الجلسة" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /ما بقي قبل الإنهاء/ }));
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

  describe("a saved decision", () => {
    const closed: VotingRound = { id: "r1", agenda_item_id: "a1", status: "closed", result: "approved", approve_count: 3, reject_count: 0, abstain_count: 0, closed_at: "2026-10-09T09:00:00Z" };
    const done = { ...first, agenda_status: "discussed", discussion_notes: "الملخص النهائي", updated_at: "2026-10-09T10:00:00Z" };
    const saved: Decision = { id: "d1", decision_no: "ق-1", agenda_item_id: "a1", decision_status: "ready_for_approval", decision_text: "اعتماد الخطة كما وردت.", updated_at: "2026-10-09T10:05:00Z", can_edit_text: true };

    it("is shown to everyone with its text", () => {
      setup("member", { agenda: [done], rounds: [closed], decisions: [{ ...saved, can_edit_text: false }] });
      const region = screen.getByRole("region", { name: "القرار" });
      expect(region).toHaveTextContent("القرار ق-1");
      expect(region).toHaveTextContent("اعتماد الخطة كما وردت.");
      expect(within(region).queryByRole("button", { name: "تعديل القرار" })).not.toBeInTheDocument();
    });

    it("can be edited from the topic card by the rapporteur when the server allows it", async () => {
      const { handlers } = setup("rapporteur", { agenda: [done], rounds: [closed], decisions: [saved] });
      await userEvent.click(within(screen.getByRole("region", { name: "القرار" })).getByRole("button", { name: "تعديل القرار" }));
      expect(handlers.onEditDecision).toHaveBeenCalledWith(saved, done, closed);
    });

    it("can be edited from the chair's dock, keeping the note of what happened", async () => {
      const { handlers } = setup("chair", { agenda: [done], rounds: [closed], decisions: [saved] });
      const dock = screen.getByRole("region", { name: "شريط تحكم رئيس المجلس" });
      expect(dock).toHaveTextContent("ق-1 · تم إنشاء القرار.");
      await userEvent.click(within(dock).getByRole("button", { name: "تعديل القرار" }));
      expect(handlers.onEditDecision).toHaveBeenCalledWith(saved, done, closed);
    });

    it("offers no edit on the hall screen", () => {
      setup("chair", { agenda: [done], rounds: [closed], decisions: [saved], presenting: true });
      expect(screen.getByRole("region", { name: "القرار" })).toHaveTextContent("اعتماد الخطة كما وردت.");
      expect(screen.queryByRole("button", { name: "تعديل القرار" })).not.toBeInTheDocument();
    });
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

  it("leaves who voted to the seats around the table, without repeating it in the topic", () => {
    const open: VotingRound = { id: "r1", agenda_item_id: "a1", status: "open", eligible_voter_count: 2, participation: [{ user_id: "u1", full_name_ar: "د. هدى", has_voted: true }, { user_id: "u2", full_name_ar: "د. خالد", has_voted: false }] };
    setup("member", { agenda: [{ ...first, agenda_status: "discussed" }], rounds: [open] });
    expect(screen.queryByLabelText("متابعة المشاركة في التصويت")).not.toBeInTheDocument();
    expect(screen.getByText(/التصويت مفتوح الآن/)).toBeInTheDocument();
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

function broadcastOf(overrides: Partial<MeetingBroadcast> = {}): MeetingBroadcast {
  return {
    meeting_id: "meeting", active: true, controller_role: "chair", agenda_item_id: null, panel: "instructions", revision: 4,
    viewer_controls: false, can_hand_over: false, can_take_back: false, can_return: false, ...overrides,
  };
}
const withMaterials: AgendaDiscussionItem[] = [
  { ...first, discussion_instructions: "ابدأ بعرض مبررات البرنامج" },
  { ...second, discussion_instructions: "عرض أسماء اللجنة" },
];
const files = [
  { id: "f1", topic_id: "t2", file_name: "قائمة اللجنة.pdf", file_url: "https://example.test/f1", mime_type: "application/pdf" },
];

describe("AgendaWorkspace broadcast", () => {
  it("shows a member the item and panel the chair broadcasts, without letting them choose", () => {
    setup("member", { agenda: withMaterials, attachments: files, broadcast: broadcastOf({ agenda_item_id: "a2", panel: "attachments" }), onBroadcast: vi.fn(), onHandOver: vi.fn() });
    expect(screen.getByRole("status")).toHaveTextContent("تتابع شاشة رئيس المجلس.");
    const topic = screen.getByRole("region", { name: "الموضوع المعروض" });
    expect(within(topic).getByRole("heading", { name: "تشكيل اللجنة" })).toBeInTheDocument();
    expect(within(topic).getByText("قائمة اللجنة.pdf")).toBeInTheDocument();
    expect(within(topic).getByRole("radio", { name: "التعليمات" })).toBeDisabled();
    expect(within(topic).getByText("يعرض رئيس المجلس هذا القسم على كل الشاشات.")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "جدول الأعمال" })).queryAllByRole("button")).toHaveLength(0);
  });

  it("broadcasts the item the controller opens", async () => {
    const onBroadcast = vi.fn();
    setup("chair", { agenda: withMaterials, attachments: files, broadcast: broadcastOf({ viewer_controls: true, can_hand_over: true }), onBroadcast, onHandOver: vi.fn() });
    await userEvent.click(within(screen.getByRole("navigation", { name: "جدول الأعمال" })).getAllByRole("button")[1]);
    expect(onBroadcast).toHaveBeenCalledWith("a2", "instructions");
  });

  it("broadcasts a panel chosen by the controller", async () => {
    const onBroadcast = vi.fn();
    setup("chair", { agenda: withMaterials, attachments: files, broadcast: broadcastOf({ viewer_controls: true, agenda_item_id: "a2" }), onBroadcast, onHandOver: vi.fn() });
    await userEvent.click(screen.getByRole("radio", { name: "المرفقات (1)" }));
    expect(onBroadcast).toHaveBeenCalledWith("a2", "attachments");
  });

  it("offers each handover only to whoever may make it", async () => {
    const onHandOver = vi.fn();
    const { props, view } = setup("chair", { broadcast: broadcastOf({ viewer_controls: true, can_hand_over: true }), onBroadcast: vi.fn(), onHandOver });
    await userEvent.click(screen.getByRole("button", { name: "تسليم التحكم للمقرر" }));
    expect(onHandOver).toHaveBeenCalledWith("rapporteur");
    view.rerender(<AgendaWorkspace {...props} broadcast={broadcastOf({ controller_role: "rapporteur", can_take_back: true })} />);
    expect(screen.getByRole("status")).toHaveTextContent("تتابع شاشة مقرر المجلس.");
    await userEvent.click(screen.getByRole("button", { name: "استرجاع التحكم" }));
    expect(onHandOver).toHaveBeenLastCalledWith("chair");
    view.rerender(<AgendaWorkspace {...props} session={sessionOf("member")} broadcast={broadcastOf()} />);
    expect(screen.queryByRole("button", { name: /التحكم/ })).not.toBeInTheDocument();
  });

  it("moves the broadcast with the council once the item on screen is finished", () => {
    const onBroadcast = vi.fn();
    const decided: AgendaDiscussionItem = { ...first, agenda_status: "discussed", requires_voting: false, discussion_notes: "ملخص كافٍ" };
    const { props, view } = setup("chair", { agenda: [first, second], broadcast: broadcastOf({ viewer_controls: true, agenda_item_id: "a1" }), onBroadcast, onHandOver: vi.fn() });
    expect(onBroadcast).not.toHaveBeenCalled();
    view.rerender(<AgendaWorkspace {...props} agenda={[decided, second]} />);
    expect(onBroadcast).toHaveBeenCalledWith("a2", "instructions");
  });

  it("shows why the broadcast could not be changed", () => {
    setup("chair", { broadcast: broadcastOf({ viewer_controls: true, can_hand_over: true }), broadcastError: "تغيّر البث من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.", onBroadcast: vi.fn(), onHandOver: vi.fn() });
    expect(screen.getByRole("alert")).toHaveTextContent("تغيّر البث من شاشة أخرى");
  });
});

describe("AgendaWorkspace documents", () => {
  const pdf = { id: "f2", topic_id: "t2", agenda_item_id: "a2", file_name: "قائمة اللجنة.pdf", file_url: "https://example.test/api/admin/topics/upload?topicId=t2&path=topics/t2/list.pdf", mime_type: "application/pdf", download_allowed: true, download_revision: 2 };

  it("shows a member the file the chair broadcasts, on its page, with nothing to open or turn", () => {
    setup("member", { agenda: withMaterials, attachments: [pdf], broadcast: broadcastOf({ agenda_item_id: "a2", panel: "attachments", attachment_id: "f2", page: 4 }), onBroadcast: vi.fn(), onHandOver: vi.fn() });
    const viewer = screen.getByRole("region", { name: "عرض قائمة اللجنة.pdf" });
    expect(within(viewer).getByText(/يعرضه رئيس المجلس على كل الشاشات/)).toBeInTheDocument();
    const frame = viewer.querySelector("iframe");
    expect(frame).toHaveAttribute("src", expect.stringContaining("#page=4"));
    expect(frame).toHaveAttribute("src", expect.stringContaining("meetingId=meeting"));
    expect(within(viewer).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "عرض قائمة اللجنة.pdf" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "عرض قائمة اللجنة.pdf" })).not.toBeInTheDocument();
  });

  it("lets the controller open, turn and close a file for every screen", async () => {
    const onBroadcastDocument = vi.fn();
    const { props, view } = setup("chair", { agenda: withMaterials, attachments: [pdf], broadcast: broadcastOf({ viewer_controls: true, can_hand_over: true, agenda_item_id: "a2", panel: "attachments" }), onBroadcast: vi.fn(), onHandOver: vi.fn(), onBroadcastDocument });
    await userEvent.click(screen.getByRole("button", { name: "عرض قائمة اللجنة.pdf" }));
    expect(onBroadcastDocument).toHaveBeenLastCalledWith("f2", 1, "a2");
    view.rerender(<AgendaWorkspace {...props} broadcast={broadcastOf({ viewer_controls: true, can_hand_over: true, agenda_item_id: "a2", panel: "attachments", attachment_id: "f2", page: 1 })} />);
    await userEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
    expect(onBroadcastDocument).toHaveBeenLastCalledWith("f2", 2, "a2");
    await userEvent.click(screen.getByRole("button", { name: "إغلاق الملف" }));
    expect(onBroadcastDocument).toHaveBeenLastCalledWith(null, null, "a2");
  });

  it("hides the download of a withheld item and lets only the chair change it", async () => {
    const onChange = vi.fn();
    const withheld = { ...pdf, download_allowed: false };
    const downloads = { pendingItemId: null, errorItemId: null, error: null, onChange };
    const { props, view } = setup("chair", { agenda: withMaterials, attachments: [withheld], broadcast: broadcastOf({ viewer_controls: true, can_hand_over: true, agenda_item_id: "a2", panel: "attachments" }), onBroadcast: vi.fn(), onHandOver: vi.fn(), downloads });
    expect(screen.queryByRole("link", { name: "تنزيل قائمة اللجنة.pdf" })).not.toBeInTheDocument();
    expect(screen.getByText("التنزيل غير متاح لهذا البند؛ يُعرض داخل الغرفة.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "السماح للمشاركين بتنزيل مرفقات هذا البند" }));
    expect(onChange).toHaveBeenCalledWith("a2", true, 2);
    view.rerender(<AgendaWorkspace {...props} downloads={{ ...downloads, pendingItemId: "a2" }} />);
    expect(screen.getByRole("checkbox", { name: "السماح للمشاركين بتنزيل مرفقات هذا البند" })).toBeDisabled();
    expect(screen.getByText("جارٍ حفظ إذن التنزيل…")).toBeInTheDocument();
    view.rerender(<AgendaWorkspace {...props} downloads={{ ...downloads, errorItemId: "a2", error: "تغيّر إذن التنزيل من شاشة أخرى" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("تغيّر إذن التنزيل من شاشة أخرى");
    view.rerender(<AgendaWorkspace {...props} session={sessionOf("member")} broadcast={broadcastOf({ agenda_item_id: "a2", panel: "attachments" })} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("AgendaWorkspace item timer", () => {
  const timers = (overrides = {}) => ({
    data: { server_now: "2026-10-16T08:07:32Z", timers: [{ agenda_item_id: "a1", planned_minutes: 5, discussion_started_at: "2026-10-16T08:00:00Z", discussion_ended_at: null, revision: 3, ...overrides }] },
    clockOffsetMs: 0,
  });
  const planned = (onChange = vi.fn(), extra = {}) => ({ pendingItemId: null, errorItemId: null, error: null, onChange, ...extra });

  it("shows every screen how long the item has been discussed, and the overrun", () => {
    vi.useFakeTimers({ now: new Date("2026-10-16T08:07:32Z"), shouldAdvanceTime: true });
    try {
      setup("member", { timers: timers(), broadcast: broadcastOf(), onBroadcast: vi.fn(), onHandOver: vi.fn() });
      const timer = screen.getByRole("timer");
      expect(timer).toHaveAccessibleName("تجاوزت المناقشة الوقت المحدد بـ 02:32");
      expect(timer).toHaveTextContent("07:32");
      expect(timer).toHaveTextContent("من 5 دقيقة");
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets only the chair plan the item's duration, with its pending and failure states", async () => {
    const onChange = vi.fn();
    const { props, view } = setup("chair", { timers: timers(), plannedMinutes: planned(onChange), broadcast: broadcastOf({ viewer_controls: true, can_hand_over: true }), onBroadcast: vi.fn(), onHandOver: vi.fn() });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "المدة المقررة" }), "15");
    expect(onChange).toHaveBeenCalledWith("a1", 15, 3);
    view.rerender(<AgendaWorkspace {...props} plannedMinutes={planned(onChange, { pendingItemId: "a1" })} />);
    expect(screen.getByRole("combobox", { name: "المدة المقررة" })).toBeDisabled();
    expect(screen.getByText("جارٍ حفظ المدة…")).toBeInTheDocument();
    view.rerender(<AgendaWorkspace {...props} plannedMinutes={planned(onChange, { errorItemId: "a1", error: "تغيّرت مدة البند من شاشة أخرى" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("تغيّرت مدة البند من شاشة أخرى");
    view.rerender(<AgendaWorkspace {...props} broadcast={broadcastOf({ controller_role: "rapporteur", can_take_back: false })} session={sessionOf("rapporteur")} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows the final duration of a finished discussion without counting on", () => {
    setup("member", { timers: timers({ discussion_ended_at: "2026-10-16T08:04:00Z" }), broadcast: broadcastOf(), onBroadcast: vi.fn(), onHandOver: vi.fn() });
    expect(screen.getByRole("timer")).toHaveTextContent("استغرقت المناقشة");
    expect(screen.getByRole("timer")).toHaveTextContent("04:00");
  });
});

describe("DecisionComposerDialog editing a saved decision", () => {
  const item: AgendaDiscussionItem = { id: "a1", agenda_order: 1, agenda_status: "discussed", topic: { id: "t1", title_ar: "خطة البرنامج" } };
  const decision: Decision = { id: "d1", decision_no: "ق-1", agenda_item_id: "a1", decision_status: "ready_for_approval", decision_text: "اعتماد الخطة كما وردت.", updated_at: "2026-10-09T10:05:00Z", can_edit_text: true };

  it("starts from the saved text, saves only a changed text and keeps it when saving fails", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const props = { item, round: null, decision, busy: false, isRapporteur: true, onClose, onSubmit };
    const { rerender } = render(<DecisionComposerDialog {...props} />);
    expect(screen.getByRole("heading", { name: "تعديل القرار ق-1" })).toBeInTheDocument();
    const field = screen.getByLabelText("نص القرار");
    expect(field).toHaveValue("اعتماد الخطة كما وردت.");
    const save = screen.getByRole("button", { name: "حفظ التعديل" });
    expect(save).toBeDisabled();
    expect(screen.getByText("لم يتغير النص بعد.")).toBeInTheDocument();
    await userEvent.type(field, " مع تعديل الميزانية.");
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalledWith("اعتماد الخطة كما وردت. مع تعديل الميزانية.");
    expect(onClose).not.toHaveBeenCalled();
    rerender(<DecisionComposerDialog {...props} error="عُدِّل القرار من مستخدم آخر؛ أعد التحميل ثم أعد المحاولة." />);
    expect(screen.getByRole("alert")).toHaveTextContent("عُدِّل القرار من مستخدم آخر");
    expect(screen.getByLabelText("نص القرار")).toHaveValue("اعتماد الخطة كما وردت. مع تعديل الميزانية.");
    await userEvent.click(screen.getByRole("button", { name: "حفظ التعديل" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps saving disabled below ten characters", async () => {
    render(<DecisionComposerDialog item={item} round={null} decision={decision} busy={false} isRapporteur={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    const field = screen.getByLabelText("نص القرار");
    await userEvent.clear(field);
    await userEvent.type(field, "قصير");
    expect(screen.getByRole("button", { name: "حفظ التعديل" })).toBeDisabled();
    expect(screen.getByText("اكتب عشرة أحرف على الأقل ليُفعَّل الحفظ.")).toBeInTheDocument();
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

describe("AgendaWorkspace referral", () => {
  const referrals = (rows: Array<Record<string, unknown>> = []) => ({
    referrals: rows.map((row) => ({ agenda_item_id: "a1", referral_id: "f1", to_unit_id: "u9", to_unit_name_ar: "لجنة الخطط", reason: "يحتاج دراسة اللجنة", status: "pending" as const, referred_at: "2026-10-16T09:00:00Z", ...row })),
    destinations: [{ id: "u9", name_ar: "لجنة الخطط" }],
  });

  it("offers the chair a referral of the item under discussion", async () => {
    const onRequestReferral = vi.fn();
    setup("chair", { referrals: referrals(), onRequestReferral, broadcast: broadcastOf({ viewer_controls: true, can_hand_over: true }), onBroadcast: vi.fn(), onHandOver: vi.fn() });
    await userEvent.click(within(screen.getByRole("region", { name: "شريط تحكم رئيس المجلس" })).getByRole("button", { name: "إحالة البند" }));
    expect(onRequestReferral).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
  });

  it("offers no referral to a manager who is not the chair", () => {
    setup("chair", { referrals: referrals(), onRequestReferral: vi.fn(), broadcast: broadcastOf({ controller_role: "rapporteur", viewer_controls: true, can_hand_over: false, can_return: true }), onBroadcast: vi.fn(), onHandOver: vi.fn() });
    expect(screen.queryByRole("button", { name: "إحالة البند" })).not.toBeInTheDocument();
  });

  it("shows every screen where the item went, and no vote on it", () => {
    setup("chair", { agenda: [{ ...first, agenda_status: "discussed", voting_available_now: true }, second], referrals: referrals([{}]), onRequestReferral: vi.fn(), broadcast: broadcastOf({ viewer_controls: true, can_hand_over: true }), onBroadcast: vi.fn(), onHandOver: vi.fn() });
    const dock = screen.getByRole("region", { name: "شريط تحكم رئيس المجلس" });
    expect(within(dock).queryByRole("button", { name: "فتح التصويت للأعضاء" })).not.toBeInTheDocument();
    expect(within(dock).getByText("أُحيل البند إلى لجنة الخطط، بانتظار قبولها.")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "جدول الأعمال" })).getByText("محال إلى لجنة الخطط")).toBeInTheDocument();
  });
});

describe("ReferralDialog", () => {
  const units = [{ id: "u9", name_ar: "لجنة الخطط" }];

  it("explains what is missing, keeps the choice on failure and closes on success", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { rerender } = render(<ReferralDialog topicTitle="خطة البرنامج" destinations={units} busy={false} onClose={onClose} onSubmit={onSubmit} />);
    const confirm = screen.getByRole("button", { name: "إحالة البند" });
    expect(confirm).toBeDisabled();
    expect(screen.getByText("اختر الجهة المحال إليها.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("الجهة المحال إليها"), "u9");
    expect(screen.getByText("اكتب سبب الإحالة بخمسة أحرف على الأقل.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("سبب الإحالة"), "يحتاج دراسة اللجنة");
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith("u9", "يحتاج دراسة اللجنة");
    expect(onClose).not.toHaveBeenCalled();
    rerender(<ReferralDialog topicTitle="خطة البرنامج" destinations={units} busy={false} error="تغيّر البند من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة." onClose={onClose} onSubmit={onSubmit} />);
    expect(screen.getByRole("alert")).toHaveTextContent("تغيّر البند من شاشة أخرى");
    expect(screen.getByLabelText("الجهة المحال إليها")).toHaveValue("u9");
    expect(screen.getByLabelText("سبب الإحالة")).toHaveValue("يحتاج دراسة اللجنة");
    await userEvent.click(screen.getByRole("button", { name: "إحالة البند" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the pending state and blocks a second submission", () => {
    render(<ReferralDialog topicTitle="خطة البرنامج" destinations={units} busy onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /جارٍ الإحالة/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeDisabled();
  });

  it("says so when no unit can receive the item", () => {
    render(<ReferralDialog topicTitle="خطة البرنامج" destinations={[]} busy={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText("لا توجد جهة نشطة أخرى يُحال إليها البند.")).toBeInTheDocument();
  });
});

describe("AgendaWorkspace assignments", () => {
  const data = { viewer: { can_issue: true, can_propose: false }, assignments: [], options: { users: [], units: [{ id: "g1", name_ar: "عمادة القبول" }] } };
  const assignments = (onCreate = vi.fn(async () => true)) => ({ data, activity: { key: null, errorKey: null, error: null }, onCreate, onConfirm: vi.fn(), onWithdraw: vi.fn() });
  const approvedRound: VotingRound = { id: "r1", agenda_item_id: "a1", status: "closed", result: "approved", closed_at: "2026-10-16T09:00:00Z" };
  const decision: Decision = { id: "d1", decision_no: "DEC-2026-000014", agenda_item_id: "a1", decision_status: "ready_for_approval", decision_text: "اعتماد الخطة." };

  it("opens the assignments under the item's decision and sends them for that item", async () => {
    const onCreate = vi.fn(async () => true);
    setup("chair", { agenda: [{ ...first, agenda_status: "discussed" }, second], rounds: [approvedRound], decisions: [decision], assignments: assignments(onCreate) });
    const section = screen.getByRole("region", { name: "التكليفات" });
    await userEvent.type(within(section).getByLabelText("عنوان التكليف"), "إبلاغ عمادة القبول");
    await userEvent.selectOptions(within(section).getByLabelText("المكلَّف"), "unit:g1");
    await userEvent.click(within(section).getByRole("button", { name: "إصدار التكليف" }));
    expect(onCreate).toHaveBeenCalledWith("a1", { title: "إبلاغ عمادة القبول", userId: null, unitId: "g1", dueDate: null });
  });

  it("offers no assignment before the decision is drafted, nor a form on the presentation screen", () => {
    const { props, view } = setup("chair", { assignments: assignments() });
    expect(screen.queryByRole("region", { name: "التكليفات" })).not.toBeInTheDocument();
    view.rerender(<AgendaWorkspace {...props} agenda={[{ ...first, agenda_status: "discussed" }, second]} rounds={[approvedRound]} decisions={[decision]} presenting />);
    expect(screen.queryByRole("form", { name: "تكليف جديد" })).not.toBeInTheDocument();
  });
});
