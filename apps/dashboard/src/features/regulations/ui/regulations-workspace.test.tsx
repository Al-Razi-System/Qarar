import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegulationsWorkspace } from "./regulations-workspace";
import type { Policy } from "../model/types";

const policies: Policy[] = [
  {
    id: "policy-1", code: "academic-2026", name_ar: "اللائحة الأكاديمية",
    name_en: "Academic Regulation", policy_type: "regulation", status: "active",
    description: "تنظيم اعتماد الخطط الأكاديمية", updated_at: "2026-07-29T00:00:00Z",
    version_count: 1, latest_version_no: 1,
  },
  {
    id: "policy-2", code: "finance-2026", name_ar: "اللائحة المالية",
    policy_type: "regulation", status: "active", updated_at: "2026-07-29T00:00:00Z",
    version_count: 0,
  },
];
const references = {
  units: [{ id: "unit-1", code: "department", name_ar: "مجلس القسم" }],
  classes: [{ id: "class-1", code: "department_council", name_ar: "مجالس الأقسام" }],
  categories: [{ id: "cat-1", code: "academic", name_ar: "برامج أكاديمية" }],
};
const activeWorkflow = {
  id: "workflow-1",
  code: "academic-approval",
  name_ar: "مسار اعتماد البرامج",
  status: "active",
  versions: [{
    id: "workflow-version-1",
    version_no: 1,
    status: "active",
    validation_status: "valid",
    steps: [{
      id: "step-1",
      workflow_template_version_id: "workflow-version-1",
      step_code: "department-review",
      name_ar: "مراجعة مجلس القسم",
      sequence_no: 10,
      step_type: "review",
      responsibility: "review",
      governance_class_id: "class-1",
      is_initial: true,
      is_terminal: false,
      allowed_outcomes: ["approved", "returned", "rejected"],
    }, {
      id: "step-2",
      workflow_template_version_id: "workflow-version-1",
      step_code: "final-approval",
      name_ar: "الاعتماد النهائي",
      sequence_no: 20,
      step_type: "approval",
      responsibility: "final_approve",
      governance_unit_id: "unit-1",
      is_initial: false,
      is_terminal: true,
      allowed_outcomes: ["completed"],
    }],
    transitions: [{
      id: "transition-1",
      from_step_id: "step-1",
      to_step_id: "step-2",
      outcome_code: "approved",
      transition_type: "forward",
    }],
  }],
};
const detailedPolicy: Policy = {
  ...policies[0],
  versions: [{
    id: "version-1",
    version_no: 1,
    version_label: "1.0",
    legal_status: "draft",
    automation_status: "ready",
    automation_readiness_pct: 100,
    items: [],
    scopes: [],
  }],
};

