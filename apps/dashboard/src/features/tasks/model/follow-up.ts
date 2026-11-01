import type { TaskSummary } from "./tasks";

export type FollowUpFilter = "open" | "closed" | "all";

export type FollowedDecision = {
  id: string;
  decision_no: string;
  decision_text: string;
  decision_status: string;
  outcome_kind: string;
  meeting_id: string | null;
  meeting_title_ar: string | null;
  meeting_date: string | null;
  council_name_ar: string | null;
  total_tasks: number;
  open_tasks: number;
  completed_tasks: number;
  cancelled_tasks: number;
  overdue_tasks: number;
  progress_percent: number;
  can_manage: boolean;
  can_close: boolean;
  close_blocked_reason: string | null;
  updated_at: string;
};

export type DecisionTasks = FollowedDecision & {
  tasks: Array<TaskSummary & { can_manage: boolean }>;
  /** For whoever manages: the units a task may be reassigned to. */
  units: Array<{ id: string; name_ar: string }> | null;
};

export type AssignmentTaskGroup = {
  id: string;
  title_ar: string;
  target_count: number;
  completed_count: number;
  progress_percent: number;
  tasks: DecisionTasks["tasks"];
};

/** Keeps a logical assignment in one follow-up row while its target tasks remain independent. */
export function groupDecisionTasks(tasks: DecisionTasks["tasks"]): AssignmentTaskGroup[] {
  const groups = new Map<string, DecisionTasks["tasks"]>();
  for (const task of tasks) {
    const key = task.assignment_batch_id ?? `task:${task.id}`;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return [...groups].map(([id, rows]) => {
    const first = rows[0];
    const declaredCount = first.assignment_batch_target_count ?? rows.length;
    return {
      id,
      title_ar: first.assignment_batch_title_ar ?? first.title_ar,
      target_count: Math.max(declaredCount, rows.length),
      completed_count: rows.filter((task) => task.status === "completed").length,
      progress_percent: Math.round(rows.reduce((total, task) => total + task.progress_percent, 0) / rows.length),
      tasks: rows,
    };
  });
}

export const FOLLOW_UP_FILTERS: Array<{ value: FollowUpFilter; label: string }> = [
  { value: "open", label: "قيد المتابعة" },
  { value: "closed", label: "مغلقة" },
  { value: "all", label: "الكل" },
];

const DECISION_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  draft: { label: "مسودة", tone: "neutral" },
  under_review: { label: "قيد المراجعة", tone: "neutral" },
  ready_for_approval: { label: "بانتظار اعتماد المحضر", tone: "warning" },
  approved: { label: "معتمد", tone: "info" },
  sent_to_execution: { label: "محال للتنفيذ", tone: "info" },
  under_follow_up: { label: "قيد المتابعة", tone: "warning" },
  closed: { label: "مغلق", tone: "success" },
  cancelled: { label: "ملغى", tone: "neutral" },
  rejected: { label: "مرفوض", tone: "danger" },
};

/** A decision's status in words; an unknown value is never shown raw. */
export function decisionStatusLabel(status: string) {
  return DECISION_STATUS[status] ?? { label: "حالة غير معروفة", tone: "neutral" as const };
}

export const OUTCOME_KIND_LABEL: Record<string, string> = {
  approval: "موافقة",
  rejection: "عدم موافقة",
  undecided: "لم يُحسم",
  postponement: "تأجيل",
  referral: "إحالة",
};
