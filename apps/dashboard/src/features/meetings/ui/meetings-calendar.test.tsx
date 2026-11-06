import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Meeting } from "../model/meeting";
import { calendarRange, MeetingsCalendar } from "./meetings-calendar";

const today = new Date(2026, 9, 31);
const base = { onCursorChange: vi.fn(), loading: false, today };
const desktop = () => screen.getByRole("table", { name: "أيام الفترة" });

it("computes bounded month and week ranges", () => {
  expect(calendarRange(new Date(2026, 9, 15), "month")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  expect(calendarRange(new Date(2026, 9, 15), "week")).toEqual({ from: "2026-10-11", to: "2026-10-17" });
});

it("opens a meeting from its calendar day", () => {
  const onOpen = vi.fn();
  render(<MeetingsCalendar {...base} cursor={new Date(2026, 9, 15)} mode="month" onOpen={onOpen} items={[{ id: "meeting-1", title_ar: "اجتماع مجلس الكلية", status: "scheduled", scheduled_date: "2026-11-15", start_time: "10:00" } as Meeting, { id: "meeting-2", title_ar: "اجتماع مجلس الكلية", status: "scheduled", scheduled_date: "2026-10-15", start_time: "10:00" }]} />);
  fireEvent.click(within(desktop()).getByRole("button", { name: /اجتماع مجلس الكلية/ }));
  expect(onOpen).toHaveBeenCalledWith("meeting-2");
});

it("draws a meeting planned within a window once across its days, not once in every day", () => {
  const window: Meeting = { id: "w1", title_ar: "اجتماع مجلس كلية العلوم", status: "draft", schedule_date_confirmed: false, planned_window_start: "2026-10-08", planned_window_end: "2026-10-14" };
  render(<MeetingsCalendar {...base} cursor={new Date(2026, 9, 1)} mode="month" onOpen={vi.fn()} items={[window]} />);
  // The window crosses one week boundary (Saturday the 10th), so it is two bars, not seven cards.
  expect(within(desktop()).getAllByRole("button", { name: /اجتماع مجلس كلية العلوم/ })).toHaveLength(2);
  expect(within(desktop()).getAllByRole("button", { name: /يوم الانعقاد لم يُحدد، خلال 8 – 14 أكتوبر/ })).toHaveLength(2);
});

it("names every stage in Arabic and marks a past meeting that never opened", () => {
  render(<MeetingsCalendar {...base} cursor={new Date(2026, 9, 1)} mode="month" onOpen={vi.fn()} items={[
    { id: "a", title_ar: "مجلس أ", status: "ready_to_start", scheduled_date: "2026-10-05", start_time: "09:00" },
    { id: "b", title_ar: "مجلس ب", status: "waiting_for_minutes", scheduled_date: "2026-10-06" },
    { id: "c", title_ar: "مجلس ج", status: "scheduled", scheduled_date: "2026-11-03" },
  ]} />);
  expect(within(desktop()).getByRole("button", { name: /مجلس أ، فاتت الدورة، 09:00/ })).toBeVisible();
  expect(within(desktop()).getByRole("button", { name: /مجلس ب، بانتظار المحضر، الوقت غير محدد/ })).toBeVisible();
  expect(screen.queryByText(/ready_to_start|waiting_for_minutes/)).not.toBeInTheDocument();
});

it("shows two meetings a day and opens the rest in the week of that day", () => {
  const onShowDay = vi.fn();
  const items = Array.from({ length: 5 }, (_, index) => ({ id: `m${index}`, title_ar: `اجتماع ${index}`, status: "scheduled", scheduled_date: "2026-10-20", start_time: `1${index}:00` }));
  render(<MeetingsCalendar {...base} cursor={new Date(2026, 9, 1)} mode="month" onOpen={vi.fn()} onShowDay={onShowDay} items={items} />);
  expect(within(desktop()).getAllByRole("button", { name: /^اجتماع \d/ })).toHaveLength(2);
  fireEvent.click(within(desktop()).getByRole("button", { name: "+ 3 أخرى" }));
  expect(onShowDay).toHaveBeenCalledWith(new Date(2026, 9, 20));
});

it("shows only the weeks of the month", () => {
  render(<MeetingsCalendar {...base} cursor={new Date(2026, 9, 1)} mode="month" onOpen={vi.fn()} items={[]} />);
  // October 2026 runs from Thursday the 1st to Saturday the 31st: five weeks, no November week.
  expect(within(desktop()).getAllByRole("row")).toHaveLength(1 + 5);
  expect(screen.getByText("لا توجد اجتماعات في هذه الفترة بحسب الفلاتر المختارة.")).toBeVisible();
});

it("folds many councils waiting for their day in the same week into one bar that opens to each", () => {
  const councils = ["مجلس قسم الصيدلة", "مجلس قسم التحرير", "مجلس قسم القانون", "مجلس قسم العلاج الطبيعي"];
  const items = councils.map((council, index) => ({ id: `w${index}`, title_ar: `الاجتماع الأول ل${council} — نوفمبر 2026`, title_is_custom: false, unit_name_ar: council, session_sequence_no: 1,
    status: "draft", schedule_date_confirmed: false, planned_window_start: "2026-11-01", planned_window_end: "2026-11-07" } as Meeting));
  render(<MeetingsCalendar {...base} cursor={new Date(2026, 10, 1)} mode="month" onOpen={vi.fn()} items={items} />);
  const group = within(desktop()).getByRole("button", { name: /4 اجتماعات يُحدَّد يومها خلال هذا الأسبوع/ });
  expect(group).toHaveAttribute("aria-expanded", "false");
  expect(within(desktop()).queryByRole("button", { name: /مجلس قسم القانون/ })).toBeNull();
  fireEvent.click(group);
  expect(within(desktop()).getByRole("button", { name: /4 اجتماعات/ })).toHaveAttribute("aria-expanded", "true");
  // Each opens as its own bar, led by the council rather than the repeated ordinal.
  expect(within(desktop()).getByText("مجلس قسم القانون · الجلسة 1")).toBeVisible();
});
