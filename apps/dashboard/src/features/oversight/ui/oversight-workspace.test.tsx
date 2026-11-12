import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OversightWorkspace } from "./oversight-workspace";

const uni = "10000000-0000-4000-8000-000000000001";
const collegeClass = "20000000-0000-4000-8000-000000000002";
const deptClass = "20000000-0000-4000-8000-000000000003";
const deansRule = {
  id: "30000000-0000-4000-8000-000000000001", version: 1, status: "active", title_ar: null,
  holder_kind: "position_rule", holder_role_code: "council_chair", holder_role_name_ar: "رئيس المجلس",
  holder_class_id: collegeClass, holder_class_name_ar: "مجلس كلية",
  target_mode: "subtree", root_unit_id: null, target_class_ids: [deptClass], target_class_names_ar: ["مجلس قسم"],
  council_ids: [], council_names_ar: [], starts_on: "2026-11-12", ends_on: null,
  coverage: { council_count: 24, holder_count: 4, holders: ["عميد الحاسوب", "عميد الطب"] },
};
const workspace = {
  assignments: [deansRule],
  users: [{ id: "40000000-0000-4000-8000-000000000001", name_ar: "خليل", email: "k@u.test" }],
  roles: [{ code: "council_chair", name_ar: "رئيس المجلس" }],
  classes: [{ id: "20000000-0000-4000-8000-000000000001", name_ar: "مجلس جامعة" }, { id: collegeClass, name_ar: "مجلس كلية" }, { id: deptClass, name_ar: "مجلس قسم" }],
  units: [{ id: uni, name_ar: "الجامعة", parent_id: null }, { id: "10000000-0000-4000-8000-000000000002", name_ar: "كلية الحاسوب", parent_id: uni }],
  councils: [{ id: "50000000-0000-4000-8000-000000000001", name_ar: "مجلس الدراسات العليا", class_name_ar: "مجلس جامعة", scope_unit_name_ar: "الجامعة" }],
  unlinked_councils: [{ id: "50000000-0000-4000-8000-000000000009", name_ar: "مجلس قسم الحاسب" }],
};

type Call = { contract: string; params: Record<string, unknown> };

function mockApi(overrides: Partial<Record<string, (call: Call) => Response | unknown>> = {}) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const call = JSON.parse(String(init?.body)) as Call;
    calls.push(call);
    const handler = overrides[call.contract];
    if (handler) {
      const value = handler(call);
      return value instanceof Response ? value : Response.json({ data: value });
    }
    if (call.contract === "admin_get_oversight_workspace_v2") return Response.json({ data: workspace });
    if (call.contract === "admin_preview_oversight_v2") {
      return Response.json({ data: { council_count: 30, councils: [{ id: "c1", name_ar: "مجلس كلية الحاسوب", class_name_ar: "مجلس كلية" }], holders: [{ id: "h1", name_ar: "خليل", council_count: 30 }] } });
    }
    return Response.json({ data: null });
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("OversightWorkspace", () => {
  it("describes each assignment in a sentence, with what it covers and who holds it now", async () => {
    mockApi();
    render(<OversightWorkspace />);
    const card = await screen.findByRole("article", { name: /رئيس المجلس في كل «مجلس كلية»/ });
    expect(card).toHaveTextContent("يتابع المجالس من نوع «مجلس قسم» التابعة لوحدة مجلسه");
    expect(card).toHaveTextContent("٢٤ مجلسًا");
    expect(card).toHaveTextContent("عميد الحاسوب");
    expect(screen.getByText(/مجلس قسم الحاسب/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("position_rule");
  });

  it("creates a person's follow-up of college and department councils, previewing what it covers first", async () => {
    const calls = mockApi({ admin_save_oversight_assignment_v2: () => ({ ...deansRule, id: "new", holder_kind: "user", holder_user_name_ar: "خليل" }) });
    render(<OversightWorkspace />);
    await screen.findByRole("article", { name: /رئيس المجلس في كل/ });

    fireEvent.click(screen.getByRole("button", { name: "تعيين متابعة" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "شخص محدد" }));
    fireEvent.change(within(dialog).getByLabelText("الشخص"), { target: { value: "40000000-0000-4000-8000-000000000001" } });
    fireEvent.change(within(dialog).getByLabelText("يتابع ما تحت"), { target: { value: uni } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "مجلس كلية" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "مجلس قسم" }));

    expect(await within(dialog).findByText("سيتابع ٣٠ مجلسًا")).toBeInTheDocument();
    expect(calls.filter((call) => call.contract === "admin_preview_oversight_v2").at(-1)?.params.p_definition).toMatchObject({
      holder_kind: "user", holder_user_id: "40000000-0000-4000-8000-000000000001", target_mode: "subtree", root_unit_id: uni,
      target_class_ids: [collegeClass, deptClass],
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعيين" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const save = calls.find((call) => call.contract === "admin_save_oversight_assignment_v2");
    expect(save?.params).toMatchObject({ p_assignment_id: null, p_expected_version: null });
    expect(String(save?.params.p_request_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByText("حُفظ تعيين المتابعة.")).toBeInTheDocument();
  });

  it("keeps the dialog and its input when saving fails, with the reason beside the action", async () => {
    mockApi({ admin_save_oversight_assignment_v2: () => Response.json({ error: { message: "اختر الشخص الذي سيتابع." } }, { status: 400 }) });
    render(<OversightWorkspace />);
    await screen.findByRole("article", { name: /رئيس المجلس في كل/ });
    fireEvent.click(screen.getByRole("button", { name: "تعيين متابعة" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("عنوان مختصر (اختياري)"), { target: { value: "متابعة نائب الرئيس" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعيين" }));
    expect(await within(dialog).findByText("اختر الشخص الذي سيتابع.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("عنوان مختصر (اختياري)")).toHaveValue("متابعة نائب الرئيس");
  });

  it("ends an assignment only with a written reason", async () => {
    const calls = mockApi({ admin_end_oversight_assignment_v2: () => ({ ...deansRule, status: "ended", end_reason: "إعادة هيكلة" }) });
    render(<OversightWorkspace />);
    const card = await screen.findByRole("article", { name: /رئيس المجلس في كل/ });
    fireEvent.click(within(card).getByRole("button", { name: "إنهاء" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "إنهاء المتابعة" });
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText("اكتب السبب لتفعيل الإنهاء.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("سبب الإنهاء"), { target: { value: "إعادة هيكلة" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.some((call) => call.contract === "admin_end_oversight_assignment_v2")).toBe(true));
    expect(calls.find((call) => call.contract === "admin_end_oversight_assignment_v2")?.params).toEqual({
      p_assignment_id: deansRule.id, p_reason: "إعادة هيكلة", p_expected_version: 1,
    });
  });
});
