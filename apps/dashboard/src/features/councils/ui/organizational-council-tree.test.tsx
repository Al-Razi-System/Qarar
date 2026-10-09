import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationalCouncilTree } from "./organizational-council-tree";
import type { CouncilHierarchyData } from "../model/types";

const data: CouncilHierarchyData = {
  units: [
    { id: "root", parent_unit_id: null, name_ar: "رئاسة الجامعة", code: "root", status: "active", type_name_ar: "جامعة" },
    { id: "faculty", parent_unit_id: "root", name_ar: "كلية الحاسوب", code: "faculty", status: "active", type_name_ar: "كلية" },
    { id: "dept", parent_unit_id: "faculty", name_ar: "قسم الذكاء الاصطناعي", code: "dept", status: "active", type_name_ar: "قسم" },
    { id: "empty", parent_unit_id: "root", name_ar: "عمادة شؤون الطلاب", code: "empty", status: "inactive", type_name_ar: "عمادة" },
  ],
  councils: ["one", "two", "institution"].map((id) => ({ id, name_ar: id === "institution" ? "مجلس الأمناء" : `مجلس ${id}`, code: id, scope_unit_id: id === "institution" ? null : "dept", status: "inactive", level_no: 1, unit_type_id: "type", minimum_active_members: 3, allow_dual_leadership: false, updated_at: "2026-10-07" })),
};
afterEach(cleanup);
describe("OrganizationalCouncilTree", () => {
  it("يعرض أسلاف المجالس فقط ويخفي الوحدات الفارغة", () => {
    render(<OrganizationalCouncilTree data={data} onSelect={vi.fn()} />);
    const dept = screen.getByLabelText("وحدة قسم الذكاء الاصطناعي");
    expect(within(dept).getByRole("button", { name: "مجلس one" })).toBeVisible();
    expect(within(dept).getByRole("button", { name: "مجلس two" })).toBeVisible();
    expect(screen.queryByText("عمادة شؤون الطلاب")).not.toBeInTheDocument();
    expect(screen.getByText("رئاسة الجامعة")).toBeVisible();
    expect(within(screen.getByLabelText("على مستوى المؤسسة")).getByRole("button", { name: "مجلس الأمناء" })).toBeVisible();
  });
  it("البحث يبقي سلسلة الوحدة ويفتح النتائج حتى بعد طيها", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OrganizationalCouncilTree data={data} onSelect={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "طي رئاسة الجامعة" }));
    expect(screen.queryByText("مجلس one")).not.toBeInTheDocument();
    rerender(<OrganizationalCouncilTree data={data} query="مجلس one" onSelect={vi.fn()} />);
    expect(screen.getByText("رئاسة الجامعة")).toBeVisible();
    expect(screen.getByText("كلية الحاسوب")).toBeVisible();
    expect(screen.getByText("مجلس one")).toBeVisible();
    expect(screen.queryByText("مجلس two")).not.toBeInTheDocument();
  });
  it("ينفذ الاختيار ويحافظ على حالة المجلس ويطبق فلترها", async () => {
    const select = vi.fn(); const user = userEvent.setup();
    const { rerender } = render(<OrganizationalCouncilTree data={data} selectedId="one" onSelect={select} />);
    expect(screen.getByRole("button", { name: "مجلس one" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "مجلس two" }));
    expect(select).toHaveBeenCalledWith("two");
    rerender(<OrganizationalCouncilTree data={data} status="active" onSelect={select} />);
    expect(screen.queryByText("مجلس one")).not.toBeInTheDocument();
    expect(screen.getByText("لا توجد مجالس مطابقة للحالة المختارة.")).toBeVisible();
  });
  it("لا يفقد المجالس عند ارتباط غير متاح أو دورة في بيانات الوحدات", () => {
    render(<OrganizationalCouncilTree data={{ ...data, units: [{ ...data.units[0], parent_unit_id: "root" }], councils: data.councils }} onSelect={vi.fn()} />);
    expect(screen.getByText("ارتباط يحتاج مراجعة")).toBeVisible();
    expect(screen.getByRole("button", { name: "مجلس one" })).toBeVisible();
    expect(screen.queryByText("رئاسة الجامعة")).not.toBeInTheDocument();
  });
  it("لا يظهر الوحدة الفارغة حتى عند البحث باسمها", () => {
    render(<OrganizationalCouncilTree data={data} query="عمادة شؤون الطلاب" onSelect={vi.fn()} />);
    expect(screen.queryByText("عمادة شؤون الطلاب")).not.toBeInTheDocument();
  });
});
