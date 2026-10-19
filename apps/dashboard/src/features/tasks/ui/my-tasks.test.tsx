import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("says what waits on the viewer, and each sentence opens the matching tasks", async () => {
    const soon = new Date(); soon.setDate(soon.getDate() + 3);
    rpc.mockResolvedValue(lists({
      to_execute: [
        summary({ id: "late", title_ar: "إبلاغ الأقسام", is_overdue: true, due_date: "2026-01-01" }),
        summary({ id: "soon", title_ar: "إعداد التقرير", due_date: soon.toLocaleDateString("en-CA") }),
        summary({ id: "later", title_ar: "مراجعة اللائحة", due_date: "2099-01-01" }),
      ],
      to_verify: [summary({ id: "v", status: "submitted" }), summary({ id: "v2", status: "submitted" })],
    }));
    render(<MyTasksWorkspace />);
    const strip = await screen.findByRole("region", { name: "ما ينتظرك" });
    expect(strip).toHaveTextContent("أنت مكلَّف بـ3 مهام مفتوحة.");
    expect(within(strip).getByRole("button", { name: "مهمتان بانتظار تحققك" })).toBeInTheDocument();
    await userEvent.click(within(strip).getByRole("button", { name: "مهمة متأخرة" }));
    const list = screen.getByRole("list", { name: "مهام للتنفيذ" });
    expect(within(list).getByRole("button", { name: /إبلاغ الأقسام/ })).toHaveTextContent("متأخرة منذ");
    expect(within(list).queryByRole("button", { name: /مراجعة اللائحة/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "عرض الكل" }));
    expect(screen.getByRole("listitem", { name: "خلال سبعة أيام" })).toHaveTextContent("إعداد التقرير");
    expect(screen.getByRole("listitem", { name: "لاحقاً" })).toHaveTextContent("مراجعة اللائحة");
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
    const next = screen.getByRole("region", { name: "خطوتك التالية" });
    expect(within(next).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "حدّث نسبة الإنجاز إن أردت توثيق تقدم جديد",
      "أرفق دليل الإنجاز المطلوب",
      "سلّم ما أنجزته للتحقق بأي نسبة حالية",
    ]);
    expect(next).toHaveTextContent("لا يلزم رفع النسبة إلى 90%");
    expect(next).toHaveTextContent("تصل المهمة إلى 100% بعد اعتماد المتابع");
    expect(within(next).queryByRole("button", { name: "تسليم الإنجاز للتحقق" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تسليم الإنجاز للتحقق" })).toBeDisabled();
    expect(screen.getByText("تتطلب هذه المهمة دليل إنجاز؛ أرفق ملفاً قبل التسليم.")).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "إرفاق دليل" });
    const submission = screen.getByRole("group", { name: "تسليم الإنجاز" });
    expect(form.compareDocumentPosition(submission) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(form).getByRole("button", { name: "إرفاق الدليل" })).toBeDisabled();
    const file = new File(["%PDF"], "plan.pdf", { type: "application/pdf" });
    await userEvent.upload(within(form).getByLabelText(/الملف/), file);
    await userEvent.type(within(form).getByLabelText("وصف الدليل (اختياري)"), "الخطة الموقعة");
    await userEvent.click(within(form).getByRole("button", { name: "إرفاق الدليل" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "upload", file, description: "الخطة الموقعة" });
  });

  it("allows the executor to submit partial completion without inflating progress", async () => {
    render(<TaskDetailPanel task={detail({ progress_percent: 25, evidence: [{ id: "e1", file_name: "partial.pdf", mime_type: "application/pdf", description: "", uploaded_at: "2026-10-20T09:00:00Z", uploaded_by_name_ar: "المنفذ", file_size_bytes: 10 }], viewer: viewer({ can_submit: true, submit_blocked_reason: null }) })} pending={null} error={null} onAction={onAction} />);
    const next = screen.getByRole("region", { name: "خطوتك التالية" });
    expect(next).toHaveTextContent("يمكنك تسليم ما وصلت إليه الآن بنسبة 25%");
    await userEvent.click(screen.getByRole("button", { name: "تسليم الإنجاز للتحقق" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "submit", note: "" });
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

  it("names the viewer's next step and saves progress picked from quick choices", async () => {
    render(<TaskDetailPanel task={detail({ viewer: viewer({ can_submit: true, submit_blocked_reason: null }) })} pending={null} error="تعذر الحفظ." onAction={onAction} />);
    const next = screen.getByRole("region", { name: "خطوتك التالية" });
    expect(next).toHaveTextContent("الإنجاز جاهز للتسليم");
    expect(within(next).getByRole("alert")).toHaveTextContent("تعذر الحفظ.");
    expect(screen.getByRole("list", { name: "مسار المهمة" })).toHaveTextContent("تنفيذ: الآن");
    const form = screen.getByRole("form", { name: "تحديث الإنجاز" });
    expect(within(form).getByRole("button", { name: "40%" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(form).getByRole("button", { name: "75%" }));
    await userEvent.click(within(form).getByRole("button", { name: "حفظ الإنجاز" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "progress", percent: 75, note: "" });
  });

  it("takes evidence dropped on the drop zone", async () => {
    render(<TaskDetailPanel task={detail()} pending={null} error={null} onAction={onAction} />);
    const form = screen.getByRole("form", { name: "إرفاق دليل" });
    const file = new File(["%PDF"], "minutes.pdf", { type: "application/pdf" });
    fireEvent.drop(within(form).getByText("اسحب الملف هنا أو اختره من جهازك"), { dataTransfer: { files: [file] } });
    expect(within(form).getByText("minutes.pdf")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "إرفاق الدليل" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "upload", file, description: "" });
  });

  it("shows the task's trail with its notes", () => {
    render(<TaskDetailPanel task={detail({ events: [{ id: "e1", event_type: "return", progress_percent: 40, note: "أرفق النسخة الموقعة", actor_name_ar: "د. هدى", created_at: "2026-10-16T10:00:00Z" }] })} pending={null} error={null} onAction={onAction} />);
    const trail = screen.getByRole("region", { name: "سجل المهمة" });
    expect(trail).toHaveTextContent("إعادة للتنفيذ");
    expect(trail).toHaveTextContent("أرفق النسخة الموقعة");
  });
});
