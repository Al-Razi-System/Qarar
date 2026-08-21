import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixturePath } from "./fixture";

async function login(page: Page) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const response = await page.request.post("/api/auth/login", {
    data: { email: fixture.email, password: fixture.password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return fixture;
}

test("يسجل مدير الاختبار الدخول ويصل إلى إدارة اللوائح", async ({ page }) => {
  await login(page);
  await page.goto("/admin/regulations");
  await expect(page.getByRole("heading", { name: "اللوائح والمسارات" })).toBeVisible();
});

test("ينشئ لائحة وإصدار مسودة من الواجهة", async ({ page }) => {
  const fixture = await login(page);
  await page.goto("/admin/regulations");

  await page.getByRole("button", { name: "إنشاء لائحة" }).click();
  await page.getByLabel("رمز اللائحة").fill(fixture.policyCode);
  await page.getByLabel("الاسم بالعربية").fill("لائحة Playwright التجريبية");
  await page.getByLabel("الوصف").fill("لائحة مؤقتة للتحقق من دورة الواجهة المتكاملة.");
  await page.getByRole("button", { name: "حفظ اللائحة" }).click();
  await expect(page.getByText("لائحة Playwright التجريبية").first()).toBeVisible();

  await page.getByText("لائحة Playwright التجريبية").first().click();
  await page.getByRole("button", { name: "إنشاء الإصدار الأول" }).click();
  await page.getByLabel("وسم الإصدار").fill("1.0");
  await page.getByLabel("ملخص التغييرات").fill("الإصدار التجريبي الأول.");
  await page.getByRole("button", { name: "إنشاء المسودة" }).click();
  await expect(page.getByText(/v1\.0/)).toBeVisible();
  await expect(page.getByText("النص والهيكل")).toBeVisible();
  await expect(page.getByText("القواعد التنفيذية")).toBeVisible();
  await expect(page.getByText("فحص الجاهزية")).toBeVisible();
});
