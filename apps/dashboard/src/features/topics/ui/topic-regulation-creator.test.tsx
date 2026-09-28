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
  it("يعرض رحلة إنشاء مبسطة ويفصل طرق الحوكمة بوضوح", () => {
    const creatorSource = readFileSync(
      join(process.cwd(), "src/features/topics/ui/topic-regulation-creator.tsx"),
      "utf8",
    );
    const progressSource = readFileSync(
      join(process.cwd(), "src/features/topics/ui/topic-creation-progress.tsx"),
      "utf8",
    );
    const methodSource = readFileSync(
      join(process.cwd(), "src/features/topics/ui/topic-governance-method-selector.tsx"),
      "utf8",
    );

    [
      "بيانات الموضوع",
      "الحوكمة والمسار",
      "المراجعة والإرسال",
      "المتابعة",
    ].forEach((label) => expect(progressSource).toContain(label));

    [
      "المسار اللائحي",
      "مسار مخصص",
      "استثناء لائحي",
      "كيف تريد أن يسير هذا الموضوع؟",
    ].forEach((label) => expect(methodSource).toContain(label));

    [
      "اللائحة المختارة",
      "البند المنطبق",
      "المسار الحالي",
      "الخطوة الحالية",
      "الجهة المسؤولة",
      "النتائج المتاحة",
    ].forEach((label) => expect(creatorSource).toContain(label));
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
      "get_topic_categories_for_unit",
      "get_topic_regulation_preview",
      "get_topic_regulation_route_preview",
      "create_topic_with_regulation_bundle",
      "get_topic_governance_summary",
      "get_topic_exception_workflow_options",
      "create_topic_custom_route_draft",
      "create_topic_governance_exception_request",
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
          priorities: ["medium"],
          source_types: ["new"],
        },
        get_topic_categories_for_unit: {
          governance_unit_id: "unit-1",
          effective_on: "2026-08-24",
          categories: [{ id: "cat-1", code: "academic", name_ar: "برامج أكاديمية", executable_item_count: 1 }],
        },
        admin_list_workflow_templates: { items: [] },
      };
      return new Response(JSON.stringify({ data: dataByContract[contract] }), { status: 200 });
    });

    render(<TopicRegulationCreator />);
    const nextButton = await screen.findByRole("button", { name: /التالي: عرض اللائحة المنطبقة/ });
    expect(nextButton).toBeDisabled();
    expect(screen.getAllByText(/أدخل عنوانًا لا يقل عن 5 أحرف/).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("عنوان الموضوع"), "أربعة");
    await user.type(screen.getByLabelText("وصف الموضوع"), "وصف قصير");
    await user.selectOptions(screen.getByLabelText("جهة تقديم الموضوع"), "unit-1");
    await screen.findByRole("option", { name: "برامج أكاديمية (1)" });
    await user.selectOptions(screen.getByLabelText("فئة الموضوع"), "cat-1");
    expect(nextButton).toBeDisabled();

    await user.type(screen.getByLabelText("وصف الموضوع"), " يكمل الحد الأدنى المطلوب");
    expect(nextButton).toBeEnabled();
  });

  it("يتيح المسار المخصص والاستثناء حتى عند وجود مسار لائحي جاهز", async () => {
    const user = userEvent.setup();
    const option = {
      selection: {
        policy_id: "policy-1",
        policy_version_id: "version-1",
        policy_item_id: "item-1",
        scope_assignment_id: "scope-1",
      },
      policy: { code: "REG-1", name_ar: "لائحة المجلس" },
      version: { number: 1, label: "الإصدار النافذ" },
      item: { code: "ART-1", title_ar: "المادة المنظمة للموضوع" },
      scope: { type: "governance_unit", priority: 1 },
      governance_mode: "strict_regulated",
      automation_status: "ready",
      routing_outcome: "workflow_started",
      can_start_workflow: true,
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const contract = JSON.parse(String(init?.body ?? "{}")).contract as string;
      const dataByContract: Record<string, unknown> = {
        get_topic_form_options: {
          governance_units: [{ id: "unit-1", code: "department", name_ar: "مجلس القسم" }],
          priorities: ["medium"],
          source_types: ["new"],
        },
        get_topic_categories_for_unit: {
          governance_unit_id: "unit-1",
          effective_on: "2026-08-24",
          categories: [{ id: "cat-1", code: "academic", name_ar: "برامج أكاديمية", executable_item_count: 1 }],
        },
        admin_list_workflow_templates: { items: [] },
        get_topic_regulation_options: { total: 1, items: [option] },
        get_topic_regulation_tree: { total: 0, items: [] },
        get_topic_regulation_preview: {
          article: { title: "المادة", official_text: "النص النظامي" },
          rule_summary: [],
          scope: { target_name: "مجلس القسم", description: "نطاق المجلس" },
          workflow: { name: "المسار المعتمد", description: "مسار اعتماد جاهز" },
          requirements: [],
          attachments: [],
          approval_effect: "اعتماد",
          voting_effect: "تصويت",
        },
        get_topic_exception_workflow_options: {
          can_request: true,
          items: [{ id: "workflow-version-1", label: "مسار مؤقت معتمد" }],
        },
      };
      return new Response(JSON.stringify({ data: dataByContract[contract] }), { status: 200 });
    });

    render(<TopicRegulationCreator />);
    await user.type(screen.getByLabelText("عنوان الموضوع"), "اعتماد برنامج جديد");
    await user.type(screen.getByLabelText("وصف الموضوع"), "طلب اعتماد برنامج أكاديمي جديد للمجلس المختص.");
    await user.selectOptions(screen.getByLabelText("جهة تقديم الموضوع"), "unit-1");
    await screen.findByRole("option", { name: "برامج أكاديمية (1)" });
    await user.selectOptions(screen.getByLabelText("فئة الموضوع"), "cat-1");
    await user.click(screen.getByRole("button", { name: /التالي: عرض اللائحة المنطبقة/ }));

    const custom = await screen.findByRole("radio", { name: /مسار مخصص/ });
    const exception = screen.getByRole("radio", { name: /استثناء لائحي/ });
    expect(custom).toBeEnabled();
    expect(exception).toBeEnabled();

    await user.click(custom);
    expect(await screen.findByText("مصمم المسار المخصص")).toBeInTheDocument();

    await user.click(exception);
    expect(await screen.findByText("استخدم مسارًا بديلًا لمدة محددة")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "مسار مؤقت معتمد" })).toBeInTheDocument();
  }, 15_000);

  it("يعرض مسار الاستثناء وحالاته للمستخدم غير التقني", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/topics/ui/topic-regulation-creator.tsx"),
      "utf8",
    );

    [
      "طلب استثناء",
      "استخدم مسارًا بديلًا لمدة محددة",
      "بانتظار الاعتماد",
      "معتمد",
      "مرفوض",
      "منتهي",
      "سبب الاستثناء",
      "إرسال طلب الاستثناء",
      "تحديث حالة الاستثناء",
    ].forEach((label) => expect(source).toContain(label));
  });

  it("ينشئ مسودة مسار مخصص مستقلة عندما لا توجد لائحة مطابقة", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const contract = body.contract as string;
      const dataByContract: Record<string, unknown> = {
        get_topic_form_options: {
          governance_units: [{ id: "unit-1", code: "department", name_ar: "مجلس القسم" }],
          priorities: ["medium"],
          source_types: ["new"],
        },
        get_topic_categories_for_unit: {
          governance_unit_id: "unit-1",
          effective_on: "2026-08-24",
          categories: [{ id: "cat-1", code: "academic", name_ar: "برامج أكاديمية", executable_item_count: 1 }],
        },
        admin_list_workflow_templates: { items: [] },
        get_topic_regulation_options: { total: 0, items: [] },
        create_topic_custom_route_draft: {
          topic_id: "topic-1",
          custom_route_draft_id: "draft-1",
          status: "submitted",
          routing_status: "routing_pending",
          governance_source: "custom",
        },
        get_topic_governance_summary: {
          topic: {
            id: "topic-1",
            topic_no: "TOP-1",
            title_ar: "إنشاء برنامج جديد",
            status: "new",
            routing_status: "routing_pending",
            governance_source: "custom",
          },
          regulation: null,
          item: null,
          workflow: null,
          current_step: null,
          exception: null,
        },
        get_topic_detail: {
          id: "topic-1",
          topic_no: "TOP-1",
          title_ar: "إنشاء برنامج جديد",
          status: "new",
          routing_status: "routing_pending",
          governance_source: "custom",
        },
      };
      return new Response(JSON.stringify({ data: dataByContract[contract] }), { status: 200 });
    });

    render(<TopicRegulationCreator />);
    await screen.findByText("جاهز للإنشاء");
    await user.type(screen.getByLabelText("عنوان الموضوع"), "إنشاء برنامج جديد");
    await user.type(screen.getByLabelText("وصف الموضوع"), "طلب دراسة واعتماد برنامج أكاديمي جديد وفق المسار النظامي.");
    await user.selectOptions(screen.getByLabelText("جهة تقديم الموضوع"), "unit-1");
    await screen.findByRole("option", { name: "برامج أكاديمية (1)" });
    await user.selectOptions(screen.getByLabelText("فئة الموضوع"), "cat-1");
    await user.click(screen.getByRole("button", { name: /التالي: عرض اللائحة المنطبقة/ }));

    const reasonInput = await screen.findByPlaceholderText(/لا توجد لائحة نافذة/);
    await user.type(reasonInput, "لا توجد لائحة مطابقة لهذا النوع من الموضوعات");
    await user.click(screen.getByRole("button", { name: /إنشاء الموضوع وإرسال المسار للاعتماد/ }));

    await screen.findByText(/تم إنشاء الموضوع وإرسال مساره المخصص للاعتماد/);
    const customRouteCall = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body))).find((body) => body.contract === "create_topic_custom_route_draft");
    expect(customRouteCall.params).toMatchObject({
      p_title_ar: "إنشاء برنامج جديد",
      p_current_unit_id: "unit-1",
      p_category_id: "cat-1",
      p_route_name_ar: "مسار معالجة الموضوع",
      p_rationale: "لا توجد لائحة مطابقة لهذا النوع من الموضوعات",
    });
    expect(customRouteCall.params.p_steps).toHaveLength(2);
  }, 15_000);
});
