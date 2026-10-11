import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("../api/councils-client", () => ({ councilRpc: vi.fn() }));
import { councilRpc } from "../api/councils-client";

afterEach(cleanup);

describe("CouncilFormDialog", () => {
  it("يحفظ الأسبوع الشهري وشهر البداية دون افتراض يوم انعقاد", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CouncilFormDialog mode="edit" options={options} onClose={vi.fn()} onSubmit={submit} />);
    await user.type(screen.getByLabelText("اسم المجلس"), "مجلس الكلية");
    await user.selectOptions(screen.getByLabelText("نوع المجلس"), "type-1");
    await user.click(screen.getByLabelText(/^إنشاء خطة اجتماعات/));
    await user.selectOptions(screen.getByLabelText(/^موعد الاجتماع الشهري/), "2");
    expect(screen.queryByLabelText("موعد أول اجتماع")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("شهر البداية"), { target: { value: "2026-11" } });
    await user.click(screen.getByRole("button", { name: "حفظ التعديلات" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ monthlyWeek: 2, firstMeetingDate: "2026-11-01", createMeetingPlan: true }));
    expect(screen.queryByLabelText("وقت البداية")).not.toBeInTheDocument();
  });
  it("يشرح منع إنشاء الخطة لمن لا يملك الصلاحية المؤسسية", () => {
    render(<CouncilFormDialog mode="edit" canCreateMeetingPlan={false} options={options} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/^إنشاء خطة اجتماعات/)).toBeDisabled();
    expect(screen.getByText("إنشاء خطة الاجتماع يتطلب صلاحية إدارة المجالس على مستوى المؤسسة.")).toBeVisible();
  });
  it("يعرض الخطة المحفوظة دون تقديم إنشاء خطة ثانية", () => {
    render(<CouncilFormDialog mode="edit" options={options} existingPlan={{id:"plan-1",recurrence:"monthly",first_meeting_date:"2026-11-01",ends_on:null,meeting_type_name_ar:"اجتماع دوري"}} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText("موعد أول اجتماع: 2026-11-01")).toBeVisible();
    expect(screen.queryByLabelText(/^إنشاء خطة اجتماعات/)).not.toBeInTheDocument();
  });
  it("يتيح إضافة خطة عند تعديل مجلس موجود", async () => {
    render(<CouncilFormDialog mode="edit" options={options} onClose={vi.fn()} onSubmit={vi.fn()} />);
    await userEvent.setup().click(screen.getByLabelText(/^إنشاء خطة اجتماعات لهذا المجلس/));
    expect(screen.getByLabelText("موعد أول اجتماع")).toBeVisible();
  });
  it("keeps rejection beside the save action and retains inputs", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("تعذر إنشاء خطة المجلس"));
    render(<CouncilFormDialog options={options} onClose={vi.fn()} onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText("اسم المجلس"), { target: { value: "مجلس العلوم" } });
    fireEvent.change(screen.getByLabelText("نوع المجلس"), { target: { value: "type-1" } });
    fireEvent.submit(screen.getByRole("button", { name: "إنشاء المجلس" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر إنشاء خطة المجلس");
    expect(screen.getByRole("alert").closest("footer")).not.toBeNull();
    expect(screen.getByLabelText("اسم المجلس")).toHaveValue("مجلس العلوم");
  });
  it("يربط المجلس بمعرف الوحدة المختارة دون طلب نطاق منفصل", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CouncilFormDialog options={{ ...options, scope_units: [{ id: "unit-ai", code: "unit_ai", name_ar: "قسم الذكاء الاصطناعي" }] }} onClose={vi.fn()} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("اسم المجلس"), "مجلس قسم الذكاء الاصطناعي");
    await user.selectOptions(screen.getByLabelText("نوع المجلس"), "type-1");
    await user.selectOptions(screen.getByLabelText(/^الوحدة التنظيمية/), "unit-ai");
    expect(screen.queryByLabelText(/^النطاق التنظيمي/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "إنشاء المجلس" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ scopeUnitId: "unit-ai" }));
  });
  it("يحدّث الاعتماديات دون فقد مدخلات المجلس", async () => {
    vi.mocked(councilRpc).mockResolvedValue({ ...options, scope_units: [{ id: "scope-new", code: "new", name_ar: "كلية جديدة" }] });
    const user = userEvent.setup();
    render(<CouncilFormDialog options={options} onClose={vi.fn()} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText("اسم المجلس"), "مجلس العلوم");
    await user.click(screen.getByRole("button", { name: "تحديث القوائم بعد الإضافة" }));
    expect(await screen.findByRole("status")).toHaveTextContent("تم تحديث القوائم");
    expect(screen.getByLabelText("اسم المجلس")).toHaveValue("مجلس العلوم");
    expect(screen.getByRole("option", { name: "كلية جديدة" })).toBeInTheDocument();
  });
  it("يعرض الحقول الأساسية فقط ولا يطلب معرفاً من المستخدم", () => {
    render(<CouncilFormDialog options={options} onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("اسم المجلس")).toBeVisible();
    expect(screen.getByLabelText("نوع المجلس")).toBeVisible();
    expect(screen.getByLabelText(/^الوحدة التنظيمية/)).toBeVisible();
    expect(screen.queryByLabelText(/^المجلس الأب/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "إدارة الوحدات التنظيمية" })).toHaveAttribute("href", "/admin/organizational-units");
    expect(screen.queryByLabelText("رمز المجلس")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^مهلة اعتبار الموعد فائتاً بالأيام/)).not.toBeInTheDocument();
  });

  it("يكشف خطة الاجتماعات والإعدادات المتقدمة عند طلبهما فقط", async () => {
    const user = userEvent.setup();
    render(<CouncilFormDialog options={options} onClose={vi.fn()} onSubmit={vi.fn()} />);

    await user.click(screen.getByLabelText(/^إنشاء خطة اجتماعات لهذا المجلس/));
    expect(screen.getByLabelText("الدورية")).toBeVisible();
    expect(screen.getByLabelText("موعد أول اجتماع")).toBeVisible();
    expect(screen.queryByLabelText("وقت البداية")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("وقت النهاية")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^الإعدادات المتقدمة/ }));
    expect(screen.getByLabelText(/^مهلة اعتبار الموعد فائتاً بالأيام/)).toHaveValue(7);
  });

  it("يمنع إنشاء خطة لا يملك النظام نوع اجتماع فعالاً لها ويشرح السبب بجوار الخيار", () => {
    render(<CouncilFormDialog options={{ ...options, meeting_types: [] }} onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/^إنشاء خطة اجتماعات لهذا المجلس/)).toBeDisabled();
    expect(screen.getByText("أضف نوع اجتماع فعالاً أولاً حتى تتمكن من إنشاء الخطة.")).toBeVisible();
    expect(screen.getByRole("link", { name: "إعداد أنواع الاجتماعات" })).toHaveAttribute("href", "/admin/settings/meeting-types");
  });
});
