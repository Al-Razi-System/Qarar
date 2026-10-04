export type MeetingOperationalGroup = "upcoming" | "missed" | "live" | "completion" | "completed" | "drafts" | "cancelled" | null;

type MeetingStateInput = { status: string; scheduled_date?: string | null };

export function meetingOperationalGroup(meeting: MeetingStateInput, today: string): MeetingOperationalGroup {
  if (["scheduled", "ready_to_start"].includes(meeting.status)) {
    return meeting.scheduled_date && meeting.scheduled_date < today ? "missed" : "upcoming";
  }
  if (meeting.status === "in_progress") return "live";
  if (["waiting_for_minutes", "waiting_for_approval"].includes(meeting.status)) return "completion";
  if (["closed", "archived"].includes(meeting.status)) return "completed";
  if (meeting.status === "draft") return "drafts";
  if (meeting.status === "cancelled") return "cancelled";
  return null;
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
