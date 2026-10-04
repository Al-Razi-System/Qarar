import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixturePath } from "./fixture";

async function login(page: Page) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const response = await page.request.post("/api/auth/login", {
    data: { email: fixture.email, password: fixture.password },
    headers: { "x-qarar-client-ip": "127.0.0.1" },
  });
  const body = await response.json() as { authenticated?: boolean; message?: string };
  expect(response.status(), body.message ?? "فشل تسجيل الدخول في بيئة الاختبار").toBe(200);
  expect(body.authenticated, "يجب أن تنشئ بيئة الاختبار جلسة كاملة لا جلسة MFA مؤقتة").toBe(true);
  return fixture;
}

test("يسجل مدير الاختبار الدخول ويصل إلى إدارة اللوائح", async ({ page }) => {
  await login(page);
  await page.goto("/admin/regulations");
  await expect(page.getByRole("heading", { name: "اللوائح والمسارات" })).toBeVisible();
});

test("ينشئ لائحة وإصدار مسودة من الواجهة", async ({ page }, testInfo) => {
  const fixture = await login(page);
  const policyCode = `${fixture.policyCode}-${testInfo.project.name.replace(/[^a-z0-9]+/g, "-")}`;
  await page.goto("/admin/regulations");

  await page.getByRole("button", { name: "إنشاء لائحة" }).click();
  await page.getByLabel("رمز اللائحة").fill(policyCode);
  await page.getByLabel("الاسم بالعربية").fill("لائحة Playwright التجريبية");
  await page.getByLabel("الوصف").fill("لائحة مؤقتة للتحقق من دورة الواجهة المتكاملة.");
  await page.getByRole("button", { name: "حفظ اللائحة" }).click();
  const createdPolicyLink = page.getByRole("link", { name: `فتح سجل اللائحة ${policyCode}` });
  await expect(createdPolicyLink).toBeVisible();
  await createdPolicyLink.click();
  await page.getByRole("button", { name: "إنشاء إصدار العمل" }).click();
  await page.getByRole("tab", { name: /الإصدارات/ }).click();
  await page.getByRole("button", { name: "إنشاء الإصدار الأول" }).click();
  await page.getByLabel("وسم الإصدار").fill("1.0");
  await page.getByLabel("ملخص التغييرات").fill("الإصدار التجريبي الأول.");
  await page.getByRole("button", { name: "إنشاء المسودة" }).click();
  await expect(page.getByRole("status")).toContainText("تم إنشاء إصدار مسودة جديد");
  await expect(page.getByLabel("إصدار العمل الحالي")).not.toHaveValue("");
  await expect(page.getByLabel("إصدار العمل الحالي").locator("option:checked")).toHaveText("1.0 · مسودة");
  await expect(page.getByRole("tab", { name: /الهيكل والمحتوى/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /القواعد والمسارات/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /الاعتماد والنفاذ/ })).toBeVisible();
});
