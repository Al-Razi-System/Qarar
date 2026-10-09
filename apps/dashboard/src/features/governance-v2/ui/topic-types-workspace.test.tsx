import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopicTypesWorkspace } from "./topic-types-workspace";
const options = { classifications: [], workflow_versions: [{ id: "layout-1", code: "layout", name_ar: "ترتيب مشترك", layout_only: true, version_no: 1, steps: [{ id: "s1-id", step_key: "s1", name_ar: "مجلس القسم", sequence_no: 1 }, { id: "s2-id", step_key: "s2", name_ar: "مجلس الجامعة", sequence_no: 2 }] }] };
function fetcher() {
  return vi.fn().mockImplementation(async (_url, init) => ({ ok: true, json: async () => ({ data: init?.method === "POST" ? { bundle_id: "bundle-1", reference_numbers: { topic_type: "TYP-2026-000001" } } : { ...options, councils: [{ id: "council-1", name_ar: "مجلس القسم التجريبي" }], source_items: [{ id: "item-1", name_ar: "اختصاص مراجعة البرامج", document_name: "اللائحة الأكاديمية" }] } }) }));
}
async function identify(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /إنشاء نوع موضوع/ }));
  await user.click(screen.getByRole("button", { name: "أكاديمي" }));
  await user.type(screen.getByPlaceholderText("مثال: اعتماد برنامج أكاديمي"), "اعتماد برنامج أكاديمي");
  await user.click(screen.getByRole("button", { name: /^التالي/ }));
}
describe("TopicTypesWorkspace", () => {
  beforeEach(() => { vi.stubGlobal("fetch", fetcher()); });
  it("edits the existing draft with its lock instead of creating a duplicate", async () => {
    const mock = fetcher();
    const base = mock.getMockImplementation()!;
    mock.mockImplementation(async (url, init) => {
      if (String(url).includes("view=types")) return { ok: true, json: async () => ({ data: { items: [{ bundle_id: "b1", name_ar: "خطة الاختبارات", classification_name: "أكاديمي", status: "draft", can_edit: true }], total: 1 } }) };
      if (String(url).includes("bundleId")) return { ok: true, json: async () => ({ data: {
        bundle: { id: "b1", lock_version: 3 }, classification: { code: "academic", name_ar: "أكاديمي" },
        topic_type: { name_ar: "خطة الاختبارات" }, version: { acceptance_finality: "advance", rejection_finality: "complete" },
        workflow_binding: { source_layout_version_id: "layout-1", stage_policies: [{ step_key: "s1", kind: "approval", approved: "advance", rejected: "complete" }, { step_key: "s2", kind: "approval", approved: "complete", rejected: "complete" }] },
        authoring: { scope_kind: "route", source_items: [], required_attachment_count: 1, submission_instructions: "أرفق الخطة", discussion_instructions: "ناقش المبررات" }, schedule: { rule_type: "none" }, authorities: [],
      } }) };
      return base(url, init);
    });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup(); render(<TopicTypesWorkspace/>);
    await user.click(await screen.findByRole("button", { name: "عرض خطة الاختبارات" }));
    await user.click(await screen.findByRole("button", { name: "تعديل التصنيف" }));
    expect(screen.getByPlaceholderText("مثال: اعتماد برنامج أكاديمي")).toHaveValue("خطة الاختبارات");
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await screen.findByRole("button", { name: /ترتيب مشترك/ });
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    expect(screen.getByLabelText("الحد الأدنى للمرفقات")).toHaveValue(1);
    await user.click(screen.getByText("التعليمات", { exact: false, selector: "summary" }));
    expect(await screen.findByRole("textbox", { name: "تعليمات التقديم" })).toHaveTextContent("أرفق الخطة");
    expect(await screen.findByRole("textbox", { name: "تعليمات المناقشة" })).toHaveTextContent("ناقش المبررات");
    await user.click(screen.getAllByRole("tab", { name: "Markdown" })[0]);
    await user.clear(screen.getByLabelText("مصدر Markdown — تعليمات التقديم"));
    await user.type(screen.getByLabelText("مصدر Markdown — تعليمات التقديم"), "قدّم خطة البرنامج كاملة");
    await user.clear(screen.getByLabelText("الحد الأدنى للمرفقات"));
    expect(screen.getByRole("button", { name: "حفظ التعديلات" })).toBeDisabled();
    await user.type(screen.getByLabelText("الحد الأدنى للمرفقات"), "2");
    await user.click(screen.getByRole("button", { name: "حفظ التعديلات" }));
    expect(await screen.findByText(/حُفظت المسودة كاملة/)).toBeInTheDocument();
    const body = JSON.parse(mock.mock.calls.find(call => call[1]?.method === "POST")![1].body);
    expect(body).toMatchObject({ bundleId: "b1", expectedLockVersion: 3, bundle: { authoring: { required_attachment_count: 2, submission_instructions: "qarar:markdown:v1\nقدّم خطة البرنامج كاملة", discussion_instructions: "ناقش المبررات" } } });
  });
  it("has no manual code or fabricated statistics and uses the correct navigation label", async () => {
    render(<TopicTypesWorkspace />);
    expect(screen.getByRole("heading", { name: "تصنيفات الموضوعات" })).toBeInTheDocument();
    expect(screen.queryByText("أنواع فعالة")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تصنيفات الموضوعات" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: /إنشاء نوع موضوع/ }));
    expect(screen.queryByPlaceholderText("academic.program")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/الرمز الداخلي/)).not.toBeInTheDocument();
    expect(screen.queryByText("المرجع والرمز تلقائيان")).not.toBeInTheDocument();
    expect(screen.getByLabelText("نطاق إتاحة التصنيف")).toBeInTheDocument();
  });
  it("saves independent policies without sending a client-generated identity", async () => {
    const mock = fetcher(); vi.stubGlobal("fetch", mock);
    const user = userEvent.setup(); render(<TopicTypesWorkspace />);
    await identify(user);
    await user.click(await screen.findByRole("button", { name: /ترتيب مشترك/ }));
    await user.selectOptions(screen.getByLabelText("عمل المجلس للمرحلة 1"), "approval");
    await user.selectOptions(screen.getByLabelText("قبول الموضوع في المرحلة 1"), "complete");
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /حفظ المسودة/ }));
    expect(await screen.findByText(/حُفظت المسودة كاملة بنجاح/)).toBeInTheDocument();
    const body = JSON.parse(mock.mock.calls.find(call => call[1]?.method === "POST")![1].body);
    expect(body.bundle.topic_type).toEqual({ name_ar: "اعتماد برنامج أكاديمي" });
    expect(body.bundle.workflow).toMatchObject({ workflow_template_version_id: "layout-1", stage_policies: [{ step_key: "s1", kind: "approval", approved: "complete", rejected: "complete" }, { step_key: "s2", approved: "complete" }] });
    expect(screen.getByRole("status")).toHaveTextContent("TYP-2026-000001");
    expect(screen.getByRole("button", { name: "تم الحفظ" })).toBeDisabled();
  });
  it("validates only the visible identity fields", async () => {
    const user = userEvent.setup(); render(<TopicTypesWorkspace />);
    await user.click(screen.getByRole("button", { name: /إنشاء نوع موضوع/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    expect(screen.getByText(/اختر تصنيف الموضوع/)).toBeInTheDocument();
    expect(screen.getByText(/اكتب اسماً واضحاً/)).toBeInTheDocument();
    expect(screen.queryByText(/استخدم رمزاً إنجليزياً/)).not.toBeInTheDocument();
  });
  it("saves scope, shared sources, attachment minimum and bounded recurrence together", async () => {
    const mock = fetcher(); vi.stubGlobal("fetch", mock);
    const user = userEvent.setup(); render(<TopicTypesWorkspace />);
    await identify(user);
    await user.click(screen.getByRole("button", { name: /السابق/ }));
    await user.selectOptions(screen.getByLabelText("نطاق إتاحة التصنيف"), "councils");
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/اختر/);
    await user.click(screen.getByRole("checkbox", { name: "مجلس القسم التجريبي" }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(await screen.findByRole("button", { name: /ترتيب مشترك/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("checkbox", { name: /اختصاص مراجعة البرامج/ }));
    await user.click(screen.getByRole("checkbox", { name: /يتطلب مرفقات/ }));
    await user.clear(screen.getByLabelText("الحد الأدنى للمرفقات"));
    await user.type(screen.getByLabelText("الحد الأدنى للمرفقات"), "2");
    expect(screen.queryByRole("checkbox", { name: /يضاف مباشرة/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("توقيت الموضوع"), "monthly_week");
    await user.click(screen.getByRole("checkbox", { name: /يضاف مباشرة/ }));
    expect(screen.queryByText(/لم يُنفّذ بعد/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("توقيت الموضوع"), "none");
    expect(screen.queryByRole("checkbox", { name: /يضاف مباشرة/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("توقيت الموضوع"), "monthly_week");
    expect(screen.getByRole("checkbox", { name: /يضاف مباشرة/ })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /يضاف مباشرة/ }));
    await user.selectOptions(screen.getByLabelText("الأسبوع الشهري"), "2");
    await user.type(screen.getByLabelText("بداية الدورية"), "2026-10-01");
    await user.type(screen.getByLabelText(/نهاية الدورية/), "2026-12-31");
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /حفظ المسودة/ }));
    expect(await screen.findByText(/حُفظت المسودة كاملة بنجاح/)).toBeInTheDocument();
    const body = JSON.parse(mock.mock.calls.find(call => call[1]?.method === "POST")![1].body);
    expect(body.bundle.authoring).toEqual({ scope_kind: "councils", scope_ids: ["council-1"], source_item_ids: ["item-1"], required_attachment_count: 2, submission_mode: "automatic_agenda", submission_instructions: "", discussion_instructions: "" });
    expect(body.bundle.schedule).toMatchObject({ rule_type: "monthly_week", rule_config: { week: 2, starts_on: "2026-10-01", ends_on: "2026-12-31" } });
  });
  it("keeps the draft and request key after a failed save", async () => {
    const mock = fetcher(); vi.stubGlobal("fetch", mock);
    const user = userEvent.setup(); render(<TopicTypesWorkspace />);
    await identify(user);
    await user.click(await screen.findByRole("button", { name: /ترتيب مشترك/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    mock.mockResolvedValue({ ok: false, json: async () => ({ error: { message: "تعذر الحفظ مؤقتًا" } }) });
    await user.click(screen.getByRole("button", { name: /حفظ المسودة/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الحفظ مؤقتًا");
    await user.click(screen.getByRole("button", { name: /حفظ المسودة/ }));
    const commands = mock.mock.calls.filter(call => call[1]?.method === "POST").map(call => JSON.parse(call[1].body));
    expect(commands[0].clientRequestId).toBe(commands[1].clientRequestId);
    expect(commands[1].bundle.topic_type).toEqual({ name_ar: "اعتماد برنامج أكاديمي" });
  });
  it("uses four compact steps and exposes the selected councils", async () => {
    const user = userEvent.setup(); render(<TopicTypesWorkspace />);
    await identify(user);
    expect(screen.getByText("الخطوة 2 من 4 · مسار الحوكمة")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "خطوات إعداد نوع الموضوع" });
    expect(nav.querySelectorAll("li")).toHaveLength(4);
    await user.click(await screen.findByRole("button", { name: /ترتيب مشترك/ }));
    expect(screen.getByLabelText("معاينة مسار الحوكمة")).toHaveTextContent("مجلس القسم");
    expect(screen.getByLabelText("معاينة مسار الحوكمة")).toHaveTextContent("مجلس الجامعة");
  });
});
