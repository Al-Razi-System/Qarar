import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViolationsWorkspace } from "./violations-workspace";

vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));

const page = {
  items: [
    { id: "v1", rule_code: "minutes_pending", rule_name_ar: "محضر لم يُعتمد بعد", council_id: "c1", council_name_ar: "مجلس قسم الذكاء الاصطناعي",
      subject_label: "اجتماع أكتوبر", subject_link: "/admin/meetings/m1", due_since: "2026-11-01T00:00:00Z", status: "open", resolved_at: null,
      days_open: 11, escalation_level: 1, relation: "follower" },
    { id: "v2", rule_code: "task_overdue", rule_name_ar: "تكليف متأخر عن موعده", council_id: "c2", council_name_ar: "مجلس كلية الحاسوب",
      subject_label: "TSK-1 رفع الخطة", subject_link: "/admin/tasks?task=t1", due_since: "2026-11-10T00:00:00Z", status: "open", resolved_at: null,
      days_open: 2, escalation_level: 0, relation: "leader" },
  ],
  total: 2,
  councils: [{ id: "c1", name_ar: "مجلس قسم الذكاء الاصطناعي" }, { id: "c2", name_ar: "مجلس كلية الحاسوب" }],
  rules: [{ rule_code: "task_overdue", name_ar: "تكليف متأخر عن موعده" }, { rule_code: "minutes_pending", name_ar: "محضر لم يُعتمد بعد" }],
};

function mockApi(data: unknown = page) {
  const calls: Array<Record<string, unknown>> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)).params);
    return Response.json({ data });
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("ViolationsWorkspace", () => {
  it("lists late items in Arabic with how long, how far escalated, and a link to act", async () => {
    mockApi();
    render(<ViolationsWorkspace />);
    const link = (await screen.findByText("محضر لم يُعتمد بعد", { selector: "span" })).closest("a");
    expect(link).toHaveAttribute("href", "/admin/meetings/m1");
    expect(link).toHaveTextContent("متأخر منذ ١١ يومًا");
    expect(link).toHaveTextContent("صُعّد إلى أقرب متابع");
    expect(link).toHaveTextContent("مجلس تتابعه");
    expect(screen.getByText("متأخر منذ يومين")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "ملخص التجاوزات المفتوحة" })).toHaveTextContent("محضر لم يُعتمد بعد: ١");
    expect(document.body).not.toHaveTextContent("minutes_pending");
  });

  it("filters by status, rule and council", async () => {
    const calls = mockApi();
    render(<ViolationsWorkspace />);
    await screen.findByText("اجتماع أكتوبر", { exact: false });
    expect(calls[0]).toEqual({ p_status: "open", p_rule_code: null, p_council_id: null });
    fireEvent.click(screen.getByRole("radio", { name: "المعالَجة" }));
    await waitFor(() => expect(calls.at(-1)?.p_status).toBe("resolved"));
    fireEvent.change(screen.getByLabelText("نوع التجاوز"), { target: { value: "task_overdue" } });
    await waitFor(() => expect(calls.at(-1)?.p_rule_code).toBe("task_overdue"));
    fireEvent.change(screen.getByLabelText("المجلس"), { target: { value: "c2" } });
    await waitFor(() => expect(calls.at(-1)?.p_council_id).toBe("c2"));
  });

  it("explains an empty scope", async () => {
    mockApi({ items: [], total: 0, councils: [], rules: page.rules });
    render(<ViolationsWorkspace />);
    expect(await screen.findByText("لا تجاوزات مفتوحة في نطاقك.")).toBeInTheDocument();
    expect(screen.getByText(/لا تقود أي مجلس ولا تتابع أي مجالس/)).toBeInTheDocument();
  });
});
