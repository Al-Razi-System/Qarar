import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionTasks, FollowedDecision } from "../model/follow-up";
import { decisionStatusLabel, groupDecisionTasks } from "../model/follow-up";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../api/tasks-client", () => ({ tasksRpc: rpc }));
import { DecisionFollowUpWorkspace } from "./decision-follow-up-workspace";

const decision = (patch: Partial<FollowedDecision> = {}): FollowedDecision => ({
  id: "d1", decision_no: "DEC-2026-000014", decision_text: "اعتماد الخطة الدراسية.", decision_status: "under_follow_up", outcome_kind: "approval",
  meeting_id: "m1", meeting_title_ar: "مجلس الكلية", meeting_date: "2026-10-10", council_name_ar: "مجلس كلية الحاسب",
  total_tasks: 2, open_tasks: 1, completed_tasks: 1, cancelled_tasks: 0, overdue_tasks: 1, progress_percent: 70,
  can_manage: true, can_close: false, close_blocked_reason: "لم تُنجز 1 من مهام القرار أو تُلغَ بعد.", updated_at: "2026-10-16T10:00:00Z", ...patch,
});
const tasks = (patch: Partial<DecisionTasks> = {}): DecisionTasks => ({
  ...decision(),
  tasks: [{
    id: "t1", action_no: "TSK-2026-000031", title_ar: "إبلاغ الأقسام", description: null, status: "in_progress", progress_percent: 40,
    due_date: "2026-10-12", is_overdue: true, requires_evidence: false, evidence_count: 0, assigned_user_name_ar: "د. خالد", assigned_unit_name_ar: null,
    follow_up_user_name_ar: "د. هدى", decision_id: "d1", decision_no: "DEC-2026-000014", meeting_title_ar: "مجلس الكلية", updated_at: "2026-10-16T09:00:00Z", can_manage: true,
  }],
  units: [{ id: "g1", name_ar: "عمادة القبول" }],
  ...patch,
});

beforeEach(() => { rpc.mockReset(); });

describe("decisionStatusLabel", () => {
  it("never shows a raw status", () => {
    expect(decisionStatusLabel("ready_for_approval").label).toBe("بانتظار اعتماد المحضر");
    expect(decisionStatusLabel("something_new").label).toBe("حالة غير معروفة");
  });
});

