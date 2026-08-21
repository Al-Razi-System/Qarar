import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuditWorkspace } from "./audit/ui/audit-workspace";
import { DelegationsWorkspace } from "./delegations/ui/delegations-workspace";
import { MeetingsWorkspace } from "./meetings/ui/meetings-workspace";
import { SessionsWorkspace } from "./sessions/ui/sessions-workspace";
import { SsoWorkspace } from "./sso/ui/sso-workspace";
import { TopicsWorkspace } from "./topics/ui/topics-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe("new administration workspaces", () => {
  it.each([
    ["audit", AuditWorkspace, "سجل"],
    ["delegations", DelegationsWorkspace, "التفويض"],
    ["meetings", MeetingsWorkspace, "الاجتماع"],
    ["sessions", SessionsWorkspace, "الجلس"],
    ["sso", SsoWorkspace, "الدخول"],
    ["topics", TopicsWorkspace, "الموضوع"],
  ])("renders %s without crashing", (_name, Component) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 }),
    );
    render(<Component />);
    expect(document.body.firstElementChild).toBeTruthy();
    vi.restoreAllMocks();
  });
});
