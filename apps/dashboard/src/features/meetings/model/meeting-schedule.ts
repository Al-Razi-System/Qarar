import type { Meeting } from "./meeting";
export function meetingScheduleLabel(meeting: Meeting): string {
  if (meeting.schedule_date_confirmed === false && meeting.planned_window_start && meeting.planned_window_end) {
    return `خلال ${windowRangeLabel(meeting.planned_window_start, meeting.planned_window_end)} — لم يُحدد يوم الانعقاد`;
  }
  return meeting.scheduled_date ? dayLabel(meeting.scheduled_date) : "—";
}

const arabic = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", options);
function parseDay(key: string) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); }

/** The day before a «YYYY-MM-DD» key, as a key. */
export function dayBefore(key: string) {
  const day = parseDay(key); day.setDate(day.getDate() - 1);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

/**
 * A plan meeting whose window ended without its session: it can still be held,
 * on a new day with a stated reason, until the next cycle begins.
 */
export function lateCycleMessage(meeting: { status: string; planned_window_end?: string | null; schedule_exception_reason?: string | null; next_cycle_start?: string | null }, today: string) {
  if (!["draft", "scheduled", "ready_to_start"].includes(meeting.status) || !meeting.planned_window_end || meeting.planned_window_end >= today) return null;
  if (meeting.schedule_exception_reason) return null;
  const until = meeting.next_cycle_start ? ` حتى ${dayLabel(dayBefore(meeting.next_cycle_start))}` : "";
  return `فاتت الدورة — يحتاج إجراء: انتهت فترة دورة هذا الاجتماع في ${dayLabel(meeting.planned_window_end)}. يمكن عقده${until} بعد تحديد موعد جديد وكتابة سبب انعقاده خارج الدورة.`;
}

/** «الاثنين، 12 أكتوبر 2026». */
export function dayLabel(key: string) {
  return arabic({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseDay(key));
}

/** «1 – 7 نوفمبر 2026», or «29 نوفمبر – 5 ديسمبر 2026» across months. */
export function windowRangeLabel(start: string, end: string) {
  const from = parseDay(start); const to = parseDay(end);
  const tail = arabic({ day: "numeric", month: "long", year: "numeric" }).format(to);
  if (from.getFullYear() !== to.getFullYear()) return `${arabic({ day: "numeric", month: "long", year: "numeric" }).format(from)} – ${tail}`;
  if (from.getMonth() !== to.getMonth()) return `${arabic({ day: "numeric", month: "long" }).format(from)} – ${tail}`;
  return `${from.getDate()} – ${tail}`;
}

/**
 * The name to show where room is short. A generated name repeats the ordinal,
 * the council and the month, and truncation would cut the council off; so it
 * leads with the council, and the session number goes beside it.
 */
export function meetingCompactTitle(meeting: { title_ar: string; title_is_custom?: boolean; unit_name_ar?: string | null; governance_unit_name_ar?: string | null; session_sequence_no?: number | null }) {
  const council = meeting.unit_name_ar ?? meeting.governance_unit_name_ar;
  if (meeting.title_is_custom === false && council) {
    return meeting.session_sequence_no ? `${council} · الجلسة ${meeting.session_sequence_no}` : council;
  }
  return meeting.title_ar;
}

const LOCATION_TYPES: Record<string, string> = { onsite: "حضوري", physical: "حضوري", online: "عن بُعد", hybrid: "هجين" };

/** Where the meeting is held, in words: the details if given, else its kind. Never the stored code. */
export function meetingLocationLabel(meeting: { location_details?: string | null; location_type?: string | null }, fallback = "غير محدد") {
  return meeting.location_details?.trim() || LOCATION_TYPES[meeting.location_type ?? ""] || fallback;
}

/**
 * «من 12:45 إلى 14:45», «12:45», or that the time is not set yet. Words, not a
 * dash: two numbers around a dash read in either order in a right-to-left line.
 */
export function meetingTimeLabel(meeting: { start_time?: string | null; end_time?: string | null }) {
  const start = meeting.start_time?.slice(0, 5); const end = meeting.end_time?.slice(0, 5);
  return start ? (end ? `من ${start} إلى ${end}` : start) : "الوقت غير محدد";
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
