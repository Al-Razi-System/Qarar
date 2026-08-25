import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeetingsWorkspace } from "./meetings/ui/meetings-workspace";

describe("RTL and accessibility contracts", () => {
  it("exposes named controls and keeps the document RTL-ready", () => {
    document.documentElement.dir = "rtl";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 }),
    );
    render(<main dir="rtl" aria-label="مساحة إدارة الاجتماعات"><MeetingsWorkspace /></main>);
    expect(document.querySelector("main")?.getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("main", { name: "مساحة إدارة الاجتماعات" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /إنشاء اجتماع/ })).toBeInTheDocument();
    expect(screen.getByRole("main").querySelectorAll("button").length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
