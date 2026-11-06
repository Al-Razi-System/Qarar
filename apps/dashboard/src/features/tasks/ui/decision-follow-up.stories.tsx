import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { DecisionTasks } from "../model/follow-up";
import { DecisionCard, ManageDialog } from "./decision-follow-up-workspace";

const detail: DecisionTasks = {
  id: "d1", decision_no: "DEC-2026-000014",
  decision_text: "اعتماد الخطة الدراسية لبرنامج الذكاء الاصطناعي، على أن تُراجع المتطلبات السابقة لمقرري تعلم الآلة والرؤية الحاسوبية قبل بداية الفصل القادم.",
  decision_status: "under_follow_up", outcome_kind: "approval", meeting_id: "m1", meeting_title_ar: "الاجتماع الدوري الثالث", meeting_date: "2026-10-10",
  council_name_ar: "مجلس كلية الحاسب", total_tasks: 3, open_tasks: 2, completed_tasks: 1, cancelled_tasks: 0, overdue_tasks: 1, progress_percent: 63,
  can_manage: true, can_close: false, close_blocked_reason: "لم تُنجز 2 من مهام القرار أو تُلغَ بعد.", updated_at: "2026-10-16T10:00:00Z",
  tasks: [
    { id: "t1", action_no: "TSK-2026-000031", title_ar: "مراجعة المتطلبات السابقة لمقرري تعلم الآلة والرؤية الحاسوبية", description: null, status: "in_progress", progress_percent: 40, due_date: "2026-10-12", is_overdue: true, requires_evidence: true, evidence_count: 1, assigned_user_name_ar: "د. خالد", assigned_unit_name_ar: null, follow_up_user_name_ar: "د. هدى", decision_id: "d1", decision_no: "DEC-2026-000014", meeting_title_ar: null, updated_at: "2026-10-16T09:00:00Z", can_manage: true },
    { id: "t2", action_no: "TSK-2026-000032", title_ar: "إبلاغ عمادة القبول بالخطة المعتمدة", description: null, status: "submitted", progress_percent: 90, due_date: "2026-11-01", is_overdue: false, requires_evidence: false, evidence_count: 0, assigned_user_name_ar: null, assigned_unit_name_ar: "عمادة القبول والتسجيل", follow_up_user_name_ar: "د. هدى", decision_id: "d1", decision_no: "DEC-2026-000014", meeting_title_ar: null, updated_at: "2026-10-16T09:00:00Z", can_manage: true },
    { id: "t3", action_no: "TSK-2026-000033", title_ar: "تحديث دليل البرنامج", description: null, status: "completed", progress_percent: 100, due_date: "2026-10-14", is_overdue: false, requires_evidence: false, evidence_count: 0, assigned_user_name_ar: "د. ريم", assigned_unit_name_ar: null, follow_up_user_name_ar: "د. هدى", decision_id: "d1", decision_no: "DEC-2026-000014", meeting_title_ar: null, updated_at: "2026-10-16T09:00:00Z", can_manage: false },
  ],
  units: [{ id: "g1", name_ar: "عمادة القبول والتسجيل" }],
};

const noop = () => undefined;
const meta: Meta = { title: "التنفيذ/متابعة القرارات" };
export default meta;

export const Card: StoryObj = { name: "قرار ومهامه", render: () => <ul className="m-0 list-none p-0 font-sans"><DecisionCard decision={detail} open onToggle={noop} detail={detail} detailError={null} onManage={noop} /></ul> };
export const Extend: StoryObj = { name: "تمديد موعد مهمة", render: () => <ManageDialog manage={{ kind: "extend", task: detail.tasks[0] }} units={detail.units ?? []} busy={false} error={null} onClose={noop} onSubmit={noop} /> };
