import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JourneyRail, type JourneyStep } from "./journey-rail";

const steps: JourneyStep[] = [
  { label: "تكليف", state: "done", detail: "16 أكتوبر" },
  { label: "تنفيذ", state: "current" },
  { label: "تسليم", state: "upcoming" },
  { label: "تحقق", state: "upcoming" },
];

describe("JourneyRail", () => {
  it("lists the stations in order and names each state in words", () => {
    render(<JourneyRail steps={steps} label="مسار المهمة" />);
    const rail = screen.getByRole("list", { name: "مسار المهمة" });
    const items = within(rail).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["✓تكليف: تمت16 أكتوبر", "2تنفيذ: الآن", "3تسليم: لم تبدأ", "4تحقق: لم تبدأ"]);
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("keeps the words in the compact rail for screen readers", () => {
    render(<JourneyRail steps={[...steps.slice(0, 1), { label: "تنفيذ", state: "blocked" }, ...steps.slice(2)]} label="مسار المهمة" compact />);
    expect(screen.getByRole("list", { name: "مسار المهمة" })).toHaveTextContent("تنفيذ: متعثرة");
  });
});
