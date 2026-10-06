import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CouncilFormDialog } from "./council-form-dialog";

const options = {
  council_types: [{ id: "type-1", code: "college", name_ar: "مجلس كلية" }],
  parent_units: [{ id: "scope-1", code: "science", name_ar: "كلية العلوم" }],
  governance_classes: [],
  leadership_roles: [],
  meeting_types: [{ id: "meeting-type-1", code: "regular", name_ar: "اجتماع دوري" }],
};

afterEach(cleanup);

describe("CouncilFormDialog", () => {
  it("يعرض الحقول الأساسية فقط ولا يطلب معرفاً من المستخدم", () => {
    render(<CouncilFormDialog options={options} onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("اسم المجلس")).toBeVisible();
    expect(screen.getByLabelText("نوع المجلس")).toBeVisible();
    expect(screen.getByLabelText(/^النطاق التنظيمي/)).toBeVisible();
    expect(screen.queryByLabelText("رمز المجلس")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^مهلة اعتبار الموعد فائتاً بالأيام/)).not.toBeInTheDocument();
  });

  it("يكشف خطة الاجتماعات والإعدادات المتقدمة عند طلبهما فقط", async () => {
    const user = userEvent.setup();
    render(<CouncilFormDialog options={options} onClose={vi.fn()} onSubmit={vi.fn()} />);

    await user.click(screen.getByLabelText(/^إنشاء خطة اجتماعات لهذا المجلس/));
    expect(screen.getByLabelText("الدورية")).toBeVisible();
    expect(screen.getByLabelText("موعد أول اجتماع")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /^الإعدادات المتقدمة/ }));
    expect(screen.getByLabelText(/^مهلة اعتبار الموعد فائتاً بالأيام/)).toHaveValue(7);
  });

  it("يمنع إنشاء خطة لا يملك النظام نوع اجتماع فعالاً لها ويشرح السبب بجوار الخيار", () => {
    render(<CouncilFormDialog options={{ ...options, meeting_types: [] }} onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/^إنشاء خطة اجتماعات لهذا المجلس/)).toBeDisabled();
    expect(screen.getByText("أضف نوع اجتماع فعالاً أولاً حتى تتمكن من إنشاء الخطة.")).toBeVisible();
  });
});
