"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, BookOpen, Check, FileCheck2, LoaderCircle, Paperclip,
  Search, ShieldCheck, Sparkles, Trash2,
} from "lucide-react";
import {
  resolveCreationStep,
  resolveDefaultGovernanceMethod,
  type TopicGovernanceMethod,
  type TopicGovernanceMethodAvailability,
} from "../model/topic-creation";
import { TopicCreationProgress } from "./topic-creation-progress";
import { TopicCustomRouteDesigner, type CustomRouteStepDraft } from "./topic-custom-route-designer";
import { TopicGovernanceMethodSelector } from "./topic-governance-method-selector";
import {
  TopicPriorRouteDesigner,
  type PriorRouteEvidenceDraft,
  type PriorRouteStep,
} from "./topic-prior-route-designer";

type Notice = { kind: "success" | "error"; text: string; detail?: string };
type PendingAttachment = { id: string; file: File; description: string };
type ReferenceOption = { id: string; code: string; name_ar: string; [key: string]: unknown };
type TopicFormOptions = {
  governance_units: ReferenceOption[];
  categories?: ReferenceOption[];
  priorities?: string[];
  source_types?: string[];
};
type TopicCategoriesForUnit = {
  governance_unit_id: string;
  effective_on: string;
  categories: Array<ReferenceOption & { executable_item_count?: number }>;
};
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
type RegulationTreeNode = {
  id: string;
  parent_id?: string | null;
  code: string;
  title_ar: string;
  title_en?: string | null;
  item_type: "chapter" | "section" | "article" | "clause" | "procedure" | string;
  sort_order: number;
  is_selectable: boolean;
  selections: Array<RegulationOption["selection"] & {
    routing_outcome: string;
    can_start_workflow: boolean;
    score: number;
  }>;
};
type RegulationTree = {
  policy: { id: string; code: string; name_ar: string; name_en?: string | null };
  version: { id: string; number: number; label?: string | null };
  nodes: RegulationTreeNode[];
};
type RegulationTreeResponse = { items: RegulationTree[]; total: number };
type SelectedRegulationReference = {
  policy_id: string;
  policy_version_id: string;
  policy_item_id: string | null;
  scope_assignment_id: string | null;
  reference_type: string;
  is_primary: boolean;
  label: string;
};
type RegulationOptionsResponse = {
  items: RegulationOption[];
  total: number;
};
type RegulationPreview = {
  article: {
    title: string;
    official_text: string;
    interpretation?: string | null;
  };
  rule_summary: Array<{
    name: string;
    description: string;
    requires_workflow?: boolean;
  }>;
  scope: { target_name: string; description: string };
  workflow: { name?: string | null; description: string };
  requirements: Array<{ name: string; type?: string; mandatory: boolean; timing: string }>;
  attachments: Array<{ name: string; description?: string | null }>;
  approval_effect: string;
  voting_effect: string;
};
type TopicRoutePreview = {
  status: string;
  workflow_name?: string | null;
  message: string;
  steps: Array<{
    title: string;
    responsible_unit_id?: string;
    responsible_entity: string;
    responsible_role: string;
    transition_requirement: string;
    expected_duration?: string | null;
  }>;
};
type ExceptionWorkflowOption = {
  id: string;
  label: string;
  description?: string | null;
};
type TopicExceptionWorkflowOptions = {
  can_request: boolean;
  items: ExceptionWorkflowOption[];
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
type GovernanceSummaryResponse = Omit<Partial<TopicSummary>, "topic"> & {
  topic?: TopicSummary["topic"];
  topic_id?: string;
  routing_status?: string;
  governance_source?: string | null;
};

const input = "h-10 w-full rounded-xl border border-[#dce5ef] bg-white px-3 text-xs text-[#0a1330] outline-none transition focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/10";
const textarea = "min-h-24 w-full rounded-xl border border-[#dce5ef] bg-white p-3 text-xs leading-6 text-[#0a1330] outline-none transition focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/10";
const invalidField = (className: string, invalid: boolean) => `${className} ${invalid ? "border-red-300 bg-red-50/30 focus:border-red-500 focus:ring-red-500/10" : ""}`;
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

function todayInRiyadh() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? "تعذر تنفيذ العملية.") as Error & { code?: string; detail?: string };
    error.code = payload.error?.code;
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

type TopicRegulationCreatorProps = {
  /** Called only after the server confirms creation and the user chooses to open the new topic. */
  onFollowTopic?: (topicId: string) => void | Promise<void>;
};

