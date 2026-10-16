import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { TaskDetail } from "../model/tasks";
import { TaskDetailPanel } from "./task-detail";

const base: TaskDetail = {
  id: "t1", action_no: "TSK-2026-000031", title_ar: "مراجعة المتطلبات السابقة لمقرري تعلم الآلة والرؤية الحاسوبية", description: null,
  status: "in_progress", progress_percent: 40, due_date: "2026-11-15", is_overdue: false, requires_evidence: true, evidence_count: 1,
  assigned_user_name_ar: "د. خالد", assigned_unit_name_ar: null, follow_up_user_name_ar: "د. هدى",
  decision_id: "d1", decision_no: "DEC-2026-000014", meeting_title_ar: "مجلس الكلية · الاجتماع الدوري الثالث", updated_at: "2026-10-16T10:00:00Z",
  decision_text: "اعتماد الخطة الدراسية لبرنامج الذكاء الاصطناعي، على أن تُراجع المتطلبات السابقة لمقرري تعلم الآلة والرؤية الحاسوبية قبل بداية الفصل القادم.",
  started_at: "2026-10-16T09:00:00Z", completed_at: null,
  events: [
    { id: "e1", event_type: "start", progress_percent: 0, note: null, actor_name_ar: "د. خالد", created_at: "2026-10-16T09:00:00Z" },
    { id: "e2", event_type: "progress", progress_percent: 40, note: "اكتملت مراجعة مقرر تعلم الآلة.", actor_name_ar: "د. خالد", created_at: "2026-10-16T10:00:00Z" },
  ],
  evidence: [{ id: "f1", file_name: "مراجعة-المتطلبات.pdf", mime_type: "application/pdf", file_size_bytes: 240000, description: "المسودة الأولى", uploaded_at: "2026-10-16T10:00:00Z", uploaded_by_name_ar: "د. خالد" }],
  viewer: { is_executor: true, is_verifier: false, can_start: false, can_update: true, can_submit: true, submit_blocked_reason: null, can_verify: false, verify_blocked_reason: null },
};

const meta: Meta<typeof TaskDetailPanel> = {
  title: "التنفيذ/تفاصيل المهمة",
  component: TaskDetailPanel,
  args: { pending: null, error: null, onAction: async () => true },
};
export default meta;
type Story = StoryObj<typeof TaskDetailPanel>;

export const Executor: Story = { name: "المنفّذ: قيد التنفيذ", args: { task: base } };
export const Overdue: Story = { name: "المنفّذ: متأخرة بلا دليل", args: { task: { ...base, is_overdue: true, due_date: "2026-10-10", evidence: [], viewer: { ...base.viewer, can_submit: false, submit_blocked_reason: "تتطلب هذه المهمة دليل إنجاز؛ أرفق ملفاً قبل التسليم." } } } };
export const Verifier: Story = {
  name: "المتحقق: بانتظار التحقق",
  args: { task: { ...base, status: "submitted", viewer: { ...base.viewer, is_executor: false, is_verifier: true, can_update: false, can_submit: false, can_verify: true } } },
};
