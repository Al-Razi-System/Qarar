/** Arabic wording for audit events. Machine names never reach the reader except in «تفاصيل تقنية». */

export type AuditResult = "success" | "failure" | "denied";
export type ActorKind = "user" | "service" | "system";

export type ActorCapacity = {
  source: "declared" | "derived";
  declared: string | null;
  roles: string[];
  system_admin: boolean;
  governance_unit_id: string | null;
  governance_unit_name: string | null;
};

export type AuditEvent = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  result: AuditResult;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name_ar: string | null;
  actor_email?: string | null;
  actor_kind?: ActorKind | null;
  request_id?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
  changed_fields?: string[] | null;
  entity_label?: { reference: string | null; title: string | null } | null;
  actor_capacity?: ActorCapacity | null;
  previous_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

const verbs: Record<string, string> = {
  insert: "إضافة", create: "إنشاء", created: "إنشاء", add: "إضافة", added: "إضافة", upsert: "حفظ",
  update: "تعديل", updated: "تعديل", save: "حفظ", saved: "حفظ", save_item: "حفظ بند", save_identity: "حفظ الهوية",
  direct_save: "حفظ مباشر", set: "تعيين", set_status: "تغيير الحالة", change: "تغيير", changed: "تغيير",
  text_update: "تعديل النص", profile_update: "تحديث الملف الشخصي", avatar_update: "تحديث الصورة", avatar_remove: "حذف الصورة",
  delete: "حذف", remove_item: "حذف بند", revoke: "سحب", disable: "تعطيل", deactivate: "تعطيل", deactivated: "تعطيل",
  enable: "تفعيل", activate: "تفعيل", activated: "تفعيل", reactivated: "إعادة تفعيل", set_item_active: "تفعيل بند",
  approve: "اعتماد", approved: "اعتماد", approve_with_minutes: "اعتماد مع المحضر", accepted: "قبول", reject: "رفض",
  submit: "تقديم", submitted: "تقديم", request: "طلب", requested: "طلب", respond: "رد", propose: "اقتراح",
  publish: "نشر", direct_publication: "نشر مباشر", item_publication: "نشر بند", issue: "إصدار", issued: "إصدار",
  provision: "تهيئة", repair: "إصلاح", repaired: "إصلاح", permanentized_by_dev_repair: "تثبيت بإصلاح تطويري",
  checked: "فحص", verify: "تحقق", completed: "إكمال", complete: "إكمال", close: "إغلاق",
  begin_edit: "بدء تعديل", start: "بدء", started: "بدء", open: "فتح", lock: "قفل", unlock: "فتح قفل",
  cast: "تصويت", transition: "تغيير حالة", sign: "توقيع", prepare: "تجهيز", derived: "اشتقاق", file: "إرفاق ملف",
  export: "تصدير", downloads: "تنزيل", temporary_password_reset: "إعادة تعيين كلمة مرور مؤقتة",
  self_check_in: "تسجيل حضور ذاتي", create_from_vote: "إنشاء من تصويت", create_from_meeting: "إنشاء من اجتماع",
  not_held: "عدم انعقاد", rescheduled: "إعادة جدولة", postpone: "تأجيل", resumed: "استكمال", continue: "متابعة",
  return: "إعادة", failed: "فشل", evidence_added: "إضافة دليل", progress: "تحديث التقدم", handover: "تسليم",
  automatic: "تلقائي", planned_minutes: "محضر مخطط", class_changed: "تغيير الفئة", excel_scope_linked: "ربط نطاق من Excel",
  excel_import_verified: "تحقق استيراد Excel", production_users: "مستخدمو الإنتاج", login: "تسجيل دخول", logout: "تسجيل خروج",
  renamed: "إعادة تسمية", denied: "محاولة مرفوضة",
};

