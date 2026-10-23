import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../api/meetings-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/meetings-client")>();
  return { ...actual, meetingRpc: rpc };
});

import { MeetingApiError } from "../api/meetings-client";
import { MeetingsWorkspace } from "./meetings-workspace";

afterEach(() => vi.clearAllMocks());

it("keeps a failed meeting load visible with its reason and an in-place retry", async () => {
  let searchAttempts = 0;
  rpc.mockImplementation((contract: string) => {
    if (contract === "list_meeting_series") return Promise.resolve([]);
    searchAttempts += 1;
    if (searchAttempts === 1) return Promise.reject(new MeetingApiError(
      "استغرق تحميل الاجتماعات وقتًا أطول من المتوقع. أعد المحاولة بعد لحظات.",
      503,
      "QUERY_TIMEOUT",
      "request-123",
    ));
    return Promise.resolve({ items: [], total: 0 });
  });
  render(<MeetingsWorkspace />);

  expect(await screen.findByRole("alert")).toHaveTextContent("استغرق تحميل الاجتماعات وقتًا أطول من المتوقع");
  const retry = screen.getByRole("button", { name: "إعادة تحميل الاجتماعات" });

  fireEvent.click(retry);

  await waitFor(() => expect(rpc).toHaveBeenCalledWith("search_meetings", expect.any(Object), expect.objectContaining({ signal: expect.any(AbortSignal) })));
});

it("shows meeting results without waiting for the secondary recurrence list", async () => {
  let resolveSeries: (value: unknown[]) => void = () => undefined;
  const seriesPending = new Promise<unknown[]>((resolve) => { resolveSeries = resolve; });
  rpc.mockImplementation((contract: string) => contract === "search_meetings"
    ? Promise.resolve({ items: [{
        id: "meeting-1",
        title_ar: "اجتماع الأداء",
        status: "scheduled",
        scheduled_date: "2026-10-22",
      }], total: 1 })
    : seriesPending);

  render(<MeetingsWorkspace />);

  expect(await screen.findByText("اجتماع الأداء")).toBeVisible();
  resolveSeries([]);
});
