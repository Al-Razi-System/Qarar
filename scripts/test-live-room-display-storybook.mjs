// Read-only visual acceptance; no database or account mutations.
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const base = "http://127.0.0.1:6008";
const entries = Object.values((await (await fetch(`${base}/index.json`)).json()).entries);
const story = name => {
  const entry = entries.find(e => e.importPath.endsWith("agenda-workspace.stories.tsx") && e.exportName === name);
  if (!entry) throw Error(`Missing story ${name}`);
  return entry.id;
};
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const page = await browser.newPage();
  const fixturePage = await browser.newPage();
  await fixturePage.setContent('<html lang="ar" dir="rtl"><h1>مرفق لاختبار عرض الاجتماع</h1><p>مستند تجريبي للتحقق من مساحة العرض الموسع.</p></html>');
  const pdf = await fixturePage.pdf({ format: "A4" });
  await fixturePage.close();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/files/f1?*", route => route.fulfill({ contentType: "application/pdf", body: pdf }));
  for (const width of [1440, 1100, 390]) for (const dark of [false, true]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${base}/iframe.html?id=${story("ChairDiscussion")}&viewMode=story`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await expect(page.getByRole("heading", { name: "مجلس الكلية · الاجتماع الدوري الثالث" })).toBeVisible({ timeout: 60000 });
    const toggle = page.getByRole("button", { name: dark ? "الوضع الليلي" : "الوضع الفاتح", exact: true });
    if (await toggle.count()) await toggle.click();
    await expect(page.getByRole("heading", { name: "مبررات الخطة" })).toBeVisible();
    const next = page.getByRole("button", { name: "إنهاء المناقشة والانتقال للتصويت" });
    await expect(next).toBeVisible();
    await next.scrollIntoViewIfNeeded();
    const overlaps = await page.getByTestId("council-table-surface").evaluate(surface => {
      const table = surface.getBoundingClientRect();
      const scene = surface.parentElement.parentElement;
      return [...scene.querySelectorAll("li")].filter(seat => {
        const rect = seat.getBoundingClientRect();
        return rect.left < table.right && rect.right > table.left && rect.top < table.bottom && rect.bottom > table.top;
      }).length;
    });
    if (overlaps) throw Error(`Seats overlap the table at ${width}`);
    const box = await next.boundingBox();
    if (width >= 1024 && box.y + box.height > 1000) throw Error(`Chair next action offscreen at ${width}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Horizontal overflow ${width}`);
    await page.screenshot({ path: `/tmp/qarar-display-chair-${width}-${dark ? "dark" : "light"}.png`, fullPage: true });
    await page.getByRole("button", { name: "تكبير التعليمات" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const top = await dialog.locator("header").boundingBox();
    await dialog.locator("header + div").evaluate(el => { el.scrollTop = el.scrollHeight; });
    if ((await dialog.locator("header").boundingBox()).y !== top.y) throw Error("Expanded header moved");
    await page.screenshot({ path: `/tmp/qarar-display-guidance-${width}-${dark ? "dark" : "light"}.png` });
    await dialog.getByRole("button", { name: "إغلاق العرض الموسع" }).click();
    results.push({ width, dark, chair: true, expanded: true });
  }
  // The available scene is much shorter inside the actual application's shell.
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(`${base}/iframe.html?id=${story("ChairDiscussion")}&viewMode=story`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "إنهاء المناقشة والانتقال للتصويت" })).toBeVisible();
  await page.getByRole("heading", { name: "مجلس الكلية · الاجتماع الدوري الثالث" }).evaluate(heading => { heading.closest("header").parentElement.style.height = "680px"; });
  const shortAction = await page.getByRole("button", { name: "إنهاء المناقشة والانتقال للتصويت" }).boundingBox();
  if (shortAction.y + shortAction.height > 720) throw Error("Next action clipped at short desktop height");
  await page.screenshot({ path: "/tmp/qarar-display-chair-short-desktop.png" });
  for (const width of [1440, 390]) for (const dark of [false, true]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${base}/iframe.html?id=${story("MemberDocument")}&viewMode=story`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "تكبير المرفقات" })).toBeVisible({ timeout: 60000 });
    const themeToggle = page.getByRole("button", { name: dark ? "الوضع الليلي" : "الوضع الفاتح", exact: true });
    if (await themeToggle.count()) await themeToggle.click();
    await page.getByRole("button", { name: "بطاقة د. منصور", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("رئيس المجلس");
    await page.screenshot({ path: `/tmp/qarar-display-member-card-${width}-${dark ? "dark" : "light"}.png` });
    await page.getByRole("dialog").getByRole("button", { name: "إغلاق", exact: true }).last().click();
    await page.getByRole("button", { name: "تكبير المرفقات" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("iframe")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "الصفحة التالية" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "إغلاق الملف" })).toHaveCount(0);
    await page.screenshot({ path: `/tmp/qarar-display-member-document-${width}-${dark ? "dark" : "light"}.png` });
    await dialog.getByRole("button", { name: "إغلاق العرض الموسع" }).click();
    results.push({ width, dark, memberExpandedDocument: true });
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(JSON.stringify({ ok: true, results }));
} finally { await browser.close(); }
