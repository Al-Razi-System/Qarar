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
  prior_route_status?: string | null;
  prior_route_missing_evidence_count?: number;
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
  new: { label: "بانتظار المراجعة", className: "bg-q-surface-2 text-q-link ring-q-primary" },
  under_review: { label: "قيد المراجعة", className: "bg-q-surface-2 text-q-link ring-q-primary" },
  returned: { label: "مطلوب استكمال", className: "bg-q-warning-soft text-q-warning ring-q-warning" },
  approved: { label: "معتمد للمسار", className: "bg-q-success-soft text-q-success ring-q-success" },
  rejected: { label: "مرفوض", className: "bg-q-danger-soft text-q-danger ring-q-danger" },
  deferred: { label: "مؤجل", className: "bg-q-warning-soft text-q-warning ring-q-warning" },
  listed: { label: "مدرج في اجتماع", className: "bg-q-surface-2 text-q-link ring-q-primary" },
  in_process: { label: "قيد المعالجة", className: "bg-q-surface-2 text-q-link ring-q-primary" },
  postponed: { label: "مؤجل للاجتماع", className: "bg-q-warning-soft text-q-warning ring-q-warning" },
  closed: { label: "مغلق", className: "bg-q-surface-2 text-q-text-2 ring-q-border" },
};

export const priorityMeta: Record<string, { label: string; className: string }> = {
  low: { label: "منخفضة", className: "bg-q-surface-2 text-q-text-2" },
  medium: { label: "متوسطة", className: "bg-q-surface-2 text-q-link" },
  high: { label: "عالية", className: "bg-q-warning-soft text-q-warning" },
  urgent: { label: "عاجلة", className: "bg-q-danger-soft text-q-danger" },
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
  if (topic.prior_route_status === "draft") return {
    label: (topic.prior_route_missing_evidence_count ?? 0) > 0 ? "مطلوب استكمال الأدلة" : "جاهز لإرسال الأدلة",
    className: "bg-q-warning-soft text-q-warning ring-q-warning",
  };
  if (topic.prior_route_status === "submitted") return {
    label: "بانتظار مراجعة أدلة المسار",
    className: "bg-q-surface-2 text-q-link ring-q-primary",
  };
  if (topic.prior_route_status === "rejected") return {
    label: "أدلة المسار بحاجة لتصحيح",
    className: "bg-q-danger-soft text-q-danger ring-q-danger",
  };
  return topicStatusMeta[topic.status] ?? {
    label: "حالة غير معرّفة",
    className: "bg-q-surface-2 text-q-text-2 ring-q-border",
  };
}

export function topicPriority(topic: Topic) {
  return priorityMeta[topic.priority] ?? { label: "غير محددة", className: "bg-q-surface-2 text-q-text-2" };
}

export function routingStatusLabel(status?: string | null) {
  if (!status) return "لم يبدأ المسار";
  return routingStatusLabels[status] ?? "حالة مسار غير معرّفة";
}
