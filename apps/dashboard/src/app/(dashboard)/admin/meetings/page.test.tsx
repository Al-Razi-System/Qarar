import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/features/meetings/ui/meetings-workspace", () => ({
  MeetingsWorkspace: ({ initialMeetingId }: { initialMeetingId?: string }) => <div data-testid="meetings-workspace">{initialMeetingId ?? "all"}</div>,
}));

import MeetingsPage from "./page";

it("passes the requested meeting to the focused agenda workspace", async () => {
  render(await MeetingsPage({ searchParams: Promise.resolve({ manage: "meeting-draft" }) }));
  expect(screen.getByTestId("meetings-workspace")).toHaveTextContent("meeting-draft");
});
