import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberCard } from "./member-card";

describe("MemberCard identity", () => {
  it("does not repeat an identical role and membership title", () => {
    render(<MemberCard member={{ name: "خليل الوجيه", roleLabel: "رئيس المجلس", membershipTitle: "رئيس المجلس", email: "a-very-long-email@university.example.test" }} fallbackName="خليل" mobileVisible={false} onClose={vi.fn()} />);
    expect(screen.getByText("رئيس المجلس", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("رئيس المجلس · رئيس المجلس")).not.toBeInTheDocument();
    expect(screen.getByText("يظهر لرئيس المجلس ومقرره فقط.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "a-very-long-email@university.example.test" })).toHaveClass("break-all");
  });
});
