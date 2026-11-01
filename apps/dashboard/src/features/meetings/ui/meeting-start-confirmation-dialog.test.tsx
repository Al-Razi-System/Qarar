import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MeetingStartTiming } from "../model/meeting";
import { MeetingStartConfirmationDialog, meetingStartWarning } from "./meeting-start-confirmation-dialog";

function timing(overrides: Partial<MeetingStartTiming> = {}): MeetingStartTiming {
  return {
    meeting_id: "meeting-1",
    meeting_no: "MTG-2026-000001",
    title_ar: "اجتماع مجلس الجامعة",
    scheduled_date: "2026-10-27",
    start_time: "10:00:00",
    end_time: "12:00:00",
    timezone: "Asia/Riyadh",
    server_now: "2026-10-26T06:00:00Z",
    scheduled_start_at: "2026-10-27T07:00:00Z",
    scheduled_end_at: "2026-10-27T09:00:00Z",
    timing_status: "early",
    requires_confirmation: true,
    difference_minutes: 1500,
    can_confirm_off_schedule: true,
    ...overrides,
  };
}

describe("MeetingStartConfirmationDialog", () => {
  it("explains an early start with the authoritative difference", () => {
    expect(meetingStartWarning(timing({ difference_minutes: 165 }))).toContain("ساعتان و45 دقيقة");
  });

  it("explains a late start and shows the scheduled window", () => {
    render(<MeetingStartConfirmationDialog timing={timing({ timing_status: "late", difference_minutes: 35 })} pending={false} error={null} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText("انتهى الوقت المحدد للاجتماع منذ 35 دقيقة.")).toBeInTheDocument();
    expect(screen.getByText("MTG-2026-000001")).toBeInTheDocument();
  });

  it("does not offer an enabled override to a non-chair", () => {
    render(<MeetingStartConfirmationDialog timing={timing({ can_confirm_off_schedule: false })} pending={false} error={null} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "تأكيد وفتح الجلسة الآن" })).toBeDisabled();
    expect(screen.getByText(/متاح لرئيس هذا المجلس فقط/)).toBeInTheDocument();
  });

  it("keeps a server failure beside the confirmation action", () => {
    render(<MeetingStartConfirmationDialog timing={timing()} pending={false} error="تم تحديث الاجتماع؛ أعد المحاولة." onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("تم تحديث الاجتماع؛ أعد المحاولة.");
  });
});
