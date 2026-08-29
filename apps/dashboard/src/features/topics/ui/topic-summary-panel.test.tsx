import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TopicDetail } from "../model/topic-view";
import { TopicSummaryPanel } from "./topic-summary-panel";

const topic: TopicDetail = {
  id: "topic-1",
  topic_no: "TOP-2026-000001",
  title_ar: "اعتماد الموازنة السنوية",
  description: "مناقشة مشروع الموازنة واعتماده.",
  status: "new",
  priority: "medium",
  routing_status: "routing_ready",
  category: { name_ar: "الموازنة والحسابات والاستثمار" },
  governance_unit: { name_ar: "مجلس الأمناء" },
  submitted_by: { full_name_ar: "مدير النظام التجريبي" },
  allowed_review_actions: ["approve", "return", "reject"],
};

describe("TopicSummaryPanel", () => {
  it("shows resolved topic metadata instead of fallback dashes", () => {
    render(<TopicSummaryPanel topic={topic} loading={false} reviewMode busy={false} onReview={vi.fn()} onRefer={vi.fn()} onOpenDetails={vi.fn()} />);
    expect(screen.getByText("الموازنة والحسابات والاستثمار")).toBeInTheDocument();
    expect(screen.getByText("مجلس الأمناء")).toBeInTheDocument();
    expect(screen.getAllByText("المسار جاهز").length).toBeGreaterThan(0);
  });

  it("executes approval directly from the primary button", async () => {
    const onReview = vi.fn();
    render(<TopicSummaryPanel topic={topic} loading={false} reviewMode busy={false} onReview={onReview} onRefer={vi.fn()} onOpenDetails={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "اعتماد مباشر" }));
    expect(onReview).toHaveBeenCalledWith("approve");
  });

  it("does not expose review actions for a returned topic", () => {
    render(<TopicSummaryPanel topic={{ ...topic, status: "returned", allowed_review_actions: [] }} loading={false} reviewMode busy={false} onReview={vi.fn()} onRefer={vi.fn()} onOpenDetails={vi.fn()} />);
    expect(screen.getByText("مطلوب استكمال")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "اعتماد مباشر" })).not.toBeInTheDocument();
  });
});
