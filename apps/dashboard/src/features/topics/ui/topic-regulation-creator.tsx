"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, BookOpen, Check, ChevronDown, ChevronLeft, FileCheck2,
  FileText, FolderTree, Gavel, Layers3, LoaderCircle, Route, Search, ShieldCheck, Sparkles,
} from "lucide-react";

type Notice = { kind: "success" | "error"; text: string; detail?: string };
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

const creationStages = [
  "بيانات الموضوع والجهة والتصنيف",
  "اختيار اللائحة والمادة",
  "المتطلبات والقيود",
  "معاينة مسار الاعتماد",
  "المراجعة والإنشاء",
  "متابعة الموضوع بعد الإنشاء",
];

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
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Record<string, boolean>>({});
  const [activeTreeNodeId, setActiveTreeNodeId] = useState("");
  const [selectedScopeLabel, setSelectedScopeLabel] = useState("");
  const [hasTestedRegulations, setHasTestedRegulations] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedReferences, setSelectedReferences] = useState<SelectedRegulationReference[]>([]);
  const [expandedKey, setExpandedKey] = useState("");
  const [regulationPreviews, setRegulationPreviews] = useState<Record<string, RegulationPreview>>({});
  const [loadingPreviewKey, setLoadingPreviewKey] = useState("");
  const [routePreviewed, setRoutePreviewed] = useState(false);
  const [routePreview, setRoutePreview] = useState<TopicRoutePreview | null>(null);
  const [loadingRoutePreview, setLoadingRoutePreview] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [summary, setSummary] = useState<TopicSummary | null>(null);
  const [exceptionResult, setExceptionResult] = useState<Record<string, unknown> | null>(null);
  const [exceptionForm, setExceptionForm] = useState({
    reason: "",
    workflowVersionId: "",
    validUntil: defaultValidUntil(),
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [busy, setBusy] = useState(false);
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
  const shouldShowExceptionDesigner = Boolean(exceptionScenario || summary?.exception?.status);
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
  const currentStage = summary
    ? 6
    : reviewReady
      ? 5
      : routePreviewed
        ? 4
        : selectedOption
          ? 3
          : hasTestedRegulations
            ? 2
            : 1;

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

  function resetOptions(next = form) {
    setForm(next);
    setOptions([]);
    setRegulationTrees([]);
    setExpandedTreeNodes({});
    setActiveTreeNodeId("");
    setSelectedScopeLabel("");
    setHasTestedRegulations(false);
    setSelectedKey("");
    setSelectedReferences([]);
    setExpandedKey("");
    setRegulationPreviews({});
    setLoadingPreviewKey("");
    setRoutePreviewed(false);
    setRoutePreview(null);
    setLoadingRoutePreview(false);
    setReviewReady(false);
    setSummary(null);
    setExceptionResult(null);
    setExceptionWorkflowOptions(null);
    setExceptionWorkflowsLoaded(false);
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
    setRoutePreviewed(false);
    setRoutePreview(null);
    setReviewReady(false);
  }

  function chooseAndPreviewRegulation(option: RegulationOption, reference?: Omit<SelectedRegulationReference, "is_primary">) {
    chooseRegulation(option, reference);
    void openRegulationPreview(option, true);
  }

  function chooseTreeScope(tree: RegulationTree, node?: RegulationTreeNode, mode: "primary" | "supporting" = "primary") {
    const byId = new Map(tree.nodes.map((entry) => [entry.id, entry]));
    const nodeIds = new Set<string>();
    const includeDescendants = (id: string) => {
      nodeIds.add(id);
      tree.nodes.filter((entry) => entry.parent_id === id).forEach((child) => includeDescendants(child.id));
    };
    if (node) includeDescendants(node.id);
    else tree.nodes.forEach((entry) => nodeIds.add(entry.id));

    const candidateKeys = new Set<string>();
    tree.nodes.filter((entry) => nodeIds.has(entry.id)).forEach((entry) => {
      entry.selections.forEach((selection) => candidateKeys.add(`${selection.policy_id}:${selection.policy_version_id}:${selection.policy_item_id}:${selection.scope_assignment_id}`));
    });
    const candidates = options
      .filter((option) => candidateKeys.has(selectionKey(option)))
      .sort((a, b) => Number(b.can_start_workflow) - Number(a.can_start_workflow));
    const chosen = candidates[0];
    if (!chosen) {
      setNotice({ kind: "error", text: "لا توجد مادة أو بند قابل للربط بهذا النطاق لهذا الموضوع. اختر مادة مطابقة أو راجع بيانات الموضوع." });
      return;
    }

    const label = node
      ? `${itemTypeLabel(node.item_type)}: ${node.title_ar}`
      : `اللائحة كاملة: ${tree.policy.name_ar}`;
    const reference = {
      policy_id: tree.policy.id,
      policy_version_id: tree.version.id,
      policy_item_id: node?.id ?? null,
      scope_assignment_id: chosen.selection.scope_assignment_id,
      reference_type: node?.item_type ?? "policy",
      label,
    };
    if (mode === "supporting" && selectedOption) {
      setSelectedReferences((current) => current.some((entry) => entry.policy_id === reference.policy_id
        && entry.policy_version_id === reference.policy_version_id && entry.policy_item_id === reference.policy_item_id)
        ? current : [...current, { ...reference, is_primary: false }]);
      setNotice({ kind: "success", text: `تمت إضافة «${label}» كمرجع تشريعي مساند للموضوع.` });
    } else {
      setActiveTreeNodeId(node?.id ?? `policy:${tree.policy.id}:${tree.version.id}`);
      setSelectedScopeLabel(label);
      chooseAndPreviewRegulation(chosen, reference);
    }
    if (node && byId.get(node.id)?.item_type !== "clause") {
      setExpandedTreeNodes((current) => ({ ...current, [node.id]: true }));
    }
  }

  async function showRoutePreview() {
    if (!selectedOption) return;
    setRoutePreviewed(true);
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
    } catch (error) {
      setRoutePreview(null);
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر تحميل معاينة المسار.",
        detail: (error as Error & { detail?: string }).detail,
      });
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
      setBusy(true); setNotice(null); setSummary(null); setSelectedKey(""); setSelectedReferences([]); setExpandedKey(""); setRegulationPreviews({}); setLoadingPreviewKey(""); setRoutePreviewed(false); setRoutePreview(null); setLoadingRoutePreview(false); setReviewReady(false); setHasTestedRegulations(false); setExceptionWorkflowOptions(null); setExceptionWorkflowsLoaded(false); setRegulationTrees([]); setExpandedTreeNodes({}); setActiveTreeNodeId(""); setSelectedScopeLabel("");
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
      if (result.items?.length === 1) {
        chooseRegulation(result.items[0]);
        void openRegulationPreview(result.items[0]);
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
    setRoutePreviewed(false);
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
    const nextSummary = await rpc<TopicSummary>("get_topic_governance_summary", { p_topic_id: topicId });
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
      setExceptionResult(null);
      if (onFollowTopic) {
        await onFollowTopic(topicId);
        return;
      }
      setNotice({ kind: "success", text: "تم إنشاء الموضوع وربطه باللائحة وتشغيل المسار تلقائيًا." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر إنشاء الموضوع.", detail: (error as Error & { detail?: string }).detail });
    } finally {
      setBusy(false);
    }
  }

  async function requestException() {
    if (!exceptionScenario && !summary?.exception?.status) {
      setNotice({ kind: "error", text: "لا يتاح طلب مسار استثنائي إلا عند غياب لائحة منطبقة أو وجود مسار تسمح السياسة باستثنائه." });
      return;
    }
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
          p_description: form.description.trim(),
          p_category_id: form.category,
          p_current_unit_id: form.unit,
          p_workflow_template_version_id: exceptionForm.workflowVersionId,
          p_reason: exceptionForm.reason,
          p_valid_until: new Date(exceptionForm.validUntil).toISOString(),
          p_priority: form.priority,
          p_source_type: form.source,
          p_title_en: null,
          p_client_request_id: getClientRequestId(),
        });
        topicId = String(result.topic_id ?? "");
      }
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

      <div className="grid gap-2 border-b border-[#edf2f7] p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {creationStages.map((label, index) => {
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

        <div className="space-y-4">
          <section className="rounded-2xl border border-[#e2e9f1] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-[#0a1330]">{hasTestedRegulations ? `تم العثور على ${regulationTrees.length} لائحة و${options.length} مادة أو بند مطابق` : "اختبار اللوائح المنطبقة"}</h2>
                <p className="mt-1 text-[10px] text-[#7b8ba0]">{hasTestedRegulations ? "اختر اللائحة التي تحكم هذا الموضوع." : "سيختبر النظام اللوائح تلقائيًا بعد اكتمال بيانات الموضوع."}</p>
              </div>
              {hasTestedRegulations && <div className="flex gap-2"><SmallBadge tone="blue">{options.length} عنصر مطابق</SmallBadge><SmallBadge tone="green">{readyOptions} جاهزة</SmallBadge></div>}
            </div>
            {!hasTestedRegulations ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#c8d8e8] bg-[#fbfdff] p-8 text-center"><div><Route className="mx-auto text-[#86a8c9]" size={34}/><h3 className="mt-3 text-sm font-black text-[#24364e]">أكمل البيانات ثم اضغط «التالي»</h3><p className="mt-2 max-w-md text-xs leading-6 text-[#8291a4]">سيجلب النظام اللوائح النافذة المناسبة للجهة والفئة وتاريخ المطابقة، دون الحاجة إلى معرفة المصطلحات القانونية التقنية.</p></div></div> : !options.length ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 p-8 text-center"><div><AlertCircle className="mx-auto text-amber-600" size={34}/><h3 className="mt-3 text-sm font-black text-[#24364e]">لم يتم العثور على لائحة منطبقة</h3><p className="mt-2 max-w-md text-xs leading-6 text-[#8291a4]">لا يمكن إنشاء موضوع غير محكوم بلائحة. يمكنك مراجعة البيانات أو طلب استثناء عند الحاجة.</p></div></div> :
              <>
              <RegulationTreePicker
                trees={regulationTrees}
                expandedNodes={expandedTreeNodes}
                activeNodeId={activeTreeNodeId}
                selectedKey={selectedKey}
                selectedScopeLabel={selectedScopeLabel}
                onToggleNode={(nodeId) => setExpandedTreeNodes((current) => ({ ...current, [nodeId]: !current[nodeId] }))}
                onChooseScope={chooseTreeScope}
              />
              <details className="mt-3 rounded-xl border border-[#e2e9f1] bg-[#fbfdff] p-3">
                <summary className="cursor-pointer text-[11px] font-black text-[#52647a]">عرض البطاقات التفصيلية البديلة</summary>
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
            {selectedOption && <div className="mt-4 space-y-3 rounded-2xl border border-[#d9e8f6] bg-[#f8fbff] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black text-[#0066cc]">المرحلة 3 · المتطلبات والقيود</p>
                  <h3 className="mt-1 text-sm font-black text-[#0a1330]">التحقق قبل بدء مسار الاعتماد</h3>
                  <p className="mt-1 text-[11px] leading-5 text-[#617287]">يعتمد الموضوع على البند المحدد ونطاقه وقابلية اللائحة لتشغيل المسار. لا تُنشأ أي معاملة قبل اجتياز هذا التحقق.</p>
                </div>
                <SmallBadge tone={selectedOption.can_start_workflow ? "green" : "amber"}>{selectedOption.can_start_workflow ? "جاهز للتشغيل" : "يتطلب معالجة"}</SmallBadge>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <SummaryTile title="المادة المنطبقة" value={selectedOption.item.title_ar}/>
                <SummaryTile title="نطاق التطبيق" value={scopeLabels[selectedOption.scope.type] ?? "النطاق المحدد في اللائحة"}/>
                <SummaryTile title="قاعدة الحوكمة" value={governanceModeLabels[selectedOption.governance_mode] ?? selectedOption.governance_mode} hint={routingLabels[selectedOption.routing_outcome] ?? selectedOption.routing_outcome}/>
              </div>
              <ExecutiveRequirements preview={selectedPreview} loading={loadingPreviewKey === selectedKey} />
              {!routePreviewed && <button onClick={() => void showRoutePreview()} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#9cc7ef] bg-white px-4 text-xs font-black text-[#0066cc] hover:bg-[#edf6ff]">
                <Route size={15}/> معاينة مسار الاعتماد
              </button>}
              {routePreviewed && <div className="rounded-xl border border-[#cfe2f4] bg-white p-3">
                <p className="text-[10px] font-black text-[#0066cc]">المرحلة 4 · معاينة مسار الاعتماد</p>
                <p className="mt-1 text-xs font-bold text-[#0a1330]">{selectedOption.can_start_workflow ? "سيتم إنشاء مسار الاعتماد تلقائيًا وفتح أول خطوة للمسؤول عنها." : "لا يمكن تشغيل المسار تلقائيًا؛ يمكنك إرسال طلب استثناء لمسار مؤقت أو مخصص."}</p>
                <TopicRouteTimeline preview={routePreview} loading={loadingRoutePreview} />
                {firstRouteStep && <div className={`mt-3 flex items-start gap-3 rounded-xl border px-4 py-3 ${firstRouteStep.responsible_unit_id && firstRouteStep.responsible_unit_id !== form.unit ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
                  <Route className="mt-0.5 shrink-0" size={17}/>
                  <div>
                    <p className="text-xs font-black">المجلس الذي سيستلم الموضوع أولاً: {firstRouteStep.responsible_entity}</p>
                    <p className="mt-1 text-[10px] leading-5">{firstRouteStep.responsible_unit_id && firstRouteStep.responsible_unit_id !== form.unit ? `سيحوّل النظام المسؤولية تلقائياً من جهة التقديم «${selectedUnit?.name_ar ?? "المحددة"}» إلى هذا المجلس عند الإنشاء، ولن يظهر الموضوع في مراجعات جهة التقديم.` : "جهة التقديم هي نفسها المجلس الأول في المسار."}</p>
                  </div>
                </div>}
                {selectedOption.can_start_workflow && routePreview?.status === "ready" && !loadingRoutePreview && !reviewReady && <button onClick={() => setReviewReady(true)} className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0066cc] px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)]">
                  <FileCheck2 size={15}/> الانتقال للمراجعة والإنشاء
                </button>}
              </div>}
            </div>}
{reviewReady && <section className="mt-4 overflow-hidden rounded-2xl border border-[#0a1330]/10 bg-white shadow-[0_16px_36px_rgba(10,19,48,.12)]">
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
          </section>

          {shouldShowExceptionDesigner && <section className="rounded-2xl border border-amber-200 bg-[#fffaf2] p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-[#ff7a00]">مسار بديل عند التعذر</p>
                <h2 className="mt-1 text-sm font-black text-[#0a1330]">{exceptionScenario?.title ?? "طلب مسار استثنائي"}</h2>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#6d7c90]">{exceptionScenario?.description ?? "الطلب بانتظار المراجعة؛ لا يمكن أن يبدأ الموضوع قبل اعتماد الاستثناء."}</p>
              </div>
              <SmallBadge tone={summary?.exception?.status === "approved" ? "green" : summary?.exception?.status === "rejected" || summary?.exception?.status === "expired" ? "amber" : "blue"}>
                {exceptionStatusLabels[summary?.exception?.status ?? String(exceptionResult?.status ?? "pending")] ?? "بانتظار الاعتماد"}
              </SmallBadge>
            </div>

            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-white px-3 py-3 text-[11px] leading-5 text-amber-900">
              <AlertCircle className="mt-0.5 shrink-0 text-[#ff7a00]" size={16}/>
              <p><strong>تنبيه:</strong> لن يبدأ الموضوع أو أي اعتماد أو تصويت قبل اعتماد طلب المسار الاستثنائي من الجهة المخولة.</p>
            </div>

            <div className="mb-4 grid gap-2 md:grid-cols-5">
              {["طلب استثناء", "ذكر السبب", "اعتماد الاستثناء", "إنشاء مسار مؤقت أو مخصص", "متابعة الموضوع"].map((label, index) => (
                <div key={label} className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-center">
                  <span className="mx-auto mb-1 grid h-5 w-5 place-items-center rounded-full bg-[#ff7a00]/10 text-[9px] font-black text-[#ff7a00]">{index + 1}</span>
                  <strong className="text-[10px] leading-4 text-[#24364e]">{label}</strong>
                </div>
              ))}
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
              <button disabled={busy || !exceptionWorkflowsLoaded || !exceptionWorkflowOptions?.can_request || !activeWorkflowVersions.length || hasPendingException || !hasTopicData || !form.unit || !form.category || !exceptionForm.workflowVersionId || exceptionForm.reason.trim().length < 10} onClick={requestException} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0066cc] px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)] disabled:cursor-not-allowed disabled:bg-[#a8b8c9]">
                {busy ? <LoaderCircle className="animate-spin" size={15}/> : <ShieldCheck size={15}/>} {hasPendingException ? "الطلب بانتظار الاعتماد" : "طلب مسار استثنائي"}
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

function TopicRouteTimeline({ preview, loading }: { preview: TopicRoutePreview | null; loading: boolean }) {
  if (loading) {
    return <div className="mt-3 rounded-xl border border-[#d9e8f6] bg-[#f8fbff] px-4 py-5 text-center text-[11px] font-bold text-[#52647a]"><LoaderCircle className="mx-auto mb-2 animate-spin text-[#0066cc]" size={18}/> جارٍ بناء معاينة المسار…</div>;
  }
  if (!preview) {
    return <div className="mt-3 rounded-xl border border-dashed border-[#cfe2f4] bg-[#f8fbff] px-4 py-4 text-[11px] text-[#617287]">تعذر إظهار خطوات المسار حاليًا. أعد تحميل المعاينة قبل المتابعة.</div>;
  }
  if (preview.status !== "ready" || !preview.steps.length) {
    return <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-[11px] leading-6 text-amber-900">{preview.message}</div>;
  }
  const displaySteps = [{
    title: "تقديم الموضوع",
    responsible_entity: "الجهة المختارة",
    responsible_role: "مقدّم الموضوع",
    transition_requirement: "تأكيد إنشاء الموضوع بعد مراجعة اللائحة والمتطلبات.",
    expected_duration: null,
  }, ...preview.steps];

  return <section className="mt-3 rounded-xl border border-[#d9e8f6] bg-[#fbfdff] p-4">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-[10px] font-black text-[#0066cc]">المرحلة 4 · معاينة المسار</p>
        <h4 className="mt-1 text-xs font-black text-[#0a1330]">ماذا سيحدث لموضوعي بعد الإرسال؟</h4>
        <p className="mt-1 text-[10px] text-[#617287]">{preview.workflow_name || "مسار الاعتماد"} — {preview.message}</p>
      </div>
      <SmallBadge tone="green">{displaySteps.length} خطوات</SmallBadge>
    </div>
    <ol className="relative mr-2 space-y-3 border-r-2 border-[#cfe2f4] pr-5">
      {displaySteps.map((step, index) => <li key={`${step.title}-${index}`} className="relative">
        <span className="absolute -right-[2.05rem] top-3 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#0066cc] text-[10px] font-black text-white shadow-sm">{index + 1}</span>
        <div className="rounded-xl border border-[#e2e9f1] bg-white p-3 shadow-[0_4px_12px_rgba(22,50,79,.04)]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <strong className="text-xs text-[#0a1330]">{step.title}</strong>
            {step.expected_duration && <SmallBadge tone="slate">{step.expected_duration}</SmallBadge>}
          </div>
          <div className="mt-2 grid gap-2 text-[10px] leading-5 text-[#52647a] sm:grid-cols-3">
            <p><span className="font-black text-[#34465e]">الجهة المسؤولة: </span>{step.responsible_entity}</p>
            <p><span className="font-black text-[#34465e]">المسؤول: </span>{step.responsible_role}</p>
            <p><span className="font-black text-[#34465e]">للانتقال: </span>{step.transition_requirement}</p>
          </div>
        </div>
      </li>)}
    </ol>
  </section>;
}

function ExecutiveRequirements({ preview, loading }: { preview?: RegulationPreview; loading: boolean }) {
  if (loading) {
    return <div className="rounded-xl border border-[#d9e8f6] bg-white px-4 py-3 text-[11px] font-bold text-[#52647a]">جارٍ تجهيز قائمة المتطلبات التنفيذية…</div>;
  }
  if (!preview) {
    return <div className="rounded-xl border border-dashed border-[#cfe2f4] bg-white px-4 py-3 text-[11px] text-[#617287]">افتح تفاصيل اللائحة المختارة لعرض المتطلبات التي تخص هذا الموضوع.</div>;
  }

  const immediateRequirements = preview.requirements.filter((requirement) => requirement.timing === "before_submission");
  const additionalApproval = preview.rule_summary.some((rule) => rule.requires_workflow);
  const rows = [
    {
      item: "المستندات والمتطلبات",
      status: immediateRequirements.length ? "ناقص" : "غير مطلوبة",
      tone: immediateRequirements.length ? "amber" as const : "slate" as const,
      required: immediateRequirements.length
        ? immediateRequirements.map((requirement) => requirement.name).join("، ")
        : "—",
    },
    {
      item: "الجهة المخولة",
      status: "مكتمل",
      tone: "green" as const,
      required: preview.scope.target_name,
    },
    {
      item: "النصاب",
      status: "يطبق لاحقًا",
      tone: "blue" as const,
      required: "يُحتسب عند انعقاد جلسة المجلس وفق إعدادات النصاب النافذة.",
    },
    {
      item: "التصويت",
      status: "يطبق لاحقًا",
      tone: "blue" as const,
      required: "يُطبّق فقط إن تضمّن مسار الاعتماد خطوة تصويت معتمدة.",
    },
    {
      item: "موافقة إضافية",
      status: additionalApproval ? "يطبق لاحقًا" : "غير مطلوبة",
      tone: additionalApproval ? "blue" as const : "slate" as const,
      required: additionalApproval ? "ستُحدّد ضمن خطوات مسار الاعتماد بعد إنشاء الموضوع." : "—",
    },
  ];

  return <section className="overflow-hidden rounded-xl border border-[#d9e8f6] bg-white">
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#edf1f5] px-4 py-3">
      <div>
        <p className="text-[10px] font-black text-[#0066cc]">المرحلة 3 · المتطلبات والقيود</p>
        <h4 className="mt-1 text-xs font-black text-[#0a1330]">ما الذي تحتاجه الآن؟</h4>
      </div>
      <span className="text-[10px] leading-5 text-[#617287]">تُعرض القواعد التقنية التفصيلية داخل إدارة اللوائح فقط.</span>
    </div>
    <div className="hidden grid-cols-[minmax(110px,.8fr)_minmax(105px,.6fr)_minmax(0,2fr)] gap-3 bg-[#f8fbff] px-4 py-2 text-[10px] font-black text-[#617287] sm:grid">
      <span>العنصر</span><span>الحالة</span><span>المطلوب</span>
    </div>
    <div className="divide-y divide-[#edf1f5]">
      {rows.map((row) => <div key={row.item} className="grid gap-2 px-4 py-3 text-[11px] sm:grid-cols-[minmax(110px,.8fr)_minmax(105px,.6fr)_minmax(0,2fr)] sm:items-center sm:gap-3">
        <strong className="text-[#0a1330]">{row.item}</strong>
        <div><span className="sm:hidden text-[10px] font-bold text-[#7b8ba0]">الحالة: </span><SmallBadge tone={row.tone}>{row.status}</SmallBadge></div>
        <p className="leading-5 text-[#52647a]"><span className="sm:hidden text-[10px] font-bold text-[#7b8ba0]">المطلوب: </span>{row.required}</p>
      </div>)}
    </div>
  </section>;
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

function RegulationTreePicker({
  trees,
  expandedNodes,
  activeNodeId,
  selectedKey,
  selectedScopeLabel,
  onToggleNode,
  onChooseScope,
}: {
  trees: RegulationTree[];
  expandedNodes: Record<string, boolean>;
  activeNodeId: string;
  selectedKey: string;
  selectedScopeLabel: string;
  onToggleNode: (nodeId: string) => void;
  onChooseScope: (tree: RegulationTree, node?: RegulationTreeNode, mode?: "primary" | "supporting") => void;
}) {
  if (!trees.length) {
    return <div className="rounded-2xl border border-dashed border-[#c8d8e8] bg-[#fbfdff] p-5 text-center text-[11px] text-[#617287]">جارٍ تجهيز هيكل اللائحة. يمكنك مؤقتًا استخدام البطاقات التفصيلية أدناه.</div>;
  }

  return <section className="overflow-hidden rounded-2xl border border-[#d8e6f3] bg-[#fbfdff]">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5edf5] bg-white px-4 py-3">
      <div className="flex gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf6ff] text-[#0066cc]"><FolderTree size={18}/></span>
        <div><h3 className="text-xs font-black text-[#0a1330]">شجرة اللوائح والمواد</h3><p className="mt-1 text-[10px] leading-5 text-[#617287]">اختر اللائحة كاملة أو فصلًا أو مادةً أو بندًا. يُثبت النظام المادة المطابقة كمرجع قانوني للمسار.</p></div>
      </div>
      <div className="flex flex-wrap gap-1.5"><SmallBadge tone="blue">لائحة ← فصل ← مادة ← بند</SmallBadge>{selectedScopeLabel && <SmallBadge tone="green">المختار: {selectedScopeLabel}</SmallBadge>}</div>
    </div>
    <div className="space-y-3 p-3">
      {trees.map((tree) => <RegulationTreeRoot key={`${tree.policy.id}:${tree.version.id}`} tree={tree} expandedNodes={expandedNodes} activeNodeId={activeNodeId} selectedKey={selectedKey} onToggleNode={onToggleNode} onChooseScope={onChooseScope}/>) }
    </div>
    <div className="border-t border-[#e5edf5] bg-white px-4 py-2.5 text-[10px] leading-5 text-[#617287]">اختيار فصل أو اللائحة كاملة لا يتجاوز التحقق القانوني: يربط النظام الموضوع تلقائيًا بأفضل مادة مطابقة من النطاق المحدد ثم يعيد التحقق قبل الإنشاء.</div>
  </section>;
}

function RegulationTreeRoot({
  tree, expandedNodes, activeNodeId, selectedKey, onToggleNode, onChooseScope,
}: {
  tree: RegulationTree;
  expandedNodes: Record<string, boolean>;
  activeNodeId: string;
  selectedKey: string;
  onToggleNode: (nodeId: string) => void;
  onChooseScope: (tree: RegulationTree, node?: RegulationTreeNode, mode?: "primary" | "supporting") => void;
}) {
  const policyNodeId = `policy:${tree.policy.id}:${tree.version.id}`;
  const byParent = new Map<string, RegulationTreeNode[]>();
  const nodeMap = new Map(tree.nodes.map((node) => [node.id, node]));
  tree.nodes.forEach((node) => {
    const parentKey = node.parent_id && nodeMap.has(node.parent_id) ? node.parent_id : "root";
    byParent.set(parentKey, [...(byParent.get(parentKey) ?? []), node]);
  });
  const roots = (byParent.get("root") ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const hasSelectionBelow = (node?: RegulationTreeNode) => {
    const descendants = node ? [node, ...collectDescendants(node.id, byParent)] : tree.nodes;
    return descendants.some((entry) => entry.selections.length > 0);
  };

  return <article className="overflow-hidden rounded-xl border border-[#d5e3f1] bg-white">
    <div className={`flex flex-wrap items-center justify-between gap-3 px-3 py-3 ${activeNodeId === policyNodeId ? "bg-[#edf6ff]" : "bg-white"}`}>
      <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0a4b90] text-white"><BookOpen size={15}/></span><div className="min-w-0"><h4 className="truncate text-xs font-black text-[#0a1330]">{tree.policy.name_ar}</h4><p className="mt-0.5 text-[10px] text-[#617287]">{tree.policy.code} · الإصدار النافذ: {tree.version.label || tree.version.number}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><SmallBadge tone="slate">{tree.nodes.length} عنصرًا</SmallBadge><button type="button" disabled={!hasSelectionBelow()} onClick={() => onChooseScope(tree)} className="flex h-8 items-center gap-1 rounded-lg bg-[#0066cc] px-3 text-[10px] font-black text-white disabled:bg-[#a8b8c9]"><ShieldCheck size={13}/> اختيارها كمرجع حاكم</button><button type="button" disabled={!hasSelectionBelow() || !selectedKey} onClick={() => onChooseScope(tree, undefined, "supporting")} className="h-8 rounded-lg border border-[#9cc7ef] bg-white px-3 text-[10px] font-black text-[#0066cc] disabled:opacity-40">+ مرجع مساند</button></div>
    </div>
    <div className="border-t border-[#edf2f7] px-2 py-2">
      {roots.length ? roots.map((node) => <RegulationTreeBranch key={node.id} tree={tree} node={node} byParent={byParent} expandedNodes={expandedNodes} activeNodeId={activeNodeId} selectedKey={selectedKey} onToggleNode={onToggleNode} onChooseScope={onChooseScope}/>) : <p className="px-3 py-2 text-[10px] text-[#7b8ba0]">لا توجد عناصر منشورة ضمن هذه اللائحة.</p>}
    </div>
  </article>;
}

function RegulationTreeBranch({
  tree, node, byParent, expandedNodes, activeNodeId, selectedKey, onToggleNode, onChooseScope,
}: {
  tree: RegulationTree;
  node: RegulationTreeNode;
  byParent: Map<string, RegulationTreeNode[]>;
  expandedNodes: Record<string, boolean>;
  activeNodeId: string;
  selectedKey: string;
  onToggleNode: (nodeId: string) => void;
  onChooseScope: (tree: RegulationTree, node: RegulationTreeNode, mode?: "primary" | "supporting") => void;
}) {
  const children = (byParent.get(node.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const descendants = collectDescendants(node.id, byParent);
  const selectableCount = [node, ...descendants].filter((entry) => entry.selections.length > 0).length;
  const isExpanded = expandedNodes[node.id] ?? (node.item_type === "chapter" || node.item_type === "section");
  const isActive = activeNodeId === node.id || node.selections.some((selection) => `${selection.policy_id}:${selection.policy_version_id}:${selection.policy_item_id}:${selection.scope_assignment_id}` === selectedKey);
  const directSelection = node.selections[0];
  const nodeKey = directSelection ? `${directSelection.policy_id}:${directSelection.policy_version_id}:${directSelection.policy_item_id}:${directSelection.scope_assignment_id}` : "";
  const nodeIsSelected = nodeKey === selectedKey;
  const selectable = selectableCount > 0;
  const icon = node.item_type === "chapter" || node.item_type === "section" ? <Layers3 size={14}/> : node.item_type === "clause" ? <Gavel size={14}/> : <FileText size={14}/>;

  return <div className="relative mr-1">
    <div className={`group flex min-h-10 items-center gap-2 rounded-lg px-2 py-1.5 transition ${isActive ? "bg-[#edf6ff] text-[#0058b3]" : "hover:bg-[#f7fbff]"}`}>
      <button type="button" aria-label={`توسيع ${node.title_ar}`} disabled={!children.length} onClick={() => onToggleNode(node.id)} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#617287] hover:bg-[#dceeff] disabled:opacity-0">{isExpanded ? <ChevronDown size={15}/> : <ChevronLeft size={15}/>}</button>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${node.item_type === "chapter" || node.item_type === "section" ? "bg-[#eef5ff] text-[#0066cc]" : "bg-slate-100 text-[#617287]"}`}>{icon}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-[#0a1330]"><span className="ml-1 text-[#0066cc]">{node.code}</span>{node.title_ar}</p><p className="mt-0.5 text-[9px] text-[#7b8ba0]">{itemTypeLabel(node.item_type)} {selectable ? `· ${selectableCount} مادة/بند مطابق` : "· غير منطبق على هذا الموضوع"}</p></div>
      {selectable && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => onChooseScope(tree, node)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black ${nodeIsSelected ? "bg-emerald-600 text-white" : "border border-[#9cc7ef] bg-white text-[#0066cc] hover:bg-[#edf6ff]"}`}>{nodeIsSelected ? "مرجع حاكم مختار" : node.item_type === "chapter" || node.item_type === "section" ? "اختيار الفصل" : node.item_type === "clause" ? "اختيار البند" : "اختيار المادة"}</button>{selectedKey && !nodeIsSelected && <button type="button" title="إضافته دون تغيير المرجع الحاكم" onClick={() => onChooseScope(tree, node, "supporting")} className="rounded-lg border border-[#d6e4f0] bg-white px-2 py-1.5 text-[10px] font-black text-[#526f8c] hover:bg-[#f3f8fc]">+ مرجع مساند</button>}</div>}
    </div>
    {children.length > 0 && isExpanded && <div className="mr-5 border-r border-[#cfe1f2] pr-2">{children.map((child) => <RegulationTreeBranch key={child.id} tree={tree} node={child} byParent={byParent} expandedNodes={expandedNodes} activeNodeId={activeNodeId} selectedKey={selectedKey} onToggleNode={onToggleNode} onChooseScope={onChooseScope}/>)}</div>}
  </div>;
}

function collectDescendants(nodeId: string, byParent: Map<string, RegulationTreeNode[]>): RegulationTreeNode[] {
  const children = byParent.get(nodeId) ?? [];
  return children.flatMap((child) => [child, ...collectDescendants(child.id, byParent)]);
}

function itemTypeLabel(itemType: string) {
  return ({ chapter: "فصل", section: "قسم", article: "مادة", clause: "بند", procedure: "إجراء" } as Record<string, string>)[itemType] ?? "عنصر تشريعي";
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