const entities: Record<string, string> = {
  permissions: "الصلاحيات", users: "المستخدمون", role_permissions: "صلاحيات الأدوار", roles: "الأدوار",
  meetings: "الاجتماعات", meeting_type: "نوع الاجتماع", memberships: "العضويات", membership: "العضوية",
  governance_units: "المجالس والوحدات", governance_unit: "المجلس أو الوحدة", governance_unit_types: "أنواع الوحدات",
  governance_unit_classes: "فئات الوحدات", policies: "اللوائح", policy_versions: "إصدارات اللوائح", policy_items: "بنود اللوائح",
  governance_bundles_v2: "حزم الحوكمة", workflow_templates: "قوالب المسارات", topic_types_v2: "تصنيفات الموضوعات",
  topics: "الموضوعات", topic_attachments: "مرفقات الموضوعات", typed_submission_preparations_v2: "مسودات التقديم",
  typed_submission_files_v2: "ملفات التقديم", attendance_records: "سجلات الحضور", agenda_items: "بنود جدول الأعمال",
  agenda_item: "بند جدول الأعمال", votes: "الأصوات", voting_rounds: "جولات التصويت", iam_change_requests: "طلبات تغيير الصلاحيات",
  action_items: "التكليفات", notification_deliveries: "إرسال الإشعارات", meeting_minutes: "المحاضر", minute_approvals: "مصادقات المحاضر",
  decisions: "القرارات", meeting_assignments: "تكليفات الاجتماعات", meeting_assignment_batches: "دفعات التكليفات",
  user_invitations: "دعوات المستخدمين", meeting_checkin_sessions: "جلسات تسجيل الحضور", organizations: "المؤسسات",
  user_sessions: "جلسات المستخدمين", api_contract: "عمليات النظام", sso_domains: "نطاقات الدخول الموحد",
};

const fields: Record<string, string> = {
  status: "الحالة", title_ar: "العنوان", name_ar: "الاسم", full_name_ar: "الاسم الكامل", email: "البريد الإلكتروني",
  description_ar: "الوصف", notes: "ملاحظات", reason: "السبب", code: "الرمز", reference_number: "الرقم المرجعي",
  topic_no: "رقم الموضوع", meeting_no: "رقم الاجتماع", action_no: "رقم التكليف", decision_no: "رقم القرار",
  employee_no: "الرقم الوظيفي", scheduled_date: "موعد الانعقاد", starts_at: "البداية", ends_at: "النهاية",
  due_date: "تاريخ الاستحقاق", priority: "الأولوية", progress_percent: "نسبة الإنجاز", is_active: "مفعّل",
  is_enabled: "متاح", is_system_admin: "مسؤول نظام", phone: "الجوال", device_name: "الجهاز", platform: "المنصة",
  revoked_at: "وقت الإبطال", revocation_reason: "سبب الإبطال", last_seen_at: "آخر نشاط", decided_at: "وقت القرار",
  result: "النتيجة", vote_choice: "الاختيار", round_number: "رقم الجولة", sort_order: "الترتيب", position: "الترتيب",
  membership_title: "صفة العضوية", start_date: "تاريخ البداية", end_date: "تاريخ النهاية", role_id: "الدور",
  user_id: "المستخدم", governance_unit_id: "المجلس أو الوحدة", meeting_id: "الاجتماع", topic_id: "الموضوع",
  assigned_to_user_id: "المكلَّف", decision_text_ar: "نص القرار", discussion_notes: "ملاحظات المناقشة",
  contract: "العملية", error_code: "رمز الخطأ", http_status: "رمز الاستجابة", api_version: "إصدار الواجهة",
  action_no_ref: "رقم التكليف", ip_address: "عنوان IP", user_agent: "المتصفح", app_version: "إصدار التطبيق",
};

const values: Record<string, string> = {
  draft: "مسودة", scheduled: "مجدول", ready_to_start: "جاهز للانعقاد", in_progress: "قيد التنفيذ", completed: "مكتمل",
  approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى", canceled: "ملغى", active: "نشط", inactive: "غير نشط",
  archived: "مؤرشف", pending: "بانتظار الإجراء", postponed: "مؤجل", submitted: "مقدَّم", under_review: "قيد المراجعة",
  effective: "نافذ", retired: "موقوف", revoked: "مسحوب", closed: "مغلق", open: "مفتوح", not_met: "غير مكتمل",
  met: "مكتمل", needs_completion: "يحتاج استكمالًا", returned: "معاد", disabled: "معطل", enabled: "مفعّل",
  success: "ناجحة", failure: "فاشلة", denied: "مرفوضة", awaiting_minutes: "بانتظار المحضر", awaiting_approvals: "بانتظار المصادقات",
  high: "عالية", medium: "متوسطة", low: "منخفضة", yes: "موافق", no: "غير موافق", abstain: "ممتنع",
};

/** Bookkeeping that never explains a decision. Still visible under «تفاصيل تقنية». */
const noise = new Set(["id", "organization_id", "created_at", "updated_at", "version", "row_version", "search_vector", "table", "operation"]);

export const resultLabels: Record<AuditResult, { label: string; tone: "success" | "danger" | "warning" }> = {
  success: { label: "ناجحة", tone: "success" },
  denied: { label: "مرفوضة", tone: "danger" },
  failure: { label: "فاشلة", tone: "warning" },
};

export function verbLabel(action: string) {
  if (action === "api.denied") return "محاولة مرفوضة";
  if (action === "api.failed") return "عملية فشلت";
  return verbs[action.split(".").at(-1) ?? action] ?? "عملية";
}

