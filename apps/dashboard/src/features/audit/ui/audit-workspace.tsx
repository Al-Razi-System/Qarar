"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, Check, ClipboardList, Download, LoaderCircle, Search, ShieldAlert,
} from "lucide-react";

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  actor_name_ar: string | null;
  result: string;
  occurred_at: string;
  previous_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type Notice = { kind: "success" | "error"; text: string };

/** Contract parameters of api_v1.admin_search_audit_logs / admin_export_audit_logs. */
type AuditFilters = { p_action: null; p_entity_type: null; p_actor_user_id: null; p_result: string | null; p_from: null; p_to: null };

const EXPORT_LIMIT = 10000;

const verbLabels: Record<string, string> = {
  insert: "إضافة", create: "إنشاء", created: "إنشاء", add: "إضافة", added: "إضافة", upsert: "حفظ",
  update: "تحديث", updated: "تحديث", save: "حفظ", saved: "حفظ", save_item: "حفظ بند", save_identity: "حفظ الهوية",
  direct_save: "حفظ مباشر", set: "تعيين", set_status: "تغيير الحالة", change: "تغيير", changed: "تغيير",
  text_update: "تعديل النص", profile_update: "تحديث الملف الشخصي", avatar_update: "تحديث الصورة", avatar_remove: "حذف الصورة",
  delete: "حذف", remove_item: "حذف بند", revoke: "سحب", disable: "تعطيل", deactivate: "تعطيل", deactivated: "تعطيل",
  enable: "تفعيل", activate: "تفعيل", activated: "تفعيل", reactivated: "إعادة تفعيل", set_item_active: "تفعيل بند",
  approve: "اعتماد", approved: "اعتماد", approve_with_minutes: "اعتماد مع المحضر", accepted: "قبول", reject: "رفض",
  submit: "تقديم", submitted: "تقديم", request: "طلب", requested: "طلب", respond: "رد", propose: "اقتراح",
  publish: "نشر", direct_publication: "نشر مباشر", item_publication: "نشر بند", issue: "إصدار", issued: "إصدار",
  provision: "تهيئة", repair: "إصلاح", repaired: "إصلاح", permanentized_by_dev_repair: "تثبيت بإصلاح تطويري",
  checked: "فحص", verify: "تحقق", self_check: "فحص ذاتي", completed: "إكمال", complete: "إكمال", close: "إغلاق",
  begin_edit: "بدء تعديل", start: "بدء", started: "بدء", open: "فتح", lock: "قفل", unlock: "فتح قفل",
  cast: "تصويت", transition: "تغيير حالة", sign: "توقيع", prepare: "تجهيز", derived: "اشتقاق", file: "إرفاق ملف",
  export: "تصدير", downloads: "تنزيل", temporary_password_reset: "إعادة تعيين كلمة مرور مؤقتة",
  self_check_in: "تسجيل حضور ذاتي", create_from_vote: "إنشاء من تصويت", create_from_meeting: "إنشاء من اجتماع",
  not_held: "عدم انعقاد", rescheduled: "إعادة جدولة", postpone: "تأجيل", resumed: "استكمال", continue: "متابعة",
  return: "إعادة", failed: "فشل", evidence_added: "إضافة دليل", progress: "تحديث التقدم", handover: "تسليم",
  automatic: "تلقائي", planned_minutes: "محضر مخطط", class_changed: "تغيير الفئة", excel_scope_linked: "ربط نطاق من Excel",
  excel_import_verified: "تحقق استيراد Excel", production_users: "مستخدمو الإنتاج", login: "تسجيل دخول", logout: "تسجيل خروج",
};

const entityLabels: Record<string, string> = {
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
};

const resultLabels: Record<string, string> = { success: "ناجحة", failure: "فاشلة", denied: "مرفوضة" };

function actionLabel(action: string) {
  const verb = action.split(".").at(-1) ?? action;
  return verbLabels[verb] ?? "عملية";
}