export function TopicRegulationCreator({ onFollowTopic }: TopicRegulationCreatorProps) {
  const [references, setReferences] = useState<{ units: ReferenceOption[]; categories: ReferenceOption[]; priorities: string[]; sources: string[] }>({ units: [], categories: [], priorities: Object.keys(priorityLabels), sources: Object.keys(sourceLabels) });
  const [exceptionWorkflowOptions, setExceptionWorkflowOptions] = useState<TopicExceptionWorkflowOptions | null>(null);
  const [exceptionWorkflowsLoaded, setExceptionWorkflowsLoaded] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    unit: "",
    category: "",
    priority: "medium",
    source: "new",
    effectiveOn: todayInRiyadh(),
  });
  const [options, setOptions] = useState<RegulationOption[]>([]);
  const [regulationTrees, setRegulationTrees] = useState<RegulationTree[]>([]);
  const [hasTestedRegulations, setHasTestedRegulations] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedReferences, setSelectedReferences] = useState<SelectedRegulationReference[]>([]);
  const [expandedKey, setExpandedKey] = useState("");
  const [regulationPreviews, setRegulationPreviews] = useState<Record<string, RegulationPreview>>({});
  const [loadingPreviewKey, setLoadingPreviewKey] = useState("");
  const [routePreview, setRoutePreview] = useState<TopicRoutePreview | null>(null);
  const [loadingRoutePreview, setLoadingRoutePreview] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [summary, setSummary] = useState<TopicSummary | null>(null);
  const [exceptionResult, setExceptionResult] = useState<Record<string, unknown> | null>(null);
  const [governanceMethodOverride, setGovernanceMethodOverride] = useState<TopicGovernanceMethod | null>(null);
  const [exceptionForm, setExceptionForm] = useState({
    reason: "",
    workflowVersionId: "",
    validUntil: defaultValidUntil(),
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [priorRouteSteps, setPriorRouteSteps] = useState<PriorRouteStep[]>([]);
  const [loadingPriorRouteSteps, setLoadingPriorRouteSteps] = useState(false);
  const [priorRouteStepsLoaded, setPriorRouteStepsLoaded] = useState(false);
  const clientRequestId = useRef<string | null>(null);

  const selectedOption = useMemo(() => options.find((option) => selectionKey(option) === selectedKey), [options, selectedKey]);
  const selectedPreview = useMemo(() => selectedKey ? regulationPreviews[selectedKey] : undefined, [regulationPreviews, selectedKey]);
  const selectedUnit = useMemo(() => references.units.find((unit) => unit.id === form.unit), [form.unit, references.units]);
  const selectedCategory = useMemo(() => references.categories.find((category) => category.id === form.category), [form.category, references.categories]);
  const activeWorkflowVersions = useMemo(() => exceptionWorkflowOptions?.items ?? [], [exceptionWorkflowOptions]);
  const readyOptions = options.filter((option) => option.can_start_workflow).length;
  const selectedPolicyAllowsException = Boolean(
    selectedOption && ["custom_route_allowed", "regulated_fallback_allowed"].includes(selectedOption.governance_mode),
  );
  const exceptionScenario = !hasTestedRegulations
    ? null
    : options.length === 0
      ? { kind: "no_regulation", title: "لا توجد لائحة منطبقة", description: "لا يمكن إنشاء موضوع غير محكوم. يمكنك طلب مسار استثنائي ليُراجع ويُعتمد قبل البدء." }
      : selectedOption?.routing_outcome === "custom_route_required"
        ? { kind: "custom_route", title: "تحتاج اللائحة مسارًا مخصصًا", description: "هذه اللائحة تسمح بمسار بديل، لكنه لن يبدأ قبل اعتماد طلب الاستثناء." }
        : selectedOption && !selectedOption.can_start_workflow && selectedPolicyAllowsException
          ? { kind: "incomplete_route", title: "المسار غير مكتمل", description: "تسمح السياسة بطلب استثناء مؤقت إلى أن يكتمل مسار اللائحة." }
          : null;
  const governanceAvailability = useMemo<TopicGovernanceMethodAvailability>(() => ({
    regulation: {
      available: Boolean(selectedOption?.can_start_workflow),
      reason: selectedOption?.can_start_workflow
        ? "المطابقة مكتملة والمسار جاهز للتشغيل."
        : "لا يوجد مسار لائحي مكتمل يمكن تشغيله الآن.",
    },
    custom: {
      available: true,
      reason: exceptionScenario?.kind === "no_regulation"
        ? "لا توجد لائحة منطبقة؛ يمكنك تصميم مسار ورفعه للاعتماد."
        : exceptionScenario?.kind === "custom_route"
          ? "تسمح نتيجة المطابقة بطلب مسار مخصص."
          : "يمكن اقتراح مسار مختلف، ولن يعمل قبل مراجعته واعتماده.",
    },
    prior: {
      available: Boolean(selectedOption?.can_start_workflow),
      reason: selectedOption?.can_start_workflow
        ? "المسار الأصلي محفوظ؛ وثّق فقط مراحله المنفذة سابقًا."
        : "يلزم مسار لائحي مكتمل قبل إثبات مراحله السابقة.",
    },
    exception: {
      available: true,
      reason: exceptionScenario?.kind === "incomplete_route"
        ? "يمكن طلب مسار مؤقت حتى يكتمل المسار اللائحي."
        : selectedOption?.can_start_workflow
          ? "يمكن طلب تجاوز المسار اللائحي بسبب موثق ومدة محددة."
          : "يمكن طلب مسار مؤقت بمدة محددة بعد التحقق من صلاحيتك.",
    },
  }), [exceptionScenario?.kind, selectedOption?.can_start_workflow]);
  const defaultGovernanceMethod = resolveDefaultGovernanceMethod(governanceAvailability);
  const governanceMethod = governanceMethodOverride && governanceAvailability[governanceMethodOverride].available
    ? governanceMethodOverride
    : defaultGovernanceMethod;
  const shouldShowExceptionDesigner = Boolean(summary?.exception?.status)
    || governanceMethod === "exception";
  const hasPendingException = summary?.exception?.status === "pending" || exceptionResult?.status === "pending";
  const titleLength = form.title.trim().length;
  const descriptionLength = form.description.trim().length;
  const hasTopicData = titleLength >= 5 && descriptionLength >= 10;
  const immediateRequirements = selectedPreview?.requirements.filter((requirement) => requirement.timing === "before_submission") ?? [];
  const firstRouteStep = routePreview?.steps[0];
  const canCreateFromReview = Boolean(
    selectedOption?.can_start_workflow
    && routePreview?.status === "ready"
    && !loadingRoutePreview
    && hasTopicData,
  );
  const canMoveToRegulation = hasTopicData && Boolean(form.unit) && Boolean(form.category) && !loadingReferences && !loadingCategories && !busy;
  const nextBlockedReason = loadingReferences
    ? "يتم تحميل الجهات والفئات المسموح بها لك."
    : loadingCategories
      ? "يتم تحميل فئات الموضوعات الخاصة بالمجلس المختار."
    : titleLength < 5
      ? "أدخل عنوانًا لا يقل عن 5 أحرف."
      : descriptionLength < 10
        ? "أدخل وصفًا لا يقل عن 10 أحرف."
        : !form.unit
          ? "اختر جهة تقديم الموضوع."
          : !form.category
            ? "اختر فئة الموضوع."
            : "";
  const currentCreationStep = resolveCreationStep({
    hasMatchedGovernance: hasTestedRegulations,
    isReadyForReview: reviewReady,
    isCreated: Boolean(summary),
  });

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoadingReferences(true);
      try {
        const formOptions = await rpc<TopicFormOptions>("get_topic_form_options");
        if (mounted) {
          setReferences({
            units: formOptions.governance_units ?? [],
            categories: [],
            priorities: formOptions.priorities?.filter((value) => value in priorityLabels) ?? Object.keys(priorityLabels),
            sources: formOptions.source_types?.filter((value) => value in sourceLabels) ?? Object.keys(sourceLabels),
          });
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

  useEffect(() => {
    let mounted = true;
    if (!form.unit) {
      return () => { mounted = false; };
    }

    void rpc<TopicCategoriesForUnit>("get_topic_categories_for_unit", {
      p_governance_unit_id: form.unit,
      p_effective_on: form.effectiveOn,
    }).then((result) => {
      if (mounted) {
        setReferences((current) => ({ ...current, categories: result.categories ?? [] }));
      }
    }).catch((error) => {
      if (mounted) setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر تحميل فئات المجلس.",
        detail: (error as Error & { detail?: string }).detail,
      });
    }).finally(() => {
      if (mounted) setLoadingCategories(false);
    });

    return () => { mounted = false; };
  }, [form.effectiveOn, form.unit]);

  const loadExceptionWorkflowOptions = useCallback(async () => {
    const result = await rpc<TopicExceptionWorkflowOptions>("get_topic_exception_workflow_options", {
      p_governance_unit_id: form.unit,
    });
    const options = {
      can_request: Boolean(result?.can_request),
      items: result?.items ?? [],
    };
    setExceptionWorkflowOptions(options);
    setExceptionWorkflowsLoaded(true);
  }, [form.unit]);

  useEffect(() => {
    if (!shouldShowExceptionDesigner || exceptionWorkflowsLoaded || !form.unit) return;
    let mounted = true;
    async function loadExceptionWorkflows() {
      try {
        await loadExceptionWorkflowOptions();
      } catch (error) {
        if (mounted) setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "تعذر تحميل المسارات المقترحة للاستثناء.",
          detail: (error as Error & { detail?: string }).detail,
        });
      }
    }
    void loadExceptionWorkflows();
    return () => { mounted = false; };
  }, [exceptionWorkflowsLoaded, form.unit, loadExceptionWorkflowOptions, shouldShowExceptionDesigner]);

  async function loadPriorRouteCandidateSteps(option: RegulationOption) {
    if (priorRouteStepsLoaded || loadingPriorRouteSteps) return;
    setLoadingPriorRouteSteps(true);
    setNotice(null);
    try {
      const result = await rpc<{ steps: PriorRouteStep[] }>("get_topic_prior_route_candidate_steps", {
        p_governance_unit_id: form.unit,
        p_topic_category_id: form.category,
        p_priority: form.priority,
        p_source_type: form.source,
        p_effective_on: form.effectiveOn,
        p_policy_id: option.selection.policy_id,
        p_policy_version_id: option.selection.policy_version_id,
        p_policy_item_id: option.selection.policy_item_id,
        p_scope_assignment_id: option.selection.scope_assignment_id,
      });
      setPriorRouteSteps(result.steps ?? []);
      setPriorRouteStepsLoaded(true);
    } catch (error) {
      setPriorRouteStepsLoaded(true);
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر تحميل مراحل المسار السابق.",
        detail: (error as Error & { detail?: string }).detail,
      });
    } finally {
      setLoadingPriorRouteSteps(false);
    }
  }

  function resetOptions(next = form) {
    setForm(next);
    setOptions([]);
    setRegulationTrees([]);
    setHasTestedRegulations(false);
    setSelectedKey("");
    setSelectedReferences([]);
    setExpandedKey("");
    setRegulationPreviews({});
    setLoadingPreviewKey("");
    setRoutePreview(null);
    setLoadingRoutePreview(false);
    setReviewReady(false);
    setSummary(null);
    setExceptionResult(null);
    setExceptionWorkflowOptions(null);
    setExceptionWorkflowsLoaded(false);
    setPriorRouteSteps([]);
    setLoadingPriorRouteSteps(false);
    setPriorRouteStepsLoaded(false);
    setGovernanceMethodOverride(null);
    setNotice(null);
  }

  function getClientRequestId() {
    if (!clientRequestId.current) {
      clientRequestId.current = globalThis.crypto?.randomUUID?.() ?? `topic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return clientRequestId.current;
  }

  async function openRegulationPreview(option: RegulationOption, forceOpen = false) {
    const key = selectionKey(option);
    setExpandedKey((current) => forceOpen ? key : current === key ? "" : key);
    if (regulationPreviews[key] || loadingPreviewKey === key) return;

    setLoadingPreviewKey(key);
    try {
      const preview = await rpc<RegulationPreview>("get_topic_regulation_preview", {
        p_governance_unit_id: form.unit,
        p_topic_category_id: form.category,
        p_priority: form.priority,
        p_source_type: form.source,
        p_effective_on: form.effectiveOn,
        p_policy_id: option.selection.policy_id,
        p_policy_version_id: option.selection.policy_version_id,
        p_policy_item_id: option.selection.policy_item_id,
        p_scope_assignment_id: option.selection.scope_assignment_id,
      });
      setRegulationPreviews((current) => ({ ...current, [key]: preview }));
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر تحميل تفاصيل اللائحة.",
        detail: (error as Error & { detail?: string }).detail,
      });
    } finally {
      setLoadingPreviewKey((current) => current === key ? "" : current);
    }
  }

  function chooseRegulation(option: RegulationOption, reference?: Omit<SelectedRegulationReference, "is_primary">) {
    setSelectedKey(selectionKey(option));
    const primaryReference: SelectedRegulationReference = {
      policy_id: option.selection.policy_id,
      policy_version_id: option.selection.policy_version_id,
      policy_item_id: option.selection.policy_item_id,
      scope_assignment_id: option.selection.scope_assignment_id,
      reference_type: "article",
      label: option.item.title_ar,
      is_primary: true,
    };
    setSelectedReferences((current) => {
      const supporting = current.filter((entry) => !entry.is_primary && !(
        entry.policy_id === primaryReference.policy_id && entry.policy_version_id === primaryReference.policy_version_id
        && entry.policy_item_id === primaryReference.policy_item_id
      ));
      const scopeReference = reference && (
        reference.policy_id !== primaryReference.policy_id
        || reference.policy_version_id !== primaryReference.policy_version_id
        || reference.policy_item_id !== primaryReference.policy_item_id
        || reference.reference_type === "policy"
      ) ? { ...reference, is_primary: false } : null;
      const next = [primaryReference, ...(scopeReference ? [scopeReference] : []), ...supporting];
      return next.filter((entry, index) => next.findIndex((candidate) => candidate.policy_id === entry.policy_id
        && candidate.policy_version_id === entry.policy_version_id && candidate.policy_item_id === entry.policy_item_id) === index);
    });
    setRoutePreview(null);
    setReviewReady(false);
  }

  function chooseAndPreviewRegulation(option: RegulationOption, reference?: Omit<SelectedRegulationReference, "is_primary">) {
    chooseRegulation(option, reference);
    void openRegulationPreview(option, true);
  }

  async function showRoutePreview(): Promise<TopicRoutePreview | null> {
    if (!selectedOption) return null;
    setLoadingRoutePreview(true);
    setNotice(null);
    try {
      const preview = await rpc<TopicRoutePreview>("get_topic_regulation_route_preview", {
        p_governance_unit_id: form.unit,
        p_topic_category_id: form.category,
        p_priority: form.priority,
        p_source_type: form.source,
        p_effective_on: form.effectiveOn,
        p_policy_id: selectedOption.selection.policy_id,
        p_policy_version_id: selectedOption.selection.policy_version_id,
        p_policy_item_id: selectedOption.selection.policy_item_id,
        p_scope_assignment_id: selectedOption.selection.scope_assignment_id,
      });
      setRoutePreview(preview);
      return preview;
    } catch (error) {
      setRoutePreview(null);
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر تحميل معاينة المسار.",
        detail: (error as Error & { detail?: string }).detail,
      });
      return null;
    } finally {
      setLoadingRoutePreview(false);
    }
  }

  async function findRegulations() {
    if (!hasTopicData) {
      setNotice({ kind: "error", text: "أكمل عنوان الموضوع ووصفًا واضحًا لا يقل عن 10 أحرف قبل الانتقال للائحة المنطبقة." });
      return;
    }
    if (!form.unit || !form.category) {
      setNotice({ kind: "error", text: "اختر المجلس/الجهة وفئة الموضوع أولًا." });
      return;
    }
      setBusy(true); setNotice(null); setSummary(null); setSelectedKey(""); setSelectedReferences([]); setExpandedKey(""); setRegulationPreviews({}); setLoadingPreviewKey(""); setRoutePreview(null); setLoadingRoutePreview(false); setReviewReady(false); setHasTestedRegulations(false); setExceptionWorkflowOptions(null); setExceptionWorkflowsLoaded(false); setRegulationTrees([]);
    try {
      const params = {
        p_governance_unit_id: form.unit,
        p_topic_category_id: form.category,
        p_priority: form.priority,
        p_source_type: form.source,
        p_effective_on: form.effectiveOn,
      };
      const [result, treeResult] = await Promise.all([
        rpc<RegulationOptionsResponse>("get_topic_regulation_options", params),
        rpc<RegulationTreeResponse>("get_topic_regulation_tree", params).catch(() => ({ items: [], total: 0 })),
      ]);
      setOptions(result.items ?? []);
      setRegulationTrees(treeResult?.items ?? []);
      setHasTestedRegulations(true);
      const recommended = result.items?.find((item) => item.can_start_workflow) ?? result.items?.[0];
      if (recommended) {
        chooseRegulation(recommended);
        void openRegulationPreview(recommended);
      }
        if (!result.items?.length) setNotice({ kind: "error", text: "لا توجد لائحة نافذة تطابق بيانات هذا الموضوع." });
        if (!result.items?.length) await loadExceptionWorkflowOptions();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر اختبار اللوائح المطابقة.", detail: (error as Error & { detail?: string }).detail });
    } finally {
      setBusy(false);
    }
  }

  function createPayload(option: RegulationOption) {
    return {
      p_title_ar: form.title,
      p_description: form.description.trim(),
      p_category_id: form.category,
      p_current_unit_id: form.unit,
      p_policy_id: option.selection.policy_id,
      p_policy_version_id: option.selection.policy_version_id,
      p_policy_item_id: option.selection.policy_item_id,
      p_scope_assignment_id: option.selection.scope_assignment_id,
      p_references: selectedReferences.length ? selectedReferences : [{
        policy_id: option.selection.policy_id,
        policy_version_id: option.selection.policy_version_id,
        policy_item_id: option.selection.policy_item_id,
        scope_assignment_id: option.selection.scope_assignment_id,
        reference_type: "article",
        is_primary: true,
        label: option.item.title_ar,
      }],
      p_priority: form.priority,
      p_source_type: form.source,
      p_title_en: null,
      p_client_request_id: getClientRequestId(),
    };
  }

  async function createTopicFromSelection(option: RegulationOption) {
    const created = await rpc<Record<string, unknown>>("create_topic_with_regulation_bundle", createPayload(option));
    const topicId = String(created.topic_id ?? created.id ?? "");
    if (!topicId) throw new Error("تم إنشاء الموضوع لكن لم يرجع معرف الموضوع.");
    return { created, topicId };
  }

  async function uploadPendingAttachments(topicId: string) {
    const failures: string[] = [];
    for (const attachment of pendingAttachments) {
      const body = new FormData();
      body.set("topicId", topicId);
      body.set("file", attachment.file);
      if (attachment.description.trim()) body.set("description", attachment.description.trim());
      try {
        const response = await fetch("/api/admin/topics/upload", { method: "POST", body });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "تعذر رفع الملف.");
      } catch (error) {
        failures.push(`${attachment.file.name}: ${error instanceof Error ? error.message : "تعذر رفع الملف"}`);
      }
    }
    if (failures.length) throw new Error(`تم إنشاء الموضوع، لكن تعذر رفع بعض المرفقات: ${failures.join("؛ ")}`);
    return pendingAttachments.length;
  }

  async function verifySelectionBeforeCreation(option: RegulationOption) {
    const current = await rpc<RegulationOptionsResponse>("get_topic_regulation_options", {
      p_governance_unit_id: form.unit,
      p_topic_category_id: form.category,
      p_priority: form.priority,
      p_source_type: form.source,
      p_effective_on: form.effectiveOn,
    });
    const exact = current.items.find((candidate) =>
      candidate.selection.policy_id === option.selection.policy_id
      && candidate.selection.policy_version_id === option.selection.policy_version_id
      && candidate.selection.policy_item_id === option.selection.policy_item_id
      && candidate.selection.scope_assignment_id === option.selection.scope_assignment_id
    );
    if (exact) return exact;

    const refreshed = current.items.find((candidate) =>
      candidate.policy.code === option.policy.code && candidate.item.code === option.item.code
    );
    setOptions(current.items ?? []);
    setReviewReady(false);
    if (refreshed) {
      chooseRegulation(refreshed);
      await openRegulationPreview(refreshed);
      setNotice({
        kind: "error",
        text: "تم تحديث بيانات اللائحة منذ فتح المعالج. راجع المادة والمسار المحدّثين ثم اضغط إنشاء مرة أخرى.",
      });
    } else {
      setSelectedKey("");
      setSelectedReferences([]);
      setNotice({
        kind: "error",
        text: "لم تعد المادة المختارة منطبقة على هذا الموضوع. اختر مادة مطابقة من النتائج المحدّثة.",
      });
    }
    return null;
  }

  async function loadSummary(topicId: string) {
    const [governance, detail] = await Promise.all([
      rpc<GovernanceSummaryResponse>("get_topic_governance_summary", { p_topic_id: topicId }),
      rpc<{ id: string; topic_no?: string | null; title_ar: string; status: string; routing_status?: string | null; governance_source?: string | null }>("get_topic_detail", { p_topic_id: topicId }),
    ]);
    const nextSummary: TopicSummary = {
      ...governance,
      topic: governance.topic ?? {
        id: detail.id,
        topic_no: detail.topic_no,
        title_ar: detail.title_ar,
        status: detail.status,
        routing_status: detail.routing_status ?? governance.routing_status ?? "not_started",
        governance_source: detail.governance_source ?? governance.governance_source,
      },
    };
    setSummary(nextSummary);
    return nextSummary;
  }

  async function createTopic() {
    if (!selectedOption) {
      setNotice({ kind: "error", text: "اختر لائحة مطابقة قبل التأكيد." });
      return;
    }
    if (!hasTopicData) {
      setNotice({ kind: "error", text: "أكمل بيانات الموضوع أولًا ثم راجع اللائحة قبل الإنشاء." });
      return;
    }
    if (!selectedOption.can_start_workflow) {
      setNotice({ kind: "error", text: "اللائحة المختارة غير جاهزة لإنشاء مسار تلقائي. استخدم طلب الاستثناء لإنشاء مسار مؤقت أو مخصص." });
      return;
    }
    setBusy(true); setNotice(null);
    try {
      const verifiedOption = await verifySelectionBeforeCreation(selectedOption);
      if (!verifiedOption) return;
      const { topicId } = await createTopicFromSelection(verifiedOption);
      await loadSummary(topicId);
      const uploadedCount = await uploadPendingAttachments(topicId);
      setPendingAttachments([]);
      setExceptionResult(null);
      if (onFollowTopic) {
        await onFollowTopic(topicId);
        return;
      }
      setNotice({ kind: "success", text: `تم إنشاء الموضوع وربطه باللائحة وتشغيل المسار تلقائيًا${uploadedCount ? `، ورفع ${uploadedCount} مرفق.` : "."}` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر إنشاء الموضوع.", detail: (error as Error & { detail?: string }).detail });
    } finally {
      setBusy(false);
    }
  }

  async function createCustomRouteDraft({
    routeName,
    rationale,
    steps,
  }: {
    routeName: string;
    rationale: string;
    steps: CustomRouteStepDraft[];
  }) {
    if (!hasTopicData || !form.unit || !form.category) {
      setNotice({ kind: "error", text: "أكمل بيانات الموضوع والجهة والفئة قبل تصميم المسار المخصص." });
      return;
    }
    if (!governanceAvailability.custom.available) {
      setNotice({ kind: "error", text: "لا تسمح نتيجة المطابقة الحالية بإنشاء مسار مخصص لهذا الموضوع." });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const result = await rpc<Record<string, unknown>>("create_topic_custom_route_draft", {
        p_title_ar: form.title.trim(),
        p_description: form.description.trim(),
        p_category_id: form.category,
        p_current_unit_id: form.unit,
        p_route_name_ar: routeName.trim(),
        p_rationale: rationale.trim(),
        p_steps: steps.map(({ name_ar, step_type, responsibility, governance_unit_id }) => ({
          name_ar: name_ar.trim(),
          step_type,
          responsibility,
          governance_unit_id,
        })),
        p_priority: form.priority,
        p_source_type: form.source,
        p_title_en: null,
        p_client_request_id: getClientRequestId(),
      });
      const topicId = String(result.topic_id ?? "");
      if (!topicId) throw new Error("تم حفظ المسار لكن لم يرجع معرف الموضوع.");
      const uploadedCount = await uploadPendingAttachments(topicId);
      await loadSummary(topicId);
      setPendingAttachments([]);
      setNotice({
        kind: "success",
        text: `تم إنشاء الموضوع وإرسال مساره المخصص للاعتماد${uploadedCount ? `، ورفع ${uploadedCount} مرفق.` : "."}`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر حفظ المسار المخصص.",
        detail: (error as Error & { detail?: string }).detail,
      });
    } finally {
      setBusy(false);
    }
  }

  async function createPriorRouteRequest(evidence: PriorRouteEvidenceDraft[]) {
    if (!selectedOption?.can_start_workflow || !hasTopicData || !form.unit || !form.category) {
      setNotice({ kind: "error", text: "يلزم موضوع مكتمل ومسار لائحي جاهز قبل توثيق المراحل السابقة." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await rpc<{
        topic_id: string;
        request_id: string;
        evidence: Array<{ id: string; template_step_id: string; sequence_no: number }>;
      }>("create_topic_prior_route_request", {
        p_title_ar: form.title.trim(),
        p_description: form.description.trim(),
        p_category_id: form.category,
        p_current_unit_id: form.unit,
        p_policy_id: selectedOption.selection.policy_id,
        p_policy_version_id: selectedOption.selection.policy_version_id,
        p_policy_item_id: selectedOption.selection.policy_item_id,
        p_scope_assignment_id: selectedOption.selection.scope_assignment_id,
        p_evidence: evidence.map((item) => ({
          template_step_id: item.template_step_id,
          meeting_date: item.meeting_date,
          meeting_reference: item.meeting_reference,
          decision_type: item.decision_type,
          decision_text: item.decision_text,
          bypass_reason: item.bypass_reason,
        })),
        p_priority: form.priority,
        p_source_type: form.source,
        p_title_en: null,
        p_client_request_id: getClientRequestId(),
      });
      if (!result.topic_id || !result.request_id) throw new Error("تعذر تثبيت طلب استكمال المسار.");
      const evidenceIds = new Map(result.evidence.map((item) => [item.template_step_id, item.id]));
      for (const item of evidence) {
        const stepEvidenceId = evidenceIds.get(item.template_step_id);
        if (!stepEvidenceId) throw new Error("تعذر ربط دليل بإحدى المراحل السابقة.");
        for (const file of item.files) {
          const body = new FormData();
          body.set("topicId", result.topic_id);
          body.set("file", file);
          body.set("description", `دليل مرحلة سابقة: ${item.meeting_reference || item.meeting_date}`);
          const response = await fetch("/api/admin/topics/upload", { method: "POST", body });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error?.message ?? `تعذر رفع ${file.name}`);
          const attachmentId = String(payload.data?.attachment?.id ?? "");
          if (!attachmentId) throw new Error(`رُفع ${file.name} دون معرف صالح للمرفق.`);
          await rpc("add_prior_route_evidence_attachment", {
            p_step_evidence_id: stepEvidenceId,
            p_topic_attachment_id: attachmentId,
          });
        }
      }
      await rpc("submit_topic_prior_route_request", { p_request_id: result.request_id });
      await loadSummary(result.topic_id);
      setNotice({ kind: "success", text: "تم إنشاء الموضوع وإرسال إثباتات المجالس السابقة للمراجعة المستقلة." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر إرسال إثباتات المسار السابق.",
        detail: (error as Error & { detail?: string }).detail,
      });
    } finally {
      setBusy(false);
    }
  }

  async function requestException() {
    if (!hasTopicData || !form.unit || !form.category) {
      setNotice({ kind: "error", text: "أكمل عنوان الموضوع ووصفه والجهة وفئة الموضوع قبل طلب الاستثناء." });
      return;
    }
    if (!exceptionWorkflowOptions?.can_request) {
      setNotice({ kind: "error", text: "لا تملك صلاحية طلب مسار استثنائي. تواصل مع مسؤول الجهة إذا كان الموضوع يحتاج هذا المسار." });
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
    if (!exceptionForm.validUntil || Number.isNaN(new Date(exceptionForm.validUntil).getTime()) || new Date(exceptionForm.validUntil) <= new Date()) {
      setNotice({ kind: "error", text: "حدد تاريخ انتهاء مستقبليًا للمسار الاستثنائي." });
      return;
    }
    setBusy(true); setNotice(null);
    try {
      const result = await rpc<Record<string, unknown>>("create_topic_governance_exception_request", {
        p_title_ar: form.title.trim(),
        p_description: form.description.trim(),
        p_category_id: form.category,
        p_current_unit_id: form.unit,
        p_workflow_template_version_id: exceptionForm.workflowVersionId,
        p_reason: exceptionForm.reason.trim(),
        p_valid_until: new Date(exceptionForm.validUntil).toISOString(),
        p_priority: form.priority,
        p_source_type: form.source,
        p_title_en: null,
        p_client_request_id: getClientRequestId(),
        p_effective_on: form.effectiveOn,
      });
      const topicId = String(result.topic_id ?? result.id ?? "");
      setExceptionResult(result);
      if (topicId) await loadSummary(topicId);
      if (topicId && onFollowTopic) {
        await onFollowTopic(topicId);
        return;
      }
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

  const screen = summary ? "done" : reviewReady ? "review" : hasTestedRegulations ? "governance" : "details";

  async function continueRegulationToReview() {
    if (!selectedOption?.can_start_workflow) {
      setNotice({ kind: "error", text: "اختر لائحة لها مسار اعتماد جاهز، أو استخدم المسار المخصص أو الاستثناء." });
      return;
    }
    const preview = await showRoutePreview();
    if (preview?.status === "ready") setReviewReady(true);
  }

  return <div className="mx-auto max-w-[1040px] space-y-5">
    {notice && <div className={`flex items-start gap-3 rounded-2xl border p-4 text-xs shadow-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}><span className="mt-0.5">{notice.kind === "success" ? <Check size={16}/> : <AlertCircle size={16}/>}</span><div><strong>{notice.text}</strong>{notice.detail && <details className="mt-2 text-[10px] opacity-80"><summary>تفاصيل تقنية</summary><p dir="ltr" className="mt-1 break-all">{notice.detail}</p></details>}</div></div>}

    <section className="overflow-hidden rounded-3xl border border-[#d9e4ef] bg-white shadow-[0_18px_55px_rgba(15,42,70,.08)]">
      <div className="grid gap-4 border-b border-[#edf2f7] bg-[#fbfdff] p-5 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <p className="mb-1.5 text-[11px] font-black text-[#ff7a00]">إنشاء موضوع</p>
          <h1 className="text-xl font-black text-[#0a1330]">{screen === "details" ? "أدخل بيانات الموضوع" : screen === "governance" ? "اختر طريقة المعالجة" : screen === "review" ? "راجع قبل الإرسال" : "تم إنشاء الموضوع"}</h1>
          <p className="mt-2 max-w-4xl text-xs leading-6 text-[#66778d]">{screen === "details" ? "الحقول الأساسية فقط، ثم سيقترح النظام المسار المناسب." : screen === "governance" ? "اختر المسار اللائحي أو صمّم مسارًا مخصصًا أو اطلب استثناءً." : screen === "review" ? "تأكد من البيانات والمسار قبل الإنشاء." : "يمكنك فتح الموضوع ومتابعة حالته."}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#dbe8f5] bg-white px-3 py-2 text-[11px] font-bold text-[#53677f]">
          {busy || loadingReferences ? <LoaderCircle className="animate-spin text-[#0066cc]" size={15}/> : <Sparkles className="text-[#ff7a00]" size={15}/>}
          {busy ? "جار تنفيذ العملية" : loadingReferences ? "تحميل المراجع" : "جاهز للإنشاء"}
        </div>
      </div>

      <TopicCreationProgress currentStep={currentCreationStep} />

      <div className="p-5 sm:p-7">
        <div className={screen === "details" ? "mx-auto max-w-3xl space-y-4" : "hidden"}>
          <div className="rounded-2xl border border-[#e2e9f1] bg-[#fbfdff] p-4">
            <div className="mb-4 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf6ff] text-[#0066cc]"><FileCheck2 size={18}/></span><div><h2 className="text-sm font-black text-[#0a1330]">بيانات الموضوع</h2><p className="text-[10px] text-[#7b8ba0]">هذه البيانات تُستخدم لاستخراج اللوائح المطابقة.</p></div></div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="عنوان الموضوع" hint={titleLength > 0 && titleLength < 5 ? `العنوان الحالي ${titleLength} أحرف — يلزم 5 أحرف على الأقل.` : "5 أحرف على الأقل."}>
                <input aria-label="عنوان الموضوع" aria-invalid={titleLength > 0 && titleLength < 5} className={invalidField(input, titleLength > 0 && titleLength < 5)} value={form.title} onChange={(event) => resetOptions({ ...form, title: event.target.value })} placeholder="مثال: اعتماد خطة دراسية جديدة"/>
              </Field>
              <Field label="وصف الموضوع" hint={descriptionLength > 0 && descriptionLength < 10 ? `الوصف الحالي ${descriptionLength} أحرف — يلزم 10 أحرف على الأقل.` : "10 أحرف على الأقل لتوضيح نطاق الطلب."}>
                <textarea aria-label="وصف الموضوع" aria-invalid={descriptionLength > 0 && descriptionLength < 10} className={invalidField(textarea, descriptionLength > 0 && descriptionLength < 10)} value={form.description} onChange={(event) => resetOptions({ ...form, description: event.target.value })} placeholder="اشرح الغرض من الموضوع والنتيجة المطلوبة."/>
              </Field>
              <Field label="جهة تقديم الموضوع" hint={!loadingReferences && !references.units.length ? "لا توجد جهة تملك صلاحية إنشاء موضوع فيها ضمن صلاحياتك الحالية." : "هذه جهة تقديم الطلب وليست بالضرورة المجلس الأول في مسار البند؛ سيحدده النظام بعد اختيار المادة."}>
                <select aria-label="جهة تقديم الموضوع" aria-invalid={!loadingReferences && !references.units.length} disabled={loadingReferences || !references.units.length} className={invalidField(input, !loadingReferences && !references.units.length)} value={form.unit} onChange={(event) => {
                  const unit = event.target.value;
                  setReferences((current) => ({ ...current, categories: [] }));
                  setLoadingCategories(Boolean(unit));
                  resetOptions({ ...form, unit, category: "" });
                }}>
                  <option value="">{loadingReferences ? "جارٍ تحميل الجهات…" : references.units.length ? "اختر جهة تقديم الموضوع" : "لا توجد جهات متاحة"}</option>
                  {references.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}
                </select>
              </Field>
              <Field label="فئة الموضوع" hint={!form.unit ? "اختر المجلس أولًا؛ ستظهر فئاته التنفيذية فقط." : loadingCategories ? "جارٍ استخراج الفئات من اللوائح النافذة على المجلس…" : !references.categories.length ? "لا توجد بنود تنفيذية نافذة مرتبطة بهذا المجلس في التاريخ المحدد." : `${references.categories.length} فئة مرتبطة ببنود هذا المجلس فقط.`}>
                <select aria-label="فئة الموضوع" aria-invalid={Boolean(form.unit) && !loadingCategories && !references.categories.length} disabled={!form.unit || loadingReferences || loadingCategories || !references.categories.length} className={invalidField(input, Boolean(form.unit) && !loadingCategories && !references.categories.length)} value={form.category} onChange={(event) => resetOptions({ ...form, category: event.target.value })}>
                  <option value="">{!form.unit ? "اختر المجلس أولًا" : loadingCategories ? "جارٍ تحميل فئات المجلس…" : references.categories.length ? "اختر فئة الموضوع" : "لا توجد فئات تنفيذية متاحة"}</option>
                  {references.categories.map((category) => <option key={category.id} value={category.id}>{category.name_ar}{typeof category.executable_item_count === "number" ? ` (${category.executable_item_count})` : ""}</option>)}
                </select>
              </Field>
              <Field label="الأولوية"><select aria-label="الأولوية" className={input} value={form.priority} onChange={(event) => resetOptions({ ...form, priority: event.target.value })}>{references.priorities.map((value) => <option key={value} value={value}>{priorityLabels[value] ?? value}</option>)}</select></Field>
              <Field label="مصدر الموضوع"><select aria-label="مصدر الموضوع" className={input} value={form.source} onChange={(event) => resetOptions({ ...form, source: event.target.value })}>{references.sources.map((value) => <option key={value} value={value}>{sourceLabels[value] ?? value}</option>)}</select></Field>
              <Field label="تاريخ المطابقة" hint="يُستخدم للتحقق من أن اللائحة كانت نافذة في هذا التاريخ."><input aria-label="تاريخ المطابقة" type="date" className={input} value={form.effectiveOn} onChange={(event) => {
                setReferences((current) => ({ ...current, categories: [] }));
                setLoadingCategories(Boolean(form.unit));
                resetOptions({ ...form, effectiveOn: event.target.value, category: "" });
              }}/></Field>
              <div className="md:col-span-2 rounded-xl border border-[#dce5ef] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-[11px] font-black text-[#34465e]">مرفقات الموضوع</p><p className="mt-1 text-[10px] text-[#7d8da1]">PDF أو PNG أو JPEG أو DOCX، حتى 25 ميجابايت لكل ملف. تُرفع بعد إنشاء الموضوع مباشرة.</p></div>
                  <label className="flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-[#9cc7ef] bg-[#edf6ff] px-3 text-[10px] font-black text-[#0066cc] hover:bg-[#e2f1ff]"><Paperclip size={14}/> اختيار ملفات<input aria-label="اختيار مرفقات الموضوع" className="hidden" type="file" multiple accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    setPendingAttachments((current) => [...current, ...files.map((file) => ({ id: globalThis.crypto?.randomUUID?.() ?? `${file.name}-${file.lastModified}-${Math.random()}`, file, description: "" }))]);
                    event.currentTarget.value = "";
                  }}/></label>
                </div>
                {pendingAttachments.length > 0 && <div className="mt-3 space-y-2">{pendingAttachments.map((attachment) => <div key={attachment.id} className="grid gap-2 rounded-xl bg-[#f8fbff] p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(180px,.8fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-[10px] font-black text-[#24364e]">{attachment.file.name}</p><p className="mt-0.5 text-[9px] text-[#7b8ba0]">{Math.max(1, Math.ceil(attachment.file.size / 1024))} KB</p></div><input aria-label={`وصف ${attachment.file.name}`} className={input} value={attachment.description} onChange={(event) => setPendingAttachments((current) => current.map((item) => item.id === attachment.id ? { ...item, description: event.target.value } : item))} placeholder="وصف اختياري للمرفق"/><button type="button" aria-label={`إزالة ${attachment.file.name}`} onClick={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))} className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={15}/></button></div>)}</div>}
              </div>
              <div className={`rounded-xl border p-3 ${canMoveToRegulation ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-[#dce5ef] bg-white text-[#617287]"}`}>
                <p className="text-[10px] font-black">جاهزية المرحلة الأولى</p>
                <p className="mt-1 text-[11px] leading-5">{canMoveToRegulation ? "اكتملت البيانات؛ يمكنك الانتقال لاختيار اللائحة المنطبقة." : nextBlockedReason}</p>
              </div>
              <div className="md:col-span-2">
                <button disabled={!canMoveToRegulation} onClick={findRegulations} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0066cc] px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)] disabled:cursor-not-allowed disabled:bg-[#a8b8c9]">
                  {busy ? <LoaderCircle className="animate-spin" size={15}/> : <Search size={15}/>} التالي: عرض اللائحة المنطبقة
                </button>
                {!canMoveToRegulation && <p className="mt-2 text-center text-[10px] font-bold text-[#7b8ba0]">زر «التالي» معطل: {nextBlockedReason}</p>}
              </div>
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

        <div className={screen !== "details" ? "space-y-4" : "hidden"}>
          {screen === "governance" && <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce7f1] bg-[#f8fbff] px-4 py-3">
            <div><p className="text-sm font-black text-[#0a1330]">{form.title}</p><p className="mt-1 text-xs text-[#66778d]">{selectedUnit?.name_ar} · {selectedCategory?.name_ar}</p></div>
            <button type="button" onClick={() => resetOptions(form)} className="h-10 rounded-xl border border-[#cddbea] bg-white px-4 text-xs font-black text-[#52647a] hover:border-[#0877df] hover:text-[#0877df]">تعديل البيانات</button>
          </div>
          <TopicGovernanceMethodSelector
            value={governanceMethod}
            availability={governanceAvailability}
            onChange={(method) => {
              setGovernanceMethodOverride(method);
              setReviewReady(false);
              if (method === "prior" && selectedOption && !priorRouteStepsLoaded) {
                void loadPriorRouteCandidateSteps(selectedOption);
              }
            }}
          />
          </>}

          {screen === "governance" && governanceMethod === "regulation" && <section className="rounded-2xl border border-[#e2e9f1] bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-[#0a1330]">{hasTestedRegulations ? `تم العثور على ${regulationTrees.length} لائحة و${options.length} مادة أو بند مطابق` : "اختبار اللوائح المنطبقة"}</h2>
                <p className="mt-1 text-[10px] text-[#7b8ba0]">{hasTestedRegulations ? "اختر اللائحة التي تحكم هذا الموضوع." : "سيختبر النظام اللوائح تلقائيًا بعد اكتمال بيانات الموضوع."}</p>
              </div>
              {hasTestedRegulations && <div className="flex gap-2"><SmallBadge tone="blue">{options.length} عنصر مطابق</SmallBadge><SmallBadge tone="green">{readyOptions} جاهزة</SmallBadge></div>}
            </div>
            {!options.length ? <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 p-8 text-center"><div><AlertCircle className="mx-auto text-amber-600" size={34}/><h3 className="mt-3 text-sm font-black text-[#24364e]">لم يتم العثور على لائحة منطبقة</h3><p className="mt-2 max-w-md text-xs leading-6 text-[#8291a4]">اختر «مسار مخصص» أو «استثناء لائحي» أعلاه للمتابعة.</p></div></div> :
              <>
              {selectedOption && <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-start justify-between gap-3"><div><SmallBadge tone={selectedOption.can_start_workflow ? "green" : "amber"}>{selectedOption.can_start_workflow ? "المسار المقترح" : "يتطلب معالجة"}</SmallBadge><h3 className="mt-3 text-base font-black text-[#0a1330]">{selectedOption.policy.name_ar}</h3><p className="mt-1 text-xs leading-6 text-[#52647a]">{selectedOption.item.title_ar}</p></div><BookOpen className="text-[#0877df]" size={26}/></div></div>}
              <details className="mt-3 rounded-xl border border-[#e2e9f1] bg-[#fbfdff] p-3">
                <summary className="cursor-pointer text-xs font-black text-[#52647a]">عرض النتائج الأخرى والتفاصيل القانونية ({options.length})</summary>
                <div className="mt-3 grid gap-3">
                {options.map((option) => {
                  const key = selectionKey(option);
                  const selected = selectedKey === key;
                  const routeState = regulationRouteState(option);
                  const expanded = expandedKey === key;
                  const preview = regulationPreviews[key];
                  return <article key={key} className={`rounded-2xl border p-4 text-right transition ${selected ? "border-[#0066cc] bg-[#edf6ff] shadow-[0_10px_24px_rgba(0,102,204,.12)]" : "border-[#e2e9f1] bg-[#fbfdff] hover:border-[#9cc7ef] hover:bg-white"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-1.5"><SmallBadge tone={routeState.tone}>حالة المسار: {routeState.label}</SmallBadge></div>
                        <h3 className="text-sm font-black text-[#0a1330]">{option.policy.name_ar}</h3>
                        <p className="mt-1 text-[10px] text-[#7b8ba0]">الإصدار النافذ: {option.version.label || `الإصدار ${option.version.number}`}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => void openRegulationPreview(option)} aria-expanded={expanded} className="flex h-8 items-center gap-1 rounded-xl border border-[#cfe0f0] bg-white px-2 text-[10px] font-black text-[#526f8c]"><ArrowLeft size={14}/> التفاصيل</button>
                        <button type="button" onClick={() => chooseAndPreviewRegulation(option)} className={`flex h-8 items-center gap-1 rounded-xl px-3 text-[10px] font-black ${selected ? "bg-emerald-600 text-white" : "bg-[#0066cc] text-white"}`}>{selected ? <Check size={14}/> : <ShieldCheck size={14}/>} {selected ? "تم اختيارها" : "اختيار اللائحة والمادة"}</button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 rounded-xl bg-white/80 p-3 sm:grid-cols-2">
                      <div><p className="text-[10px] font-black text-[#34465e]">المادة المنطبقة</p>
                      <p className="mt-1 text-xs font-bold text-[#0a1330]">{option.item.title_ar}</p>
                      <p className="mt-1 text-[10px] text-[#7b8ba0]">{routeState.detail}</p></div>
                      <div><p className="text-[10px] font-black text-[#34465e]">سبب الانطباق</p><p className="mt-1 text-[10px] leading-5 text-[#52647a]">{regulationMatchingReason(option, selectedUnit, selectedCategory)}</p></div>
                      <div className="sm:col-span-2"><p className="text-[10px] font-black text-[#34465e]">نطاق التطبيق</p><p className="mt-1 text-[10px] text-[#52647a]">{scopeLabels[option.scope.type] ?? "النطاق المحدد في اللائحة"}</p></div>
                    </div>
                    {expanded && <RegulationPreviewCard
                      preview={preview}
                      loading={loadingPreviewKey === key}
                      selected={selected}
                      canStartWorkflow={option.can_start_workflow}
                      onChoose={() => chooseRegulation(option)}
                    />}
                  </article>;
                })}
                </div>
              </details></>}
            {selectedOption?.can_start_workflow && <button type="button" disabled={busy || loadingRoutePreview} onClick={() => void continueRegulationToReview()} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0877df] text-sm font-black text-white shadow-[0_10px_22px_rgba(8,119,223,.18)] disabled:bg-[#a8b8c9]"><ArrowLeft size={17}/>{loadingRoutePreview ? "جارٍ تجهيز المسار…" : "متابعة إلى المراجعة"}</button>}
          </section>}

            {screen === "governance" && governanceMethod === "custom" && !summary && <div>
              <TopicCustomRouteDesigner
                units={references.units}
                initialUnitId={form.unit}
                busy={busy}
                onSubmit={createCustomRouteDraft}
              />
            </div>}
            {screen === "governance" && governanceMethod === "prior" && !summary && <TopicPriorRouteDesigner
              steps={priorRouteSteps}
              loading={loadingPriorRouteSteps}
              busy={busy}
              onSubmit={createPriorRouteRequest}
            />}
{screen === "review" && <section className="mt-4 overflow-hidden rounded-2xl border border-[#0a1330]/10 bg-white shadow-[0_16px_36px_rgba(10,19,48,.12)]">
              <div className="bg-[#0a1330] px-5 py-4 text-white">
                <p className="text-[10px] font-black text-[#8fc7ff]">المرحلة 5 · المراجعة والإنشاء</p>
                <h2 className="mt-1 text-base font-black">راجِع ملخص الموضوع قبل بدء المسار</h2>
                <p className="mt-1 text-[11px] leading-5 text-slate-200">سيعيد الخادم التحقق من اللائحة والمسار عند الإنشاء؛ لا يبدأ أي مسار إذا تغيرت الحوكمة أو لم تعد البيانات مؤهلة.</p>
              </div>
              <div className="grid gap-3 p-4 lg:grid-cols-2">
                <ReviewItem title="بيانات الموضوع" value={form.title.trim()} hint={form.description.trim()}/>
                <ReviewItem title="جهة التقديم والفئة" value={selectedUnit?.name_ar ?? "—"} hint={selectedCategory?.name_ar ?? "—"}/>
                <ReviewItem title="اللائحة والإصدار" value={selectedOption?.policy.name_ar ?? "—"} hint={selectedOption?.version.label || (selectedOption ? `الإصدار ${selectedOption.version.number}` : "—")}/>
                <ReviewItem title="المادة الحاكمة" value={selectedOption?.item.title_ar ?? "—"} hint={selectedOption ? (scopeLabels[selectedOption.scope.type] ?? "النطاق المحدد في اللائحة") : "—"}/>
                <ReviewItem title="المتطلبات المكتملة" value="بيانات الموضوع والجهة والفئة مكتملة" hint="تم التحقق منها قبل هذه الصفحة." tone="green"/>
                <ReviewItem title="المتطلبات الناقصة" value={immediateRequirements.length ? immediateRequirements.map((requirement) => requirement.name).join("، ") : "لا توجد متطلبات قبل الإرسال"} hint={immediateRequirements.length ? "تأكد من إرفاقها أو استكمالها وفق الإجراء المعتمد." : "—"} tone={immediateRequirements.length ? "amber" : "green"}/>
                <ReviewItem title="المرفقات المختارة" value={pendingAttachments.length ? `${pendingAttachments.length} مرفق جاهز للرفع` : "لا توجد مرفقات"} hint={pendingAttachments.length ? pendingAttachments.map((attachment) => attachment.file.name).join("، ") : "يمكن إنشاء الموضوع دون مرفقات ما لم تشترط اللائحة خلاف ذلك."} tone={pendingAttachments.length ? "green" : "blue"}/>
                <ReviewItem title="المسار الذي سيبدأ" value={routePreview?.workflow_name || selectedPreview?.workflow.name || "مسار الاعتماد"} hint={routePreview?.message || "سيتم تشغيل المسار تلقائيًا بعد الإنشاء."}/>
                <ReviewItem title="المجلس الأول المستلم" value={firstRouteStep?.responsible_entity || "ستحدد عند بدء المسار"} hint={firstRouteStep?.responsible_unit_id && firstRouteStep.responsible_unit_id !== form.unit ? "سيتم تحويل المسؤولية إليه تلقائياً عند الإنشاء." : (firstRouteStep?.responsible_role || "—")}/>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f5] bg-[#fbfdff] px-4 py-4">
                <p className="text-[11px] leading-5 text-[#617287]">{canCreateFromReview ? "كل عناصر الحوكمة اللازمة لبدء المسار متاحة. لا تنشئ الصفحة موضوعًا ثانيًا عند النقر المتكرر." : "لا يمكن الإنشاء حتى تكتمل معاينة المسار وتصبح اللائحة جاهزة للتشغيل."}</p>
                <button disabled={busy || !canCreateFromReview} onClick={createTopic} className="flex h-11 min-w-60 items-center justify-center gap-2 rounded-xl bg-[#0066cc] px-5 text-xs font-black text-white shadow-[0_10px_24px_rgba(0,102,204,.22)] hover:bg-[#0058b3] disabled:cursor-not-allowed disabled:bg-[#a8b8c9]">
                  {busy ? <LoaderCircle className="animate-spin" size={16}/> : <ShieldCheck size={16}/>} {busy ? "جارٍ إنشاء الموضوع وبدء المسار…" : "إنشاء الموضوع وبدء المسار"}
                </button>
              </div>
            </section>}
          {screen === "governance" && shouldShowExceptionDesigner && <section className="rounded-2xl border border-amber-200 bg-[#fffaf2] p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#d56700]">طلب استثناء</p>
                <h2 className="mt-1 text-base font-black text-[#0a1330]">استخدم مسارًا بديلًا لمدة محددة</h2>
                <p className="mt-1 max-w-2xl text-xs leading-6 text-[#6d7c90]">وثّق سبب تجاوز المسار المقترح واختر البديل. لن يبدأ قبل موافقة مراجع مستقل.</p>
              </div>
              <SmallBadge tone={summary?.exception?.status === "approved" ? "green" : summary?.exception?.status === "rejected" || summary?.exception?.status === "expired" ? "amber" : "blue"}>
                {exceptionStatusLabels[summary?.exception?.status ?? String(exceptionResult?.status ?? "pending")] ?? "بانتظار الاعتماد"}
              </SmallBadge>
            </div>

            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-white px-3 py-3 text-[11px] leading-5 text-amber-900">
              <AlertCircle className="mt-0.5 shrink-0 text-[#ff7a00]" size={16}/>
              <p><strong>تنبيه:</strong> لن يبدأ الموضوع أو أي اعتماد أو تصويت قبل اعتماد طلب المسار الاستثنائي من الجهة المخولة.</p>
            </div>

            {!exceptionWorkflowsLoaded && <div className="rounded-xl border border-[#d9e8f6] bg-white px-4 py-4 text-center text-[11px] font-bold text-[#52647a]"><LoaderCircle className="mx-auto mb-2 animate-spin text-[#0066cc]" size={17}/>جارٍ تجهيز المسارات المؤقتة المسموح بها لك…</div>}
            {exceptionWorkflowsLoaded && !exceptionWorkflowOptions?.can_request && <div className="rounded-xl border border-amber-200 bg-white px-4 py-4 text-[11px] leading-6 text-amber-900"><strong>لا تملك صلاحية طلب مسار استثنائي لهذه الجهة.</strong><br/>لا يمكن إنشاء موضوع غير محكوم. اطلب من مسؤول الجهة أو مسؤول الحوكمة تقديم الطلب أو منحك الصلاحية.</div>}
            {exceptionWorkflowsLoaded && exceptionWorkflowOptions?.can_request && !activeWorkflowVersions.length && <div className="rounded-xl border border-amber-200 bg-white px-4 py-4 text-[11px] leading-6 text-amber-900"><strong>لا يوجد مسار مؤقت جاهز للاختيار.</strong><br/>لا يمكن إرسال الطلب حتى يجهز مسؤول الحوكمة مسارًا مؤقتًا معتمدًا.</div>}
            {exceptionWorkflowsLoaded && exceptionWorkflowOptions?.can_request && activeWorkflowVersions.length > 0 && <>
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <Field label="المسار المؤقت المقترح" hint="اختر مسارًا معتمدًا ليُراجع مع طلب الاستثناء.">
                <select className={input} value={exceptionForm.workflowVersionId} onChange={(event) => setExceptionForm({ ...exceptionForm, workflowVersionId: event.target.value })}>
                  <option value="">اختر المسار البديل</option>
                  {activeWorkflowVersions.map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}
                </select>
              </Field>
              <Field label="تاريخ انتهاء الاستثناء">
                <input type="datetime-local" min={new Date().toISOString().slice(0, 16)} className={input} value={exceptionForm.validUntil} onChange={(event) => setExceptionForm({ ...exceptionForm, validUntil: event.target.value })}/>
              </Field>
              <div className="lg:col-span-2">
                <Field label="سبب الاستثناء" hint="مثال: لا توجد لائحة نافذة لهذه الفئة حالياً، ونحتاج مساراً مؤقتاً حتى اعتماد اللائحة.">
                  <textarea className={textarea} value={exceptionForm.reason} onChange={(event) => setExceptionForm({ ...exceptionForm, reason: event.target.value })} placeholder="اكتب السبب بلغة واضحة للمراجع..."/>
                </Field>
              </div>
            </div></>}

            {summary?.exception && <div className="mt-3 grid gap-3 rounded-xl border border-amber-100 bg-white p-3 text-[11px] lg:grid-cols-3">
              <SummaryTile title="حالة الاستثناء" value={exceptionStatusLabels[summary.exception.status ?? ""] ?? summary.exception.status ?? "—"} hint={summary.exception.valid_until ? `ينتهي: ${new Date(summary.exception.valid_until).toLocaleString("ar-SA")}` : undefined}/>
              <SummaryTile title="المسار المطلوب" value={summary.exception.workflow_name_ar || "—"} hint={summary.exception.requested_source === "custom" ? "مسار مخصص" : "استثناء"}/>
              <SummaryTile title="سبب الطلب" value={summary.exception.reason || "—"}/>
            </div>}

            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={busy || !exceptionWorkflowsLoaded || !exceptionWorkflowOptions?.can_request || !activeWorkflowVersions.length || hasPendingException || !hasTopicData || !form.unit || !form.category || !exceptionForm.workflowVersionId || exceptionForm.reason.trim().length < 10} onClick={requestException} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d56700] px-5 text-sm font-black text-white shadow-[0_8px_18px_rgba(213,103,0,.18)] disabled:cursor-not-allowed disabled:bg-[#a8b8c9]">
                {busy ? <LoaderCircle className="animate-spin" size={16}/> : <ShieldCheck size={16}/>} {hasPendingException ? "الطلب بانتظار الاعتماد" : "إرسال طلب الاستثناء"}
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
            {onFollowTopic && <button onClick={() => void onFollowTopic(summary.topic.id)} className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(5,150,105,.18)] hover:bg-emerald-700">
              <ArrowLeft size={15}/> فتح الموضوع ومتابعته
            </button>}
          </section>}
        </div>
      </div>
    </section>
  </div>;
}

function RegulationPreviewCard({
  preview,
  loading,
  selected,
  canStartWorkflow,
  onChoose,
}: {
  preview?: RegulationPreview;
  loading: boolean;
  selected: boolean;
  canStartWorkflow: boolean;
  onChoose: () => void;
}) {
  if (loading) {
    return <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#d9e8f6] bg-white p-4 text-xs font-bold text-[#52647a]"><LoaderCircle className="animate-spin text-[#0066cc]" size={16}/> جارٍ تحميل النص والمتطلبات ومسار الاعتماد…</div>;
  }
  if (!preview) return null;

  return <div className="mt-3 space-y-3 rounded-xl border border-[#cfe2f4] bg-white p-4">
    <div className="grid gap-3 lg:grid-cols-2">
      <PreviewDetail title="نص المادة" value={preview.article.official_text} wide />
      <PreviewDetail title="ملخص القاعدة" value={preview.rule_summary.length
        ? preview.rule_summary.map((rule) => `${rule.name}: ${rule.description}`).join("\n")
        : "لا توجد قاعدة تنفيذية إضافية مسجلة لهذه المادة."} />
      <PreviewDetail title="الجهة التي ينطبق عليها النطاق" value={`${preview.scope.target_name} — ${preview.scope.description}`} />
      <PreviewDetail title="المسار الناتج" value={preview.workflow.description} />
    </div>

    {preview.article.interpretation && <div className="rounded-xl bg-[#f8fbff] px-3 py-2 text-[11px] leading-6 text-[#52647a]"><strong className="text-[#0a1330]">تفسير تنفيذي:</strong> {preview.article.interpretation}</div>}

    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-[#e2e9f1] p-3">
        <p className="text-[10px] font-black text-[#34465e]">المرفقات أو المتطلبات اللازمة</p>
        {preview.requirements.length || preview.attachments.length ? <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-[#52647a]">
          {preview.requirements.map((requirement) => <li key={`${requirement.name}-${requirement.timing}`}>• {requirement.name} {requirement.mandatory ? "(مطلوب)" : "(اختياري)"}</li>)}
          {preview.attachments.map((attachment) => <li key={attachment.name}>• {attachment.name}{attachment.description ? ` — ${attachment.description}` : ""}</li>)}
        </ul> : <p className="mt-2 text-[11px] text-[#7b8ba0]">لا توجد مرفقات أو متطلبات إضافية لهذه المادة.</p>}
      </div>
      <div className="rounded-xl border border-[#e2e9f1] p-3">
        <p className="text-[10px] font-black text-[#34465e]">أثر الاختيار على الموافقة والتصويت</p>
        <p className="mt-2 text-[11px] leading-5 text-[#52647a]">{preview.approval_effect}</p>
        <p className="mt-2 text-[11px] leading-5 text-[#52647a]">{preview.voting_effect}</p>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f5] pt-3">
      <span className="text-[10px] font-bold text-[#617287]">{selected ? "هذه اللائحة مختارة حاليًا ويمكنك تغييرها من البطاقات الأخرى." : "راجع التفاصيل ثم أكد اختيار اللائحة لهذه المعاملة."}</span>
      <button type="button" onClick={onChoose} className={`flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black shadow-sm ${selected ? "border border-[#9cc7ef] bg-white text-[#0066cc]" : "bg-[#0066cc] text-white shadow-[0_8px_18px_rgba(0,102,204,.18)]"}`}>
        {selected ? <Check size={15}/> : <ShieldCheck size={15}/>} اختيار هذه اللائحة والمادة
      </button>
    </div>
    {!canStartWorkflow && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-800">هذا الاختيار يحتاج إلى استثناء أو مسار بديل قبل بدء الاعتماد.</p>}
  </div>;
}

function PreviewDetail({ title, value, wide = false }: { title: string; value: string; wide?: boolean }) {
  return <div className={`rounded-xl border border-[#e2e9f1] p-3 ${wide ? "lg:col-span-2" : ""}`}>
    <p className="text-[10px] font-black text-[#34465e]">{title}</p>
    <p className="mt-1 whitespace-pre-line text-[11px] leading-6 text-[#52647a]">{value}</p>
  </div>;
}

function selectionKey(option: RegulationOption) {
  const selection = option.selection;
  return `${selection.policy_id}:${selection.policy_version_id}:${selection.policy_item_id}:${selection.scope_assignment_id}`;
}

function regulationRouteState(option: RegulationOption) {
  if (option.can_start_workflow) return { label: "جاهز", tone: "green" as const, detail: "المسار جاهز للبدء" };
  if (option.routing_outcome === "custom_route_required") return { label: "يحتاج استثناء", tone: "amber" as const, detail: "يتطلب مسارًا مخصصًا أو مؤقتًا" };
  return { label: "غير مكتمل", tone: "slate" as const, detail: "المسار أو متطلباته غير مكتملة" };
}

function regulationMatchingReason(option: RegulationOption, unit?: ReferenceOption, category?: ReferenceOption) {
  const scope = scopeLabels[option.scope.type] ?? "النطاق المحدد في اللائحة";
  const unitName = unit?.name_ar ?? "الجهة المختارة";
  const categoryName = category?.name_ar ?? "فئة الموضوع المختارة";
  return `تنطبق على ${unitName} ضمن فئة «${categoryName}» لأن ${scope} يشمل هذه الحالة.`;
}

function SummaryTile({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return <div className="rounded-xl border border-emerald-200 bg-white p-3"><p className="text-[10px] font-black text-[#617287]">{title}</p><strong className="mt-1 block text-xs text-[#0a1330]">{value}</strong>{hint && <span className="mt-1 block text-[10px] text-[#7b8ba0]">{hint}</span>}</div>;
}

function ReviewItem({ title, value, hint, tone = "blue" }: { title: string; value: string; hint?: string; tone?: "blue" | "green" | "amber" }) {
  const colors = {
    blue: "border-[#d9e8f6] bg-[#fbfdff]",
    green: "border-emerald-200 bg-emerald-50/50",
    amber: "border-amber-200 bg-amber-50/50",
  };
  return <article className={`rounded-xl border p-3 ${colors[tone]}`}>
    <p className="text-[10px] font-black text-[#617287]">{title}</p>
    <strong className="mt-1 block text-xs leading-5 text-[#0a1330]">{value}</strong>
    {hint && <p className="mt-1 text-[10px] leading-5 text-[#617287]">{hint}</p>}
  </article>;
}
