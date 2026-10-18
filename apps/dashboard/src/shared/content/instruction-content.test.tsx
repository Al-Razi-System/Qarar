import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstructionContent } from "./instruction-content";

describe("InstructionContent legacy guidance", () => {
  it("renders unprefixed Markdown and safe HTML without rewriting the source", () => {
    render(<InstructionContent value={'### المخاطر المالية\n\n- السيولة\n\n<strong>أرفق التقرير</strong>'} />);
    expect(screen.getByRole("heading", { name: "المخاطر المالية", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("السيولة");
    expect(screen.getByText("أرفق التقرير").tagName).toBe("STRONG");
  });
  it("sanitizes legacy HTML, links and embedded content", () => {
    const { container } = render(<InstructionContent value={'<script>alert(1)</script><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)" onclick="alert(1)">خطر</a><span style="position:fixed;color:#0066cc">آمن</span>'} />);
    expect(container.querySelector("script,iframe,[onclick],[href^='javascript:']")).toBeNull();
    expect(screen.getByText("آمن")).not.toHaveAttribute("style", expect.stringContaining("position"));
  });
});
