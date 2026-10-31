import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixturePath } from "./fixture";
import type { LibraryDetail } from "../src/features/regulations/model/regulation-library";

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
  await expect(page.getByRole("heading", { name: "اللوائح والبنود" })).toBeVisible();
});

test("ينشئ لائحة ومسودتها تلقائيًا ثم يحفظ أول بند ويعيد قراءته", async ({ page }, testInfo) => {
  const fixture = await login(page);
  const name = `لائحة Playwright ${fixture.policyCode} ${testInfo.project.name}`;
  await page.goto("/admin/regulations");

  await page.getByRole("button", { name: "إضافة لائحة", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("رمز اللائحة")).toHaveCount(0);
  await dialog.getByLabel("اسم اللائحة").fill(name);
  await dialog.getByText("وصف مختصر · اختياري", { exact: true }).click();
  await dialog.getByLabel("الوصف", { exact: true }).fill("لائحة مؤقتة للتحقق من دورة الواجهة المتكاملة.");
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/regulations") && response.request().method() === "POST" && response.request().postDataJSON()?.params?.p_action === "create");
  await dialog.getByRole("button", { name: "حفظ اللائحة" }).click();
  const created = await createResponse;
  expect(created.status()).toBe(200);
  const { data } = await created.json() as { data: LibraryDetail };
  expect(data.policy.description).toBe("لائحة مؤقتة للتحقق من دورة الواجهة المتكاملة.");
  // The library's internal code is the lowercase generated REG reference.
  expect(data.policy.code).toMatch(/^reg-\d{4}-\d{6,}$/);
  expect((data.policy.versions ?? []).some((version) => version.id === data.working_version_id && version.legal_status === "draft")).toBe(true);
  expect(created.request().postDataJSON().params.p_payload).not.toHaveProperty("code");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/admin/regulations/${data.policy.id}$`));
  await page.getByRole("button", { name: "إضافة بند", exact: true }).click();
  await dialog.getByLabel("عنوان البند").fill("بند Playwright المحفوظ");
  await dialog.getByLabel("النص النظامي").fill("نص تجريبي للتحقق من حفظ المسودة وإعادة قراءتها دون تغيير اللائحة المنشورة.");
  const itemResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/regulations") && response.request().method() === "POST" && response.request().postDataJSON()?.params?.p_action === "save_item");
  await dialog.getByRole("button", { name: "حفظ البند" }).click();
  const saved = await itemResponse;
  expect(saved.status()).toBe(200);
  const { data: itemData } = await saved.json() as { data: LibraryDetail };
  const item = (itemData.policy.versions ?? []).flatMap((version) => version.items).find((entry) => entry.id === itemData.item_id);
  expect(item?.item_code).toMatch(/^ART-\d{4}-\d{6,}$/);
  await page.reload();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "بند Playwright المحفوظ", exact: true })).toBeVisible();
  await expect(page.getByText("نص تجريبي للتحقق من حفظ المسودة وإعادة قراءتها دون تغيير اللائحة المنشورة.", { exact: true })).toBeVisible();
});
