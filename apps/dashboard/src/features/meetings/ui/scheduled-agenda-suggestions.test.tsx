import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScheduledAgendaSuggestions } from "./scheduled-agenda-suggestions";

describe("scheduled agenda suggestions", () => {
  it("does not render an empty proposal section", () => {
    const { container } = render(<ScheduledAgendaSuggestions items={[]}/>);
    expect(container).toBeEmptyDOMElement();
  });
  it("distinguishes scheduled proposals from approved agenda and explains attachments", () => {
    render(<ScheduledAgendaSuggestions items={[{ topic_type_version_id: "type-1", title_ar: "خطة الاختبارات", available_from: "2026-11-01", due_on: "2026-11-07", required_attachment_count: 2 }]}/>);
    expect(screen.getByRole("heading", { name: "خطة الاختبارات" })).toBeInTheDocument();
    expect(screen.getByText(/ليست بنودًا معتمدة/)).toBeInTheDocument();
    expect(screen.getByText(/المرفقات المطلوبة قبل الإدراج: 2/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
