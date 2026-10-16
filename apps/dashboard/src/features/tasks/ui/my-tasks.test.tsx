import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyTasks, TaskDetail, TaskSummary } from "../model/tasks";
import { taskStatusLabel } from "../model/tasks";

const { rpc, upload, remove } = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("../api/tasks-client", () => ({
  tasksRpc: rpc,
  uploadTaskEvidence: upload,
  removeTaskEvidence: remove,
  taskEvidenceUrl: (taskId: string, evidenceId: string) => `/evidence/${taskId}/${evidenceId}`,
}));
import { MyTasksWorkspace } from "./my-tasks-workspace";
import { TaskDetailPanel } from "./task-detail";

const summary = (patch: Partial<TaskSummary> = {}): TaskSummary => ({
  id: "t1", action_no: "TSK-2026-000007", title_ar: "تحديث الخطة الدراسية", description: null, status: "in_progress",
  progress_percent: 40, due_date: "2026-11-15", is_overdue: false, requires_evidence: true, evidence_count: 0,
  assigned_user_name_ar: "د. خالد", assigned_unit_name_ar: null, follow_up_user_name_ar: "د. هدى",
  decision_id: "d1", decision_no: "DEC-2026-000014", meeting_title_ar: "مجلس الكلية", updated_at: "2026-10-16T10:00:00Z", ...patch,
});
const viewer = (patch: Partial<TaskDetail["viewer"]> = {}): TaskDetail["viewer"] => ({
  is_executor: true, is_verifier: false, can_start: false, can_update: true, can_submit: false,
  submit_blocked_reason: "تتطلب هذه المهمة دليل إنجاز؛ أرفق ملفاً قبل التسليم.", can_verify: false, verify_blocked_reason: null, ...patch,
});
const detail = (patch: Partial<TaskDetail> = {}): TaskDetail => ({
  ...summary(), decision_text: "اعتماد الخطة الدراسية.", started_at: null, completed_at: null, events: [], evidence: [], viewer: viewer(), ...patch,
});

beforeEach(() => { rpc.mockReset(); upload.mockReset(); remove.mockReset(); });

describe("taskStatusLabel", () => {
  it("names every state in words, overdue before in progress", () => {
    expect(taskStatusLabel({ status: "new", is_overdue: false }).label).toBe("لم تبدأ");
    expect(taskStatusLabel({ status: "in_progress", is_overdue: true })).toEqual({ label: "متأخرة", tone: "danger" });
    expect(taskStatusLabel({ status: "submitted", is_overdue: true }).label).toBe("بانتظار التحقق");
    expect(taskStatusLabel({ status: "completed", is_overdue: false }).label).toBe("منجزة");
  });
});

