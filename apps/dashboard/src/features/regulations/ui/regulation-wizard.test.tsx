import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegulationWizard } from "./regulation-wizard";

describe("RegulationWizard accessibility and RTL", () => {
  it("exposes the active step and Arabic labels in RTL", () => {
    render(<div dir="rtl"><RegulationWizard steps={[{ label: "بيانات اللائحة", done: true }, { label: "البنود", done: false }]} onSelect={vi.fn()} /></div>);
    expect(screen.getByRole("list", { name: "مراحل إعداد اللائحة" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2\. البنود، غير مكتملة/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /1\. بيانات اللائحة، مكتملة/ })).toBeInTheDocument();
  });
});
