import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TypedTopicCreator } from "./typed-topic-creator";
afterEach(() => vi.unstubAllGlobals());
it("selects the council first and requires successful route preparation before submitting", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ data: url.includes("versionId") ? { steps: [{ name_ar: "مجلس القسم" }], authoring: { required_attachment_count: 2, submission_instructions: "أرفق خطة الاختبارات", discussion_instructions: "تعليمات خاصة بالمناقشة" } } : url.includes("unitId") ? [{ topic_type_version_id: "v1", topic_type_name_ar: "خطة الاختبارات" }] : { governance_units: [{ id: "u1", name_ar: "مجلس القسم" }] } }) })));
  render(<TypedTopicCreator/>);
  expect(screen.getByRole("button", { name: "تقديم الموضوع" })).toBeDisabled();
  await screen.findByRole("option", { name: "مجلس القسم" });
  await userEvent.selectOptions(screen.getByLabelText("المجلس"), "u1");
  await screen.findByRole("option", { name: "خطة الاختبارات" });
  await userEvent.selectOptions(screen.getByLabelText("تصنيف الموضوع"), "v1");
  expect(await screen.findByText("المرفقات المطلوبة: 2 على الأقل، تُرفع من تفاصيل الموضوع قبل المراجعة.")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "تعليمات التقديم" })).toHaveTextContent("أرفق خطة الاختبارات");
  expect(screen.queryByText("تعليمات خاصة بالمناقشة")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "تقديم الموضوع" })).toBeDisabled();
});
