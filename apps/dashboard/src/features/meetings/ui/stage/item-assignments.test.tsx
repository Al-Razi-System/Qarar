import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MeetingAssignment, MeetingAssignments } from "../../model/live-meeting";
import { ItemAssignments, NEW_ASSIGNMENT_KEY, type AssignmentActivity } from "./item-assignments";

const options: MeetingAssignments["options"] = { users: [{ id: "u3", name_ar: "د. خالد" }], units: [{ id: "g1", name_ar: "عمادة القبول" }] };
const idle: AssignmentActivity = { key: null, errorKey: null, error: null };
const row = (patch: Partial<MeetingAssignment> = {}): MeetingAssignment => ({
  id: "s1", agenda_item_id: "a1", decision_id: "d1", title_ar: "تحديث الخطة الدراسية", description: null,
  assigned_user_id: "u3", assigned_user_name_ar: "د. خالد", assigned_unit_id: null, assigned_unit_name_ar: null,
  due_date: "2026-11-15", status: "active", revision: 1, proposed_by_me: false, action_no: "TSK-2026-000007", action_status: "new", ...patch,
});

function setup(viewer: MeetingAssignments["viewer"], assignments: MeetingAssignment[] = [], extra: Partial<Parameters<typeof ItemAssignments>[0]> = {}) {
  const handlers = { onCreate: vi.fn(async () => true), onConfirm: vi.fn(), onWithdraw: vi.fn() };
  const props = { assignments, viewer, options: viewer.can_issue || viewer.can_propose ? options : null, activity: idle, ...handlers, ...extra };
  return { handlers, props, view: render(<ItemAssignments {...props} />) };
}

describe("ItemAssignments", () => {
  it("lets the chair issue an assignment, explaining what is missing first", async () => {
    const { handlers } = setup({ can_issue: true, can_propose: false });
    const issue = screen.getByRole("button", { name: "إصدار التكليف" });
    expect(issue).toBeDisabled();
    expect(screen.getByText("اكتب عنوان التكليف بخمسة أحرف على الأقل.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("عنوان التكليف"), "تحديث الخطة الدراسية");
    expect(screen.getByText("اختر المكلَّف.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("المكلَّف"), "unit:g1");
    expect(screen.getByText("يصبح التكليف مهمة تنفيذ فور إصداره، قبل اعتماد القرار.")).toBeInTheDocument();
    await userEvent.click(issue);
    expect(handlers.onCreate).toHaveBeenCalledWith({ title: "تحديث الخطة الدراسية", userId: null, unitId: "g1", dueDate: null });
    expect(screen.getByLabelText("عنوان التكليف")).toHaveValue("");
  });

  it("keeps the form on failure and shows why, and shows pending while saving", async () => {
    const onCreate = vi.fn(async () => false);
    const { props, view } = setup({ can_issue: false, can_propose: true }, [], { onCreate });
    await userEvent.type(screen.getByLabelText("عنوان التكليف"), "إبلاغ الأقسام");
    await userEvent.selectOptions(screen.getByLabelText("المكلَّف"), "user:u3");
    await userEvent.click(screen.getByRole("button", { name: "اقتراح التكليف" }));
    view.rerender(<ItemAssignments {...props} onCreate={onCreate} activity={{ key: null, errorKey: NEW_ASSIGNMENT_KEY, error: "صغ قرار البند أولاً، ثم أضف تكليفاته." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("صغ قرار البند أولاً");
    expect(screen.getByLabelText("عنوان التكليف")).toHaveValue("إبلاغ الأقسام");
    view.rerender(<ItemAssignments {...props} onCreate={onCreate} activity={{ key: NEW_ASSIGNMENT_KEY, errorKey: null, error: null }} />);
    expect(screen.getByRole("button", { name: "جارٍ الحفظ…" })).toBeDisabled();
    expect(screen.getByLabelText("عنوان التكليف")).toBeDisabled();
  });

  it("lets the chair confirm a proposal and asks once more before withdrawing an issued one", async () => {
    const proposal = row({ id: "s2", status: "proposed", action_no: null, action_status: null, revision: 0 });
    const { handlers } = setup({ can_issue: true, can_propose: false }, [row(), proposal]);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("نافذ")).toBeInTheDocument();
    expect(within(items[0]).getByText("TSK-2026-000007")).toBeInTheDocument();
    expect(within(items[1]).getByText("مقترح بانتظار اعتماد الرئيس")).toBeInTheDocument();
    await userEvent.click(within(items[1]).getByRole("button", { name: "اعتماد التكليف" }));
    expect(handlers.onConfirm).toHaveBeenCalledWith(proposal);
    await userEvent.click(within(items[0]).getByRole("button", { name: "سحب التكليف" }));
    expect(handlers.onWithdraw).not.toHaveBeenCalled();
    expect(within(items[0]).getByText("تُلغى مهمة التنفيذ.")).toBeInTheDocument();
    await userEvent.click(within(items[0]).getByRole("button", { name: "تأكيد السحب" }));
    expect(handlers.onWithdraw).toHaveBeenCalledWith(row());
  });

  it("lets the rapporteur withdraw only their own proposal, and nobody withdraw a task already under way", () => {
    setup({ can_issue: false, can_propose: true }, [
      row({ id: "mine", status: "proposed", proposed_by_me: true, action_no: null, action_status: null }),
      row({ id: "other", status: "proposed", proposed_by_me: false, action_no: null, action_status: null }),
      row({ id: "issued" }),
    ]);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByRole("button", { name: "سحب التكليف" })).toBeInTheDocument();
    expect(within(items[1]).queryByRole("button")).not.toBeInTheDocument();
    expect(within(items[2]).queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not let the chair withdraw a task whose work has started", () => {
    setup({ can_issue: true, can_propose: false }, [row({ action_status: "in_progress" })]);
    expect(within(screen.getByRole("listitem")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a member the assignments without any form or action", () => {
    setup({ can_issue: false, can_propose: false }, [row({ action_status: "cancelled" })]);
    expect(screen.getByText("أُلغيت مهمته")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows nothing to a member when the decision has no assignment", () => {
    const { view } = setup({ can_issue: false, can_propose: false });
    expect(view.container).toBeEmptyDOMElement();
  });
});

