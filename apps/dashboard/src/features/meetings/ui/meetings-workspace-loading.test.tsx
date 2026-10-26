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

it("requires the chair to confirm an off-schedule start before opening the live room", async () => {
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
    if (contract === "get_meeting_detail") return Promise.resolve({
      ...meeting,
      governance_unit_id: "unit-1",
      agenda_items: [],
      capabilities: { can_start_session: true },
    });
    if (contract === "list_meeting_topic_attachments") return Promise.resolve([]);
    if (contract === "get_meeting_readiness") return Promise.resolve({ ready: true, checks: [] });
    if (contract === "get_meeting_session_start_timing_v2") return Promise.resolve({
      meeting_id: meeting.id,
      meeting_no: meeting.meeting_no,
      title_ar: meeting.title_ar,
      scheduled_date: meeting.scheduled_date,
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      timezone: "Asia/Riyadh",
      server_now: "2026-10-26T06:00:00Z",
      scheduled_start_at: "2026-10-27T07:00:00Z",
      scheduled_end_at: "2026-10-27T09:00:00Z",
      timing_status: "early",
      requires_confirmation: true,
      difference_minutes: 1500,
      can_confirm_off_schedule: true,
    });
    if (contract === "open_meeting_session") return Promise.resolve({});
    return Promise.reject(new Error(`unexpected contract: ${contract}`));
  });

  render(<MeetingsWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: /اجتماع مبكر/ }));
  fireEvent.click(await screen.findByRole("button", { name: /فتح الجلسة الحية/ }));

  expect(await screen.findByRole("dialog", { name: "تأكيد فتح الجلسة خارج الموعد" })).toBeVisible();
  expect(rpc).not.toHaveBeenCalledWith("open_meeting_session", expect.anything());

  fireEvent.click(screen.getByRole("button", { name: "تأكيد وفتح الجلسة الآن" }));

  await waitFor(() => expect(rpc).toHaveBeenCalledWith("open_meeting_session", {
    p_meeting_id: meeting.id,
    p_expected_updated_at: meeting.updated_at,
    p_confirmed_off_schedule: true,
  }));
  expect(push).toHaveBeenCalledWith(`/admin/meetings/${meeting.id}/live`);
});
