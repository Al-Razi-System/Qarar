import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopicContextDialog } from "./topic-context-dialog";
describe("meeting topic context", () => {
  it("renders the body, route and closed decisions without exposing machine states", () => {
    const close = vi.fn();
    render(<TopicContextDialog title="الميزانية" context={{ description: "### تفاصيل الطلب\n\n<strong>مراجعة الاعتمادات</strong>", route: [{ id: "s1", name_ar: "مراجعة الجامعة", sequence_no: 1, unit_name_ar: "مجلس الجامعة", status: "completed", current: false, acted_at: null }, { id: "s2", name_ar: "اعتماد الأمناء", sequence_no: 2, unit_name_ar: "مجلس الأمناء", status: "active", current: true, acted_at: null }], previous_decisions: [{ id: "d1", decision_no: "DEC-2026-1", decision_text: "الموافقة على الاعتمادات", meeting_title_ar: "الجلسة السابقة", meeting_no: "MTG-1", meeting_date: "2026-10-18", unit_name_ar: "مجلس الجامعة" }] }} onClose={close} />);
    expect(screen.getByRole("heading", { name: "تفاصيل الطلب" })).toBeInTheDocument();
    expect(screen.getByText("مراجعة الاعتمادات").tagName).toBe("STRONG");
    expect(screen.getByText("الموافقة على الاعتمادات")).toBeInTheDocument();
    expect(screen.getByText("MTG-1")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("المرحلة الحالية")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).not.toHaveTextContent("completed");
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى الاجتماع" })); expect(close).toHaveBeenCalledOnce();
  });
  it("states missing legacy context explicitly", () => {
    render(<TopicContextDialog title="موضوع سابق" context={{ description: null, route: [], previous_decisions: [] }} onClose={vi.fn()} />);
    expect(screen.getByText("لم يُسجَّل وصف لهذا الموضوع.")).toBeInTheDocument();
    expect(screen.getByText("لا توجد مراحل تنفيذ مسجلة لهذا الموضوع.")).toBeInTheDocument();
    expect(screen.getByText("لا قرارات من اجتماعات مغلقة سابقة لهذا الموضوع.")).toBeInTheDocument();
  });
});