describe("groupDecisionTasks", () => {
  it("keeps one logical assignment row with independently tracked target tasks", () => {
    const first = tasks().tasks[0];
    const groups = groupDecisionTasks([
      { ...first, id: "t1", status: "completed", progress_percent: 100, assignment_batch_id: "batch-1", assignment_batch_target_count: 2, assignment_batch_title_ar: "إبلاغ الأقسام" },
      { ...first, id: "t2", action_no: "TSK-2026-000032", assigned_user_name_ar: "د. ريم", assignment_batch_id: "batch-1", assignment_batch_target_count: 2, assignment_batch_title_ar: "إبلاغ الأقسام" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "batch-1", title_ar: "إبلاغ الأقسام", target_count: 2, completed_count: 1 });
    expect(groups[0].tasks).toHaveLength(2);
  });
});

describe("DecisionFollowUpWorkspace", () => {
  it("lists the followed decisions and explains why one cannot close yet", async () => {
    rpc.mockResolvedValue([decision()]);
    render(<DecisionFollowUpWorkspace />);
    const card = (await screen.findByText("اعتماد الخطة الدراسية.")).closest("li")!;
    expect(within(card).getByRole("button", { name: "إغلاق القرار" })).toBeDisabled();
    expect(within(card).getByText("لم تُنجز 1 من مهام القرار أو تُلغَ بعد.")).toBeInTheDocument();
    expect(within(card).getByText("متأخرة: 1")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("list_decision_follow_up_v2", { p_status: "open" });
  });

  it("shows one progress row for a multi-target assignment and keeps both target tasks", async () => {
    const first = tasks().tasks[0];
    rpc.mockImplementation((contract: string) => contract === "list_decision_follow_up_v2" ? Promise.resolve([decision()]) : Promise.resolve(tasks({
      tasks: [
        { ...first, id: "t1", status: "completed", progress_percent: 100, assignment_batch_id: "batch-1", assignment_batch_target_count: 2, assignment_batch_title_ar: "إبلاغ جميع الأقسام" },
        { ...first, id: "t2", action_no: "TSK-2026-000032", assigned_user_name_ar: "د. ريم", assignment_batch_id: "batch-1", assignment_batch_target_count: 2, assignment_batch_title_ar: "إبلاغ جميع الأقسام" },
      ],
    })));
    render(<DecisionFollowUpWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: "عرض المهام" }));
    expect(await screen.findByText("إبلاغ جميع الأقسام")).toBeVisible();
    expect(screen.getByText(/أُنجز 1 من 2/)).toBeVisible();
    expect(screen.getByText("TSK-2026-000031")).toBeInTheDocument();
    expect(screen.getByText("TSK-2026-000032")).toBeInTheDocument();
  });

  it("cancels a task only with a reason, keeps the dialog on failure, and reloads", async () => {
    let cancels = 0;
    rpc.mockImplementation((contract: string) => {
      if (contract === "list_decision_follow_up_v2") return Promise.resolve([decision()]);
      if (contract === "list_decision_tasks_v2") return Promise.resolve(tasks());
      cancels += 1;
      return cancels === 1 ? Promise.reject(new Error("تغيّرت المهمة من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.")) : Promise.resolve({});
    });
    render(<DecisionFollowUpWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: "عرض المهام" }));
    await userEvent.click(await screen.findByRole("button", { name: "إلغاء المهمة" }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "إلغاء المهمة" });
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText("اكتب السبب بخمسة أحرف على الأقل.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("السبب"), "استُبدلت بالخطة الجديدة");
    await userEvent.click(confirm);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("تغيّرت المهمة من شاشة أخرى");
    expect(within(dialog).getByLabelText("السبب")).toHaveValue("استُبدلت بالخطة الجديدة");
    await userEvent.click(within(dialog).getByRole("button", { name: "إلغاء المهمة" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("أُلغيت المهمة.")).toBeInTheDocument();
    expect(rpc).toHaveBeenLastCalledWith("list_decision_tasks_v2", { p_decision_id: "d1" });
    expect(rpc).toHaveBeenCalledWith("cancel_task_v2", { p_task_id: "t1", p_expected_updated_at: "2026-10-16T09:00:00Z", p_reason: "استُبدلت بالخطة الجديدة" });
  });

  it("reassigns a task to a unit and extends its due date", async () => {
    rpc.mockImplementation((contract: string) => contract === "list_decision_follow_up_v2" ? Promise.resolve([decision()])
      : contract === "list_decision_tasks_v2" ? Promise.resolve(tasks()) : Promise.resolve({}));
    render(<DecisionFollowUpWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: "عرض المهام" }));
    await userEvent.click(await screen.findByRole("button", { name: "إعادة إسناد" }));
    let dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText("الجهة المكلَّفة الجديدة"), "g1");
    await userEvent.type(within(dialog).getByLabelText("السبب"), "العمادة صاحبة الاختصاص");
    await userEvent.click(within(dialog).getByRole("button", { name: "إعادة إسناد المهمة" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("reassign_task_v2", expect.objectContaining({ p_assigned_unit_id: "g1", p_assigned_user_id: null })));
    await userEvent.click(await screen.findByRole("button", { name: "تمديد الموعد" }));
    dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("السبب"), "بانتظار اعتماد الميزانية");
    // The task's current due date has passed, so a new one is required before extending.
    expect(within(dialog).getByText("اختر موعداً لا يكون في الماضي.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "تمديد موعد الإنجاز" })).toBeDisabled();
  });

  it("closes a finished decision", async () => {
    rpc.mockImplementation((contract: string) => contract === "list_decision_follow_up_v2"
      ? Promise.resolve([decision({ open_tasks: 0, overdue_tasks: 0, can_close: true, close_blocked_reason: null })]) : Promise.resolve({}));
    render(<DecisionFollowUpWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: "إغلاق القرار" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "إغلاق القرار" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("close_decision_v2", { p_decision_id: "d1", p_note: null, p_expected_updated_at: "2026-10-16T10:00:00Z" }));
  });

  it("offers no management to whoever only follows", async () => {
    rpc.mockImplementation((contract: string) => contract === "list_decision_follow_up_v2"
      ? Promise.resolve([decision({ can_manage: false })])
      : Promise.resolve(tasks({ tasks: tasks().tasks.map((task) => ({ ...task, can_manage: false })), units: null })));
    render(<DecisionFollowUpWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: "عرض المهام" }));
    expect((await screen.findAllByText("إبلاغ الأقسام")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "إغلاق القرار" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إلغاء المهمة" })).not.toBeInTheDocument();
  });
});
