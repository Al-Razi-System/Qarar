import type { Meeting } from "./meeting";
export function meetingScheduleLabel(meeting: Meeting): string {
  if (meeting.schedule_date_confirmed === false && meeting.planned_window_start && meeting.planned_window_end) {
    return `الأسبوع المقترح: ${meeting.planned_window_start} إلى ${meeting.planned_window_end} — لم يُحدد يوم الانعقاد`;
  }
  return meeting.scheduled_date ?? "—";
}

const LOCATION_TYPES: Record<string, string> = { onsite: "حضوري", physical: "حضوري", online: "عن بُعد", hybrid: "هجين" };

/** Where the meeting is held, in words: the details if given, else its kind. Never the stored code. */
export function meetingLocationLabel(meeting: { location_details?: string | null; location_type?: string | null }, fallback = "غير محدد") {
  return meeting.location_details?.trim() || LOCATION_TYPES[meeting.location_type ?? ""] || fallback;
}

/** «12:45 – 14:45», «12:45», or that the time is not set yet. */
export function meetingTimeLabel(meeting: { start_time?: string | null; end_time?: string | null }) {
  const start = meeting.start_time?.slice(0, 5); const end = meeting.end_time?.slice(0, 5);
  return start ? (end ? `${start} – ${end}` : start) : "الوقت غير محدد";
}

/** «2026/2027» for an academic year that starts on 2026-09-01. */
export function academicYearLabel(start?: string | null) {
  if (!start) return null;
  const year = Number(start.slice(0, 4));
  return Number.isFinite(year) ? `${year}/${year + 1}` : null;
}

/** «الجلسة 3 · العام الجامعي 2026/2027», or null for a meeting outside a council year. */
export function sessionNumberLabel(meeting: { session_sequence_no?: number | null; academic_year_start?: string | null }) {
  const year = academicYearLabel(meeting.academic_year_start);
  if (!meeting.session_sequence_no || !year) return null;
  return `الجلسة ${meeting.session_sequence_no} · العام الجامعي ${year}`;
}