export function entityLabel(entityType: string) {
  return entities[entityType] ?? "سجل آخر";
}

export function actorLabel(event: Pick<AuditEvent, "actor_name_ar" | "actor_kind" | "actor_user_id">) {
  if (event.actor_name_ar) return event.actor_name_ar;
  if (event.actor_user_id) return "مستخدم محذوف";
  return event.actor_kind === "service" ? "خدمة النظام" : "النظام (تهيئة أو ترحيل)";
}

export function fieldLabel(key: string) {
  return fields[key] ?? null;
}

export function isMeaningfulField(key: string) {
  return !noise.has(key) && !key.endsWith("_hash") && !key.endsWith("_token");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DisplayValue = { text: string; technical?: boolean };

export function displayValue(value: unknown): DisplayValue {
  if (value === null || value === undefined || value === "") return { text: "—" };
  if (typeof value === "boolean") return { text: value ? "نعم" : "لا" };
  if (typeof value === "number") return { text: value.toLocaleString("ar-SA-u-nu-latn") };
  if (typeof value === "string") {
    if (values[value]) return { text: values[value] };
    if (UUID.test(value)) return { text: `معرّف ${value.slice(0, 8)}`, technical: true };
    if (ISO_DATE.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return { text: value.length <= 10 ? date.toLocaleDateString("ar-SA-u-nu-latn", { dateStyle: "medium" }) : date.toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }) };
      }
    }
    return { text: value.length > 240 ? `${value.slice(0, 240)}…` : value, technical: /^[a-z0-9_.-]+$/.test(value) };
  }
  return { text: JSON.stringify(value), technical: true };
}

export function formatTime(value: string, withSeconds = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-SA-u-nu-latn", withSeconds ? { dateStyle: "long", timeStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" });
}

export function deviceLabel(userAgent?: string | null) {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent) ? "Edge" : /OPR\//.test(userAgent) ? "Opera" : /Firefox\//.test(userAgent) ? "Firefox"
    : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : /Dart|Flutter/i.test(userAgent) ? "تطبيق الجوال" : "عميل آخر";
  const system = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
    : /Mac OS X/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : null;
  return system ? `${browser} على ${system}` : browser;
}

/** What changed, as rows the reader can scan: changed fields for an edit, the recorded values otherwise. */
export function changeRows(event: AuditEvent) {
  const before = event.previous_data ?? null;
  const after = event.new_data ?? null;
  if (before && after) {
    const keys = (event.changed_fields?.length ? event.changed_fields : Object.keys({ ...before, ...after }).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])))
      .filter(isMeaningfulField);
    return { kind: "update" as const, rows: keys.map((key) => ({ key, before: before[key], after: after[key] })) };
  }
  const snapshot = after ?? before;
  if (!snapshot) return { kind: "none" as const, rows: [] };
  const rows = Object.entries(snapshot).filter(([key, value]) => isMeaningfulField(key) && value !== null && value !== "")
    .map(([key, value]) => ({ key, before: after ? undefined : value, after: after ? value : undefined }));
  return { kind: after ? "insert" as const : "delete" as const, rows };
}

const capacityNames: Record<string, string> = {
  council_chair: "رئيس المجلس", council_rapporteur: "مقرر المجلس", council_member: "عضو المجلس", system_admin: "مسؤول النظام",
};

/**
 * The capacity the actor acted in. «Declared» is what the command stated (and verified); otherwise the
 * roles the actor held in that council that day. Null when the event predates capacity recording.
 */
export function capacityLabel(capacity?: ActorCapacity | null): { text: string; hint: string } | null {
  if (!capacity) return null;
  const where = capacity.governance_unit_name ? ` في «${capacity.governance_unit_name}»` : "";
  if (capacity.source === "declared" && capacity.declared) {
    return { text: `${capacityNames[capacity.declared] ?? "صفة أخرى"}${capacity.declared === "system_admin" ? "" : where}`, hint: "صفة أعلنها الأمر وتحقق منها النظام" };
  }
  const roles = (capacity.roles ?? []).map((role) => capacityNames[role]).filter(Boolean);
  if (roles.length) return { text: `${roles.join("، ")}${where}`, hint: "الأدوار التي كان يشغلها في هذا المجلس وقت الحدث" };
  if (capacity.system_admin) return { text: "مسؤول النظام", hint: capacity.governance_unit_name ? `بلا دور في «${capacity.governance_unit_name}»` : "خارج سياق مجلس" };
  return { text: capacity.governance_unit_name ? `بلا دور في «${capacity.governance_unit_name}»` : "بلا صفة مجلس", hint: "لم يكن يشغل دورًا في هذا السياق" };
}
