import { render, screen } from "@testing-library/react";
import Link from "next/link";
import { afterEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: rpc }));
vi.mock("@/features/topics/ui/topics-workspace", () => ({
  TopicsWorkspace: ({ canCreate }: { canCreate: boolean }) => canCreate ? <Link href="/admin/topics/new">إنشاء موضوع</Link> : null,
}));
import TopicsPage from "./page";
afterEach(() => vi.clearAllMocks());
it("keeps the main entry available for an active system administrator without memberships", async () => {
  rpc.mockResolvedValue({ is_system_admin: true, permissions: [] });
  render(await TopicsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("link", { name: "إنشاء موضوع" })).toHaveAttribute("href", "/admin/topics/new");
});
it("shows the same entry for a contextual submitter", async () => {
  rpc.mockResolvedValue({ is_system_admin: false, permissions: ["topics.create"] });
  render(await TopicsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("link", { name: "إنشاء موضوع" })).toBeVisible();
});
it("does not offer creation to a reader without submission authority", async () => {
  rpc.mockResolvedValue({ is_system_admin: false, permissions: ["topics.read"] });
  render(await TopicsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.queryByRole("link", { name: "إنشاء موضوع" })).not.toBeInTheDocument();
});
