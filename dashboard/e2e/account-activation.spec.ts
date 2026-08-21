import { expect, test } from "@playwright/test";

for (const scenario of ["expired", "used", "tampered"] as const) {
  test(`activation rejects a ${scenario} invitation`, async ({ page }) => {
    await page.route("**/api/auth/activate", async (route) => route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INVALID_INVITATION", message: "رابط التفعيل غير صالح أو انتهت صلاحيته أو استُخدم سابقًا." } }),
    }));
    await page.goto(`http://localhost:3000/activate#token=v1.1999999999.${"a".repeat(43)}.${"b".repeat(43)}`);
    await expect(page.getByRole("heading", { name: "تعذر استخدام الدعوة" })).toBeVisible();
    await expect(page.locator('p[role="alert"]')).toContainText("رابط التفعيل غير صالح");
    await expect(page).not.toHaveURL(/token=/);
  });
}

test("activation submits a new password and shows the completed state", async ({ page }) => {
  let method = "";
  await page.route("**/api/auth/activate", async (route) => {
    method = route.request().method();
    if (method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ invitation: { email: "member@example.test", full_name_ar: "عضو", organization_name: "جامعة الاختبار", expires_at: "2030-01-01T00:00:00Z" } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ activated: true }) });
  });
  await page.goto(`http://localhost:3000/activate#token=v1.1999999999.${"a".repeat(43)}.${"b".repeat(43)}`);
  await expect(page.getByText("member@example.test")).toBeVisible();
  await page.getByLabel("كلمة المرور الجديدة").fill("StrongPassword1!");
  await page.getByLabel("تأكيد كلمة المرور").fill("StrongPassword1!");
  await page.getByRole("button", { name: "تفعيل الحساب" }).click();
  await expect(page.getByRole("heading", { name: "تم تفعيل الحساب" })).toBeVisible();
  expect(method).toBe("POST");
});
