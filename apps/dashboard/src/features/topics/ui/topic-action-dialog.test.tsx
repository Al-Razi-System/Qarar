import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopicActionDialog } from "./topic-action-dialog";
import type { TopicDetail } from "../model/topic-view";

const topic = { id: "topic-1", title_ar: "مراجعة الخطة", status: "under_review", priority: "medium" } as TopicDetail;
const props = { topic, reason: "استكمال البيانات", busy: false, onReasonChange: vi.fn(), onClose: vi.fn(), onConfirm: vi.fn() };

describe("TopicActionDialog presentation", () => {
  it("uses the primary action token for a completion request", () => {
    render(<TopicActionDialog {...props} action="return" />);
    expect(screen.getByRole("button", { name: "إرسال طلب الاستكمال" })).toHaveClass("bg-q-primary", "text-q-on-primary");
  });

  it("uses the danger action token for rejection", () => {
    render(<TopicActionDialog {...props} action="reject" />);
    expect(screen.getByRole("button", { name: "تأكيد الرفض" })).toHaveClass("bg-q-danger", "text-q-on-danger");
  });

  it("preserves reason validation, pending protection and the confirmation callback", () => {
    const confirm = vi.fn();
    const { rerender } = render(<TopicActionDialog {...props} action="return" reason="قصير" onConfirm={confirm} />);
    expect(screen.getByRole("button", { name: "إرسال طلب الاستكمال" })).toBeDisabled();
    rerender(<TopicActionDialog {...props} action="return" onConfirm={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب الاستكمال" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    rerender(<TopicActionDialog {...props} action="return" busy onConfirm={confirm} />);
    expect(screen.getByRole("button", { name: "جارٍ التنفيذ..." })).toBeDisabled();
  });
});
