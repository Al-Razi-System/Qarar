import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TopicTypesList } from "./topic-types-list";

afterEach(() => vi.unstubAllGlobals());
it("shows real drafts and details without fabricating topic counts", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ data: url.includes("bundleId") ? {
    submitted_topic_count: 3, topic_type: { name_ar: "خطة الاختبارات" }, authorities: [{ authority_text: "إقرار الخطط" }],
    authoring: { required_attachment_count: 2 }, schedule: { rule_type: "none" },
  } : { items: [{ bundle_id: "b1", name_ar: "خطة الاختبارات", classification_name: "أكاديمي", status: "draft", reference_number: "TYP-2026-000001" }], total: 1 } }) })));
  render(<TopicTypesList/>);
  await userEvent.click(await screen.findByRole("button", { name: /عرض خطة الاختبارات/ }));
  expect(await screen.findByText("إقرار الخطط")).toBeInTheDocument();
  expect(screen.getByText("2 على الأقل")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.queryByText("غير متاح بعد")).not.toBeInTheDocument();
  expect(screen.queryByText("draft")).not.toBeInTheDocument();
});
it("provides retry on list failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  render(<TopicTypesList/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل التصنيفات");
  expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
});
it("describes seasonal dates in Arabic, never as undefined", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ data: url.includes("bundleId") ? {
    submitted_topic_count: 0, topic_type: { name_ar: "تقرير موسمي" }, authorities: [],
    authoring: { required_attachment_count: 0 },
    schedule: { rule_type: "seasonal", rule_config: { starts_on: "2026-01-01", dates: [{ month: 3, day: 15 }, { month: 9, day: 1, to_month: 9, to_day: 30 }] } },
  } : { items: [{ bundle_id: "b2", name_ar: "تقرير موسمي", classification_name: "أكاديمي", status: "draft", reference_number: "TYP-2026-000002" }], total: 1 } }) })));
  render(<TopicTypesList/>);
  await userEvent.click(await screen.findByRole("button", { name: /عرض تقرير موسمي/ }));
  expect(await screen.findByText("سنويًا في 15 مارس، 1 – 30 سبتمبر")).toBeInTheDocument();
  expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
});
