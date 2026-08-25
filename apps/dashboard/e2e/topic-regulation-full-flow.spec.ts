import { expect, test } from "@playwright/test";

test("مسار كامل: إنشاء موضوع ← اختيار لائحة ← إنشاء المسار ← عرض الخطوة الحالية", async ({ page }) => {
  await page.route("**/api/admin/regulations", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { contract: string; params?: Record<string, unknown> };
    const responses: Record<string, unknown> = {
      admin_list_governance_units: {
        items: [{ id: "unit-1", code: "department", name_ar: "مجلس القسم" }],
      },
      admin_list_topic_categories: {
        items: [{ id: "cat-1", code: "academic", name_ar: "برامج أكاديمية" }],
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
      create_topic_with_selected_regulation: {
        topic_id: "topic-1",
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
          id: "topic-1",
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
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: responses[body.contract] ?? {} }),
    });
  });

  await page.goto("/admin/requests");
  await expect(page.getByRole("heading", { name: "موضوع جديد مع اختيار اللائحة المناسبة" })).toBeVisible();

  await page.getByLabel("عنوان الموضوع").fill("إنشاء برنامج بكالوريوس الأمن السيبراني");
  await page.getByLabel("وصف مختصر").fill("طلب إنشاء برنامج أكاديمي جديد وفق لائحة البرامج الأكاديمية.");
  await page.getByLabel("المجلس/الجهة المسؤولة").selectOption("unit-1");
  await page.getByLabel("فئة الموضوع").selectOption("cat-1");
  await page.getByRole("button", { name: /عرض اللوائح المطابقة/ }).click();

  await expect(page.getByText("لائحة اعتماد البرامج والمقررات الأكاديمية").first()).toBeVisible();
  await expect(page.getByText("إنشاء برنامج أكاديمي جديد").first()).toBeVisible();
  await page.getByRole("button", { name: /لائحة اعتماد البرامج والمقررات الأكاديمية/ }).click();
  await page.getByRole("button", { name: /تأكيد وإنشاء الموضوع والمسار/ }).click();

  await expect(page.getByText("تم إنشاء الموضوع وربطه باللائحة وتشغيل المسار تلقائيًا.")).toBeVisible();
  await expect(page.getByText("اللائحة المختارة").first()).toBeVisible();
  await expect(page.getByText("البند المنطبق").first()).toBeVisible();
  await expect(page.getByText("المسار الحالي").first()).toBeVisible();
  await expect(page.getByText("الخطوة الحالية").first()).toBeVisible();
  await expect(page.getByText("الجهة المسؤولة").first()).toBeVisible();
  await expect(page.getByText("النتائج المتاحة").first()).toBeVisible();
  await expect(page.getByText("مراجعة مجلس القسم").first()).toBeVisible();
  await expect(page.getByText("يعتمد").first()).toBeVisible();
  await expect(page.getByText("يعاد للتعديل").first()).toBeVisible();
  await expect(page.getByText("يرفض").first()).toBeVisible();
});
