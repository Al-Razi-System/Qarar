import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixturePath } from "./fixture";

test("دخول مدير النظام المحلي", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/البريد/).fill("admin@qarar.local");
  await page.getByRole("textbox", { name: "كلمة المرور" }).fill("QararAdmin!2026#Local");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL(/\/admin\/users/);
  await expect(page.getByRole("heading", { name: "المستخدمون" })).toBeVisible();
});

test("إنشاء لائحة وإصدار مسودة من الواجهة", async ({ page }) => {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { email: fixture.email, password: fixture.password },
  });
  expect(loginResponse.ok(), await loginResponse.text()).toBeTruthy();

  await page.goto("/admin/regulations");
  await expect(page.getByRole("heading", { name: "اللوائح والمسارات" })).toBeVisible();
  await page.getByRole("button", { name: "إنشاء لائحة" }).click();
  await page.getByLabel("رمز اللائحة").fill(fixture.policyCode);
  await page.getByLabel("الاسم بالعربية").fill("لائحة Playwright التجريبية");
  await page.getByLabel("الوصف").fill("لائحة مؤقتة للتحقق من مسار الواجهة الكامل.");
  await page.getByRole("button", { name: "حفظ اللائحة" }).click();
  await expect(page.getByText("لائحة Playwright التجريبية").first()).toBeVisible();

  await page.getByText("لائحة Playwright التجريبية").first().click();
  await page.getByLabel("إصدار جديد").click();
  await page.getByLabel("وسم الإصدار").fill("1.0");
  await page.getByLabel("ملخص التغييرات").fill("الإصدار التجريبي الأول.");
  await page.getByRole("button", { name: "إنشاء المسودة" }).click();
  await expect(page.getByText(/v1.0/)).toBeVisible();
});
