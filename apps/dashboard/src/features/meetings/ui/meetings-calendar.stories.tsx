import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import type { Meeting } from "../model/meeting";
import { MeetingsCalendar, type CalendarMode } from "./meetings-calendar";

const today = new Date(2026, 9, 16);

const items: Meeting[] = [
  // Planned within a week: the day is not fixed yet.
  { id: "w1", title_ar: "اجتماع مجلس كلية العلوم الإدارية والإنسانية", status: "draft", schedule_date_confirmed: false, planned_window_start: "2026-10-08", planned_window_end: "2026-10-14", unit_name_ar: "مجلس كلية العلوم الإدارية والإنسانية" },
  { id: "t1", title_ar: "اجتماع مجلس الأمناء", status: "draft", scheduled_date: "2026-10-07", unit_name_ar: "مجلس الأمناء" },
  { id: "p1", title_ar: "اجتماع مجلس القسم", status: "closed", scheduled_date: "2026-10-05", start_time: "10:00", end_time: "12:00", unit_name_ar: "قسم إدارة الأعمال", location_details: "قاعة 102" },
  { id: "p2", title_ar: "اجتماع لجنة الدراسات العليا", status: "waiting_for_minutes", scheduled_date: "2026-10-13", start_time: "11:00", unit_name_ar: "الدراسات العليا" },
  { id: "p3", title_ar: "اجتماع مجلس الكلية", status: "scheduled", scheduled_date: "2026-10-26", start_time: "09:30", end_time: "11:00", unit_name_ar: "مجلس كلية الطب", location_type: "online" },
  { id: "l1", title_ar: "اجتماع مجلس الجامعة الطارئ", status: "in_progress", scheduled_date: "2026-10-16", start_time: "18:00", unit_name_ar: "مجلس الجامعة" },
  { id: "x1", title_ar: "اجتماع لجنة الموازنة", status: "cancelled", scheduled_date: "2026-10-28", start_time: "13:00", unit_name_ar: "اللجنة المالية" },
  ...[15, 16, 17, 18, 19, 20, 21].map((day) => ({ id: `d${day}`, title_ar: "اجتماع مجلس الجامعة", status: day < 31 ? "scheduled" : "draft", scheduled_date: `2026-10-${day}`, start_time: "20:49", unit_name_ar: "مجلس الجامعة", location_type: "onsite" })),
  ...["09:00", "11:00", "13:00"].map((time, index) => ({ id: `b${index}`, title_ar: `اجتماع اللجنة ${index + 1}`, status: "scheduled", scheduled_date: "2026-10-19", start_time: time, unit_name_ar: "لجان الكلية" })),
];

function Calendar({ mode: initialMode, dark = false }: { mode: CalendarMode; dark?: boolean }) {
  const [cursor, setCursor] = useState(new Date(2026, 9, 15));
  const [mode, setMode] = useState(initialMode);
  return <div data-theme={dark ? "dark" : undefined} className="min-h-screen bg-q-bg p-4 sm:p-6">
    <MeetingsCalendar items={items} cursor={cursor} mode={mode} loading={false} today={today} onCursorChange={setCursor} onOpen={() => undefined} onShowDay={(day) => { setCursor(day); setMode("week"); }}/>
  </div>;
}

/** The meetings calendar: one month or one week, each meeting coloured by its stage. */
const meta: Meta<typeof Calendar> = { title: "الاجتماعات/تقويم الاجتماعات", component: Calendar };
export default meta;
type Story = StoryObj<typeof Calendar>;

export const Month: Story = { name: "شهر", args: { mode: "month" } };
export const Week: Story = { name: "أسبوع", args: { mode: "week" } };
export const MonthDark: Story = { name: "شهر — الوضع الليلي", args: { mode: "month", dark: true } };
