// Read-only browser checks against Storybook fixtures; no account/database writes.
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const base = "http://127.0.0.1:6008";
const entries = Object.values((await (await fetch(`${base}/index.json`)).json()).entries);
const story = name => entries.find(entry => entry.importPath.endsWith("agenda-workspace.stories.tsx") && entry.exportName === name)?.id;
const browser = await chromium.launch({ headless: true });
const results = []; const errors = [];
try {
  const page = await browser.newPage(); page.on("pageerror", error => errors.push(error.message));
  for (const width of [1440, 390]) for (const dark of [false, true]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.addInitScript(value => localStorage.setItem("qarar.meeting-room.theme", value), dark ? "dark" : "light");
    await page.goto(`${base}/iframe.html?id=${story("MemberVoting")}&viewMode=story`);
    const dialog = page.getByRole("dialog", { name: "التصويت على البند" });
    await expect(dialog).toBeVisible({ timeout: 60000 });
    await expect(dialog.getByRole("button", { name: "تأكيد التصويت" })).toBeDisabled();
    await dialog.getByRole("radio", { name: "موافق", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "تأكيد التصويت" })).toBeEnabled();
    await dialog.getByRole("button", { name: "إضافة ملاحظة اختيارية" }).click();
    await dialog.getByLabel("ملاحظة مع التصويت").fill("ملاحظة اختبار خاصة");
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Overflow at ${width}`);
    await page.screenshot({ path: `/tmp/qarar-vote-dialog-${width}-${dark ? "dark" : "light"}.png` });
    await dialog.getByRole("button", { name: "لاحقًا" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "أدلِ بصوتك" }).click();
    await expect(dialog.getByLabel("ملاحظة مع التصويت")).toHaveValue("ملاحظة اختبار خاصة");
    results.push({ width, dark, privateDialog: true });
    await page.goto(`${base}/iframe.html?id=${story("ChairAssignments")}&viewMode=story`);
    const dock = page.getByRole("region", { name: "شريط تحكم رئيس المجلس" });
    await expect(dock.getByRole("button", { name: "إضافة تكليف" })).toBeVisible({ timeout: 60000 });
    await dock.getByRole("button", { name: "إضافة تكليف" }).click();
    const assignment = page.getByRole("dialog", { name: "إضافة تكليف" });
    await expect(assignment).toBeVisible();
    await assignment.getByLabel("عنوان التكليف").fill("مراجعة بنود الميزانية");
    await page.screenshot({ path: `/tmp/qarar-assignment-dialog-${width}-${dark ? "dark" : "light"}.png` });
    const button = await assignment.getByRole("button", { name: "إصدار التكليف" }).boundingBox();
    if (button.y + button.height > (width === 390 ? 844 : 900)) throw Error("Assignment action outside dialog viewport");
    results.push({ width, dark, assignmentDialog: true });
    await assignment.getByRole("button", { name: "إغلاق", exact: true }).click();
    await page.getByRole("button", { name: "تفاصيل الموضوع ومساره" }).click();
    const context = page.getByRole("dialog", { name: /تفاصيل الموضوع ومساره/ });
    await expect(context.getByRole("heading", { name: "وصف المقترح" })).toBeVisible();
    await expect(context.getByText("المرحلة الحالية", { exact: true })).toBeVisible();
    const headerBefore = await context.locator("header").boundingBox();
    await context.locator("header + div").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(context.getByText("أوصى مجلس القسم باعتماد المقترح وإحالته لمجلس الكلية.")).toBeVisible();
    const header = await context.locator("header").boundingBox();
    if (header.y !== headerBefore.y || header.y > 4) throw Error("Topic context header scrolled out");
    await page.screenshot({ path: `/tmp/qarar-topic-context-${width}-${dark ? "dark" : "light"}.png` });
    results.push({ width, dark, topicContext: true });
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(JSON.stringify({ ok: true, results }));
} finally { await browser.close(); }
