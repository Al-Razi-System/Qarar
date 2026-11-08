import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CollapsibleSection } from "./collapsible-section";

it("folds long content away and opens it on demand", () => {
  render(<CollapsibleSection title="التعليمات"><p>نص طويل</p></CollapsibleSection>);
  const toggle = screen.getByRole("button", { name: /التعليمات/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("نص طويل")).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByText("نص طويل")).toBeInTheDocument();
  expect(toggle).toHaveAttribute("aria-expanded", "true");
});
