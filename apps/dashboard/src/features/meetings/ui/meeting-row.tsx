"use client";

import { ChevronLeft, Clock, ListChecks, MapPin, Users } from "lucide-react";
import type { Meeting } from "../model/meeting";
import { meetingStatusLabels, meetingStatusTone } from "../model/meeting";
import { meetingOperationalGroup } from "../model/meeting-operational-state";
import { meetingLocationLabel, meetingTimeLabel } from "../model/meeting-schedule";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";

const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", options);

function parse(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The day a meeting is held, or the window it is planned in when its day is not fixed. */
function DateTile({ meeting, missed }: { meeting: Meeting; missed: boolean }) {
  if (meeting.schedule_date_confirmed === false && meeting.planned_window_start && meeting.planned_window_end) {
    const start = parse(meeting.planned_window_start); const end = parse(meeting.planned_window_end);
    return <span className="flex w-16 shrink-0 flex-col items-center justify-center rounded-q-control border border-dashed border-q-border-strong px-1 py-2 text-center">
      <span className="text-q-caption text-q-text-2">خلال</span>
      <span className="text-q-ui font-bold text-q-text">{start.getDate()}–{end.getDate()}</span>
      <span className="text-q-caption text-q-text-2">{format({ month: "short" }).format(end)}</span>
    </span>;
  }
  if (!meeting.scheduled_date) {
    return <span className="grid w-16 shrink-0 place-items-center rounded-q-control border border-dashed border-q-border-strong px-1 py-3 text-center text-q-caption text-q-text-2">بلا موعد</span>;
  }
  const day = parse(meeting.scheduled_date);
  return <span className={cn("flex w-16 shrink-0 flex-col items-center justify-center rounded-q-control px-1 py-2 text-center", missed ? "bg-q-warning-soft text-q-warning" : "bg-q-surface-2 text-q-link")}>
    <span className="text-q-caption">{format({ weekday: "short" }).format(day)}</span>
    <span className="text-q-h3 font-bold leading-tight">{day.getDate()}</span>
    <span className="text-q-caption">{format({ month: "short" }).format(day)}</span>
  </span>;
}

/** One meeting in the list: when, what, where, how much is on its agenda, and its stage. */
export function MeetingRow({ meeting, today, onOpen }: { meeting: Meeting; today: string; onOpen: () => void }) {
  const missed = meetingOperationalGroup(meeting, today) === "missed";
  const time = meetingTimeLabel(meeting);
  const council = meeting.unit_name_ar ?? meeting.governance_unit_name_ar;
  const items = meeting.agenda_item_count ?? meeting.agenda_count ?? 0;
  const where = meeting.location_details || meeting.location_type ? meetingLocationLabel(meeting) : null;
  return <button type="button" onClick={onOpen} className="group flex w-full items-center gap-4 px-4 py-3 text-start transition-colors hover:bg-q-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-q-primary">
    <DateTile meeting={meeting} missed={missed}/>
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-q-ui font-bold text-q-text">{meeting.title_ar}</span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-q-caption text-q-text-2">
        {council && <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden="true"/>{council}</span>}
        <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden="true"/>{time}</span>
        {where && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true"/>{where}</span>}
        <span className="inline-flex items-center gap-1"><ListChecks size={14} aria-hidden="true"/>{items === 0 ? "لا بنود بعد" : `${items} بند`}</span>
      </span>
    </span>
    <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
      <Badge tone={missed ? "warning" : meetingStatusTone[meeting.status] ?? "neutral"}>{missed ? "فات موعدها" : meetingStatusLabels[meeting.status] ?? "اجتماع"}</Badge>
      <ChevronLeft size={18} aria-hidden="true" className="hidden text-q-text-3 transition-transform group-hover:-translate-x-0.5 sm:block"/>
    </span>
  </button>;
}
