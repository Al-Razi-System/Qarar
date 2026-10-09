import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OrganizationalUnitDialog, OrganizationalUnitsWorkspace } from "./organizational-units-workspace";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../api/councils-client", () => ({ councilRpc: rpc }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const options = { types: [{ id: "type-1", name_ar: "كلية" }], parents: [] };
const data = { ...options, items: [], total: 21, limit: 20, offset: 0 };
const unit = { id: "unit-1", name_ar: "كلية العلوم", code: "college", reference_number: "ORU-2026-000001", parent_unit_id: null, unit_type_id: "type-1", type_name_ar: "كلية", parent_name_ar: null, status: "active" as const, updated_at: "2026-10-07T00:00:00Z" };
it("edits a unit without changing identity and keeps failures inside the edit dialog", async () => {
  rpc.mockRejectedValue(new Error("تم تعديل الوحدة؛ حدّث القائمة"));
  render(<OrganizationalUnitsWorkspace initialData={{ ...data, items: [unit] }} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "تعديل" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("اسم الوحدة"), { target: { value: "كلية الحاسوب" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعديلات" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("تم تعديل الوحدة");
  expect(within(dialog).getByLabelText("اسم الوحدة")).toHaveValue("كلية الحاسوب");
  expect(rpc).toHaveBeenCalledWith("admin_update_organizational_unit_v2", expect.objectContaining({ p_unit_id: unit.id, p_expected_updated_at: unit.updated_at, p_name_ar: "كلية الحاسوب" }));
});
it("confirms logical deletion and displays rejection at its action", async () => {
  rpc.mockRejectedValue(new Error("عالج الوحدات الفرعية النشطة أولًا"));
  render(<OrganizationalUnitsWorkspace initialData={{ ...data, items: [unit] }} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "حذف" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/السجل والعلاقات/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحذف المنطقي" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("الوحدات الفرعية");
  expect(rpc).toHaveBeenCalledWith("admin_update_organizational_unit_v2", expect.objectContaining({ p_status: "archived", p_unit_id: unit.id }));
});
it("hides lifecycle mutations for a read-only actor", () => {
  render(<OrganizationalUnitsWorkspace initialData={{ ...data, items: [unit] }} canManage={false} />);
  expect(screen.queryByRole("button", { name: "تعديل" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "حذف" })).not.toBeInTheDocument();
});
it("creates a type inside the unit dialog and selects it without losing unit inputs", async () => {
  rpc.mockResolvedValue({ id: "new-type", name_ar: "قسم" });
  render(<OrganizationalUnitsWorkspace initialData={{ ...data, parents: [{ id: "parent-1", name_ar: "كلية الحاسوب" }] }} canManage canManageTypes />);
  fireEvent.click(screen.getByRole("button", { name: "إضافة وحدة" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(screen.getByLabelText("اسم الوحدة"), { target: { value: "قسم الحاسوب" } });
  fireEvent.change(screen.getByLabelText(/^الجهة التابعة لها/), { target: { value: "parent-1" } });
  expect(within(dialog).queryByRole("button", { name: "إضافة نوع وحدة" })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("option", { name: "＋ إضافة نوع جديد…" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("نوع الوحدة"), { target: { value: "__add_type__" } });
  fireEvent.change(within(dialog).getByLabelText("اسم النوع الجديد"), { target: { value: "قسم" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "حفظ النوع" }));
  await waitFor(() => expect(screen.getByLabelText("نوع الوحدة")).toHaveValue("new-type"));
  expect(screen.getByLabelText("اسم الوحدة")).toHaveValue("قسم الحاسوب");
  expect(screen.getByLabelText(/^الجهة التابعة لها/)).toHaveValue("parent-1");
  expect(dialog.querySelectorAll("form")).toHaveLength(1);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("keeps type failure at its editor and blocks unit submission while type creation is pending", async () => {
  let reject!: (error: Error) => void;
  rpc.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  render(<OrganizationalUnitsWorkspace initialData={data} canManage canManageTypes />);
  fireEvent.click(screen.getByRole("button", { name: "إضافة وحدة" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(screen.getByLabelText("نوع الوحدة"), { target: { value: "__add_type__" } });
  const input = within(dialog).getByLabelText("اسم النوع الجديد");
  fireEvent.change(input, { target: { value: "قسم" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(within(dialog).getByRole("button", { name: "إضافة الوحدة" })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "إغلاق" })).toBeDisabled();
  reject(new Error("تعذر حفظ النوع"));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("تعذر حفظ النوع");
  expect(input).toHaveValue("قسم");
  expect(rpc.mock.calls[0][0]).toBe("admin_create_organizational_unit_type_v2");
});
it("does not offer inline type creation without type management authority", () => {
  render(<OrganizationalUnitsWorkspace initialData={data} canManage canManageTypes={false} />);
  fireEvent.click(screen.getByRole("button", { name: "إضافة وحدة" }));
  expect(within(screen.getByRole("dialog")).queryByRole("option", { name: "＋ إضافة نوع جديد…" })).not.toBeInTheDocument();
});
it("allows a type manager to start setup with no preconfigured types", () => {
  render(<OrganizationalUnitsWorkspace initialData={{ ...data, types: [] }} canManage canManageTypes />);
  fireEvent.click(screen.getByRole("button", { name: "إضافة وحدة" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("option", { name: "＋ إضافة نوع جديد…" })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "إضافة الوحدة" })).toBeDisabled();
});
it("keeps the previous type when the create option is cancelled and never treats it as an ID", () => {
  render(<OrganizationalUnitDialog options={options} canManageTypes onClose={vi.fn()} onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("نوع الوحدة"), { target: { value: "type-1" } });
  fireEvent.change(screen.getByLabelText("نوع الوحدة"), { target: { value: "__add_type__" } });
  fireEvent.click(screen.getByRole("button", { name: "إلغاء إضافة النوع" }));
  expect(screen.getByLabelText("نوع الوحدة")).toHaveValue("type-1");
  expect(rpc).not.toHaveBeenCalled();
});
it("does not expose creation to a read-only actor", () => {
  render(<OrganizationalUnitsWorkspace initialData={data} canManage={false} />);
  expect(screen.queryByRole("button", { name: "إضافة وحدة" })).not.toBeInTheDocument();
});
it("loads the next page and displays non-JSON failures at the list", async () => {
  rpc.mockRejectedValue(new Error("تعذر تحميل الوحدات"));
  render(<OrganizationalUnitsWorkspace initialData={data} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "التالي" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل الوحدات");
  expect(rpc).toHaveBeenCalledWith("admin_list_organizational_units_v2", { p_query: null, p_limit: 20, p_offset: 20 });
});
it("does not show a standalone type form outside the unit dialog", () => {
  render(<OrganizationalUnitsWorkspace initialData={data} canManage canManageTypes />);
  expect(screen.queryByRole("button", { name: /نوع الوحدة غير موجود/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("اسم نوع الوحدة")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "إضافة وحدة" })).toBeEnabled();
});
it("keeps inputs and displays failures inside the dialog", async () => {
  rpc.mockRejectedValue(new Error("هذه الوحدة موجودة بالفعل"));
  render(<OrganizationalUnitDialog options={options} onClose={vi.fn()} onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("اسم الوحدة"), { target: { value: "كلية العلوم" } });
  fireEvent.change(screen.getByLabelText("نوع الوحدة"), { target: { value: "type-1" } });
  fireEvent.click(screen.getByRole("button", { name: "إضافة الوحدة" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("هذه الوحدة موجودة بالفعل");
  expect(screen.getByLabelText("اسم الوحدة")).toHaveValue("كلية العلوم");
  expect(screen.queryByLabelText(/معرف|رمز الوحدة/)).not.toBeInTheDocument();
});
it("prevents duplicate submission and reuses request identity on retry", async () => {
  let reject!: (reason: Error) => void;
  rpc.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const created = vi.fn();
  render(<OrganizationalUnitDialog options={options} onClose={vi.fn()} onCreated={created} />);
  fireEvent.change(screen.getByLabelText("اسم الوحدة"), { target: { value: "كلية العلوم" } });
  fireEvent.change(screen.getByLabelText("نوع الوحدة"), { target: { value: "type-1" } });
  fireEvent.click(screen.getByRole("button", { name: "إضافة الوحدة" }));
  expect(screen.getByRole("button", { name: "جارٍ الحفظ…" })).toBeDisabled();
  expect(rpc).toHaveBeenCalledTimes(1);
  reject(new Error("تعذر الاتصال"));
  await screen.findByRole("alert");
  rpc.mockResolvedValue({ id: "unit-1", reference_number: "ORU-2026-000001" });
  fireEvent.click(screen.getByRole("button", { name: "إضافة الوحدة" }));
  await waitFor(() => expect(created).toHaveBeenCalled());
  expect(rpc.mock.calls[0][1].p_client_request_id).toBe(rpc.mock.calls[1][1].p_client_request_id);
});
