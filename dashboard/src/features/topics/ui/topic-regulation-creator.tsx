"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowLeft, Check, FileCheck2, LoaderCircle,
  Route, Search, ShieldCheck, Sparkles,
} from "lucide-react";

type Notice = { kind: "success" | "error"; text: string; detail?: string };
type ReferenceOption = { id: string; code: string; name_ar: string; [key: string]: unknown };
type RegulationOption = {
  selection: {
    policy_id: string;
    policy_version_id: string;
    policy_item_id: string;
    scope_assignment_id: string;
  };
  policy: { code: string; name_ar: string; name_en?: string | null };
  version: { number: number; label?: string | null };
  item: { code: string; title_ar: string; title_en?: string | null };
  scope: { type: string; priority: number };
  governance_mode: string;
  automation_status: string;
  routing_outcome: string;
  can_start_workflow: boolean;
};
type RegulationOptionsResponse = {
  items: RegulationOption[];
  total: number;
};
type WorkflowTemplate = {
  id: string;
  code: string;
  name_ar: string;
  versions?: WorkflowTemplateVersion[];
};
type WorkflowTemplateVersion = {
  id: string;
  version_no: number;
  status: string;
  validation_status: string;
};
type TopicSummary = {
  topic: {
    id: string;
    topic_no?: string | null;
    title_ar: string;
    status: string;
    routing_status: string;
    governance_source?: string | null;
  };
  regulation?: {
    code?: string | null;
    name_ar?: string | null;
    version_no?: number | null;
    version_label?: string | null;
  } | null;
  item?: {
    code?: string | null;
    title_ar?: string | null;
    governance_mode?: string | null;
  } | null;
  workflow?: {
    instance_id?: string | null;
    name_ar?: string | null;
    status?: string | null;
  } | null;
  current_step?: {
    id?: string | null;
    name_ar?: string | null;
    responsibility?: string | null;
    assigned_unit_name_ar?: string | null;
    status?: string | null;
    allowed_outcomes?: string[];
    action_version?: number;
  } | null;
  exception?: {
    id?: string | null;
    status?: "pending" | "approved" | "rejected" | "expired" | string;
    reason?: string | null;
    valid_until?: string | null;
    requested_source?: string | null;
    workflow_template_version_id?: string | null;
    workflow_name_ar?: string | null;
  } | null;
};

const input = "h-10 w-full rounded-xl border border-[#dce5ef] bg-white px-3 text-xs text-[#0a1330] outline-none transition focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/10";
const textarea = "min-h-24 w-full rounded-xl border border-[#dce5ef] bg-white p-3 text-xs leading-6 text-[#0a1330] outline-none transition focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/10";
const priorityLabels: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };
const sourceLabels: Record<string, string> = {
  new: "موضوع جديد",
  from_lower_unit: "وارد من وحدة أدنى",
  from_upper_unit: "وارد من وحدة أعلى",
  from_peer_unit: "وارد من وحدة مناظرة",
  from_admin_entity: "وارد من جهة إدارية",
};
const scopeLabels: Record<string, string> = {
  organization: "المنظمة كاملة",
  governance_unit: "جهة محددة",
  governance_class: "تصنيف مجالس",
  governance_level: "مستوى تنظيمي",
  governance_unit_type: "نوع وحدة",
  unit_subtree: "وحدة وفروعها",
};
const governanceModeLabels: Record<string, string> = {
  regulation_required: "مسار اللائحة إلزامي",
  regulated_fallback_allowed: "يسمح بمسار بديل",
  custom_route_allowed: "يسمح بمسار مخصص",
};
const routingLabels: Record<string, string> = {
  resolved: "جاهزة لإنشاء المسار",
  blocked: "محظورة مؤقتًا",
  custom_route_required: "تحتاج مسارًا مخصصًا",
  policy_partially_ready: "اللائحة غير مكتملة الجاهزية",
  policy_not_implemented: "المسار غير مطبق",
};
const outcomeLabels: Record<string, string> = {
  approved: "يعتمد",
  returned: "يعاد للتعديل",
  rejected: "يرفض",
  tie: "تعادل التصويت",
  no_vote: "لا يوجد تصويت كافٍ",
  completed: "يكتمل المسار",
  cancelled: "يلغى",
};
const exceptionStatusLabels: Record<string, string> = {
  pending: "بانتظار الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  expired: "منتهي",
};