function mockRegulationRpc(overrides: Record<string, unknown> = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const contract = body.contract as string;
    const dataByContract: Record<string, unknown> = {
      admin_get_policy_detail: detailedPolicy,
      admin_list_workflow_templates: { items: [activeWorkflow] },
      admin_list_governance_units: { items: references.units },
      admin_list_governance_unit_classes: { items: references.classes },
      admin_list_topic_categories: { items: references.categories },
      admin_search_policies: { items: policies },
      admin_list_governance_exceptions: { items: [] },
      ...overrides,
    };
    if (!(contract in dataByContract)) {
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: dataByContract[contract] }), { status: 200 });
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RegulationsWorkspace", () => {
  it("يعرض اللوائح ويصفيها بالاسم والرمز", async () => {
    const user = userEvent.setup();
    render(<RegulationsWorkspace initialPolicies={policies} />);

    expect(screen.getByText("اللائحة الأكاديمية")).toBeInTheDocument();
    expect(screen.getByText("اللائحة المالية")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("ابحث بالاسم أو الرمز"), "finance");
    expect(screen.queryByText("اللائحة الأكاديمية")).not.toBeInTheDocument();
    expect(screen.getByText("اللائحة المالية")).toBeInTheDocument();
  });

  it("يفتح نموذج إنشاء اللائحة ويرسل عقد RPC الصحيح", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "new-policy", status: "active" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { items: policies } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...policies[0], id: "new-policy", versions: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { items: [] } }), { status: 200 }));

    render(<RegulationsWorkspace initialPolicies={policies} />);
    await user.click(screen.getByRole("button", { name: "إنشاء لائحة" }));
    await user.type(screen.getByLabelText("رمز اللائحة"), "NEW_REGULATION");
    await user.type(screen.getByLabelText("الاسم بالعربية"), "لائحة اختبار");
    await user.click(screen.getByRole("button", { name: "حفظ اللائحة" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.contract).toBe("admin_create_policy_idempotent");
    expect(body.params).toMatchObject({
      p_code: "new_regulation",
      p_name_ar: "لائحة اختبار",
      p_policy_type: "regulation",
    });
    expect(body.params.p_client_request_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ينقل المستخدم مباشرة إلى الصفحة المستقلة للائحة", () => {
    render(<RegulationsWorkspace initialPolicies={policies} />);
    const policyLink = screen.getByRole("link", { name: /اللائحة الأكاديمية/ });

    expect(policyLink).toHaveAttribute("href", "/admin/regulations/policy-1");
    expect(screen.queryByText("اختر لائحة لعرض مساحة العمل")).not.toBeInTheDocument();
  });

  it("يوحّد قيم نتائج المسار مع قيم الباكند", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/regulations/ui/regulations-workspace.tsx"),
      "utf8",
    );

    expect(source).toContain('"tie"');
    expect(source).toContain('"no_vote"');
    expect(source).toContain('"cancelled"');
    expect(source).toContain("تعادل التصويت");
    expect(source).toContain("لا يوجد تصويت كافٍ");
    expect(source).toContain("يكتمل المسار");
    expect(source).not.toContain('"tied"');
    expect(source).not.toContain('"no_votes"');
  });

  it("يكشف عقود api_v1 الحرجة عبر route الواجهة", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/admin/regulations/route.ts"),
      "utf8",
    );

    [
      "get_topic_regulation_options",
      "create_topic_with_selected_regulation",
      "act_topic_workflow_step",
      "admin_list_governance_units",
      "admin_list_governance_unit_classes",
      "admin_list_topic_categories",
      "admin_create_governance_unit",
      "admin_update_governance_unit",
      "admin_create_governance_unit_class",
      "admin_update_governance_unit_class",
      "admin_import_policy_bundle",
    ].forEach((contract) => {
      expect(source).toContain(`"${contract}"`);
    });
  });

  it("يستورد حزمة اللائحة ذريًا مع idempotency وتسجيل تدقيقي", () => {
    const source = readFileSync(
      join(process.cwd(), "../supabase/migrations/20260801040000_atomic_policy_bundle_import.sql"),
      "utf8",
    );

    expect(source).toContain("admin_import_policy_bundle");
    expect(source).toContain("p_client_request_id uuid");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("governance.policy_bundle.import");
    expect(source).toContain("commit;");
  });

  it("يدعم مصمم شروط المطابقة غير التقني والاستثناء والمعاينة", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/regulations/ui/regulations-workspace.tsx"),
      "utf8",
    );

    expect(source).toContain("نوع الطلب");
    expect(source).toContain("المستوى الأكاديمي");
    expect(source).toContain("استثناء: لا يساوي");
    expect(source).toContain("هل هذا الموضوع يطابق");
    expect(source).toContain("ملخص الشروط التي سيطبقها النظام");
    expect(source).not.toContain("JSON الذي سيرسله النظام");
    expect(source).not.toContain("الشروط بصيغة JSON");
    expect(source).toContain("new_academic_program");
    expect(source).toContain("diploma");
    expect(source).toContain("bachelor");
    expect(source).toContain("master");
  });

  it("يعرض اللوائح كصفوف جدول مرتبطة بصفحات مستقلة ولا يجلب التفاصيل داخل الفهرس", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RegulationsWorkspace initialPolicies={policies} />);

    expect(screen.getByRole("link", { name: /اللائحة الأكاديمية/ })).toHaveAttribute(
      "href",
      "/admin/regulations/policy-1",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("يعرض مصمم المسارات كتسلسل واضح من البيانات إلى التفعيل", async () => {
    const user = userEvent.setup();
    mockRegulationRpc();

    render(<RegulationsWorkspace initialPolicies={policies} />);
    await user.click(screen.getByRole("button", { name: /مصمم المسارات/ }));
    await screen.findByText("مسار اعتماد البرامج");
    await user.click(screen.getByText("مسار اعتماد البرامج"));

    [
      "بيانات المسار",
      "خطوات المسار",
      "الجهة المسؤولة",
      "النتائج المتاحة",
      "ماذا يحدث بعد كل نتيجة",
      "فحص المسار",
      "تفعيل المسار",
      "مراجعة مجلس القسم",
      "يعتمد",
      "يعاد للتعديل",
      "يرفض",
      "تنتهي رحلة القرار",
    ].forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
  });

  it("يشغل اختبار المطابقة من الواجهة ويرسل سياق الموضوع للعقد الصحيح", async () => {
    const user = userEvent.setup();
    const fetchMock = mockRegulationRpc({
      get_topic_regulation_options: {
        total: 1,
        items: [{ policy: { name_ar: "اللائحة الأكاديمية" }, routing_outcome: "resolved" }],
      },
    });

    render(<RegulationsWorkspace initialPolicies={policies} />);
    await user.click(screen.getByRole("button", { name: /اختبار المطابقة/ }));
    await user.selectOptions(await screen.findByLabelText("المجلس"), "unit-1");
    await user.selectOptions(screen.getByLabelText("فئة الموضوع"), "cat-1");
    await user.click(screen.getByRole("button", { name: /تشغيل الاختبار/ }));

    await screen.findByText(/وجد المحرك/);
    const matcherCall = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body))).find((body) => body.contract === "get_topic_regulation_options");
    expect(matcherCall.params).toMatchObject({
      p_governance_unit_id: "unit-1",
      p_topic_category_id: "cat-1",
      p_priority: "medium",
      p_source_type: "new",
    });
  });
  it("يعرض دورة الاعتماد والتفعيل وقواعد القفل بوضوح", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/regulations/ui/regulations-workspace.tsx"),
      "utf8",
    );

    expect(source).toContain("دورة الاعتماد والتفعيل");
    expect(source).toContain("مسودة ← إرسال للمراجعة ← اعتماد من مستخدم آخر ← تفعيل بتاريخ نفاذ ← نافذة");
    expect(source).toContain("لا يمكن اعتماد الإصدار من نفس المستخدم الذي أرسله");
    expect(source).toContain("canActivatePolicy");
    expect(source).toContain("المسار جاهز ومكتمل");
    expect(source).toContain("هذا الإصدار مقفل للتحرير");
    expect(source).toContain("النسخة النافذة لا تُعدّل مباشرة");
  });

  it("يدعم بيانات الملكية والمرفقات ويستخدم محرك المطابقة الفعلي", () => {
    const workspace = readFileSync(join(process.cwd(), "src/features/regulations/ui/policy-management-workspace.tsx"), "utf8");
    const designer = readFileSync(join(process.cwd(), "src/features/regulations/ui/regulations-workspace.tsx"), "utf8");
    const migration = readFileSync(join(process.cwd(), "../supabase/migrations/20260802010000_policy_metadata_attachments_matcher.sql"), "utf8");

    expect(workspace).toContain("p_owner_governance_unit_id");
    expect(workspace).toContain("admin_add_policy_attachment");
    expect(workspace).toContain("تضمين الجهات التابعة");
    expect(designer).toContain('{ value: "change_level", label: "مستوى التغيير" }');
    expect(designer).toContain('"preview_policy_conditions"');
    expect(designer).not.toContain("function criteriaMatch(");
    expect(migration).toContain("qarar_governance.conditions_match");
    expect(migration).toContain("check(num_nonnulls(policy_id,policy_version_id,policy_item_id)=1)");
  });
});
