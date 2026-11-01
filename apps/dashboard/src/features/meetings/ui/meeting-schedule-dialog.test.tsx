import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../api/meetings-client", () => ({ meetingRpc: rpc }));
import { MeetingScheduleDialog } from "./meeting-schedule-dialog";

const planned = {
  id: "m1", title_ar: "اجتماع مجلس الكلية", status: "draft", scheduled_date: "2026-10-08", start_time: null, end_time: null,
  planned_window_start: "2026-10-08", planned_window_end: "2026-10-14", schedule_date_confirmed: false,
  location_type: "onsite", location_details: "الكبرى", updated_at: "2026-10-01T00:00:00Z", quorum_percentage: 60, meeting_type_id: "t1",
};

beforeEach(() => rpc.mockReset());

function fill(date: string, start: string, end: string) {
  fireEvent.change(screen.getByLabelText("تاريخ الانعقاد"), { target: { value: date } });
  fireEvent.change(screen.getByLabelText("وقت البداية"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("وقت النهاية"), { target: { value: end } });
}

it("asks only for the session's time and place", () => {
  render(<MeetingScheduleDialog meeting={planned as never} onClose={vi.fn()} onSaved={vi.fn()}/>);
  expect(screen.getByRole("dialog", { name: "موعد الجلسة ومكانها" })).toBeVisible();
  expect(screen.queryByLabelText(/النصاب/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/نوع الاجتماع/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/اسم الاجتماع/)).not.toBeInTheDocument();
  expect(screen.getByText(/أسبوع الدورة المخطط: 8 – 14 أكتوبر/)).toBeVisible();
});

it("refuses an end that is not after the start before sending anything", async () => {
  render(<MeetingScheduleDialog meeting={planned as never} onClose={vi.fn()} onSaved={vi.fn()}/>);
  fill("2026-10-12", "12:59", "12:59");
  fireEvent.click(screen.getByRole("button", { name: "حفظ الموعد والمكان" }));
  expect(await screen.findByText("يجب أن يكون وقت النهاية بعد وقت البداية.")).toBeVisible();
  expect(rpc).not.toHaveBeenCalled();
});

it("allows a day outside the planned week once a reason is written, and sends that reason", async () => {
  const onSaved = vi.fn();
  rpc.mockResolvedValue({ ...planned, scheduled_date: "2026-10-20" });
  render(<MeetingScheduleDialog meeting={planned as never} onClose={vi.fn()} onSaved={onSaved}/>);
  fill("2026-10-20", "10:00", "12:00");
  expect(screen.getByText(/هذا اليوم خارج أسبوع الدورة المخطط/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "حفظ الموعد والمكان" }));
  expect(await screen.findByText("اكتب سبب الانعقاد خارج أسبوع الدورة (5 أحرف على الأقل).")).toBeVisible();
  expect(rpc).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("سبب الانعقاد خارج أسبوع الدورة"), { target: { value: "سفر رئيس المجلس" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ الموعد والمكان" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("reschedule_meeting_session_v2", {
    p_meeting_id: "m1", p_scheduled_date: "2026-10-20", p_start_time: "10:00", p_end_time: "12:00",
    p_location_type: "onsite", p_location_details: "الكبرى", p_off_plan_reason: "سفر رئيس المجلس", p_expected_updated_at: "2026-10-01T00:00:00Z",
  }));
  expect(onSaved).toHaveBeenCalled();
});

it("needs no reason inside the planned week and keeps a server refusal in place", async () => {
  rpc.mockRejectedValueOnce(new Error("عدّل شخص آخر هذا الاجتماع للتو. حدّث الصفحة ثم أعد المحاولة."));
  render(<MeetingScheduleDialog meeting={planned as never} onClose={vi.fn()} onSaved={vi.fn()}/>);
  fill("2026-10-12", "10:00", "12:00");
  expect(screen.queryByLabelText("سبب الانعقاد خارج أسبوع الدورة")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "حفظ الموعد والمكان" }));
  expect(await screen.findByText("عدّل شخص آخر هذا الاجتماع للتو. حدّث الصفحة ثم أعد المحاولة.")).toBeVisible();
  expect(rpc).toHaveBeenCalledWith("reschedule_meeting_session_v2", expect.objectContaining({ p_off_plan_reason: null }));
  expect(screen.getByLabelText("تاريخ الانعقاد")).toHaveValue("2026-10-12");
});
