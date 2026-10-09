import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell, type AppAccessContext } from "./app-shell";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ replace, refresh: vi.fn() }),
}));

const baseAccess: AppAccessContext = {
  user_id: "00000000-0000-0000-0000-000000000001",
  full_name_ar: "مستخدم الاختبار",
  permissions: [],
  roles: [],
};

describe("AppShell governance navigation", () => {
  beforeEach(() => replace.mockClear());

  it("shows the governance model entry to an authorized manager", () => {
    render(<AppShell access={{ ...baseAccess, permissions: ["governance.regulations.manage"] }}><div>المحتوى</div></AppShell>);

    const entries = screen.getAllByRole("link", { name: /تصنيفات الموضوعات/ });
    expect(entries).toHaveLength(2);
    entries.forEach(entry => expect(entry).toHaveAttribute("href", "/admin/governance-model"));
  });

  it("does not expose the governance model entry to an unauthorized user", () => {
    render(<AppShell access={baseAccess}><div>المحتوى</div></AppShell>);

    expect(screen.queryByRole("link", { name: /تصنيفات الموضوعات/ })).not.toBeInTheDocument();
  });
});
