import type { Meeting } from "./meeting";
export function meetingScheduleLabel(meeting: Meeting): string {
  if (meeting.schedule_date_confirmed === false && meeting.planned_window_start && meeting.planned_window_end) {
    return `الأسبوع المقترح: ${meeting.planned_window_start} إلى ${meeting.planned_window_end} — لم يُحدد يوم الانعقاد`;
  }
  return meeting.scheduled_date ?? "—";
}
