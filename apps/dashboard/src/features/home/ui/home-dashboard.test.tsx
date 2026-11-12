import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeDashboard, type HomeData } from "./home-dashboard";

vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));

// The local calendar day: the UTC day differs from it around midnight and made this test fail then.
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const base: HomeData = {
  user: { name_ar: "أمل" },
  meetings: { count: 2, items: [
    { link: "/admin/meetings/m2", title_ar: "الجلسة الجارية", scheduled_date: today, start_time: "10:00:00", status: "in_progress", council_name_ar: "مجلس الكلية" },
    { link: "/admin/meetings/m1", title_ar: "الاجتماع القادم", scheduled_date: today, start_time: "13:30:00", status: "scheduled", council_name_ar: "مجلس الكلية" },
  ] },
  votes: { count: 1, items: [{ link: "/admin/meetings/m2", round_id: "r1", meeting_title_ar: "الجلسة الجارية", topic_title_ar: "خطة الكلية" }] },
  signatures: { count: 0, items: [] },
  tasks: { open: 2, overdue: 1, to_verify: 1, items: [{ link: "/admin/tasks?task=a1", id: "a1", action_no: "A-1", title_ar: "مهمة متأخرة", due_date: today, overdue: true }] },
  topics: { returned: 1, to_review: 0, items: [{ link: "/admin/topics/t2", id: "t2", topic_no: "T-2", title_ar: "طلب أُعيد", kind: "returned" }] },
  leadership: { councils: 1, open: 0 },
  oversight: { councils: 24, open: 3, escalated: 1, by_rule: [{ name_ar: "موضوع متوقف في المجلس", count: 3 }],
    oldest: [{ council_name_ar: "مجلس قسم التسويق", rule_name_ar: "موضوع متوقف في المجلس", subject_label: "T-9 خطة", days_open: 61, link: "/admin/topics/t9" }] },
  organization: null,
};

describe("HomeDashboard", () => {
  it("leads with what is waiting for this person, each card linking to where to act", () => {
    render(<HomeDashboard data={base} />);
    expect(screen.getByText("2 منها يحتاج إجراءً عاجلًا")).toBeInTheDocument();
    const meetings = screen.getByRole("article", { name: "اجتماعاتي القادمة" });
    expect(within(meetings).getByText("منعقد الآن")).toBeInTheDocument();
    expect(within(meetings).getByText(/اليوم 1:30 م/)).toBeInTheDocument();
    const votes = screen.getByRole("article", { name: "تصويت ينتظر صوتك" });
    expect(within(votes).getByText("خطة الكلية").closest("a")).toHaveAttribute("href", "/admin/meetings/m2");
    expect(within(screen.getByRole("article", { name: "تكليفاتي" })).getByText("1 متأخر")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "محاضر بانتظار توقيعك" })).getByText("لا محاضر تنتظر توقيعك.")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "موضوعات تحتاج إجراءك" })).getByText("أُعيد إليك")).toBeInTheDocument();
  });

  it("shows the follow-up scope with its violations, and hides organisation indicators from non-administrators", () => {
    render(<HomeDashboard data={base} />);
    const scope = screen.getByRole("article", { name: "نطاق متابعتي" });
    expect(scope).toHaveTextContent("تتابع 24 مجلسًا");
    expect(within(scope).getByText("3 تجاوز مفتوح").closest("a")).toHaveAttribute("href", "/admin/violations");
    expect(within(scope).getByText(/T-9 خطة/).closest("a")).toHaveAttribute("href", "/admin/topics/t9");
    expect(screen.getByRole("article", { name: "المجالس التي أقودها" })).toHaveTextContent("لا تجاوزات");
    expect(screen.queryByText("مؤشرات المؤسسة")).not.toBeInTheDocument();
  });

  it("tells someone with nothing pending, and shows administrators the organisation", () => {
    render(<HomeDashboard data={{ ...base,
      meetings: { count: 0, items: [] }, votes: { count: 0, items: [] }, tasks: { open: 0, overdue: 0, to_verify: 0, items: [] },
      topics: { returned: 0, to_review: 0, items: [] }, leadership: { councils: 0, open: 0 }, oversight: null,
      organization: { active_councils: 37, meetings_next_14_days: 2, meetings_held_30_days: 3, topics_in_process: 9, decisions_30_days: 4, open_tasks: 6, overdue_tasks: 1, open_violations: 42 } }} />);
    expect(screen.getByText("لا شيء ينتظرك الآن.")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "نطاق متابعتي" })).not.toBeInTheDocument();
    expect(screen.getByText("مؤشرات المؤسسة")).toBeInTheDocument();
    expect(screen.getByText("تجاوزات مفتوحة").closest("a")).toHaveTextContent("42");
  });
});
