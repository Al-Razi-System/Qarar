import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { Meeting } from "../model/meeting";
import { MeetingRow } from "./meeting-row";

const today = "2026-10-31";
const groups: Array<{ label: string; meetings: Meeting[] }> = [
  { label: "القادمة", meetings: [
    { id: "a", title_ar: "اجتماع مجلس كلية العلوم الإدارية والإنسانية", status: "scheduled", scheduled_date: "2026-11-09", start_time: "12:45", end_time: "14:45", unit_name_ar: "مجلس كلية العلوم الإدارية والإنسانية", location_details: "قاعة 102", agenda_count: 4 },
    { id: "b", title_ar: "اجتماع مجلس الجامعة", status: "ready_to_start", scheduled_date: "2026-11-02", start_time: "10:00", unit_name_ar: "مجلس الجامعة", location_type: "online", agenda_count: 7 },
  ] },
  { label: "تحتاج إجراء", meetings: [
    { id: "c", title_ar: "اجتماع لجنة الدراسات العليا", status: "scheduled", scheduled_date: "2026-10-20", unit_name_ar: "الدراسات العليا", agenda_count: 2 },
  ] },
  { label: "المسودات", meetings: [
    { id: "d", title_ar: "اجتماع مجلس القسم الدوري", status: "draft", schedule_date_confirmed: false, planned_window_start: "2026-11-08", planned_window_end: "2026-11-14", unit_name_ar: "قسم إدارة الأعمال" },
  ] },
  { label: "المكتملة", meetings: [
    { id: "e", title_ar: "اجتماع مجلس الأمناء", status: "closed", scheduled_date: "2026-10-05", start_time: "09:00", end_time: "11:00", unit_name_ar: "مجلس الأمناء", location_type: "onsite", agenda_count: 5 },
  ] },
];

function List({ dark = false }: { dark?: boolean }) {
  return <div data-theme={dark ? "dark" : undefined} className="min-h-screen space-y-4 bg-q-bg p-4 font-sans text-q-text sm:p-6">
    {groups.map((group) => <section key={group.label} className="overflow-hidden rounded-q-card border border-q-border bg-q-surface">
      <header className="flex items-center justify-between gap-3 border-b border-q-border px-4 py-3"><h2 className="m-0 text-q-ui font-bold">{group.label}</h2><span className="text-q-caption text-q-text-2">{group.meetings.length} اجتماع</span></header>
      <ul className="m-0 list-none divide-y divide-q-border p-0">{group.meetings.map((meeting) => <li key={meeting.id}><MeetingRow meeting={meeting} today={today} onOpen={() => undefined}/></li>)}</ul>
    </section>)}
  </div>;
}

/** A meeting in the list: its day, title, council, time, place, agenda size and stage. */
const meta: Meta<typeof List> = { title: "الاجتماعات/صف الاجتماع في القائمة", component: List };
export default meta;
type Story = StoryObj<typeof List>;

export const Light: Story = { name: "الوضع الفاتح" };
export const Dark: Story = { name: "الوضع الليلي", args: { dark: true } };
