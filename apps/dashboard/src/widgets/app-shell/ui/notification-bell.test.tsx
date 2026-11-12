import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./notification-bell";

vi.mock("next/link", () => ({ default: ({ href, children, onClick, className }: { href: string; children: React.ReactNode; onClick?: () => void; className?: string }) => <a href={href} onClick={(event) => { event.preventDefault(); onClick?.(); }} className={className}>{children}</a> }));

const items = [
  { id: "11111111-1111-4111-8111-111111111111", category: "escalation", title_ar: "تصعيد: محضر لم يُعتمد بعد", body_ar: "مجلس قسم أ1: اجتماع أكتوبر", link_path: "/admin/meetings/m1", created_at: new Date().toISOString(), read_at: null },
  { id: "22222222-2222-4222-8222-222222222222", category: "meeting", title_ar: "تذكير باجتماع قادم", body_ar: null, link_path: null, created_at: new Date().toISOString(), read_at: "2026-11-12T00:00:00Z" },
];

function Harness() {
  const [open, setOpen] = useState(false);
  return <NotificationBell open={open} onOpenChange={setOpen} />;
}

function mockApi(unread = 1) {
  const posts: unknown[] = [];
  let remaining = unread;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); remaining = 0; return Response.json({ data: { unread_count: 0 } }); }
    return Response.json({ data: { items: remaining ? items : items.map((item) => ({ ...item, read_at: item.read_at ?? "2026-11-12T01:00:00Z" })), unread_count: remaining } });
  });
  return posts;
}

afterEach(() => vi.restoreAllMocks());

describe("NotificationBell", () => {
  it("shows the real unread count instead of a permanent dot", async () => {
    mockApi(1);
    render(<Harness />);
    expect(await screen.findByRole("button", { name: "الإشعارات، ١ غير مقروءة" })).toBeInTheDocument();
  });

  it("opens the latest notifications and marks one read when followed", async () => {
    const posts = mockApi(1);
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /الإشعارات/ }));
    const panel = await screen.findByRole("dialog", { name: "الإشعارات" });
    const link = within(panel).getByText("تصعيد: محضر لم يُعتمد بعد").closest("a");
    expect(link).toHaveAttribute("href", "/admin/meetings/m1");
    fireEvent.click(link!);
    await waitFor(() => expect(posts).toContainEqual({ ids: ["11111111-1111-4111-8111-111111111111"] }));
    expect(await screen.findByRole("button", { name: "الإشعارات" })).toBeInTheDocument();
  });

  it("marks everything read in one action", async () => {
    const posts = mockApi(1);
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /الإشعارات/ }));
    fireEvent.click(await screen.findByRole("button", { name: "تعليم الكل مقروءًا" }));
    await waitFor(() => expect(posts).toContainEqual({ ids: null }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "تعليم الكل مقروءًا" })).not.toBeInTheDocument());
  });

  it("shows a load failure inside the panel", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { message: "تعذر تحميل الإشعارات." } }, { status: 500 }));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "الإشعارات" }));
    expect(await screen.findByText("تعذر تحميل الإشعارات.")).toBeInTheDocument();
  });
});
