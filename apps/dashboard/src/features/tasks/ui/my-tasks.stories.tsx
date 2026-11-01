import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { MyTasks, TaskDetail, TaskSummary } from "../model/tasks";
import { MyTasksWorkspace } from "./my-tasks-workspace";

const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
};

const task = (patch: Partial<TaskSummary>): TaskSummary => ({
  id: "t1", action_no: "TSK-2026-000031", title_ar: "", description: null, status: "in_progress", progress_percent: 40,
  due_date: inDays(10), is_overdue: false, requires_evidence: false, evidence_count: 0,
  assigned_user_name_ar: "د. خالد", assigned_unit_name_ar: null, follow_up_user_name_ar: "د. هدى",
  decision_id: "d1", decision_no: "DEC-2026-000014", meeting_title_ar: "مجلس كلية الحاسب", updated_at: "2026-10-16T10:00:00Z", ...patch,
});

const tasks: MyTasks = {
  to_execute: [
    task({ id: "t1", title_ar: "مراجعة المتطلبات السابقة لمقرري تعلم الآلة والرؤية الحاسوبية", due_date: inDays(-4), is_overdue: true, requires_evidence: true }),
    task({ id: "t2", title_ar: "إعداد تقرير الطاقة الاستيعابية للفصل القادم", status: "new", progress_percent: 0, due_date: inDays(3) }),
    task({ id: "t3", title_ar: "تحديث دليل البرنامج على موقع الكلية", progress_percent: 75, due_date: inDays(1), requires_evidence: true, evidence_count: 2 }),
    task({ id: "t4", title_ar: "مخاطبة عمادة القبول بالخطة المعتمدة", status: "submitted", progress_percent: 90, due_date: inDays(20) }),
  ],
  to_verify: [
    task({ id: "v1", title_ar: "رفع محضر لجنة الخطط إلى المجلس", status: "submitted", progress_percent: 90, assigned_user_name_ar: "د. ريم", due_date: inDays(2) }),
    task({ id: "v2", title_ar: "حصر المقررات المشتركة بين الأقسام", status: "submitted", progress_percent: 90, assigned_user_name_ar: null, assigned_unit_name_ar: "قسم علوم الحاسب", due_date: inDays(9) }),
  ],
  following: [task({ id: "f1", title_ar: "اعتماد جداول الاختبارات النهائية", progress_percent: 50, assigned_user_name_ar: "أ. سارة", due_date: inDays(12) })],
};

const detailOf = (summary: TaskSummary): TaskDetail => ({
  ...summary,
  decision_text: "اعتماد الخطة الدراسية لبرنامج الذكاء الاصطناعي، على أن تُراجع المتطلبات السابقة لمقرري تعلم الآلة والرؤية الحاسوبية قبل بداية الفصل القادم.",
  started_at: "2026-10-10T09:00:00Z", completed_at: null,
  events: [
    { id: "e1", event_type: "start", progress_percent: 0, note: null, actor_name_ar: "د. خالد", created_at: "2026-10-10T09:00:00Z" },
    { id: "e2", event_type: "progress", progress_percent: 40, note: "اكتملت مراجعة مقرر تعلم الآلة.", actor_name_ar: "د. خالد", created_at: "2026-10-13T10:00:00Z" },
  ],
  evidence: [],
  viewer: summary.status === "submitted" && summary.id.startsWith("v")
    ? { is_executor: false, is_verifier: true, can_start: false, can_update: false, can_submit: false, submit_blocked_reason: null, can_verify: true, verify_blocked_reason: null }
    : { is_executor: true, is_verifier: false, can_start: summary.status === "new", can_update: summary.status === "in_progress", can_submit: false, submit_blocked_reason: summary.requires_evidence ? "تتطلب هذه المهمة دليل إنجاز؛ أرفق ملفاً قبل التسليم." : null, can_verify: false, verify_blocked_reason: null },
});

/** Answers the workspace's calls from the sample tasks above. */
function stubTasksApi() {
  const all = [...tasks.to_execute, ...tasks.to_verify, ...tasks.following];
  window.fetch = async (_input, init) => {
    const { contract, params } = JSON.parse(String(init?.body ?? "{}"));
    const data = contract === "list_my_tasks_v2" ? tasks : detailOf(all.find((entry) => entry.id === params?.p_task_id) ?? all[0]);
    return new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } });
  };
}

const meta: Meta<typeof MyTasksWorkspace> = {
  title: "التنفيذ/مهامي",
  component: MyTasksWorkspace,
  parameters: { layout: "padded" },
  loaders: [async () => { stubTasksApi(); return {}; }],
};
export default meta;

export const Workspace: StoryObj<typeof MyTasksWorkspace> = { name: "مهامي: ما ينتظرك" };