function defaultValidUntil() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  date.setHours(23, 59, 0, 0);
  return date.toISOString().slice(0, 16);
}

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/regulations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? "تعذر تنفيذ العملية.") as Error & { detail?: string };
    error.detail = payload.error?.technicalMessage ?? payload.error?.details;
    throw error;
  }
  return payload.data as T;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-black text-[#34465e]">{label}</span>{children}{hint && <span className="mt-1 block text-[10px] text-[#7d8da1]">{hint}</span>}</label>;
}

function SmallBadge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "amber" | "slate" }) {
  const classes = {
    blue: "bg-[#edf6ff] text-[#0066cc]",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    slate: "bg-slate-100 text-slate-600",
  };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${classes[tone]}`}>{children}</span>;
}

export function TopicRegulationCreator() {
  const [references, setReferences] = useState<{ units: ReferenceOption[]; categories: ReferenceOption[] }>({ units: [], categories: [] });
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    unit: "",
    category: "",
    priority: "medium",
    source: "new",
    effectiveOn: new Date().toISOString().slice(0, 10),
  });
  const [options, setOptions] = useState<RegulationOption[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [summary, setSummary] = useState<TopicSummary | null>(null);
  const [exceptionResult, setExceptionResult] = useState<Record<string, unknown> | null>(null);
  const [exceptionForm, setExceptionForm] = useState({
    reason: "",
    workflowVersionId: "",
    validUntil: defaultValidUntil(),
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectedOption = useMemo(() => options.find((option) => selectionKey(option) === selectedKey), [options, selectedKey]);
  const activeWorkflowVersions = useMemo(() => workflows.flatMap((workflow) =>
    (workflow.versions ?? [])
      .filter((version) => version.status === "active" && version.validation_status === "valid")
      .map((version) => ({
        id: version.id,
        label: `${workflow.name_ar} · v${version.version_no}`,
      })),
  ), [workflows]);
  const readyOptions = options.filter((option) => option.can_start_workflow).length;
  const shouldShowExceptionDesigner = Boolean(
    (form.unit && form.category && options.length === 0 && notice?.kind === "error") ||
    (options.length > 0 && readyOptions === 0) ||
    (selectedOption && !selectedOption.can_start_workflow) ||
    summary?.exception?.status,
  );
  const currentStage = summary ? 6 : selectedOption ? 5 : options.length ? 4 : form.unit && form.category ? 3 : form.unit ? 2 : 1;

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoadingReferences(true);
      try {
        const [units, categories, workflowItems] = await Promise.all([
          rpc<{ items: ReferenceOption[] }>("admin_list_governance_units", {
            p_query: null, p_status: "active", p_unit_type_id: null, p_governance_class_id: null, p_parent_unit_id: null, p_limit: 100, p_offset: 0,
          }),
          rpc<{ items: ReferenceOption[] }>("admin_list_topic_categories", {
            p_query: null, p_is_active: true, p_limit: 100, p_offset: 0,
          }),
          rpc<WorkflowTemplate[]>("admin_list_workflow_templates"),
        ]);
        if (mounted) {
          setReferences({ units: units.items, categories: categories.items });
          setWorkflows(workflowItems ?? []);
        }
      } catch (error) {
        if (mounted) setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل المراجع.", detail: (error as Error & { detail?: string }).detail });
      } finally {
        if (mounted) setLoadingReferences(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  function resetOptions(next = form) {
    setForm(next);
    setOptions([]);
    setSelectedKey("");
    setSummary(null);
    setExceptionResult(null);
    setNotice(null);
  }

  async function findRegulations() {
    if (!form.unit || !form.category) {
      setNotice({ kind: "error", text: "اختر المجلس/الجهة وفئة الموضوع أولًا." });
      return;
    }
    setBusy(true); setNotice(null); setSummary(null); setSelectedKey("");
    try {
      const result = await rpc<RegulationOptionsResponse>("get_topic_regulation_options", {
        p_governance_unit_id: form.unit,
        p_topic_category_id: form.category,
        p_priority: form.priority,
        p_source_type: form.source,
        p_effective_on: form.effectiveOn,
      });
      setOptions(result.items ?? []);
      if (!result.items?.length) setNotice({ kind: "error", text: "لا توجد لائحة نافذة تطابق بيانات هذا الموضوع." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر اختبار اللوائح المطابقة.", detail: (error as Error & { detail?: string }).detail });
    } finally {
      setBusy(false);
    }
  }

  function createPayload(option: RegulationOption) {
    return {
      p_title_ar: form.title,
      p_description: form.description || null,
      p_category_id: form.category,
      p_current_unit_id: form.unit,
      p_policy_id: option.selection.policy_id,
      p_policy_version_id: option.selection.policy_version_id,
      p_policy_item_id: option.selection.policy_item_id,
      p_scope_assignment_id: option.selection.scope_assignment_id,
      p_priority: form.priority,
      p_source_type: form.source,
      p_title_en: null,
      p_client_request_id: crypto.randomUUID(),
    };
  }

  async function createTopicFromSelection(option: RegulationOption) {
    const created = await rpc<Record<string, unknown>>("create_topic_with_selected_regulation", createPayload(option));
    const topicId = String(created.topic_id ?? created.id ?? "");
    if (!topicId) throw new Error("تم إنشاء الموضوع لكن لم يرجع معرف الموضوع.");
    return { created, topicId };
  }

  async function loadSummary(topicId: string) {
    const nextSummary = await rpc<TopicSummary>("get_topic_governance_summary", { p_topic_id: topicId });
    setSummary(nextSummary);
    return nextSummary;
  }

  async function createTopic() {
    if (!selectedOption) {
      setNotice({ kind: "error", text: "اختر لائحة مطابقة قبل التأكيد." });
      return;
    }
    if (!selectedOption.can_start_workflow) {
      setNotice({ kind: "error", text: "اللائحة المختارة غير جاهزة لإنشاء مسار تلقائي. استخدم طلب الاستثناء لإنشاء مسار مؤقت أو مخصص." });
      return;
    }
    setBusy(true); setNotice(null);
    try {
      const { topicId } = await createTopicFromSelection(selectedOption);
      await loadSummary(topicId);
      setExceptionResult(null);
      setNotice({ kind: "success", text: "تم إنشاء الموضوع وربطه باللائحة وتشغيل المسار تلقائيًا." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر إنشاء الموضوع.", detail: (error as Error & { detail?: string }).detail });
    } finally {
      setBusy(false);
    }
  }

  async function requestException() {
    if (!form.title.trim() || !form.unit || !form.category) {
      setNotice({ kind: "error", text: "أكمل عنوان الموضوع والجهة وفئة الموضوع قبل طلب الاستثناء." });
      return;
    }
    if (!exceptionForm.workflowVersionId) {
      setNotice({ kind: "error", text: "اختر مسارًا مؤقتًا أو مخصصًا للاستثناء." });
      return;
    }
    if (exceptionForm.reason.trim().length < 10) {
      setNotice({ kind: "error", text: "اكتب سببًا واضحًا للاستثناء لا يقل عن 10 أحرف." });
      return;
    }
    setBusy(true); setNotice(null);
    try {
      let topicId = summary?.topic.id;
      let result: Record<string, unknown>;
      if (selectedOption?.routing_outcome === "custom_route_required") {
        const createdTopic = topicId ? { topicId } : await createTopicFromSelection(selectedOption);
        topicId = createdTopic.topicId;
        result = await rpc<Record<string, unknown>>("request_custom_workflow", {
          p_topic_id: topicId,
          p_workflow_template_version_id: exceptionForm.workflowVersionId,
          p_reason: exceptionForm.reason,
          p_valid_until: new Date(exceptionForm.validUntil).toISOString(),
        });
      } else {
        result = await rpc<Record<string, unknown>>("create_topic_exception_request", {
          p_title_ar: form.title,
          p_description: form.description || null,
          p_category_id: form.category,
          p_current_unit_id: form.unit,
          p_workflow_template_version_id: exceptionForm.workflowVersionId,
          p_reason: exceptionForm.reason,
          p_valid_until: new Date(exceptionForm.validUntil).toISOString(),
          p_priority: form.priority,
          p_source_type: form.source,
          p_title_en: null,
          p_client_request_id: crypto.randomUUID(),
        });
        topicId = String(result.topic_id ?? "");
      }
      setExceptionResult(result);
      if (topicId) await loadSummary(topicId);
      setNotice({ kind: "success", text: "تم إرسال طلب الاستثناء. الحالة الآن: بانتظار الاعتماد." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر إرسال طلب الاستثناء.", detail: (error as Error & { detail?: string }).detail });
    } finally {
      setBusy(false);
    }
  }

  async function refreshExceptionStatus() {
    const topicId = summary?.topic.id ?? (exceptionResult?.topic_id ? String(exceptionResult.topic_id) : "");
    if (!topicId) return;
    setBusy(true); setNotice(null);
    try {
      const nextSummary = await loadSummary(topicId);
      const status = nextSummary.exception?.status ? exceptionStatusLabels[nextSummary.exception.status] ?? nextSummary.exception.status : "لا يوجد طلب استثناء نشط";
      setNotice({ kind: "success", text: `تم تحديث حالة الاستثناء: ${status}.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحديث حالة الاستثناء.", detail: (error as Error & { detail?: string }).detail });
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-[1360px] space-y-5">
    {notice && <div className={`flex items-start gap-3 rounded-2xl border p-4 text-xs shadow-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}><span className="mt-0.5">{notice.kind === "success" ? <Check size={16}/> : <AlertCircle size={16}/>}</span><div><strong>{notice.text}</strong>{notice.detail && <details className="mt-2 text-[10px] opacity-80"><summary>تفاصيل تقنية</summary><p dir="ltr" className="mt-1 break-all">{notice.detail}</p></details>}</div></div>}

    <section className="overflow-hidden rounded-2xl border border-[#d9e4ef] bg-white shadow-sm">
      <div className="grid gap-4 border-b border-[#edf2f7] bg-[#fbfdff] p-5 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <p className="mb-1.5 text-[11px] font-black text-[#ff7a00]">إنشاء موضوع محكوم بلائحة</p>
          <h1 className="text-2xl font-black text-[#0a1330]">موضوع جديد مع اختيار اللائحة المناسبة</h1>
          <p className="mt-2 max-w-4xl text-xs leading-6 text-[#66778d]">ابدأ ببيانات الموضوع، اختر المجلس وفئة الموضوع، ثم يعرض النظام اللوائح المطابقة لتختار منها قبل إنشاء الموضوع والمسار تلقائيًا.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#dbe8f5] bg-white px-3 py-2 text-[11px] font-bold text-[#53677f]">
          {busy || loadingReferences ? <LoaderCircle className="animate-spin text-[#0066cc]" size={15}/> : <Sparkles className="text-[#ff7a00]" size={15}/>}
          {busy ? "جار تنفيذ العملية" : loadingReferences ? "تحميل المراجع" : "جاهز للإنشاء"}
        </div>
      </div>

      <div className="grid gap-2 border-b border-[#edf2f7] p-3 md:grid-cols-6">
        {["إنشاء موضوع", "اختيار المجلس/الجهة", "اختيار فئة الموضوع", "عرض اللوائح المطابقة", "تأكيد الاختيار", "إنشاء المسار"].map((label, index) => {
          const done = currentStage > index + 1;
          const active = currentStage === index + 1;
          return <div key={label} className={`rounded-xl border px-3 py-2 ${done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : active ? "border-[#8ebeea] bg-[#edf6ff] text-[#0066cc]" : "border-[#e2e9f1] bg-[#fbfdff] text-[#74849a]"}`}>
            <span className={`mb-1 grid h-5 w-5 place-items-center rounded-full text-[8px] font-black ${done ? "bg-emerald-600 text-white" : active ? "bg-[#0066cc] text-white" : "bg-[#edf2f7] text-[#7b8ba0]"}`}>{done ? <Check size={10}/> : index + 1}</span>
            <strong className="text-[9px] leading-4">{label}</strong>
          </div>;
        })}
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(360px,.78fr)_minmax(0,1.22fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#e2e9f1] bg-[#fbfdff] p-4">
            <div className="mb-4 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf6ff] text-[#0066cc]"><FileCheck2 size={18}/></span><div><h2 className="text-sm font-black text-[#0a1330]">بيانات الموضوع</h2><p className="text-[10px] text-[#7b8ba0]">هذه البيانات تُستخدم لاستخراج اللوائح المطابقة.</p></div></div>
            <div className="space-y-3">
              <Field label="عنوان الموضوع"><input className={input} value={form.title} onChange={(event) => resetOptions({ ...form, title: event.target.value })} placeholder="مثال: إنشاء برنامج بكالوريوس الأمن السيبراني"/></Field>
              <Field label="وصف مختصر"><textarea className={textarea} value={form.description} onChange={(event) => resetOptions({ ...form, description: event.target.value })} placeholder="اكتب وصفًا يساعد المراجع على فهم الموضوع."/></Field>
              <Field label="المجلس/الجهة المسؤولة"><select className={input} value={form.unit} onChange={(event) => resetOptions({ ...form, unit: event.target.value })}><option value="">اختر الجهة</option>{references.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}</select></Field>
              <Field label="فئة الموضوع"><select className={input} value={form.category} onChange={(event) => resetOptions({ ...form, category: event.target.value })}><option value="">اختر الفئة</option>{references.categories.map((category) => <option key={category.id} value={category.id}>{category.name_ar}</option>)}</select></Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="الأولوية"><select className={input} value={form.priority} onChange={(event) => resetOptions({ ...form, priority: event.target.value })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="مصدر الموضوع"><select className={input} value={form.source} onChange={(event) => resetOptions({ ...form, source: event.target.value })}>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="تاريخ المطابقة"><input type="date" className={input} value={form.effectiveOn} onChange={(event) => resetOptions({ ...form, effectiveOn: event.target.value })}/></Field>
              </div>
              <button disabled={busy || loadingReferences || !form.unit || !form.category} onClick={findRegulations} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0066cc] px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)] disabled:cursor-not-allowed disabled:bg-[#a8b8c9]">
                {busy ? <LoaderCircle className="animate-spin" size={15}/> : <Search size={15}/>} عرض اللوائح المطابقة
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e2e9f1] bg-white p-4">
            <h3 className="text-xs font-black text-[#0a1330]">قواعد هذه المرحلة</h3>
            <div className="mt-3 space-y-2 text-[11px] leading-5 text-[#64758a]">
              <p>لا يتم إنشاء الموضوع قبل اختيار لائحة مطابقة صالحة.</p>
              <p>النظام يعيد التحقق من اللائحة عند التأكيد حتى لا تُستخدم لائحة لم تعد نافذة.</p>
              <p>إذا كانت اللائحة جاهزة، يتم إنشاء المسار وفتح أول خطوة تلقائيًا.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-[#e2e9f1] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-sm font-black text-[#0a1330]">اللوائح المطابقة</h2><p className="mt-1 text-[10px] text-[#7b8ba0]">اختر اللائحة التي ستُطبّق على هذا الموضوع.</p></div>
              <div className="flex gap-2"><SmallBadge tone="blue">{options.length} مطابقة</SmallBadge><SmallBadge tone="green">{readyOptions} جاهزة</SmallBadge></div>
            </div>
            {!options.length ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#c8d8e8] bg-[#fbfdff] p-8 text-center"><div><Route className="mx-auto text-[#86a8c9]" size={34}/><h3 className="mt-3 text-sm font-black text-[#24364e]">ابدأ بعرض اللوائح المطابقة</h3><p className="mt-2 max-w-md text-xs leading-6 text-[#8291a4]">بعد اختيار المجلس وفئة الموضوع سيعرض النظام اللوائح النافذة التي تنطبق على هذه الحالة.</p></div></div> :
              <div className="grid gap-3">
                {options.map((option) => {
                  const key = selectionKey(option);
                  const selected = selectedKey === key;
                  return <button key={key} onClick={() => setSelectedKey(key)} className={`rounded-2xl border p-4 text-right transition ${selected ? "border-[#0066cc] bg-[#edf6ff] shadow-[0_10px_24px_rgba(0,102,204,.12)]" : "border-[#e2e9f1] bg-[#fbfdff] hover:border-[#9cc7ef] hover:bg-white"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-1.5"><SmallBadge tone={option.can_start_workflow ? "green" : "amber"}>{routingLabels[option.routing_outcome] ?? option.routing_outcome}</SmallBadge><SmallBadge tone="slate">{scopeLabels[option.scope.type] ?? option.scope.type}</SmallBadge></div>
                        <h3 className="text-sm font-black text-[#0a1330]">{option.policy.name_ar}</h3>
                        <p className="mt-1 text-[10px] text-[#7b8ba0]">{option.policy.code} · v{option.version.label || option.version.number}</p>
                      </div>
                      <span className={`grid h-8 w-8 place-items-center rounded-xl ${selected ? "bg-[#0066cc] text-white" : "bg-white text-[#8aa0b8]"}`}>{selected ? <Check size={15}/> : <ArrowLeft size={15}/>}</span>
                    </div>
                    <div className="mt-3 rounded-xl bg-white/80 p-3">
                      <p className="text-[10px] font-black text-[#34465e]">البند المنطبق</p>
                      <p className="mt-1 text-xs font-bold text-[#0a1330]">{option.item.title_ar}</p>
                      <p className="mt-1 text-[10px] text-[#7b8ba0]">{option.item.code} · {governanceModeLabels[option.governance_mode] ?? option.governance_mode}</p>
                    </div>
                  </button>;
                })}
              </div>}
            <button disabled={busy || !selectedOption || !selectedOption.can_start_workflow || !form.title.trim()} onClick={createTopic} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0a1330] px-4 text-xs font-black text-white shadow-[0_10px_24px_rgba(10,19,48,.16)] disabled:cursor-not-allowed disabled:bg-[#a8b8c9]">
              {busy ? <LoaderCircle className="animate-spin" size={15}/> : <ShieldCheck size={15}/>} تأكيد وإنشاء الموضوع والمسار
            </button>
          </section>

          {shouldShowExceptionDesigner && <section className="rounded-2xl border border-amber-200 bg-[#fffaf2] p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-[#ff7a00]">مسار بديل عند التعذر</p>
                <h2 className="mt-1 text-sm font-black text-[#0a1330]">طلب استثناء</h2>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#6d7c90]">استخدم هذا المسار عندما لا توجد لائحة مطابقة أو عندما تكون اللائحة المطابقة غير جاهزة للمسار التلقائي.</p>
              </div>
              <SmallBadge tone={summary?.exception?.status === "approved" ? "green" : summary?.exception?.status === "rejected" || summary?.exception?.status === "expired" ? "amber" : "blue"}>
                {exceptionStatusLabels[summary?.exception?.status ?? String(exceptionResult?.status ?? "pending")] ?? "بانتظار الاعتماد"}
              </SmallBadge>
            </div>

            <div className="mb-4 grid gap-2 md:grid-cols-5">
              {["طلب استثناء", "ذكر السبب", "اعتماد الاستثناء", "إنشاء مسار مؤقت أو مخصص", "متابعة الموضوع"].map((label, index) => (
                <div key={label} className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-center">
                  <span className="mx-auto mb-1 grid h-5 w-5 place-items-center rounded-full bg-[#ff7a00]/10 text-[9px] font-black text-[#ff7a00]">{index + 1}</span>
                  <strong className="text-[10px] leading-4 text-[#24364e]">{label}</strong>
                </div>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <Field label="المسار المؤقت أو المخصص">
                <select className={input} value={exceptionForm.workflowVersionId} onChange={(event) => setExceptionForm({ ...exceptionForm, workflowVersionId: event.target.value })}>
                  <option value="">اختر المسار البديل</option>
                  {activeWorkflowVersions.map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}
                </select>
              </Field>
              <Field label="ينتهي الاستثناء في">
                <input type="datetime-local" className={input} value={exceptionForm.validUntil} onChange={(event) => setExceptionForm({ ...exceptionForm, validUntil: event.target.value })}/>
              </Field>
              <div className="lg:col-span-2">
                <Field label="سبب الاستثناء" hint="مثال: لا توجد لائحة نافذة لهذه الفئة حالياً، ونحتاج مساراً مؤقتاً حتى اعتماد اللائحة.">
                  <textarea className={textarea} value={exceptionForm.reason} onChange={(event) => setExceptionForm({ ...exceptionForm, reason: event.target.value })} placeholder="اكتب السبب بلغة واضحة للمراجع..."/>
                </Field>
              </div>
            </div>

            {summary?.exception && <div className="mt-3 grid gap-3 rounded-xl border border-amber-100 bg-white p-3 text-[11px] lg:grid-cols-3">
              <SummaryTile title="حالة الاستثناء" value={exceptionStatusLabels[summary.exception.status ?? ""] ?? summary.exception.status ?? "—"} hint={summary.exception.valid_until ? `ينتهي: ${new Date(summary.exception.valid_until).toLocaleString("ar-SA")}` : undefined}/>
              <SummaryTile title="المسار المطلوب" value={summary.exception.workflow_name_ar || "—"} hint={summary.exception.requested_source === "custom" ? "مسار مخصص" : "استثناء"}/>
              <SummaryTile title="سبب الطلب" value={summary.exception.reason || "—"}/>
            </div>}

            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={busy || !form.title.trim() || !form.unit || !form.category || !exceptionForm.workflowVersionId || exceptionForm.reason.trim().length < 10} onClick={requestException} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0066cc] px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)] disabled:cursor-not-allowed disabled:bg-[#a8b8c9]">
                {busy ? <LoaderCircle className="animate-spin" size={15}/> : <ShieldCheck size={15}/>} إرسال طلب الاستثناء
              </button>
              {(summary?.exception || exceptionResult) && <button disabled={busy} onClick={refreshExceptionStatus} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#cddbea] bg-white px-4 text-xs font-black text-[#0a1330] disabled:cursor-not-allowed disabled:opacity-60">
                تحديث حالة الاستثناء
              </button>}
            </div>
          </section>}

          {summary && <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-black text-emerald-700">تم الإنشاء بنجاح</p><h2 className="mt-1 text-base font-black text-[#0a1330]">{summary.topic.title_ar}</h2><p className="mt-1 text-[10px] text-[#63758a]">{summary.topic.topic_no || summary.topic.id} · {summary.topic.routing_status}</p></div>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-600 text-white"><Check size={18}/></span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <SummaryTile title="اللائحة المختارة" value={summary.regulation?.name_ar || "—"} hint={summary.regulation?.code ? `${summary.regulation.code} · v${summary.regulation.version_label || summary.regulation.version_no}` : undefined}/>
              <SummaryTile title="البند المنطبق" value={summary.item?.title_ar || "—"} hint={summary.item?.code || undefined}/>
              <SummaryTile title="المسار الحالي" value={summary.workflow?.name_ar || "—"} hint={summary.workflow?.status || undefined}/>
              <SummaryTile title="الخطوة الحالية" value={summary.current_step?.name_ar || "—"} hint={summary.current_step?.status || undefined}/>
              <SummaryTile title="الجهة المسؤولة" value={summary.current_step?.assigned_unit_name_ar || "—"} hint={summary.current_step?.responsibility || undefined}/>
              <div className="rounded-xl border border-emerald-200 bg-white p-3"><p className="text-[10px] font-black text-[#617287]">النتائج المتاحة</p><div className="mt-2 flex flex-wrap gap-1.5">{(summary.current_step?.allowed_outcomes ?? []).map((outcome) => <SmallBadge key={outcome} tone="blue">{outcomeLabels[outcome] ?? outcome}</SmallBadge>)}{!summary.current_step?.allowed_outcomes?.length && <span className="text-xs font-bold text-[#0a1330]">—</span>}</div></div>
            </div>
          </section>}
        </div>
      </div>
    </section>
  </div>;
}

function selectionKey(option: RegulationOption) {
  const selection = option.selection;
  return `${selection.policy_id}:${selection.policy_version_id}:${selection.policy_item_id}:${selection.scope_assignment_id}`;
}

function SummaryTile({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return <div className="rounded-xl border border-emerald-200 bg-white p-3"><p className="text-[10px] font-black text-[#617287]">{title}</p><strong className="mt-1 block text-xs text-[#0a1330]">{value}</strong>{hint && <span className="mt-1 block text-[10px] text-[#7b8ba0]">{hint}</span>}</div>;
}
