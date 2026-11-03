import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MeetingRow } from "./meeting-row";

it("shows when, where and how much is on the agenda, in Arabic, and opens the meeting", () => {
  const onOpen = vi.fn();
  render(<MeetingRow today="2026-10-31" onOpen={onOpen} meeting={{ id: "m1", title_ar: "اجتماع مجلس الكلية", status: "scheduled", scheduled_date: "2026-11-09", start_time: "12:45:00", end_time: "14:45:00", unit_name_ar: "مجلس كلية العلوم", location_type: "onsite", agenda_count: 3 }}/>);
  const row = screen.getByRole("button", { name: /اجتماع مجلس الكلية/ });
  expect(row).toHaveTextContent("12:45 – 14:45");
  expect(row).toHaveTextContent("حضوري");
  expect(row).toHaveTextContent("3 بند");
  expect(row).toHaveTextContent("مجدولة");
  expect(row).not.toHaveTextContent(/onsite|scheduled/);
  fireEvent.click(row);
  expect(onOpen).toHaveBeenCalledOnce();
});

it("marks a scheduled meeting whose day passed without opening, and a meeting still planned within a window", () => {
  const { rerender } = render(<MeetingRow today="2026-10-31" onOpen={vi.fn()} meeting={{ id: "m1", title_ar: "اجتماع فائت", status: "scheduled", scheduled_date: "2026-10-20" }}/>);
  expect(screen.getByRole("button")).toHaveTextContent("فات موعدها");
  expect(screen.getByRole("button")).toHaveTextContent("الوقت غير محدد");
  rerender(<MeetingRow today="2026-10-31" onOpen={vi.fn()} meeting={{ id: "m2", title_ar: "اجتماع دوري", status: "draft", schedule_date_confirmed: false, planned_window_start: "2026-11-08", planned_window_end: "2026-11-14" }}/>);
  expect(screen.getByRole("button")).toHaveTextContent("خلال");
  expect(screen.getByRole("button")).toHaveTextContent("8–14");
  expect(screen.getByRole("button")).toHaveTextContent("لا بنود بعد");
});

it("shows the session number and its academic year when the meeting has one", () => {
  render(<MeetingRow today="2026-10-31" onOpen={vi.fn()} meeting={{ id: "m3", title_ar: "الاجتماع الثالث لمجلس كلية العلوم — نوفمبر 2026", status: "draft", scheduled_date: "2026-11-09", session_sequence_no: 3, academic_year_start: "2026-09-01" }}/>);
  expect(screen.getByText("الجلسة 3 · العام الجامعي 2026/2027")).toBeVisible();
});

it("distinguishes a late draft from a cycle finally classified as not held", () => {
  const { rerender } = render(<MeetingRow today="2026-11-03" onOpen={vi.fn()} meeting={{ id: "late", title_ar: "اجتماع دورة أكتوبر", status: "draft", schedule_date_confirmed: false, planned_window_start: "2026-10-08", planned_window_end: "2026-10-14" }}/>);
  expect(screen.getByRole("button")).toHaveTextContent("فاتت الدورة · تحتاج إجراء");
  rerender(<MeetingRow today="2026-11-08" onOpen={vi.fn()} meeting={{ id: "not-held", title_ar: "اجتماع دورة أكتوبر", status: "not_held", planned_window_start: "2026-10-08", planned_window_end: "2026-10-14" }}/>);
  expect(screen.getByRole("button")).toHaveTextContent("لم يُنفذ");
  expect(screen.getByRole("button")).not.toHaveTextContent("تحتاج إجراء");
});
