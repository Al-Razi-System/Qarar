export type TopicStatus =
  | "new"
  | "under_review"
  | "returned"
  | "approved"
  | "rejected"
  | "deferred"
  | "listed"
  | "in_process"
  | "postponed"
  | "closed";

export type Topic = {
  id: string;
  topic_no?: string | null;
  title_ar: string;
  title_en?: string | null;
  description?: string | null;
  status: TopicStatus | string;
  priority: string;
  source_type?: string | null;
  routing_status?: string | null;
  governance_source?: string | null;
  category_id?: string;
  category_name_ar?: string | null;
  current_unit_id?: string;
  governance_unit_id?: string;
  governance_unit_name_ar?: string | null;
  unit_name_ar?: string | null;
  submitted_by_name_ar?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TopicDetail = Topic & {
  category?: { id?: string; name_ar?: string | null } | null;
  governance_unit?: { id?: string; name_ar?: string | null } | null;
  submitted_by?: { id?: string; full_name_ar?: string | null } | null;
  allowed_review_actions?: string[];
  referrals?: Array<{
    id: string;
    to_unit_name_ar: string;
    from_unit_name_ar: string;
    reason: string;
    decision?: string;
    created_at: string;
  }>;
};

export type ReviewAction = "approve" | "reject" | "return";

export const topicStatusMeta: Record<string, { label: string; className: string }> = {
  new: { label: "بانتظار المراجعة", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  under_review: { label: "قيد المراجعة", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  returned: { label: "مطلوب استكمال", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved: { label: "معتمد للمسار", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  rejected: { label: "مرفوض", className: "bg-red-50 text-red-700 ring-red-200" },
  deferred: { label: "مؤجل", className: "bg-orange-50 text-orange-700 ring-orange-200" },
  listed: { label: "مدرج في اجتماع", className: "bg-cyan-50 text-cyan-700 ring-cyan-200" },
  in_process: { label: "قيد المعالجة", className: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  postponed: { label: "مؤجل للاجتماع", className: "bg-orange-50 text-orange-700 ring-orange-200" },
  closed: { label: "مغلق", className: "bg-slate-100 text-slate-700 ring-slate-200" },
};

export const priorityMeta: Record<string, { label: string; className: string }> = {
  low: { label: "منخفضة", className: "bg-slate-100 text-slate-600" },
  medium: { label: "متوسطة", className: "bg-blue-50 text-blue-700" },
  high: { label: "عالية", className: "bg-orange-50 text-orange-700" },
  urgent: { label: "عاجلة", className: "bg-red-50 text-red-700" },
};

export const routingStatusLabels: Record<string, string> = {
  routing_ready: "المسار جاهز",
  routing_exception_pending: "بانتظار اعتماد استثناء",
  routing_exception_approved: "مسار استثنائي معتمد",
  routing_unavailable: "المسار غير مكتمل",
  not_required: "لا يتطلب مساراً",
};

export function topicCategoryName(topic: TopicDetail | Topic) {
  return topic.category_name_ar || ("category" in topic ? topic.category?.name_ar : null) || "غير محددة";
}

export function topicUnitName(topic: TopicDetail | Topic) {
  return topic.unit_name_ar
    || topic.governance_unit_name_ar
    || ("governance_unit" in topic ? topic.governance_unit?.name_ar : null)
    || "غير محددة";
}

export function topicStatus(topic: Topic) {
  return topicStatusMeta[topic.status] ?? {
    label: "حالة غير معرّفة",
    className: "bg-slate-100 text-slate-700 ring-slate-200",
  };
}

export function topicPriority(topic: Topic) {
  return priorityMeta[topic.priority] ?? { label: "غير محددة", className: "bg-slate-100 text-slate-600" };
}

export function routingStatusLabel(status?: string | null) {
  if (!status) return "لم يبدأ المسار";
  return routingStatusLabels[status] ?? "حالة مسار غير معرّفة";
}

