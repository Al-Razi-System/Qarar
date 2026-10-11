import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixturePath } from "./fixture";

test("إنشاء من القائمة: مجلس ثم تصنيف دون إعداد لائحة أو مسار", async ({ page }) => {
  const council = "11111111-1111-4111-8111-111111111111";
  const version = "22222222-2222-4222-8222-222222222222";
  const topic = "33333333-3333-4333-8333-333333333333";
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const login = await page.request.post("/api/auth/login", {
    data: { email: fixture.email, password: fixture.password },
    headers: { "x-qarar-client-ip": "127.0.0.1" },
  });
  expect(login.status()).toBe(200);
  expect((await login.json()).authenticated).toBe(true);
  const legacyContracts: string[] = [];
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/admin/topics", async route => {
    const body = route.request().postDataJSON() as { contract: string };
    legacyContracts.push(body.contract);
    await route.fulfill({ json: { data: { items: [], total: 0 } } });
  });
  await page.route("**/api/admin/typed-topics**", async route => {
    if (route.request().method() === "POST") {
      submissions.push(route.request().postDataJSON());
      await route.fulfill({ json: { data: { topic_id: topic, topic_no: "TOP-2026-000001" } } });
      return;
    }
    const query = new URL(route.request().url()).searchParams;
    const data = query.has("versionId")
      ? { steps: [{ name_ar: "مجلس القسم" }], authoring: { required_attachment_count: 0, submission_instructions: "وضح مبررات الطلب" } }
      : query.has("unitId")
        ? [{ topic_type_version_id: version, topic_type_name_ar: "إنشاء برنامج أكاديمي" }]
        : { governance_units: [{ id: council, name_ar: "مجلس القسم" }] };
    await route.fulfill({ json: { data } });
  });
  await page.goto("/admin/topics");
  await page.getByRole("link", { name: "إنشاء موضوع", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/topics\/new$/);
  await expect(page.getByLabel("جهة تقديم الموضوع")).toHaveCount(0);
  await expect(page.getByLabel("فئة الموضوع")).toHaveCount(0);
  await expect(page.getByText("كيف تريد أن يسير هذا الموضوع؟", { exact: true })).toHaveCount(0);
  await page.getByLabel("المجلس", { exact: true }).selectOption(council);
  await page.getByLabel("تصنيف الموضوع", { exact: true }).selectOption(version);
  await expect(page.getByRole("region", { name: "تعليمات التقديم" })).toContainText("وضح مبررات الطلب");
  await page.getByLabel("عنوان الموضوع").fill("إنشاء برنامج بكالوريوس الأمن السيبراني");
  await page.getByLabel("تفاصيل الموضوع").fill("طلب إنشاء برنامج أكاديمي جديد وفق التصنيف المحدد.");
  await page.getByRole("button", { name: "تقديم الموضوع", exact: true }).click();
  await expect(page.getByText("TOP-2026-000001", { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(Object.keys(submissions[0]).sort()).toEqual(["description", "requestId", "title", "unitId", "versionId"]);
  expect(submissions[0]).toMatchObject({ unitId: council, versionId: version });
  for (const contract of ["get_topic_regulation_options", "get_topic_categories_for_unit", "create_topic_with_regulation_bundle"]) {
    expect(legacyContracts).not.toContain(contract);
  }
});
