"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import type { Meeting } from "../model/meeting";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

export type CalendarMode = "month" | "week";

const weekDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function calendarRange(cursor: Date, mode: CalendarMode) {
  if (mode === "month") {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return { from: dateKey(from), to: dateKey(to) };
  }
  const from = new Date(cursor); from.setDate(from.getDate() - from.getDay());
  const to = new Date(from); to.setDate(to.getDate() + 6);
  return { from: dateKey(from), to: dateKey(to) };
}

export function MeetingsCalendar({ items, cursor, mode, loading, onCursorChange, onOpen }: { items: Meeting[]; cursor: Date; mode: CalendarMode; loading: boolean; onCursorChange: (value: Date) => void; onOpen: (meetingId: string) => void }) {
  const days = mode === "month" ? monthGrid(cursor) : weekGrid(cursor);
  const title = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", mode === "month" ? { month: "long", year: "numeric" } : { dateStyle: "medium" }).format(cursor);
  const move = (direction: number) => { const next = new Date(cursor); if (mode === "month") next.setMonth(next.getMonth() + direction); else next.setDate(next.getDate() + direction * 7); onCursorChange(next); };
  return <section className="overflow-hidden rounded-q-card border border-q-border bg-q-surface" aria-label={`تقويم الاجتماعات ${title}`}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-q-border bg-q-surface-2 p-4">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-q-control bg-q-info-soft text-q-link"><CalendarDays size={21}/></span><div><h2 className="m-0 text-q-h3 font-bold text-q-text">{title}</h2><p className="m-0 mt-1 text-q-caption text-q-text-2">{mode === "month" ? "عرض شهري" : "عرض أسبوعي"} · اضغط على الاجتماع لفتح تفاصيله</p></div></div>
      <div className="flex items-center gap-2"><Button variant="ghost" aria-label="الفترة السابقة" onClick={() => move(-1)}><ChevronRight size={18}/></Button><Button variant="secondary" onClick={() => onCursorChange(new Date())}>اليوم</Button><Button variant="ghost" aria-label="الفترة التالية" onClick={() => move(1)}><ChevronLeft size={18}/></Button></div>
    </header>
    {loading && <p role="status" className="m-4 rounded-q-control bg-q-surface-2 p-3 text-q-caption text-q-text-2">جارٍ تحميل مواعيد التقويم…</p>}
    <div className="hidden grid-cols-7 border-b border-q-border md:grid">{weekDays.map((day) => <div key={day} className="border-s border-q-border p-2 text-center text-q-caption font-bold text-q-text-2 first:border-s-0">{day}</div>)}</div>
    <div className="hidden grid-cols-7 md:grid">{days.map((day) => <CalendarDay key={dateKey(day)} day={day} currentMonth={day.getMonth() === cursor.getMonth()} items={meetingsForDay(items, day)} onOpen={onOpen}/>)}</div>
    <div className="divide-y divide-q-border md:hidden">{days.filter((day) => meetingsForDay(items, day).length > 0).map((day) => <div key={dateKey(day)} className="p-4"><p className="m-0 text-q-caption font-bold text-q-text-2">{new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long" }).format(day)}</p><div className="mt-2 grid gap-2">{meetingsForDay(items, day).map((meeting) => <MeetingChip key={meeting.id} meeting={meeting} onOpen={onOpen}/>)}</div></div>)}{items.length === 0 && !loading && <p className="m-0 p-8 text-center text-q-ui text-q-text-2">لا توجد اجتماعات في هذه الفترة.</p>}</div>
  </section>;
}

function CalendarDay({ day, currentMonth, items, onOpen }: { day: Date; currentMonth: boolean; items: Meeting[]; onOpen: (id: string) => void }) {
  return <div className={`min-h-32 border-b border-s border-q-border p-2 first:border-s-0 ${currentMonth ? "bg-q-surface" : "bg-q-surface-2"}`}><span className={`grid h-7 w-7 place-items-center rounded-q-pill text-q-caption font-bold ${dateKey(day) === dateKey(new Date()) ? "bg-q-primary text-white" : "text-q-text-2"}`}>{day.getDate()}</span><div className="mt-2 grid gap-1.5">{items.slice(0, 3).map((meeting) => <MeetingChip key={meeting.id} meeting={meeting} onOpen={onOpen}/>)}</div>{items.length > 3 && <p className="m-0 mt-1 text-q-caption text-q-link">+ {items.length - 3} اجتماعات</p>}</div>;
}

function MeetingChip({ meeting, onOpen }: { meeting: Meeting; onOpen: (id: string) => void }) {
  return <button type="button" onClick={() => onOpen(meeting.id)} className="w-full rounded-q-control border border-q-border bg-q-surface p-2 text-start transition hover:border-q-primary hover:bg-q-info-soft"><span className="line-clamp-2 text-q-caption font-bold text-q-text">{meeting.title_ar}</span><span className="mt-1 flex items-center gap-1 text-q-caption text-q-text-2"><Clock size={12}/>{meeting.schedule_date_confirmed === false ? "موعد ضمن نافذة" : meeting.start_time?.slice(0, 5) || "الوقت غير محدد"}</span><Badge tone={meeting.status === "cancelled" ? "danger" : meeting.status === "in_progress" ? "success" : "neutral"}>{meeting.status === "draft" ? "مسودة" : meeting.status === "scheduled" ? "مجدول" : meeting.status === "in_progress" ? "منعقد" : meeting.status === "cancelled" ? "ملغى" : "اجتماع"}</Badge></button>;
}

function meetingsForDay(items: Meeting[], day: Date) { const key = dateKey(day); return items.filter((item) => (item.planned_window_start ?? item.scheduled_date ?? "") <= key && (item.planned_window_end ?? item.scheduled_date ?? "") >= key); }
function monthGrid(cursor: Date) { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); first.setDate(first.getDate() - first.getDay()); return Array.from({ length: 42 }, (_, index) => { const date = new Date(first); date.setDate(date.getDate() + index); return date; }); }
function weekGrid(cursor: Date) { const first = new Date(cursor); first.setDate(first.getDate() - first.getDay()); return Array.from({ length: 7 }, (_, index) => { const date = new Date(first); date.setDate(date.getDate() + index); return date; }); }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
