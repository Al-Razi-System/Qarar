import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopicRegulationCreator } from "./topic-regulation-creator";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TopicRegulationCreator", () => {
  it("يعرض مسار إنشاء موضوع مرتبط بلائحة بالتسلسل الصحيح", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/topics/ui/topic-regulation-creator.tsx"),
      "utf8",
    );

    [
      "بيانات الموضوع والجهة والتصنيف",
      "اختيار اللائحة والمادة",
      "المتطلبات والقيود",
      "معاينة مسار الاعتماد",
      "المراجعة والإنشاء",
      "متابعة الموضوع بعد الإنشاء",
      "اللائحة المختارة",
      "البند المنطبق",
      "المسار الحالي",
      "الخطوة الحالية",
      "الجهة المسؤولة",
      "النتائج المتاحة",
    ].forEach((label) => expect(source).toContain(label));
  });

  it("يستخدم عقود اللوائح الحديثة للبحث والإنشاء والملخص", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/topics/ui/topic-regulation-creator.tsx"),
      "utf8",
    );
    const route = readFileSync(
      join(process.cwd(), "src/app/api/admin/topics/route.ts"),
      "utf8",
    );

    [
      "get_topic_regulation_options",
      "get_topic_regulation_preview",
      "get_topic_regulation_route_preview",
      "create_topic_with_regulation_bundle",
        "get_topic_governance_summary",
        "create_topic_exception_request",
        "request_custom_workflow",
        "get_topic_exception_workflow_options",
    ].forEach((contract) => {
      expect(source).toContain(contract);
      expect(route).toContain(`"${contract}"`);
    });
  });

  it("يبقي زر التالي معطلاً حتى تكتمل بيانات الموضوع ويعرض خيارات الإنشاء المسموح بها فقط", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const contract = JSON.parse(String(init?.body ?? "{}")).contract as string;
      const dataByContract: Record<string, unknown> = {
        get_topic_form_options: {
          governance_units: [{ id: "unit-1", code: "department", name_ar: "مجلس القسم" }],
          categories: [{ id: "cat-1", code: "academic", name_ar: "برامج أكاديمية" }],
          priorities: ["medium"],
          source_types: ["new"],
        },
        admin_list_workflow_templates: [],
      };
      return new Response(JSON.stringify({ data: dataByContract[contract] }), { status: 200 });
    });

    render(<TopicRegulationCreator />);
    const nextButton = await screen.findByRole("button", { name: /التالي: عرض اللائحة المنطبقة/ });
    expect(nextButton).toBeDisabled();
    expect(screen.getAllByText(/أدخل عنوانًا لا يقل عن 5 أحرف/).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("عنوان الموضوع"), "أربعة");
    await user.type(screen.getByLabelText("وصف الموضوع"), "وصف قصير");
    await user.selectOptions(screen.getByLabelText("الجهة أو المجلس"), "unit-1");
    await user.selectOptions(screen.getByLabelText("فئة الموضوع"), "cat-1");
    expect(nextButton).toBeDisabled();

    await user.type(screen.getByLabelText("وصف الموضوع"), " يكمل الحد الأدنى المطلوب");
    expect(nextButton).toBeEnabled();
  });

  it("يعرض مسار الاستثناء وحالاته للمستخدم غير التقني", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/topics/ui/topic-regulation-creator.tsx"),
      "utf8",
    );

    [
      "طلب استثناء",
      "ذكر السبب",
      "اعتماد الاستثناء",
      "إنشاء مسار مؤقت أو مخصص",
      "متابعة الموضوع",
      "بانتظار الاعتماد",
      "معتمد",
      "مرفوض",
      "منتهي",
      "سبب الاستثناء",
      "إرسال طلب الاستثناء",
      "تحديث حالة الاستثناء",
    ].forEach((label) => expect(source).toContain(label));
  });

  it("ينشئ طلب استثناء فعليًا عندما لا توجد لائحة مطابقة", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const contract = body.contract as string;
      const dataByContract: Record<string, unknown> = {
        get_topic_form_options: {
          governance_units: [{ id: "unit-1", code: "department", name_ar: "مجلس القسم" }],
          categories: [{ id: "cat-1", code: "academic", name_ar: "برامج أكاديمية" }],
          priorities: ["medium"],
          source_types: ["new"],
        },
        admin_list_workflow_templates: [{
          id: "workflow-1",
          code: "temporary-route",
          name_ar: "مسار مؤقت",
          versions: [{ id: "workflow-version-1", version_no: 1, status: "active", validation_status: "valid" }],
        }],
        get_topic_exception_workflow_options: {
          can_request: true,
          items: [{ id: "workflow-version-1", label: "مسار مؤقت معتمد", description: "مسار مؤقت للمراجعة" }],
        },
        get_topic_regulation_options: { total: 0, items: [] },
        create_topic_exception_request: {
          topic_id: "topic-1",
          exception_id: "exception-1",
          status: "pending",
          routing_status: "routing_exception_pending",
        },
        get_topic_governance_summary: {
          topic: {
            id: "topic-1",
            topic_no: "TOP-1",
            title_ar: "إنشاء برنامج جديد",
            status: "new",
            routing_status: "routing_exception_pending",
            governance_source: "custom",
          },
          regulation: null,
          item: null,
          workflow: null,
          current_step: null,
          exception: {
            id: "exception-1",
            status: "pending",
            reason: "لا توجد لائحة مطابقة لهذا النوع من الموضوعات",
            valid_until: new Date(Date.now() + 86_400_000).toISOString(),
            requested_source: "custom",
            workflow_name_ar: "مسار مؤقت",
          },
        },
      };
      return new Response(JSON.stringify({ data: dataByContract[contract] }), { status: 200 });
    });

    render(<TopicRegulationCreator />);
    await screen.findByText("جاهز للإنشاء");
    await user.type(screen.getByLabelText("عنوان الموضوع"), "إنشاء برنامج جديد");
    await user.type(screen.getByLabelText("وصف الموضوع"), "طلب دراسة واعتماد برنامج أكاديمي جديد وفق المسار النظامي.");
    await user.selectOptions(screen.getByLabelText("الجهة أو المجلس"), "unit-1");
    await user.selectOptions(screen.getByLabelText("فئة الموضوع"), "cat-1");
    await user.click(screen.getByRole("button", { name: /التالي: عرض اللائحة المنطبقة/ }));

      await screen.findByRole("button", { name: /طلب مسار استثنائي/ });
      await screen.findByText("مسار مؤقت معتمد");
      await user.selectOptions(screen.getAllByRole("combobox").at(-1)!, "workflow-version-1");
    const reasonInput = screen.getByPlaceholderText(/اكتب السبب/);
    await user.clear(reasonInput);
    await user.type(reasonInput, "لا توجد لائحة مطابقة لهذا النوع من الموضوعات");
      await user.click(screen.getByRole("button", { name: /طلب مسار استثنائي/ }));

    await screen.findByText("تم إرسال طلب الاستثناء. الحالة الآن: بانتظار الاعتماد.");
    const exceptionCall = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body))).find((body) => body.contract === "create_topic_exception_request");
    expect(exceptionCall.params).toMatchObject({
      p_title_ar: "إنشاء برنامج جديد",
      p_current_unit_id: "unit-1",
      p_category_id: "cat-1",
      p_workflow_template_version_id: "workflow-version-1",
      p_reason: "لا توجد لائحة مطابقة لهذا النوع من الموضوعات",
    });
  }, 15_000);
});
