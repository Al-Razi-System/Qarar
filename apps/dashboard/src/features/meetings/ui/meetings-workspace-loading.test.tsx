import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
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

it("opens the dedicated meeting journey without loading the legacy detail panel", async () => {
  const meeting = {
    id: "meeting-early",
    meeting_no: "MTG-2026-000777",
    title_ar: "اجتماع مبكر",
    status: "ready_to_start",
    scheduled_date: "2026-10-27",
    start_time: "10:00:00",
    end_time: "12:00:00",
    updated_at: "2026-10-26T20:00:00Z",
    unit_name_ar: "مجلس الجامعة",
  };
  rpc.mockImplementation((contract: string) => {
    if (contract === "search_meetings") return Promise.resolve({ items: [meeting], total: 1 });
    if (contract === "list_meeting_series") return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected contract: ${contract}`));
  });

  render(<MeetingsWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: /اجتماع مبكر/ }));
  expect(push).toHaveBeenCalledWith(`/admin/meetings/${meeting.id}`);
  expect(rpc).not.toHaveBeenCalledWith("get_meeting_detail", expect.anything(), expect.anything());
});
