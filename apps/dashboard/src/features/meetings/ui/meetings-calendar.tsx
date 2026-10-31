"use client";

import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { Meeting } from "../model/meeting";
import { meetingStatusLabels } from "../model/meeting";
import { meetingOperationalGroup } from "../model/meeting-operational-state";
import { meetingLocationLabel } from "../model/meeting-schedule";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

export type CalendarMode = "month" | "week";

const weekDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
// Every target is at least 44px tall, so a month cell shows two meetings and a link to the rest.
const MAX_IN_DAY = 2;

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

type Tone = { accent: string; fill: string; text: string; label: string; dashed?: boolean; struck?: boolean };

/** One colour per stage of a meeting's life, from the design tokens only. */
function toneOf(meeting: Meeting, today: string): Tone {
  const label = meetingStatusLabels[meeting.status] ?? "اجتماع";
  switch (meetingOperationalGroup(meeting, today)) {
    case "missed": return { accent: "bg-q-warning", fill: "bg-q-warning-soft", text: "text-q-warning", label: "فات موعدها" };
    case "live": return { accent: "bg-q-live", fill: "bg-q-live-soft", text: "text-q-live", label };
    case "completion": return { accent: "bg-q-warning", fill: "bg-q-warning-soft", text: "text-q-warning", label };
    case "completed": return { accent: "bg-q-success", fill: "bg-q-success-soft", text: "text-q-success", label };
    case "drafts": return { accent: "bg-q-border-strong", fill: "bg-q-surface", text: "text-q-text-2", label, dashed: true };
    case "cancelled": return { accent: "bg-q-danger", fill: "bg-q-danger-soft", text: "text-q-danger", label, struck: true };
    default: return { accent: "bg-q-primary", fill: "bg-q-surface-2", text: "text-q-link", label };
  }
}

const legend: Array<{ accent: string; label: string; dashed?: boolean }> = [
  { accent: "bg-q-primary", label: "مجدولة" },
  { accent: "bg-q-live", label: "منعقدة" },
  { accent: "bg-q-warning", label: "بانتظار إجراء" },
  { accent: "bg-q-success", label: "مكتملة" },
  { accent: "bg-q-border-strong", label: "مسودة", dashed: true },
];

/** A meeting whose day is not fixed yet: it is planned somewhere inside a window of days. */
function isWindow(meeting: Meeting) {
  return meeting.schedule_date_confirmed === false && Boolean(meeting.planned_window_start && meeting.planned_window_end);
}

function timeOf(meeting: Meeting) {
  const start = meeting.start_time?.slice(0, 5);
  const end = meeting.end_time?.slice(0, 5);
  return start ? (end ? `${start} – ${end}` : start) : null;
}

function councilOf(meeting: Meeting) {
  return meeting.unit_name_ar ?? meeting.governance_unit_name_ar ?? null;
}