function entityLabel(entityType: string) {
  return entityLabels[entityType] ?? "سجل آخر";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-SA");
}

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const res = await fetch("/api/admin/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}

export function AuditWorkspace() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const latestSearch = useRef(0);

  const filters = (): AuditFilters => ({
    p_action: null, p_entity_type: null, p_actor_user_id: null,
    p_result: resultFilter || null, p_from: null, p_to: null,
  });

  useEffect(() => { void loadLogs(); }, [query, resultFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLogs() {
    const requestId = ++latestSearch.current;
    setLoading(true); setNotice(null);
    try {
      const result = await rpc<{ items: AuditLog[]; total: number }>("admin_search_audit_logs", {
        p_query: query.trim() || null,
        ...filters(),
        p_limit: 50, p_offset: 0,
      });
      if (requestId !== latestSearch.current) return;
      setLogs(result.items ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      if (requestId !== latestSearch.current) return;
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تحميل سجل التدقيق." });
    } finally {
      if (requestId === latestSearch.current) setLoading(false);
    }
  }

  async function openDetail(logId: string) {
    setDetailLoading(true); setNotice(null);
    try {
      const detail = await rpc<AuditLog>("admin_get_audit_log", { p_audit_log_id: logId });
      setSelected(detail);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تحميل تفاصيل الحدث." });
    } finally {
      setDetailLoading(false);
    }
  }

  async function exportLogs() {
    if (exporting) return;
    setExporting(true); setNotice(null);
    try {
      const result = await rpc<{ items?: unknown[] }>("admin_export_audit_logs", filters());
      const count = result.items?.length ?? 0;
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice({
        kind: "success",
        text: count >= EXPORT_LIMIT
          ? `تم تصدير أحدث ${EXPORT_LIMIT.toLocaleString("ar-SA")} سجل؛ ضيّق النتيجة لتصدير الباقي.`
          : `تم تصدير ${count} سجل.`,
      });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التصدير." });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className={`flex items-center gap-2 rounded-q-control border p-3 text-q-caption font-bold ${notice.kind === "success" ? "border-q-success bg-q-success-soft text-q-success" : "border-q-danger bg-q-danger-soft text-q-danger"}`}>
          {notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />} {notice.text}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-q-card border border-q-border bg-q-surface p-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1 sm:max-w-sm">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-q-text-3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void loadLogs(); }} placeholder="ابحث بالاسم أو المعرف..." className="min-h-11 w-full rounded-q-control border border-q-border bg-q-surface-2 pr-9 pl-3 text-q-ui text-q-text outline-none focus:border-q-focus" />
          </div>
          <select aria-label="نتيجة العملية" value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} className="min-h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui text-q-text outline-none focus:border-q-focus">
            <option value="">كل النتائج</option>
            <option value="success">ناجحة</option>
            <option value="failure">فاشلة</option>
            <option value="denied">مرفوضة</option>
          </select>
          <button type="button" onClick={() => void loadLogs()} className="min-h-11 rounded-q-control border border-q-border px-4 text-q-ui font-bold text-q-text-2 hover:bg-q-surface-2">بحث</button>
        </div>
        <button type="button" onClick={() => void exportLogs()} disabled={exporting} className="flex min-h-11 items-center gap-2 rounded-q-control border border-q-border px-4 text-q-ui font-bold text-q-text-2 hover:border-q-primary hover:text-q-primary disabled:opacity-50">
          <Download size={14} /> {exporting ? "جارٍ التصدير..." : "تصدير"}
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_minmax(380px,.55fr)]">
        <div className="rounded-q-card border border-q-border bg-q-surface">
          <div className="flex items-center justify-between border-b border-q-border px-5 py-3">
            <h2 className="text-q-ui font-black text-q-text">سجل التدقيق</h2>
            <span className="text-q-caption font-bold text-q-text-3">إجمالي: <strong className="text-q-text">{total}</strong></span>
          </div>
          {loading ? (
            <div className="grid min-h-[350px] place-items-center"><LoaderCircle className="animate-spin text-q-primary" size={28} /></div>
          ) : logs.length === 0 ? (
            <div className="grid min-h-[350px] place-items-center text-center p-8">
              <div><ShieldAlert className="mx-auto text-q-text-3" size={34} /><h3 className="mt-3 text-q-ui font-black text-q-text">لا توجد سجلات</h3></div>
            </div>
          ) : (
            <div className="divide-y divide-q-border">
              {logs.map((log) => (
                <button type="button" key={log.id} onClick={() => void openDetail(log.id)} className={`flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-q-bg ${selected?.id === log.id ? "bg-q-surface-2" : ""}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-q-control bg-q-info-soft text-q-primary">
                    <ClipboardList size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-q-caption font-black text-q-text">{log.actor_name_ar ?? "النظام"}</h4>
                    <p className="text-q-caption text-q-text-3">
                      {actionLabel(log.action)} · {entityLabel(log.entity_type)} · {formatTime(log.occurred_at)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-q-card border border-q-border bg-q-surface">
          {detailLoading ? (
            <div className="grid min-h-[300px] place-items-center"><LoaderCircle className="animate-spin text-q-primary" size={28} /></div>
          ) : !selected ? (
            <div className="grid min-h-[300px] place-items-center text-center p-8">
              <div><ClipboardList className="mx-auto text-q-text-3" size={30} /><h3 className="mt-3 text-q-ui font-black text-q-text">اختر سجلاً</h3></div>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <h3 className="text-q-h3 font-black text-q-text">تفاصيل الحدث</h3>
              <div className="grid grid-cols-1 gap-3 text-q-caption sm:grid-cols-2">
                <div className="rounded-q-control border border-q-border bg-q-bg p-3"><p className="text-q-caption font-black text-q-text-3">العملية</p><strong className="mt-1 block text-q-text">{actionLabel(selected.action)}</strong></div>
                <div className="rounded-q-control border border-q-border bg-q-bg p-3"><p className="text-q-caption font-black text-q-text-3">الكيان</p><strong className="mt-1 block text-q-text">{entityLabel(selected.entity_type)}</strong></div>
                <div className="rounded-q-control border border-q-border bg-q-bg p-3"><p className="text-q-caption font-black text-q-text-3">المنفذ</p><strong className="mt-1 block text-q-text">{selected.actor_name_ar ?? "النظام"}</strong></div>
                <div className="rounded-q-control border border-q-border bg-q-bg p-3"><p className="text-q-caption font-black text-q-text-3">الوقت</p><strong className="mt-1 block text-q-text">{formatTime(selected.occurred_at)}</strong></div>
                <div className="rounded-q-control border border-q-border bg-q-bg p-3"><p className="text-q-caption font-black text-q-text-3">النتيجة</p><strong className="mt-1 block text-q-text">{resultLabels[selected.result] ?? "غير محددة"}</strong></div>
              </div>
              {([["البيانات السابقة", selected.previous_data], ["البيانات الجديدة", selected.new_data], ["بيانات إضافية", selected.metadata]] as const).map(([label, value]) => value && Object.keys(value).length > 0 ? (
                <div key={label} className="max-h-48 overflow-auto rounded-q-control border border-q-border bg-q-bg p-3">
                  <p className="mb-2 text-q-caption font-black text-q-text-3">{label}</p>
                  <pre dir="ltr" className="whitespace-pre-wrap text-left font-mono text-q-caption text-q-text-2">{JSON.stringify(value, null, 2)}</pre>
                </div>
              ) : null)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
