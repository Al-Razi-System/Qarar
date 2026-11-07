export type MeetingOperationalGroup = "future" | "upcoming" | "missed" | "live" | "completion" | "completed" | "archived" | "drafts" | "cancelled" | "not_held" | null;

type MeetingStateInput = { status: string; scheduled_date?: string | null; planned_window_start?: string | null; planned_window_end?: string | null };

export function meetingOperationalGroup(meeting: MeetingStateInput, today: string): MeetingOperationalGroup {
  if (["draft", "scheduled", "ready_to_start"].includes(meeting.status)
    && meeting.planned_window_start && meeting.planned_window_start > today) return "future";
  if (["scheduled", "ready_to_start"].includes(meeting.status)) {
    return meeting.scheduled_date && meeting.scheduled_date < today ? "missed" : "upcoming";
  }
  if (meeting.status === "in_progress") return "live";
  if (["waiting_for_minutes", "waiting_for_approval"].includes(meeting.status)) return "completion";
  if (meeting.status === "closed") return "completed";
  if (meeting.status === "archived") return "archived";
  if (meeting.status === "draft") {
    return meeting.planned_window_end && meeting.planned_window_end < today ? "missed" : "drafts";
  }
  if (meeting.status === "cancelled") return "cancelled";
  if (meeting.status === "not_held") return "not_held";
  return null;
}

/** A session still running or being completed after the window of its cycle has ended. */
export function isFromPreviousCycle(meeting: { status: string; planned_window_end?: string | null }, today: string) {
  return ["in_progress", "waiting_for_minutes", "waiting_for_approval"].includes(meeting.status)
    && Boolean(meeting.planned_window_end) && (meeting.planned_window_end as string) < today;
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