/** «8 – 14 أكتوبر», or «29 أكتوبر – 4 نوفمبر» across two months. */
function windowLabel(meeting: Meeting) {
  const start = parseKey(meeting.planned_window_start!); const end = parseKey(meeting.planned_window_end!);
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} – ${dayLabel(end, { day: "numeric", month: "long" })}`
    : `${dayLabel(start, { day: "numeric", month: "long" })} – ${dayLabel(end, { day: "numeric", month: "long" })}`;
}

function describe(meeting: Meeting, tone: Tone) {
  const when = isWindow(meeting)
    ? `يوم الانعقاد لم يُحدد، خلال ${windowLabel(meeting)}`
    : timeOf(meeting) ?? "الوقت غير محدد";
  return [meeting.title_ar, tone.label, when, councilOf(meeting)].filter(Boolean).join("، ");
}

type Props = {
  items: Meeting[];
  cursor: Date;
  mode: CalendarMode;
  loading: boolean;
  onCursorChange: (value: Date) => void;
  onOpen: (meetingId: string) => void;
  /** Shows one day in the week view, e.g. from «+ 2 أخرى». */
  onShowDay?: (day: Date) => void;
  /** Today, for tests; the real date otherwise. */
  today?: Date;
};

/**
 * The meetings of a month or a week. A meeting whose day is fixed sits in its
 * day; a meeting planned within a window of days is one bar across that window,
 * not a copy in every day. Each meeting is a line coloured by its stage. On a
 * narrow screen the period becomes a list of the days that have meetings.
 */
export function MeetingsCalendar({ items, cursor, mode, loading, onCursorChange, onOpen, onShowDay, today = new Date() }: Props) {
  const todayKey = dateKey(today);
  const days = mode === "month" ? monthGrid(cursor) : weekGrid(cursor);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const title = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", mode === "month" ? { month: "long", year: "numeric" } : { day: "numeric", month: "long", year: "numeric" }).format(mode === "month" ? cursor : days[0]);
  const range = mode === "week" ? `${dayLabel(days[0], { day: "numeric", month: "long" })} – ${dayLabel(days[6], { day: "numeric", month: "long" })}` : null;
  const move = (direction: number) => {
    const next = new Date(cursor);
    if (mode === "month") { next.setDate(1); next.setMonth(next.getMonth() + direction); } else next.setDate(next.getDate() + direction * 7);
    onCursorChange(next);
  };
  const empty = !loading && items.length === 0;

  return <section className="overflow-hidden rounded-q-card border border-q-border bg-q-surface font-sans text-q-text" aria-label={`تقويم الاجتماعات: ${mode === "month" ? title : range}`} aria-busy={loading}>
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-q-border px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" aria-label={mode === "month" ? "الشهر السابق" : "الأسبوع السابق"} onClick={() => move(-1)}><ChevronRight size={18} aria-hidden="true"/></Button>
        <Button variant="ghost" aria-label={mode === "month" ? "الشهر التالي" : "الأسبوع التالي"} onClick={() => move(1)}><ChevronLeft size={18} aria-hidden="true"/></Button>
        <h2 className="m-0 ms-1 text-q-h3 font-bold">{mode === "month" ? title : range}</h2>
        <Button variant="secondary" className="ms-2" onClick={() => onCursorChange(new Date(today))}>اليوم</Button>
      </div>
      <ul aria-label="ألوان حالات الاجتماع" className="m-0 hidden list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 lg:flex">
        {legend.map((entry) => <li key={entry.label} className="flex items-center gap-1.5 text-q-caption text-q-text-2"><span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", entry.accent, entry.dashed && "opacity-60")}/>{entry.label}</li>)}
      </ul>
    </header>
    {loading && <p role="status" className="m-0 border-b border-q-border bg-q-surface-2 px-5 py-2 text-q-caption text-q-text-2">جارٍ تحميل مواعيد الفترة…</p>}
    {empty && <p role="status" className="m-0 border-b border-q-border px-5 py-3 text-q-ui text-q-text-2">لا توجد اجتماعات في هذه الفترة بحسب الفلاتر المختارة.</p>}

    <div className="hidden md:block" role="table" aria-label="أيام الفترة">
      <div role="row" className="grid grid-cols-7 border-b border-q-border bg-q-surface">
        {weekDays.map((day) => <div role="columnheader" key={day} className="px-3 py-2 text-start text-q-caption font-bold text-q-text-2">{day}</div>)}
      </div>
      {weeks.map((week) => <Week key={dateKey(week[0])} week={week} mode={mode} month={cursor.getMonth()} items={items} todayKey={todayKey} onOpen={onOpen} onShowDay={onShowDay}/>)}
    </div>

    <ol className="m-0 list-none divide-y divide-q-border p-0 md:hidden" aria-label="أيام الفترة التي فيها اجتماعات">
      {days.filter((day) => mode === "week" || day.getMonth() === cursor.getMonth()).map((day) => {
        const key = dateKey(day);
        const dated = datedOn(items, key);
        const windows = items.filter((meeting) => isWindow(meeting) && meeting.planned_window_start === key);
        if (!dated.length && !windows.length) return null;
        return <li key={key} className="px-4 py-3">
          <p className="m-0 flex items-center gap-2 text-q-caption font-bold text-q-text-2">
            {dayLabel(day, { weekday: "long", day: "numeric", month: "long" })}
            {key === todayKey && <span className="rounded-full bg-q-primary px-2 text-q-caption text-q-on-primary">اليوم</span>}
          </p>
          <div className="mt-2 grid gap-2">
            {windows.map((meeting) => <WindowBar key={meeting.id} meeting={meeting} todayKey={todayKey} onOpen={onOpen} detailed/>)}
            {dated.map((meeting) => <MeetingLine key={meeting.id} meeting={meeting} todayKey={todayKey} onOpen={onOpen} detailed/>)}
          </div>
        </li>;
      })}
    </ol>
  </section>;
}

function Week({ week, mode, month, items, todayKey, onOpen, onShowDay }: { week: Date[]; mode: CalendarMode; month: number; items: Meeting[]; todayKey: string; onOpen: (id: string) => void; onShowDay?: (day: Date) => void }) {
  const first = dateKey(week[0]); const last = dateKey(week[6]);
  // Windows that touch this week, packed into as few lanes as possible.
  const lanes: Array<Array<{ meeting: Meeting; start: number; end: number }>> = [];
  for (const meeting of items.filter(isWindow).sort((a, b) => a.planned_window_start!.localeCompare(b.planned_window_start!))) {
    if (meeting.planned_window_end! < first || meeting.planned_window_start! > last) continue;
    const start = Math.max(0, week.findIndex((day) => dateKey(day) >= meeting.planned_window_start!));
    const endIndex = week.findIndex((day) => dateKey(day) > meeting.planned_window_end!);
    const end = endIndex === -1 ? 6 : endIndex - 1;
    const lane = lanes.find((row) => row.every((placed) => placed.end < start || placed.start > end));
    if (lane) lane.push({ meeting, start, end }); else lanes.push([{ meeting, start, end }]);
  }
  const rows = `auto ${"auto ".repeat(lanes.length)}minmax(${mode === "month" ? "7rem" : "22rem"}, 1fr)`;
  return <div role="row" className="relative grid grid-cols-7 border-b border-q-border last:border-b-0" style={{ gridTemplateRows: rows }}>
    {week.map((day, index) => {
      const key = dateKey(day);
      const outside = mode === "month" && day.getMonth() !== month;
      return <div key={`bg-${key}`} aria-hidden="true" className={cn("border-q-border", index > 0 && "border-s", outside ? "bg-q-surface-2/60" : "bg-q-surface")} style={{ gridColumn: index + 1, gridRow: "1 / -1" }}/>;
    })}
    {week.map((day, index) => {
      const key = dateKey(day);
      const outside = mode === "month" && day.getMonth() !== month;
      const isToday = key === todayKey;
      return <div key={`n-${key}`} className="relative px-2 pt-2" style={{ gridColumn: index + 1, gridRow: 1 }}>
        <span className={cn("inline-grid h-7 min-w-7 place-items-center rounded-full px-1 text-q-caption font-bold", isToday ? "bg-q-primary text-q-on-primary" : outside ? "text-q-text-3" : "text-q-text")} aria-label={dayLabel(day, { weekday: "long", day: "numeric", month: "long" })}>{day.getDate()}</span>
      </div>;
    })}
    {lanes.map((lane, laneIndex) => lane.map(({ meeting, start, end }) => <div key={`w-${meeting.id}`} className="relative px-1 pt-1" style={{ gridColumn: `${start + 1} / ${end + 2}`, gridRow: laneIndex + 2 }}>
      <WindowBar meeting={meeting} todayKey={todayKey} onOpen={onOpen}/>
    </div>))}
    {week.map((day, index) => {
      const dated = datedOn(items, dateKey(day));
      const shown = mode === "month" ? dated.slice(0, MAX_IN_DAY) : dated;
      return <div key={`e-${dateKey(day)}`} role="cell" aria-label={`${dayLabel(day, { weekday: "long", day: "numeric", month: "long" })}: ${dated.length ? `${dated.length} اجتماع` : "لا اجتماعات"}`} className="relative flex min-w-0 flex-col gap-1 px-1 pb-2 pt-1" style={{ gridColumn: index + 1, gridRow: lanes.length + 2 }}>
        {shown.map((meeting) => <MeetingLine key={meeting.id} meeting={meeting} todayKey={todayKey} onOpen={onOpen} detailed={mode === "week"}/>)}
        {dated.length > shown.length && <button type="button" onClick={() => onShowDay?.(day)} disabled={!onShowDay} className="min-h-11 rounded-q-control px-2 text-start text-q-caption font-bold text-q-link hover:bg-q-surface-2 disabled:cursor-default disabled:hover:bg-transparent">+ {dated.length - shown.length} أخرى</button>}
      </div>;
    })}
  </div>;
}

function MeetingLine({ meeting, todayKey, onOpen, detailed = false }: { meeting: Meeting; todayKey: string; onOpen: (id: string) => void; detailed?: boolean }) {
  const tone = toneOf(meeting, todayKey);
  const time = timeOf(meeting);
  return <button type="button" onClick={() => onOpen(meeting.id)} aria-label={describe(meeting, tone)} title={describe(meeting, tone)}
    className={cn("group flex w-full min-w-0 items-stretch gap-2 overflow-hidden rounded-q-control text-start transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-q-primary", tone.fill, tone.dashed && "border border-dashed border-q-border-strong", detailed ? "min-h-11 py-2 pe-2" : "min-h-11 py-1 pe-2")}>
    <span aria-hidden="true" className={cn("w-1 shrink-0 rounded-full", tone.accent)}/>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex min-w-0 items-baseline gap-1.5">
        {time && <span className={cn("shrink-0 text-q-caption font-bold tabular-nums", tone.text)}>{detailed ? time : time.slice(0, 5)}</span>}
        <span className={cn("min-w-0 text-q-caption font-bold text-q-text", detailed ? "line-clamp-2" : "truncate", tone.struck && "line-through")}>{meeting.title_ar}</span>
      </span>
      {detailed && <>
        {councilOf(meeting) && <span className="truncate text-q-caption text-q-text-2">{councilOf(meeting)}</span>}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-q-caption text-q-text-2">
          <span className={cn("font-bold", tone.text)}>{tone.label}</span>
          {(meeting.location_details || meeting.location_type) && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true"/>{meetingLocationLabel(meeting)}</span>}
        </span>
      </>}
    </span>
  </button>;
}

function WindowBar({ meeting, todayKey, onOpen, detailed = false }: { meeting: Meeting; todayKey: string; onOpen: (id: string) => void; detailed?: boolean }) {
  const tone = toneOf(meeting, todayKey);
  return <button type="button" onClick={() => onOpen(meeting.id)} aria-label={describe(meeting, tone)} title={describe(meeting, tone)}
    className={cn("flex min-h-11 w-full min-w-0 gap-2 rounded-q-control border border-dashed border-q-border-strong bg-q-surface px-2 py-1 text-start transition-colors hover:bg-q-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-q-primary", detailed ? "items-start py-2" : "items-center")}>
    <CalendarDays size={14} aria-hidden="true" className={cn("shrink-0 text-q-text-2", detailed && "mt-1")}/>
    {detailed
      ? <span className="flex min-w-0 flex-col"><span className="text-q-caption font-bold text-q-text">{meeting.title_ar}</span><span className="text-q-caption text-q-text-2">يوم الانعقاد لم يُحدد · خلال {windowLabel(meeting)}</span></span>
      : <><span className="min-w-0 truncate text-q-caption font-bold text-q-text">{meeting.title_ar}</span><span className="shrink-0 text-q-caption text-q-text-2">يوم الانعقاد لم يُحدد</span></>}
  </button>;
}

function datedOn(items: Meeting[], key: string) {
  return items
    .filter((meeting) => !isWindow(meeting) && meeting.scheduled_date === key)
    .sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99") || a.title_ar.localeCompare(b.title_ar, "ar"));
}
function dayLabel(day: Date, options: Intl.DateTimeFormatOptions) { return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", options).format(day); }
function monthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); first.setDate(first.getDate() - first.getDay());
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const weeks = Math.ceil((Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1) / 7);
  return Array.from({ length: weeks * 7 }, (_, index) => { const date = new Date(first); date.setDate(date.getDate() + index); return date; });
}
function weekGrid(cursor: Date) { const first = new Date(cursor); first.setDate(first.getDate() - first.getDay()); return Array.from({ length: 7 }, (_, index) => { const date = new Date(first); date.setDate(date.getDate() + index); return date; }); }
function parseKey(key: string) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
