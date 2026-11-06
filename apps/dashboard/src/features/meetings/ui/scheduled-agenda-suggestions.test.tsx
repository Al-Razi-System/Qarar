import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduledAgendaSuggestions } from "./scheduled-agenda-suggestions";

describe("scheduled agenda suggestions", () => {
  it("does not render an empty proposal section", () => {
    const { container } = render(<ScheduledAgendaSuggestions items={[]} onPrepare={()=>undefined}/>);
    expect(container).toBeEmptyDOMElement();
  });
  it("distinguishes scheduled proposals from approved agenda and explains attachments", () => {
    const onPrepare = vi.fn();
    const item = { topic_type_version_id: "type-1", title_ar: "خطة الاختبارات", available_from: "2026-11-01", due_on: "2026-11-07", required_attachment_count: 2 };
    render(<ScheduledAgendaSuggestions items={[item]} onPrepare={onPrepare}/>);
    expect(screen.getByRole("heading", { name: "خطة الاختبارات" })).toBeInTheDocument();
    expect(screen.getByText(/ليست بنودًا معتمدة/)).toBeInTheDocument();
    expect(screen.getByText(/المرفقات المطلوبة قبل الإدراج: 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "استكمال وإدراج خطة الاختبارات" }));
    expect(onPrepare).toHaveBeenCalledWith(item);
  });
  it("marks a carried occurrence as overdue and exposes its stable reference", () => {
    render(<ScheduledAgendaSuggestions items={[{ occurrence_id: "occurrence-1", reference_number: "TSO-2026-000001", topic_type_version_id: "type-1", title_ar: "الخطة السنوية", available_from: "2026-10-01", due_on: "2026-10-07", timing_status: "overdue", required_attachment_count: 0 }]} onPrepare={()=>undefined}/>);
    expect(screen.getByText("متأخر عن دورته")).toBeInTheDocument();
    expect(screen.getByText(/TSO-2026-000001/)).toBeInTheDocument();
  });
});
