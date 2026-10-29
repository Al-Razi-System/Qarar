import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../api/meetings-client", () => ({ meetingRpc: mocks.rpc }));
import { MeetingDetailsJourney } from "./meeting-details-journey";

const meeting = {
  id: "meeting-1", meeting_no: "MTG-2026-1", title_ar: "اجتماع مجلس الجامعة", status: "scheduled",
  unit_name_ar: "مجلس الجامعة", scheduled_date: "2026-10-30", start_time: "10:00", end_time: "12:00",
  updated_at: "2026-10-30T08:00:00Z", agenda_items: [{ id: "item-1", agenda_order: 1, topic: { id: "topic-1", title_ar: "اعتماد الخطة" } }],
  capabilities: { can_send_invitations: true, can_prepare_session: true },
};

beforeEach(() => { mocks.rpc.mockReset(); mocks.push.mockReset(); });

it("shows one primary action for the current stage and keeps later stages locked", async () => {
  mocks.rpc.mockImplementation((contract: string) => contract === "get_meeting_detail" ? Promise.resolve(meeting) : Promise.resolve({ ready: true, checks: [] }));
  render(<MeetingDetailsJourney meetingId="meeting-1"/>);
  expect(await screen.findByRole("heading", { name: "اجتماع مجلس الجامعة" })).toBeVisible();
  expect(screen.getByRole("button", { name: "معاينة الدعوة وتجهيزها" })).toBeVisible();
  expect(screen.getAllByText("الدعوة").length).toBeGreaterThan(0);
  expect(screen.queryByRole("link", { name: "فتح المحضر والمصادقات" })).not.toBeInTheDocument();
});

it("opens completed stages for reading while keeping future stages locked", async () => {
  const minutesMeeting = { ...meeting, status: "waiting_for_minutes", capabilities: {} };
  mocks.rpc.mockImplementation((contract: string) => contract === "get_meeting_detail" ? Promise.resolve(minutesMeeting) : Promise.resolve({ ready: true, checks: [] }));
  render(<MeetingDetailsJourney meetingId="meeting-1"/>);

  expect(await screen.findByRole("link", { name: "فتح المحضر والمصادقات" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /الإعداد.*تمت/ }));
  expect(screen.getByText("مرحلة مكتملة للقراءة")).toBeVisible();
  expect(screen.queryByRole("link", { name: "فتح المحضر والمصادقات" })).not.toBeInTheDocument();

  expect(screen.getByRole("button", { name: /المتابعة.*لم تبدأ/ })).toBeDisabled();
  expect(screen.getByText(/تُفتح المراحل اللاحقة بعد إكمال المحضر/)).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: /المحضر.*الآن/ }));
  expect(screen.getByRole("link", { name: "فتح المحضر والمصادقات" })).toBeVisible();
});

it("explains unmet readiness beside the disabled action", async () => {
  mocks.rpc.mockImplementation((contract: string) => contract === "get_meeting_detail" ? Promise.resolve(meeting) : Promise.resolve({ ready: false, checks: [{ code: "agenda", label: "إضافة بند واحد على الأقل", complete: false }] }));
  render(<MeetingDetailsJourney meetingId="meeting-1"/>);
  const action = await screen.findByRole("button", { name: "معاينة الدعوة وتجهيزها" });
  expect(action).toBeDisabled();
  expect(screen.getByText(/قبل المتابعة: إضافة بند واحد على الأقل/)).toBeVisible();
});

it("shows a local retry when the meeting cannot be read", async () => {
  mocks.rpc.mockRejectedValue(new Error("تعذر الاتصال بالخادم"));
  render(<MeetingDetailsJourney meetingId="meeting-1"/>);
  expect(await screen.findByText("تعذر الاتصال بالخادم")).toBeVisible();
  expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeVisible();
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
});

it("confirms an off-schedule start before opening the live room", async () => {
  const readyMeeting = {
    ...meeting,
    status: "ready_to_start",
    capabilities: { can_start_session: true },
  };
  mocks.rpc.mockImplementation((contract: string) => {
    if (contract === "get_meeting_detail") return Promise.resolve(readyMeeting);
    if (contract === "get_meeting_readiness") return Promise.resolve({ ready: true, checks: [] });
    if (contract === "get_meeting_session_start_timing_v2") return Promise.resolve({
      meeting_id: readyMeeting.id,
      meeting_no: readyMeeting.meeting_no,
      title_ar: readyMeeting.title_ar,
      scheduled_date: readyMeeting.scheduled_date,
      start_time: readyMeeting.start_time,
      end_time: readyMeeting.end_time,
      timezone: "Asia/Aden",
      server_now: "2026-10-29T06:00:00Z",
      scheduled_start_at: "2026-10-30T07:00:00Z",
      scheduled_end_at: "2026-10-30T09:00:00Z",
      timing_status: "early",
      requires_confirmation: true,
      difference_minutes: 1_500,
      can_confirm_off_schedule: true,
    });
    if (contract === "open_meeting_session") return Promise.resolve({});
    return Promise.reject(new Error(`unexpected contract: ${contract}`));
  });

  render(<MeetingDetailsJourney meetingId={readyMeeting.id}/>);
  fireEvent.click(await screen.findByRole("button", { name: "فتح الجلسة" }));
  expect(await screen.findByRole("dialog", { name: "تأكيد فتح الجلسة خارج الموعد" })).toBeVisible();
  expect(mocks.rpc).not.toHaveBeenCalledWith("open_meeting_session", expect.anything());

  fireEvent.click(screen.getByRole("button", { name: "تأكيد وفتح الجلسة الآن" }));

  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("open_meeting_session", {
    p_meeting_id: readyMeeting.id,
    p_expected_updated_at: readyMeeting.updated_at,
    p_confirmed_off_schedule: true,
  }));
  expect(mocks.push).toHaveBeenCalledWith(`/admin/meetings/${readyMeeting.id}/live`);
});
