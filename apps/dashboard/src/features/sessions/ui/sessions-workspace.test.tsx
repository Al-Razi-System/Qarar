import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionsWorkspace } from "./sessions-workspace";

const mine = [
  { id: "s-current", device_name: "Chrome على Windows", platform: "web", last_activity_at: "2026-11-12T08:00:00Z", status: "active", is_current: true },
  { id: "s-old", device_name: "Safari على iOS", platform: "web", last_activity_at: "2026-11-01T08:00:00Z", status: "ended", is_current: false },
];
const organization = {
  items: [{ id: "s-member", user_name_ar: "عضو المجلس", user_email: "m@example.test", device_name: "Edge على Windows", ip_address: "203.0.113.5", last_activity_at: "2026-11-12T07:00:00Z", status: "active", is_current: false }],
  total: 1,
};

function mockApi() {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "POST") return new Response(JSON.stringify({ revoked: true }), { status: 200 });
    if (url.includes("scope=organization")) return new Response(JSON.stringify(organization), { status: 200 });
    return new Response(JSON.stringify({ sessions: mine }), { status: 200 });
  });
  return requests;
}

afterEach(() => vi.restoreAllMocks());

describe("SessionsWorkspace", () => {
  it("shows the user's own sessions with an honest status and no organisation tab without permission", async () => {
    mockApi();
    render(<SessionsWorkspace canMonitorOrganization={false} />);

    expect(await screen.findByText("Chrome على Windows")).toBeInTheDocument();
    expect(screen.getByText("هذا الجهاز")).toBeInTheDocument();
    expect(screen.getByText("منتهية")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "جلسات المؤسسة" })).not.toBeInTheDocument();
    // An ended session has nothing left to revoke.
    expect(screen.getAllByRole("button", { name: "إبطال الجلسة" })).toHaveLength(1);
  });

  it("lets a session manager monitor the organisation's active sessions", async () => {
    const requests = mockApi();
    render(<SessionsWorkspace canMonitorOrganization />);
    await screen.findByText("Chrome على Windows");

    fireEvent.click(screen.getByRole("radio", { name: "جلسات المؤسسة" }));

    expect(await screen.findByText("عضو المجلس")).toBeInTheDocument();
    expect(requests.at(-1)?.url).toBe("/api/admin/sessions?scope=organization&status=active");
    expect(screen.getByText(/203\.0\.113\.5/)).toBeInTheDocument();
  });

  it("confirms in a dialog before revoking and reports the result in place", async () => {
    const requests = mockApi();
    render(<SessionsWorkspace canMonitorOrganization={false} />);
    await screen.findByText("Chrome على Windows");

    fireEvent.click(screen.getByRole("button", { name: "إبطال الجلسة" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "إبطال" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    expect(requests.find((request) => request.method === "POST")?.body).toMatchObject({ session_id: "s-current" });
    expect(await screen.findByText("تم إبطال الجلسة وسلسلة التحديث المرتبطة بها.")).toBeInTheDocument();
  });
});
