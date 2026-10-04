import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fixturePath } from "./fixture";

type Fixture = {
  privilegedEmail: string;
  privilegedPassword: string;
  privilegedMfaSecret?: string;
  userPageTarget: { id: string; email: string; fullNameAr: string };
};

async function readFixture(): Promise<Fixture> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("سر إعداد MFA غير صالح في بيئة الاختبار.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string) {
  const counter = Math.floor(Date.now() / 30_000);
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(value).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function loginWithMfa(page: Page) {
  let fixture = await readFixture();
  const login = await page.request.post("/api/auth/login", {
    data: { email: fixture.privilegedEmail, password: fixture.privilegedPassword },
    headers: { "x-qarar-client-ip": "127.0.0.1" },
  });
  expect(login.status(), "حساب إدارة المستخدمين يجب أن يطلب MFA").toBe(202);

  const factorsResponse = await page.request.get("/api/auth/mfa");
  expect(factorsResponse.ok()).toBe(true);
  const factorsBody = await factorsResponse.json() as {
    factors?: Array<{ id: string; status: string }>;
  };
  let factorId = factorsBody.factors?.find((factor) => factor.status === "verified")?.id;
  let secret = fixture.privilegedMfaSecret;

  if (!factorId) {
    const enrollment = await page.request.post("/api/auth/mfa", { data: { action: "enroll" } });
    expect(enrollment.ok()).toBe(true);
    const enrollmentBody = await enrollment.json() as { id?: string; totp?: { secret?: string } };
    factorId = enrollmentBody.id;
    secret = enrollmentBody.totp?.secret;
    expect(factorId).toBeTruthy();
    expect(secret).toBeTruthy();
    fixture = { ...fixture, privilegedMfaSecret: secret };
    await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  }

  expect(secret, "يجب حفظ سر MFA لإعادة تشغيل المشروع الثاني").toBeTruthy();
  const verification = await page.request.post("/api/auth/mfa", {
    data: { action: "verify", factor_id: factorId, code: currentTotp(secret!) },
  });
  const verificationBody = await verification.json() as { verified?: boolean; message?: string };
  expect(verification.status(), verificationBody.message).toBe(200);
  expect(verificationBody.verified).toBe(true);
  return fixture;
}

test("تعرض إدارة المستخدمين جميع السجلات بعد أول 25 وتبحث خارج الصفحة الأولى", async ({ page }) => {
  const fixture = await loginWithMfa(page);
  await page.goto("/admin/users");

  await expect(page.getByRole("heading", { name: "المستخدمون" })).toBeVisible();
  await expect(page.getByText(/إجمالي المستخدمين:/)).toContainText("32");
  await expect(page.getByText(fixture.userPageTarget.fullNameAr)).toHaveCount(0);

  const pagination = page.getByRole("navigation", { name: "ترقيم صفحات المستخدمين" });
  await expect(pagination).toContainText("الصفحة 1 من 2");
  const nextPageResponse = page.waitForResponse((response) =>
    response.url().includes("/api/admin/users?offset=25"),
  );
  await pagination.getByRole("button", { name: "الصفحة التالية" }).click();
  const nextPageResult = await nextPageResponse;
  expect(nextPageResult.status(), await nextPageResult.text()).toBe(200);
  await expect(pagination).toContainText("الصفحة 2 من 2");
  await expect(page.getByText(fixture.userPageTarget.fullNameAr)).toBeVisible();

  const search = page.getByPlaceholder("ابحث بالاسم، البريد أو الرقم الوظيفي...");
  await search.fill(fixture.userPageTarget.email);
  await expect(page.getByText(fixture.userPageTarget.fullNameAr)).toBeVisible();
  await expect(page.getByText(/إجمالي المستخدمين:/)).toContainText("1");

  await page.route("**/api/admin/users?**", (route) => route.abort("failed"), { times: 1 });
  await search.fill("بحث يختبر انقطاع الشبكة");
  await expect(page.getByRole("alert").filter({ hasText: "تعذر تحميل المستخدمين حالياً" }))
    .toBeVisible();

  await search.fill(fixture.userPageTarget.fullNameAr);
  await expect(page.getByText(fixture.userPageTarget.fullNameAr)).toBeVisible();
});