describe("MyTasksWorkspace", () => {
  const lists = (patch: Partial<MyTasks> = {}): MyTasks => ({ to_execute: [summary()], to_verify: [], following: [], ...patch });

  it("opens on the tasks awaiting the viewer's verification, and on a task's details", async () => {
    rpc.mockImplementation((contract: string) => contract === "list_my_tasks_v2"
      ? Promise.resolve(lists({ to_verify: [summary({ id: "t2", title_ar: "إبلاغ الأقسام", status: "submitted" })] }))
      : Promise.resolve(detail({ id: "t2", title_ar: "إبلاغ الأقسام", status: "submitted", viewer: viewer({ is_executor: false, is_verifier: true, can_update: false, can_verify: true, submit_blocked_reason: null }) })));
    render(<MyTasksWorkspace />);
    const list = await screen.findByRole("list", { name: "مهام للتحقق" });
    await userEvent.click(within(list).getByRole("button", { name: /إبلاغ الأقسام/ }));
    const panel = await screen.findByRole("region", { name: "تفاصيل المهمة" });
    expect(within(panel).getByRole("form", { name: "التحقق من الإنجاز" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("get_task_v2", { p_task_id: "t2" });
  });

  it("says so when there is nothing to do, and offers a retry when the list fails", async () => {
    rpc.mockRejectedValueOnce(new Error("تعذر الاتصال بالخادم."));
    render(<MyTasksWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الاتصال بالخادم.");
    rpc.mockResolvedValueOnce(lists({ to_execute: [] }));
    await userEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("لا مهام مكلَّف بها الآن.")).toBeInTheDocument();
  });

  it("sends a step against the task's token, shows success, and reloads the server's state", async () => {
    let reads = 0;
    rpc.mockImplementation((contract: string) => {
      if (contract === "list_my_tasks_v2") return Promise.resolve(lists());
      if (contract === "get_task_v2") { reads += 1; return Promise.resolve(detail({ progress_percent: reads > 1 ? 60 : 40 })); }
      return Promise.resolve({});
    });
    render(<MyTasksWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: /تحديث الخطة الدراسية/ }));
    const form = await screen.findByRole("form", { name: "تحديث الإنجاز" });
    await userEvent.type(within(form).getByLabelText("ملاحظة (اختيارية)"), "اكتملت المسودة");
    await userEvent.click(within(form).getByRole("button", { name: "حفظ الإنجاز" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("update_task_progress_v2", { p_task_id: "t1", p_expected_updated_at: "2026-10-16T10:00:00Z", p_percent: 40, p_note: "اكتملت المسودة" }));
    expect(await screen.findByText("حُفظت نسبة الإنجاز.")).toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it("keeps the panel and shows the server's reason when a step is refused", async () => {
    rpc.mockImplementation((contract: string) => {
      if (contract === "list_my_tasks_v2") return Promise.resolve(lists());
      if (contract === "get_task_v2") return Promise.resolve(detail({ status: "new", viewer: viewer({ can_start: true }) }));
      return Promise.reject(new Error("تغيّرت المهمة من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة."));
    });
    render(<MyTasksWorkspace />);
    await userEvent.click(await screen.findByRole("button", { name: /تحديث الخطة الدراسية/ }));
    await userEvent.click(await screen.findByRole("button", { name: "بدء التنفيذ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تغيّرت المهمة من شاشة أخرى");
    expect(screen.getByRole("region", { name: "تفاصيل المهمة" })).toBeInTheDocument();
  });
});

describe("TaskDetailPanel", () => {
  const onAction = vi.fn(async () => true);
  beforeEach(() => { onAction.mockClear(); });

  it("explains why the executor cannot submit yet, and uploads evidence", async () => {
    render(<TaskDetailPanel task={detail()} pending={null} error={null} onAction={onAction} />);
    expect(screen.getByRole("button", { name: "تسليم الإنجاز للتحقق" })).toBeDisabled();
    expect(screen.getByText("تتطلب هذه المهمة دليل إنجاز؛ أرفق ملفاً قبل التسليم.")).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "إرفاق دليل" });
    expect(within(form).getByRole("button", { name: "إرفاق الدليل" })).toBeDisabled();
    const file = new File(["%PDF"], "plan.pdf", { type: "application/pdf" });
    await userEvent.upload(within(form).getByLabelText(/الملف/), file);
    await userEvent.type(within(form).getByLabelText("وصف الدليل (اختياري)"), "الخطة الموقعة");
    await userEvent.click(within(form).getByRole("button", { name: "إرفاق الدليل" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "upload", file, description: "الخطة الموقعة" });
  });

  it("asks a verifier for a reason before returning the task", async () => {
    render(<TaskDetailPanel task={detail({ status: "submitted", viewer: viewer({ is_executor: false, can_update: false, can_verify: true, is_verifier: true, submit_blocked_reason: null }) })} pending={null} error={null} onAction={onAction} />);
    const form = screen.getByRole("form", { name: "التحقق من الإنجاز" });
    await userEvent.click(within(form).getByLabelText("إعادة للتنفيذ"));
    expect(within(form).getByRole("button", { name: "إعادة المهمة للتنفيذ" })).toBeDisabled();
    expect(within(form).getByText("اكتب سبب الإعادة بخمسة أحرف على الأقل.")).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText("سبب الإعادة"), "أرفق النسخة الموقعة");
    await userEvent.click(within(form).getByRole("button", { name: "إعادة المهمة للتنفيذ" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "return", reason: "أرفق النسخة الموقعة" });
  });

  it("tells a verifier who submitted the task that someone else verifies it", () => {
    render(<TaskDetailPanel task={detail({ status: "submitted", viewer: viewer({ can_update: false, is_verifier: true, verify_blocked_reason: "سلّمت هذه المهمة بنفسك، فيتحقق منها متحقق آخر.", submit_blocked_reason: null }) })} pending={null} error={null} onAction={onAction} />);
    expect(screen.queryByRole("form", { name: "التحقق من الإنجاز" })).not.toBeInTheDocument();
    expect(screen.getByText("سلّمت هذه المهمة بنفسك، فيتحقق منها متحقق آخر.")).toBeInTheDocument();
  });

  it("shows pending on the running step and blocks the others", () => {
    render(<TaskDetailPanel task={detail({ viewer: viewer({ can_submit: true, submit_blocked_reason: null }) })} pending="submit" error={null} onAction={onAction} />);
    expect(screen.getByRole("button", { name: "جارٍ التسليم…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "حفظ الإنجاز" })).toBeDisabled();
  });

  it("shows the task's trail with its notes", () => {
    render(<TaskDetailPanel task={detail({ events: [{ id: "e1", event_type: "return", progress_percent: 40, note: "أرفق النسخة الموقعة", actor_name_ar: "د. هدى", created_at: "2026-10-16T10:00:00Z" }] })} pending={null} error={null} onAction={onAction} />);
    const trail = screen.getByRole("region", { name: "سجل المهمة" });
    expect(trail).toHaveTextContent("إعادة للتنفيذ");
    expect(trail).toHaveTextContent("أرفق النسخة الموقعة");
  });
});
