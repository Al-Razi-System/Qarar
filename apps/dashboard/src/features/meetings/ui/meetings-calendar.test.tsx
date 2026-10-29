import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { calendarRange, MeetingsCalendar } from "./meetings-calendar";

it("computes bounded month and week ranges", () => {
  expect(calendarRange(new Date(2026, 9, 15), "month")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  expect(calendarRange(new Date(2026, 9, 15), "week")).toEqual({ from: "2026-10-11", to: "2026-10-17" });
});

it("opens a meeting from its calendar day", () => {
  const onOpen = vi.fn();
  render(<MeetingsCalendar cursor={new Date(2026, 9, 15)} mode="month" loading={false} onCursorChange={vi.fn()} onOpen={onOpen} items={[{ id: "meeting-1", title_ar: "اجتماع مجلس الكلية", status: "scheduled", scheduled_date: "2026-10-15", start_time: "10:00" }]} />);
  fireEvent.click(screen.getAllByRole("button", { name: /اجتماع مجلس الكلية/ })[0]);
  expect(onOpen).toHaveBeenCalledWith("meeting-1");
});
