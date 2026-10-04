import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixturePath } from "./fixture";

test("واجهة إنشاء موضوع: البيانات ← اللائحة ← مراجعة المسار ← إرسال الإنشاء مرة واحدة", async ({ page }) => {
  const topicId = "11111111-1111-4111-8111-111111111111";
  const calledContracts: string[] = [];
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const login = await page.request.post("/api/auth/login", {
    data: { email: fixture.email, password: fixture.password },
    headers: { "x-qarar-client-ip": "127.0.0.1" },
  });
  const loginBody = await login.json() as { authenticated?: boolean; message?: string };
  expect(login.status(), loginBody.message ?? "فشل تسجيل الدخول في بيئة الاختبار").toBe(200);
  expect(loginBody.authenticated, "يجب أن تنشئ بيئة الاختبار جلسة كاملة").toBe(true);
  await page.route("**/api/admin/topics", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { contract: string; params?: Record<string, unknown> };
    calledContracts.push(body.contract);
    const responses: Record<string, unknown> = {
      get_topic_form_options: {
        governance_units: [{ id: "unit-1", code: "department", name_ar: "مجلس القسم" }],
        priorities: ["low", "medium", "high", "urgent"],
        source_types: ["new", "lower_unit", "higher_unit", "peer_unit", "administrative"],
      },
      get_topic_categories_for_unit: {
        governance_unit_id: "unit-1",
        effective_on: "2026-10-02",
        categories: [{ id: "cat-1", code: "academic", name_ar: "برامج أكاديمية", executable_item_count: 1 }],
      },
      admin_list_workflow_templates: [{
        id: "workflow-1",
        code: "academic-approval",
        name_ar: "مسار اعتماد البرامج",
        versions: [{ id: "workflow-version-1", version_no: 1, status: "active", validation_status: "valid" }],
      }],
      get_topic_regulation_options: {
        total: 1,
        items: [{
          selection: {
            policy_id: "policy-1",
            policy_version_id: "version-1",
            policy_item_id: "item-1",
            scope_assignment_id: "scope-1",
          },
          policy: { code: "academic-programs-regulation", name_ar: "لائحة اعتماد البرامج والمقررات الأكاديمية" },
          version: { number: 1, label: "1.0" },
          item: { code: "new-academic-program", title_ar: "إنشاء برنامج أكاديمي جديد" },
          scope: { type: "organization", priority: 100 },
          governance_mode: "regulation_required",
          automation_status: "ready",
          routing_outcome: "resolved",
          can_start_workflow: true,
        }],
      },
      get_topic_regulation_tree: { total: 0, items: [] },
      get_topic_regulation_preview: {
        article: {
          title: "إنشاء برنامج أكاديمي جديد",
          official_text: "يعتمد إنشاء البرامج الأكاديمية الجديدة وفق مسار الاعتماد المحدد.",
        },
        rule_summary: [{ name: "مسار اعتماد إلزامي", description: "يجب تشغيل مسار الاعتماد الأكاديمي.", requires_workflow: true }],
        scope: { target_name: "مجلس القسم", description: "تنطبق على الجهة مقدمة الموضوع." },
        workflow: { name: "مسار اعتماد البرامج", description: "مسار يبدأ بمراجعة مجلس القسم." },
        requirements: [],
        attachments: [],
        approval_effect: "ينشأ القرار بعد إكمال المسار.",
        voting_effect: "تطبق قواعد التصويت في خطوة المجلس.",
      },
      get_topic_regulation_route_preview: {
        status: "ready",
        workflow_name: "مسار اعتماد البرامج",
        message: "المسار جاهز للتشغيل.",
        steps: [{
          title: "مراجعة مجلس القسم",
          responsible_unit_id: "unit-1",
          responsible_entity: "مجلس القسم",
          responsible_role: "مقرر المجلس",
          transition_requirement: "اعتماد الموضوع",
        }],
      },
      create_topic_with_regulation_bundle: {
        topic_id: topicId,
        routing_status: "routing_ready",
        policy_id: "policy-1",
        policy_version_id: "version-1",
        policy_item_id: "item-1",
        scope_assignment_id: "scope-1",
        workflow_instance_id: "workflow-instance-1",
        current_workflow_step_id: "step-instance-1",
      },
      get_topic_governance_summary: {
        topic: {
          id: topicId,
          topic_no: "TOP-2026-000001",
          title_ar: "إنشاء برنامج بكالوريوس الأمن السيبراني",
          status: "new",
          routing_status: "routing_ready",
          governance_source: "regulated",
        },
        regulation: {
          code: "academic-programs-regulation",
          name_ar: "لائحة اعتماد البرامج والمقررات الأكاديمية",
          version_no: 1,
          version_label: "1.0",
        },
        item: {
          code: "new-academic-program",
          title_ar: "إنشاء برنامج أكاديمي جديد",
          governance_mode: "regulation_required",
        },
        workflow: {
          instance_id: "workflow-instance-1",
          name_ar: "مسار اعتماد البرامج",
          status: "active",
        },
        current_step: {
          id: "step-instance-1",
          name_ar: "مراجعة مجلس القسم",
          responsibility: "review",
          assigned_unit_name_ar: "مجلس القسم",
          status: "active",
          allowed_outcomes: ["approved", "returned", "rejected"],
          action_version: 0,
        },
      },
      get_topic_detail: {
        id: topicId,
        topic_no: "TOP-2026-000001",
        title_ar: "إنشاء برنامج بكالوريوس الأمن السيبراني",
        status: "new",
        routing_status: "routing_ready",
        governance_source: "regulated",
      },
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: responses[body.contract] ?? {} }),
    });
  });

  await page.goto("/admin/topics");
  await page.getByRole("button", { name: "إنشاء موضوع" }).click();
  await expect(page.getByRole("heading", { name: "بيانات مختصرة، ثم اختيار المسار" })).toBeVisible();

  await page.getByLabel("عنوان الموضوع").fill("إنشاء برنامج بكالوريوس الأمن السيبراني");
  await page.getByLabel("وصف الموضوع").fill("طلب إنشاء برنامج أكاديمي جديد وفق لائحة البرامج الأكاديمية.");
  await page.getByLabel("جهة تقديم الموضوع").selectOption("unit-1");
  await page.getByLabel("فئة الموضوع").selectOption("cat-1");
  await page.getByRole("button", { name: /التالي: عرض اللائحة المنطبقة/ }).click();

  await expect(page.getByText("لائحة اعتماد البرامج والمقررات الأكاديمية").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "لائحة اعتماد البرامج والمقررات الأكاديمية" })).toBeVisible();
  await page.getByRole("button", { name: "متابعة إلى المراجعة" }).click();
  await expect(page.getByRole("heading", { name: "راجِع ملخص الموضوع قبل بدء المسار" })).toBeVisible();
  await page.getByRole("button", { name: "إنشاء الموضوع وبدء المسار" }).click();

  await expect(page.getByRole("dialog", { name: "بيانات مختصرة، ثم اختيار المسار" })).toBeHidden();
  expect(calledContracts.filter((contract) => contract === "create_topic_with_regulation_bundle")).toHaveLength(1);
  expect(calledContracts).toEqual(expect.arrayContaining([
    "get_topic_form_options",
    "get_topic_categories_for_unit",
    "get_topic_regulation_options",
    "get_topic_regulation_route_preview",
    "create_topic_with_regulation_bundle",
    "get_topic_governance_summary",
    "get_topic_detail",
  ]));
});
