import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { TopicRow, TopicsFollowUp } from "../model/performance";
import { TopicsFollowUpView } from "./topics-follow-up";

const topic = (extra: Partial<TopicRow>): TopicRow => ({
  id: "t1", topic_no: "T-1", title_ar: "ميزانية الكلية", category_name_ar: "اعتماد الميزانية", governance_source: "regulated", state: "stalled",
  at_council_id: "c1", at_council_name_ar: "مجلس الجامعة", waiting_days: 34, age_days: 40, created_on: "2026-10-01", steps_total: 3, steps_done: 1,
  listed_count: 2, decision_no: null, outcome_kind: null, tasks: 0, tasks_done: 0, link: "/admin/topics/t1", ...extra,
});
const data: TopicsFollowUp = {
  academic_year_start: "2026-09-01",
  summary: { total: 3, in_progress: 1, stalled: 1, returned: 0, finished: 1, ungoverned: 1, avg_days_to_finish: 15, avg_waiting_days: 20 },
  by_council: [{ id: "c1", name_ar: "مجلس الجامعة", open: 1, stalled: 1, longest_wait: 34 }, { id: "c2", name_ar: "مجلس الكلية", open: 1, stalled: 0, longest_wait: 6 }],
  by_category: [{ name_ar: "اعتماد الميزانية", total: 2, finished: 1, avg_days_to_finish: 15 }, { name_ar: "بلا تصنيف", total: 1, finished: 0, avg_days_to_finish: null }],
  topics: [
    topic({}),
    topic({ id: "t2", topic_no: "T-2", title_ar: "طلب مباشر", category_name_ar: null, governance_source: "custom", state: "in_progress", at_council_id: "c2", at_council_name_ar: "مجلس الكلية", waiting_days: 6, steps_total: 0, steps_done: 0, listed_count: 0, link: "/admin/topics/t2" }),
    topic({ id: "t3", topic_no: "T-3", title_ar: "خطة محسومة", state: "finished", at_council_id: null, at_council_name_ar: null, waiting_days: null, age_days: 15, steps_done: 3, decision_no: "D-1", outcome_kind: "approval", tasks: 2, tasks_done: 1, link: "/admin/topics/t3" }),
  ],
};
const rows = () => within(screen.getByRole("region", { name: "الموضوعات" })).getAllByRole("row").slice(1);

describe("TopicsFollowUpView", () => {
  it("shows where each topic stands, how long it waited, its route progress and what was decided", () => {
    render(<TopicsFollowUpView data={data} />);
    expect(rows()).toHaveLength(3);
    expect(rows()[0]).toHaveTextContent("مجلس الجامعة");
    expect(rows()[0]).toHaveTextContent("منذ 34 يومًا");
    expect(within(rows()[0]).getByRole("img", { name: "أُنجزت 1 من 3 مراحل" })).toBeInTheDocument();
    expect(within(rows()[0]).getByText("متوقف")).toBeInTheDocument();
    expect(rows()[1]).toHaveTextContent("مباشر");
    expect(rows()[1]).toHaveTextContent("بلا مسار");
    expect(rows()[2]).toHaveTextContent("موافقة");
    expect(rows()[2]).toHaveTextContent("نُفّذ 1 من 2");
    expect(screen.getByRole("link", { name: "ميزانية الكلية" })).toHaveAttribute("href", "/admin/topics/t1");
  });

  it("summarises the topics against what counts as stalled", () => {
    render(<TopicsFollowUpView data={data} />);
    const strip = screen.getByRole("region", { name: "مؤشرات الموضوعات" });
    expect(strip).toHaveTextContent("قيد المعالجة الآن2");
    expect(strip).toHaveTextContent("1 منها متوقف");
    expect(strip).toHaveTextContent("متوسط مدة الحسم 15 يومًا");
    expect(strip).toHaveTextContent("غير محوكمة1 من 3");
  });

  it("filters by state, by governance and by the council a topic stands at", async () => {
    render(<TopicsFollowUpView data={data} />);
    await userEvent.click(screen.getByRole("radio", { name: "محسومة 1" }));
    expect(rows()).toHaveLength(1);
    await userEvent.click(screen.getByRole("radio", { name: "الكل 3" }));
    await userEvent.click(screen.getByRole("radio", { name: "غير محوكمة" }));
    expect(rows()[0]).toHaveTextContent("طلب مباشر");
    await userEvent.click(screen.getByRole("button", { name: /مجلس الجامعة/ }));
    expect(screen.getByText("لا موضوعات بهذه التصفية.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "عرض كل المجالس" }));
    expect(rows()).toHaveLength(1);
  });

  it("opens already filtered when another dashboard links to it", () => {
    render(<TopicsFollowUpView data={data} initial={{ councilId: "c2", governance: "ungoverned" }} />);
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("تعرض ما يقف عند:")).toHaveTextContent("مجلس الكلية");
  });

  it("says so when there is no topic in scope", () => {
    render(<TopicsFollowUpView data={{ ...data, summary: { ...data.summary, total: 0 }, topics: [], by_council: [], by_category: [] }} />);
    expect(screen.getByText(/لا موضوعات في المجالس التي تقودها أو تتابعها/)).toBeInTheDocument();
  });
});
