import type { JourneyStep } from "@/shared/ui/journey-rail";
import type { TaskDetail, TaskSummary } from "./tasks";

const DAY = 24 * 60 * 60 * 1000;
const shortDate = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" });

/** Whole days from today (local) to a date: negative when it has passed. */
export function daysUntil(date: string, today: Date = new Date()) {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = date.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - start) / DAY);
}

function days(count: number) {
  if (count === 1) return "يوم";
  if (count === 2) return "يومين";
  if (count <= 10) return `${count} أيام`;
  return `${count} يوماً`;
}

export type DueTone = "danger" | "warning" | "neutral" | "success";

/** The due date as people say it: «بعد 3 أيام», «اليوم», «متأخرة منذ 4 أيام». */
export function dueText(task: Pick<TaskSummary, "due_date" | "status">, today: Date = new Date()): { text: string; tone: DueTone } {
  if (task.status === "completed") return { text: "أُنجزت", tone: "success" };
  if (task.status === "cancelled" || task.status === "closed") return { text: "أُلغيت", tone: "neutral" };
  if (!task.due_date) return { text: "بلا موعد", tone: "neutral" };
  const left = daysUntil(task.due_date, today);
  if (task.status === "submitted") return { text: "سُلّمت للتحقق", tone: "neutral" };
  if (left < 0) return { text: `متأخرة منذ ${days(-left)}`, tone: "danger" };
  if (left === 0) return { text: "موعدها اليوم", tone: "warning" };
  if (left === 1) return { text: "موعدها غداً", tone: "warning" };
  if (left <= 7) return { text: `بعد ${days(left)}`, tone: "warning" };
  return { text: `حتى ${shortDate.format(new Date(`${task.due_date}T00:00:00`))}`, tone: "neutral" };
}

export type Urgency = "overdue" | "this_week" | "later";

export const URGENCY_GROUPS: Array<{ value: Urgency; label: string }> = [
  { value: "overdue", label: "متأخرة" },
  { value: "this_week", label: "خلال سبعة أيام" },
  { value: "later", label: "لاحقاً" },
];

export function urgencyOf(task: Pick<TaskSummary, "due_date" | "is_overdue">, today: Date = new Date()): Urgency {
  if (task.is_overdue) return "overdue";
  if (task.due_date && daysUntil(task.due_date, today) <= 7) return "this_week";
  return "later";
}

const STATIONS = ["تكليف", "تنفيذ", "تسليم", "تحقق"] as const;

/** Where a task stands on its way from the decision to verified completion. */
export function taskJourney(task: Pick<TaskSummary, "status" | "is_overdue" | "progress_percent">, events: TaskDetail["events"] = []): JourneyStep[] {
  const at = { new: 1, in_progress: 1, overdue: 1, submitted: 3, completed: 4, cancelled: -1, closed: -1 }[task.status] ?? 1;
  const last = (type: string) => [...events].reverse().find((event) => event.event_type === type);
  const when = (type: string) => {
    const event = last(type);
    return event ? [event.actor_name_ar, shortDate.format(new Date(event.created_at))].filter(Boolean).join("، ") : null;
  };
  const details = [null, task.status === "new" ? "لم يبدأ" : `${task.progress_percent}%`, when("submit"), when("verify")];
  return STATIONS.map((label, index) => {
    if (at === -1) return { label, state: index === 0 ? "done" : "upcoming", detail: index === 1 ? "أُلغيت المهمة" : null };
    if (index < at) return { label, state: "done", detail: details[index] };
    if (index === at) return { label, state: task.is_overdue && index === 1 ? "blocked" : "current", detail: details[index] };
    return { label, state: "upcoming" };
  });
}
