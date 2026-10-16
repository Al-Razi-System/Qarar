export type TaskStatus = "new" | "in_progress" | "submitted" | "completed" | "cancelled" | "closed";

export type TaskSummary = {
  id: string;
  action_no: string;
  title_ar: string;
  description: string | null;
  status: TaskStatus;
  progress_percent: number;
  due_date: string | null;
  is_overdue: boolean;
  requires_evidence: boolean;
  evidence_count: number;
  assigned_user_name_ar: string | null;
  assigned_unit_name_ar: string | null;
  follow_up_user_name_ar: string | null;
  decision_id: string;
  decision_no: string | null;
  meeting_title_ar: string | null;
  updated_at: string;
};

export type MyTasks = { to_execute: TaskSummary[]; to_verify: TaskSummary[]; following: TaskSummary[] };

export type TaskEventType = "start" | "progress" | "evidence_added" | "evidence_removed" | "submit" | "verify" | "return";

export type TaskDetail = TaskSummary & {
  decision_text: string | null;
  started_at: string | null;
  completed_at: string | null;
  events: Array<{ id: string; event_type: TaskEventType; progress_percent: number | null; note: string | null; actor_name_ar: string | null; created_at: string }>;
  evidence: Array<{ id: string; file_name: string; mime_type: string | null; file_size_bytes: number | null; description: string | null; uploaded_at: string; uploaded_by_name_ar: string | null }>;
  viewer: {
    is_executor: boolean;
    is_verifier: boolean;
    can_start: boolean;
    can_update: boolean;
    can_submit: boolean;
    submit_blocked_reason: string | null;
    can_verify: boolean;
    verify_blocked_reason: string | null;
  };
};

export type TaskList = keyof MyTasks;

export const TASK_LISTS: Array<{ value: TaskList; label: string; empty: string }> = [
  { value: "to_execute", label: "للتنفيذ", empty: "لا مهام مكلَّف بها الآن." },
  { value: "to_verify", label: "للتحقق", empty: "لا مهام بانتظار تحققك." },
  { value: "following", label: "أتابعها", empty: "لا مهام تتابعها." },
];

export function taskStatusLabel(task: Pick<TaskSummary, "status" | "is_overdue">): { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" } {
  if (task.status === "completed") return { label: "منجزة", tone: "success" };
  if (task.status === "cancelled" || task.status === "closed") return { label: "ملغاة", tone: "neutral" };
  if (task.status === "submitted") return { label: "بانتظار التحقق", tone: "info" };
  if (task.is_overdue) return { label: "متأخرة", tone: "danger" };
  if (task.status === "in_progress") return { label: "قيد التنفيذ", tone: "warning" };
  return { label: "لم تبدأ", tone: "neutral" };
}

export const TASK_EVENT_LABEL: Record<TaskEventType, string> = {
  start: "بدء التنفيذ",
  progress: "تحديث الإنجاز",
  evidence_added: "إرفاق دليل",
  evidence_removed: "حذف دليل",
  submit: "تسليم للتحقق",
  verify: "اعتماد الإنجاز",
  return: "إعادة للتنفيذ",
};

export function assigneeName(task: Pick<TaskSummary, "assigned_user_name_ar" | "assigned_unit_name_ar">) {
  return task.assigned_user_name_ar ?? task.assigned_unit_name_ar ?? "غير محدد";
}
