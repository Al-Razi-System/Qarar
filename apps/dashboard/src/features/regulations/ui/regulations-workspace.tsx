"use client";

import { Card as QCard } from "@/shared/ui/card";
import { Badge as QBadge } from "@/shared/ui/badge";

import { Badge as SharedBadge } from "@/shared/ui/badge";
import { PageHeader } from "@/shared/ui/page-header";
import { Button as QButton } from "@/shared/ui/button";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BookOpenCheck,
  Building2,
  Check,
  ChevronLeft,
  CirclePlus,
  FileJson,
  FlaskConical,
  Layers3,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Route,
  Search,
  Send,
  ShieldCheck,
  Tags,
  Workflow,
  X,
} from "lucide-react";
import type {
  GovernanceException,
  Policy,
  PolicyItem,
  ReferenceOption,
  TopicCustomRouteDraft,
  TopicPriorRouteRequest,
  WorkflowTemplate,
} from "../model/types";
import { workflowTemplatesFromResponse } from "../model/workflow-contract";
import { RegulationWizard } from "./regulation-wizard";
import { ApprovalChain } from "./approval-chain";
import { RegulationsNavigation } from "./regulations-navigation";

type Notice = { kind: "success" | "error"; text: string; detail?: string };

type PriorRouteReviewStep = TopicPriorRouteRequest["steps"][number] & {
  display_sequence_no: number;
  covered_step_titles: string[];
};

function groupPriorRouteReviewSteps(
  steps: TopicPriorRouteRequest["steps"],
): PriorRouteReviewStep[] {
  const groups: Omit<PriorRouteReviewStep, "display_sequence_no">[] = [];

  for (const step of [...steps].sort(
    (left, right) => left.sequence_no - right.sequence_no,
  )) {
    const previous = groups.at(-1);
    const belongsToPreviousMeeting =
      previous &&
      previous.responsible_unit_name_ar === step.responsible_unit_name_ar &&
      previous.meeting_date === step.meeting_date &&
      previous.meeting_reference === step.meeting_reference &&
      previous.decision_type === step.decision_type &&
      previous.decision_text === step.decision_text &&
      previous.bypass_reason === step.bypass_reason;

    if (!belongsToPreviousMeeting) {
      groups.push({
        ...step,
        covered_step_titles: [step.step_title],
      });
      continue;
    }

    if (!previous.covered_step_titles.includes(step.step_title)) {
      previous.covered_step_titles.push(step.step_title);
    }
    const attachmentIds = new Set(
      previous.attachments.map((attachment) => attachment.id),
    );
    previous.attachments.push(
      ...step.attachments.filter(
        (attachment) => !attachmentIds.has(attachment.id),
      ),
    );
  }

  return groups.map((group, index) => ({
    ...group,
    display_sequence_no: index + 1,
  }));
}
// مسودة ← إرسال للمراجعة ← اعتماد من مستخدم آخر ← تفعيل بتاريخ نفاذ ← نافذة
// لا يمكن اعتماد الإصدار من نفس المستخدم الذي أرسله
// المسار جاهز ومكتمل — هذا الإصدار مقفل للتحرير — النسخة النافذة لا تُعدّل مباشرة
type MatchMode = "single" | "all" | "any";
type MatchCondition = {
  id: string;
  field: string;
  values: string[];
  inverted: boolean;
};
type Modal =
  | "policy"
  | "version"
  | "item"
  | "scope"
  | "activate"
  | "suspend"
  | "workflow"
  | "step"
  | "transition"
  | "exception"
  | "review"
  | "approve"
  | "class"
  | "category"
  | "import_bundle"
  | null;

const matchFields = [
  { value: "request_type", label: "نوع الطلب" },
  { value: "academic_level", label: "المستوى الأكاديمي" },
  { value: "priority", label: "أولوية الموضوع" },
  { value: "source_type", label: "مصدر الموضوع" },
  { value: "governance_level", label: "المستوى التنظيمي" },
  { value: "governance_unit_id", label: "المجلس أو الوحدة" },
  { value: "governance_class_id", label: "تصنيف المجلس" },
  { value: "change_level", label: "مستوى التغيير" },
];
const priorityValues = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
  { value: "urgent", label: "عاجلة" },
];
const sourceValues = [
  { value: "new", label: "موضوع جديد" },
  { value: "from_lower_unit", label: "وارد من وحدة أدنى" },
  { value: "from_upper_unit", label: "وارد من وحدة أعلى" },
  { value: "from_peer_unit", label: "وارد من وحدة مناظرة" },
  { value: "from_admin_entity", label: "وارد من جهة إدارية" },
];
const requestTypeValues = [
  { value: "new_academic_program", label: "إنشاء برنامج أكاديمي" },
  { value: "modify_academic_program", label: "تعديل برنامج أكاديمي" },
  { value: "new_course", label: "إنشاء مقرر" },
  { value: "modify_course", label: "تعديل مقرر" },
  { value: "policy_exception", label: "طلب استثناء" },
];
const academicLevelValues = [
  { value: "diploma", label: "دبلوم" },
  { value: "bachelor", label: "بكالوريوس" },
  { value: "master", label: "ماجستير" },
  { value: "doctorate", label: "دكتوراه" },
];
const governanceLevelValues = [
  { value: "department", label: "قسم" },
  { value: "faculty", label: "كلية" },
  { value: "university", label: "جامعة" },
  { value: "committee", label: "لجنة" },
  { value: "executive", label: "تنفيذي" },
  { value: "other", label: "أخرى" },
];
const changeLevelValues = [
  { value: "minor", label: "تغيير طفيف" },
  { value: "moderate", label: "تغيير متوسط" },
  { value: "major", label: "تغيير جوهري" },
];
const valueSources: Record<string, { value: string; label: string }[]> = {
  request_type: requestTypeValues,
  academic_level: academicLevelValues,
  priority: priorityValues,
  source_type: sourceValues,
  governance_level: governanceLevelValues,
  change_level: changeLevelValues,
};
const fieldLabelMap = Object.fromEntries(
  matchFields.map((field) => [field.value, field.label]),
);

function readableValueLabel(
  field: string,
  value: string,
  references?: {
    units: ReferenceOption[];
    classes: ReferenceOption[];
    categories: ReferenceOption[];
  },
) {
  if (field === "governance_unit_id")
    return (
      references?.units.find((item) => item.id === value)?.name_ar ?? value
    );
  if (field === "governance_class_id")
    return (
      references?.classes.find((item) => item.id === value)?.name_ar ?? value
    );
  return (
    valueSources[field]?.find((item) => item.value === value)?.label ?? value
  );
}

function conditionText(
  condition: MatchCondition,
  references?: {
    units: ReferenceOption[];
    classes: ReferenceOption[];
    categories: ReferenceOption[];
  },
) {
  const fieldLabel = fieldLabelMap[condition.field] ?? condition.field;
  const values = condition.values
    .map((value) => readableValueLabel(condition.field, value, references))
    .filter(Boolean);
  if (!values.length) return `${fieldLabel}: غير محدد`;
  const operator = condition.inverted
    ? "ليس"
    : values.length > 1
      ? "أحد"
      : "يساوي";
  return `${fieldLabel} ${operator}: ${values.join("، ")}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nestedText(value: unknown, path: string[], fallback = "—") {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return typeof current === "string" || typeof current === "number"
    ? String(current)
    : fallback;
}

function defaultValuesForField(field: string) {
  if (field === "request_type") return ["new_academic_program"];
  if (field === "academic_level") return ["diploma", "bachelor", "master"];
  if (field === "priority") return ["medium"];
  if (field === "source_type") return ["new"];
  if (field === "governance_level") return ["faculty"];
  if (field === "change_level") return ["minor"];
  return [];
}

function newMatchCondition(field = "request_type"): MatchCondition {
  return {
    id: crypto.randomUUID(),
    field,
    values: defaultValuesForField(field),
    inverted: false,
  };
}

function conditionCriteria(condition: MatchCondition) {
  const value: unknown =
    condition.values.length > 1 ? condition.values : condition.values[0];
  const criteria = { [condition.field]: value };
  return condition.inverted ? { not: criteria } : criteria;
}

function visualCriteria(mode: MatchMode, conditions: MatchCondition[]) {
  const entries = conditions.filter(
    (condition) => condition.field && condition.values.length,
  );
  if (!entries.length) return {};
  if (mode === "single" || entries.length === 1)
    return conditionCriteria(entries[0]);
  return { [mode]: entries.map(conditionCriteria) };
}

function readVisualCriteria(criteria: Record<string, unknown>) {
  function readConditionObject(
    entry: unknown,
    inverted = false,
  ): MatchCondition[] {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const object = entry as Record<string, unknown>;
    if (object.not) return readConditionObject(object.not, !inverted);
    return Object.entries(object).map(([field, value]) => ({
      id: crypto.randomUUID(),
      field,
      values: Array.isArray(value) ? value.map(String) : [String(value)],
      inverted,
    }));
  }
  const group: "all" | "any" | null = Array.isArray(criteria.all)
    ? "all"
    : Array.isArray(criteria.any)
      ? "any"
      : null;
  if (group) {
    const entries = criteria[group] as unknown[];
    const conditions = entries.flatMap((entry) => readConditionObject(entry));
    return {
      mode: group as MatchMode,
      conditions,
      supported: conditions.length === entries.length,
    };
  }
  const conditions = readConditionObject(criteria);
  return {
    mode: "single" as const,
    conditions,
    supported: conditions.length > 0 || Object.keys(criteria).length === 0,
  };
}

const legalLabels: Record<string, string> = {
  draft: "مسودة",
  under_review: "قيد المراجعة",
  approved: "معتمد",
  effective: "نافذ",
  suspended: "معلّق",
  expired: "منتهي",
  archived: "مؤرشف",
  submitted: "بانتظار المراجعة",
  rejected: "مرفوض",
};
const typeLabels: Record<string, string> = {
  regulation: "لائحة",
  policy: "سياسة",
  procedure: "إجراء",
  framework: "إطار",
};
const statusClass: Record<string, string> = {
  draft: "bg-q-neutral-soft text-q-text-2",
  under_review: "bg-q-warning-soft text-q-warning",
  approved: "bg-q-surface-2 text-q-link",
  effective: "bg-q-success-soft text-q-success",
  suspended: "bg-q-danger-soft text-q-danger",
  expired: "bg-q-neutral-soft text-q-text-2",
  active: "bg-q-success-soft text-q-success",
  pending: "bg-q-warning-soft text-q-warning",
  submitted: "bg-q-warning-soft text-q-warning",
  rejected: "bg-q-danger-soft text-q-danger",
};
const automationLabels: Record<string, string> = {
  not_configured: "غير مهيأ",
  mapping_in_progress: "قيد استكمال الربط",
  ready: "جاهز للتشغيل",
  blocked: "متوقف ويحتاج معالجة",
};
const stepTypeLabels: Record<string, string> = {
  review: "مراجعة",
  discussion: "مناقشة",
  recommendation: "توصية",
  approval: "اعتماد",
  voting: "تصويت",
  execution: "تنفيذ",
  follow_up: "متابعة",
};
const responsibilityLabels: Record<string, string> = {
  present: "عرض",
  review: "مراجعة",
  discuss: "مناقشة",
  recommend: "توصية",
  initial_approve: "اعتماد أولي",
  final_approve: "اعتماد نهائي",
  execute: "تنفيذ",
  follow_up: "متابعة",
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
const outcomeOptions = [
  "approved",
  "returned",
  "rejected",
  "tie",
  "no_vote",
  "completed",
  "cancelled",
];
const transitionLabels: Record<string, string> = {
  forward: "انتقال للأمام",
  return: "إعادة",
  reject: "رفض وإنهاء",
  complete: "إكمال",
  cancel: "إلغاء",
};
const scopeLabels: Record<string, string> = {
  organization: "المنظمة كاملة",
  governance_unit: "مجلس أو وحدة محددة",
  governance_class: "تصنيف مجالس",
  governance_level: "مستوى تنظيمي",
  governance_unit_type: "نوع وحدة",
  unit_subtree: "وحدة والوحدات التابعة",
};
const governanceModeLabels: Record<string, string> = {
  regulation_required: "مسار اللائحة إلزامي",
  regulated_fallback_allowed: "يسمح بمسار بديل",
  custom_route_allowed: "يسمح بمسار مخصص",
};

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/regulations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(
      payload.error?.message ?? "تعذر تنفيذ العملية.",
    ) as Error & { detail?: string };
    error.detail = payload.error?.technicalMessage ?? payload.error?.details;
    throw error;
  }
  return payload.data as T;
}

function Badge({ value }: { value: string }) {
  return (
    <SharedBadge className={statusClass[value]}>
      {legalLabels[value] ?? value}
    </SharedBadge>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const id = `field-${label}`;
  const control =
    React.isValidElement(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type);
  return (
    <div className="block">
      {control ? (
        <label
          htmlFor={id}
          className="mb-1 block text-q-caption font-bold text-q-text-2"
        >
          {label}
        </label>
      ) : (
        <span className="mb-1 block text-q-caption font-bold text-q-text-2">
          {label}
        </span>
      )}
      {control
        ? React.cloneElement(children as React.ReactElement<{ id?: string }>, {
            id,
          })
        : children}
      {hint && (
        <span className="mt-1 block text-q-caption text-q-text-3">{hint}</span>
      )}
    </div>
  );
}
const input =
  "h-9 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption outline-none transition focus:border-q-primary focus:ring-2 focus:ring-q-primary/10";
const textarea =
  "min-h-20 w-full rounded-q-control border border-q-border bg-q-surface p-3 text-q-caption leading-5 outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary/10";

function Dialog({
  title,
  onClose,
  children,
  wide = false,
  feedback,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  feedback?: Notice | null;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-q-header/50 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-q-card bg-q-surface shadow-2xl ${wide ? "max-w-4xl" : "max-w-xl"}`}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-q-border bg-q-surface/95 px-5 py-4 backdrop-blur">
          <h2 className="text-q-ui font-bold text-q-text">{title}</h2>
          <QButton type="submit" variant="ghost"
            onClick={onClose}
            className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control bg-q-surface-2 text-q-text-3"
            aria-label="إغلاق"
          >
            <X size={15} />
          </QButton>
        </header>
        <div className="p-5">
          {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} className={`mb-4 rounded-q-control border p-3 text-q-caption font-bold leading-5 ${feedback.kind === "error" ? "border-q-border bg-q-danger-soft text-q-danger" : "border-q-border bg-q-success-soft text-q-success"}`}><p>{feedback.text}</p>{feedback.detail && <details className="mt-2 text-q-caption opacity-80"><summary className="min-h-11 content-center">تفاصيل إضافية</summary><p dir="ltr" className="mt-1 break-all">{feedback.detail}</p></details>}</div>}
          {children}
        </div>
      </section>
    </div>
  );
}

export function RegulationsWorkspace({
  initialPolicies,
}: {
  initialPolicies: Policy[];
}) {
  const router = useRouter();
  const legacyInlineDetailEnabled: boolean = false;
  const [policies, setPolicies] = useState(initialPolicies);
  const [tab, setTab] = useState<
    | "policies"
    | "workflows"
    | "matcher"
    | "exceptions"
    | "classes"
    | "categories"
  >("policies");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Policy | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<WorkflowTemplate | null>(null);
  const [references, setReferences] = useState<{
    units: ReferenceOption[];
    classes: ReferenceOption[];
    categories: ReferenceOption[];
  }>({ units: [], classes: [], categories: [] });
  const [exceptions, setExceptions] = useState<GovernanceException[]>([]);
  const [customRouteDrafts, setCustomRouteDrafts] = useState<
    TopicCustomRouteDraft[]
  >([]);
  const [priorRouteRequests, setPriorRouteRequests] = useState<
    TopicPriorRouteRequest[]
  >([]);
  const [priorRouteReviewComments, setPriorRouteReviewComments] = useState<
    Record<string, string>
  >({});
  const reviewablePriorRouteRequests = useMemo(
    () => priorRouteRequests.filter((request) => request.status !== "draft"),
    [priorRouteRequests],
  );
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editingItem, setEditingItem] = useState<PolicyItem | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [policyClientRequestId, setPolicyClientRequestId] = useState<
    string | null
  >(null);
  const [policyForm, setPolicyForm] = useState({
    code: "",
    name_ar: "",
    name_en: "",
    policy_type: "regulation",
    description: "",
    status: "active",
  });
  const [versionForm, setVersionForm] = useState({ label: "", summary: "" });
  const [itemForm, setItemForm] = useState({
    code: "",
    title: "",
    body: "",
    type: "article",
    mode: "regulation_required",
    category: "",
    workflow: "",
    sort: "10",
  });
  const [matchMode, setMatchMode] = useState<MatchMode>("all");
  const [matchConditions, setMatchConditions] = useState<MatchCondition[]>([]);
  const [matchPreview, setMatchPreview] = useState({
    request_type: "new_academic_program",
    academic_level: "bachelor",
    source_type: "new",
    priority: "medium",
    governance_level: "faculty",
    governance_unit_id: "",
    governance_class_id: "",
    change_level: "minor",
  });
  const [previewMatches, setPreviewMatches] = useState<boolean | null>(null);
  const [scopeForm, setScopeForm] = useState({
    type: "organization",
    target: "",
    level: "",
    priority: "0",
    from: "",
    to: "",
    descendants: false,
  });
  const [lifecycleForm, setLifecycleForm] = useState({
    from: new Date().toISOString().slice(0, 10),
    to: "",
    reason: "",
  });
  const [workflowForm, setWorkflowForm] = useState({
    code: "",
    name: "",
    description: "",
  });
  const [stepForm, setStepForm] = useState({
    code: "",
    name: "",
    sequence: "10",
    type: "review",
    responsibility: "review",
    unit: "",
    classId: "",
    permission: "",
    initial: false,
    terminal: false,
    outcomes: "approved,returned,rejected",
  });
  const [transitionForm, setTransitionForm] = useState({
    from: "",
    outcome: "approved",
    to: "",
    type: "forward",
  });
  const [matcherForm, setMatcherForm] = useState({
    unit: "",
    category: "",
    priority: "medium",
    source: "new",
    date: new Date().toISOString().slice(0, 10),
  });
  const [matcherResult, setMatcherResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [exceptionForm, setExceptionForm] = useState({
    type: "exception",
    topic: "",
    workflow: "",
    reason: "",
    until: "",
  });
  const [classForm, setClassForm] = useState({
    code: "",
    name_ar: "",
    name_en: "",
    level: "department",
    description: "",
  });
  const [categoryForm, setCategoryForm] = useState({
    code: "",
    name_ar: "",
    name_en: "",
    description: "",
  });
  const [bundleJsonText, setBundleJsonText] = useState("");

  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section");
    if (
      [
        "policies",
        "classes",
        "categories",
        "workflows",
        "matcher",
        "exceptions",
      ].includes(section ?? "")
    )
      // eslint-disable-next-line react-hooks/immutability
      void changeTab(section as typeof tab);
    // Query-based deep links are resolved once when the workspace opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedVersion =
    detail?.versions?.find((v) => v.id === selectedVersionId) ??
    detail?.versions?.[0];
  const requiredPolicyItems =
    selectedVersion?.items.filter(
      (item) => item.governance_mode === "regulation_required",
    ) ?? [];
  const requiredItemsLinked = selectedVersion
    ? selectedVersion.items.length > 0 &&
      requiredPolicyItems.every((item) =>
        Boolean(item.workflow_template_version_id),
      )
    : false;
  const preReviewChecks = selectedVersion
    ? [
        {
          label: "بيانات اللائحة محفوظة",
          done: Boolean(detail?.name_ar && detail?.code),
          action: "policy" as const,
        },
        { label: "إصدار العمل موجود", done: true, action: "version" as const },
        {
          label: "إضافة بند لائحي واحد على الأقل",
          done: selectedVersion.items.length > 0,
          action: "item" as const,
        },
        {
          label: "إضافة نطاق سريان واحد على الأقل",
          done: selectedVersion.scopes.length > 0,
          action: "scope" as const,
        },
        {
          label: "ربط كل بند إلزامي بمسار فعال",
          done: requiredItemsLinked,
          action: "workflow" as const,
        },
      ]
    : [];
  const readinessChecks = selectedVersion
    ? [
        ...preReviewChecks,
        {
          label: "فحص الجاهزية قبل الإرسال",
          done: preReviewChecks.every((check) => check.done),
          action: "matcher" as const,
        },
      ]
    : [];
  const readinessCompleted = readinessChecks.filter(
    (check) => check.done,
  ).length;
  const blockingReviewChecks = preReviewChecks.filter((check) => !check.done);
  const canSubmitForReview =
    selectedVersion?.legal_status === "draft" &&
    preReviewChecks.length > 0 &&
    preReviewChecks.every((check) => check.done);
  const isWorkflowReadyForActivation =
    selectedVersion?.automation_status === "ready" &&
    (selectedVersion.readiness_percent ??
      selectedVersion.automation_readiness_pct ??
      0) >= 100;
  const canApproveVersion = selectedVersion?.legal_status === "under_review";
  const canActivatePolicy =
    selectedVersion?.legal_status === "approved" &&
    isWorkflowReadyForActivation;
  const canEditSelectedVersion = selectedVersion?.legal_status === "draft";
  const activationBlockers = selectedVersion
    ? [
        {
          label: "الإصدار معتمد",
          done: ["approved", "effective", "suspended", "expired"].includes(
            selectedVersion.legal_status,
          ),
        },
        {
          label: "المسار جاهز ومكتمل",
          done:
            isWorkflowReadyForActivation ||
            ["effective", "suspended", "expired"].includes(
              selectedVersion.legal_status,
            ),
        },
        {
          label: "تاريخ النفاذ محدد",
          done:
            Boolean(lifecycleForm.from) ||
            ["effective", "suspended", "expired"].includes(
              selectedVersion.legal_status,
            ),
        },
      ]
    : [];
  const approvalStage = selectedVersion
    ? ({
        draft: 0,
        under_review: 1,
        approved: 2,
        effective: 4,
        suspended: 4,
        expired: 4,
        archived: 4,
      }[selectedVersion.legal_status] ?? 0)
    : 0;
  const approvalFlowSteps = selectedVersion
    ? [
        {
          label: "مسودة",
          description: "قابلة للتحرير",
          done: approvalStage >= 0,
          active: selectedVersion.legal_status === "draft",
        },
        {
          label: "إرسال للمراجعة",
          description: "يقفل التحرير",
          done: approvalStage >= 1,
          active:
            selectedVersion.legal_status === "draft" && canSubmitForReview,
        },
        {
          label: "اعتماد من مستخدم آخر",
          description: "لا يعتمدها المرسل",
          done: approvalStage >= 2,
          active: selectedVersion.legal_status === "under_review",
        },
        {
          label: "تفعيل بتاريخ نفاذ",
          description: "بعد الجاهزية",
          done: approvalStage >= 4,
          active: selectedVersion.legal_status === "approved",
        },
        {
          label: "نافذة",
          description: "تعمل على المواضيع",
          done: selectedVersion.legal_status === "effective",
          active: selectedVersion.legal_status === "effective",
        },
      ]
    : [];
  const visible = useMemo(
    () =>
      policies.filter((p) =>
        `${p.name_ar} ${p.code}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [policies, query],
  );
  const activeWorkflowVersions = workflows.flatMap((w) =>
    w.versions
      .filter((v) => v.status === "active")
      .map((v) => ({ ...v, label: `${w.name_ar} · ${v.version_no}` })),
  );
  const workflowVersionLabel = (id?: string | null) => {
    if (!id) return "لم يربط بمسار";
    return (
      activeWorkflowVersions.find((version) => version.id === id)?.label ??
      "مسار مرتبط"
    );
  };
  const responsibilityTargetLabel = (
    unitId?: string | null,
    classId?: string | null,
  ) => {
    if (unitId)
      return (
        references.units.find((unit) => unit.id === unitId)?.name_ar ??
        "جهة محددة"
      );
    if (classId)
      return (
        references.classes.find((unitClass) => unitClass.id === classId)
          ?.name_ar ?? "تحدد حسب التصنيف"
      );
    return "لم تحدد الجهة";
  };
  const lifecycleSteps = selectedVersion
    ? [
        {
          label: "بيانات اللائحة",
          done: Boolean(detail?.name_ar && detail?.code),
          action: "policy" as const,
        },
        {
          label: "الإصدارات",
          done: Boolean(selectedVersion),
          action: "version" as const,
        },
        {
          label: "البنود",
          done: selectedVersion.items.length > 0,
          action: "item" as const,
        },
        {
          label: "نطاقات السريان",
          done: selectedVersion.scopes.length > 0,
          action: "scope" as const,
        },
        {
          label: "المسار المرتبط",
          done: requiredItemsLinked,
          action: "workflow" as const,
        },
        {
          label: "فحص الجاهزية",
          done:
            canSubmitForReview || selectedVersion.automation_status === "ready",
          action: "matcher" as const,
        },
        {
          label: "إرسال للمراجعة",
          done: [
            "under_review",
            "approved",
            "effective",
            "suspended",
            "expired",
          ].includes(selectedVersion.legal_status),
          action: "review" as const,
        },
        {
          label: "اعتماد",
          done: ["approved", "effective", "suspended", "expired"].includes(
            selectedVersion.legal_status,
          ),
          action: "approve" as const,
        },
        {
          label: "تفعيل",
          done: ["effective", "suspended", "expired"].includes(
            selectedVersion.legal_status,
          ),
          action: "activate" as const,
        },
      ]
    : [];
  const selectedStepOutcomes = stepForm.outcomes
    .split(",")
    .map((outcome) => outcome.trim())
    .filter(Boolean);
  const generatedCriteria = useMemo(
    () => visualCriteria(matchMode, matchConditions),
    [matchMode, matchConditions],
  );
  const criteriaSummary = useMemo(
    () =>
      matchConditions
        .filter((condition) => condition.field && condition.values.length)
        .map((condition) => conditionText(condition, references)),
    [matchConditions, references],
  );
  const matcherItems = useMemo(
    () =>
      Array.isArray(matcherResult?.items)
        ? (matcherResult.items as Array<Record<string, unknown>>)
        : [],
    [matcherResult],
  );
  const previewContext = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(matchPreview).filter(([, value]) => value !== ""),
      ),
    [matchPreview],
  );
  useEffect(() => {
    if (modal !== "item") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await rpc<{ matched: boolean }>(
          "preview_policy_conditions",
          { p_conditions: generatedCriteria, p_context: previewContext },
        );
        if (!cancelled) setPreviewMatches(result.matched);
      } catch {
        if (!cancelled) setPreviewMatches(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [generatedCriteria, previewContext, modal]);

  function toggleStepOutcome(outcome: string) {
    const exists = selectedStepOutcomes.includes(outcome);
    const next = exists
      ? selectedStepOutcomes.filter((item) => item !== outcome)
      : [...selectedStepOutcomes, outcome];
    setStepForm({ ...stepForm, outcomes: next.join(",") });
  }

  async function execute<T>(action: () => Promise<T>, success?: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (success) setNotice({ kind: "success", text: success });
      return result;
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر تنفيذ العملية.",
        detail: (error as Error & { detail?: string }).detail,
      });
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function refreshPolicies(selectId?: string) {
    const result = await rpc<{ items: Policy[] }>("admin_search_policies", {
      p_query: null,
      p_status: null,
      p_limit: 100,
      p_offset: 0,
    });
    setPolicies(result.items);
    if (selectId) await openPolicy(selectId);
  }
  async function openPolicy(id: string) {
    const result = await execute(() =>
      rpc<Policy>("admin_get_policy_detail", { p_policy_id: id }),
    );
    if (result) {
      setDetail(result);
      setSelectedVersionId(result.versions?.[0]?.id ?? null);
      if (!workflows.length) void loadWorkflows();
    }
  }
  async function loadReferences() {
    if (references.units.length) return;
    const result = await execute(() =>
      Promise.all([
        rpc<{ items: ReferenceOption[] }>("admin_list_governance_units", {
          p_query: null,
          p_status: "active",
          p_unit_type_id: null,
          p_governance_class_id: null,
          p_parent_unit_id: null,
          p_limit: 100,
          p_offset: 0,
        }),
        rpc<{ items: ReferenceOption[] }>(
          "admin_list_governance_unit_classes",
          { p_query: null, p_is_active: true, p_limit: 100, p_offset: 0 },
        ),
        rpc<{ items: ReferenceOption[] }>("admin_list_topic_categories", {
          p_query: null,
          p_is_active: true,
          p_limit: 100,
          p_offset: 0,
        }),
      ]),
    );
    if (!result) return;
    const [units, classes, categories] = result;
    setReferences({
      units: units.items,
      classes: classes.items,
      categories: categories.items,
    });
  }
  async function loadWorkflows() {
    const result = await execute(() =>
      rpc<unknown>("admin_list_workflow_templates"),
    );
    if (result) setWorkflows(workflowTemplatesFromResponse(result));
  }
  async function changeTab(next: typeof tab) {
    setTab(next);
    setNotice(null);
    if (
      next === "workflows" ||
      next === "matcher" ||
      next === "exceptions" ||
      next === "classes" ||
      next === "categories"
    )
      await loadReferences();
    if (next === "workflows" || next === "matcher" || next === "exceptions")
      await loadWorkflows();
    if (next === "exceptions") {
      setBusy(true);
      try {
        const result = await Promise.allSettled([
          rpc<{ items: GovernanceException[] }>(
            "admin_list_governance_exceptions",
            {
              p_status: null,
              p_limit: 100,
              p_offset: 0,
            },
          ),
          rpc<{ items: TopicCustomRouteDraft[] }>(
            "admin_list_topic_custom_route_drafts",
            {
              p_status: null,
              p_limit: 100,
              p_offset: 0,
            },
          ),
          rpc<{ items: TopicPriorRouteRequest[] }>(
            "admin_list_topic_prior_route_requests",
            {
              p_status: null,
            },
          ),
        ]);
        if (result[0].status === "fulfilled")
          setExceptions(result[0].value.items);
        if (result[1].status === "fulfilled")
          setCustomRouteDrafts(result[1].value.items);
        if (result[2].status === "fulfilled")
          setPriorRouteRequests(result[2].value.items);

        const failed = result.filter(
          (item): item is PromiseRejectedResult => item.status === "rejected",
        );
        if (failed.length) {
          const firstError = failed[0].reason;
          setNotice({
            kind: "error",
            text:
              firstError instanceof Error
                ? firstError.message
                : "تعذر تحميل بعض قوائم المراجعة.",
          });
        }
      } finally {
        setBusy(false);
      }
    }
  }

  async function saveGovernanceClass() {
    await execute(async () => {
      await rpc("admin_create_governance_unit_class", {
        p_code: classForm.code.trim().toLowerCase(),
        p_name_ar: classForm.name_ar,
        p_name_en: classForm.name_en || null,
        p_governance_level: classForm.level,
        p_description: classForm.description || null,
      });
      setReferences({ units: [], classes: [], categories: [] });
      await loadReferences();
      closeModal();
    }, "تم إنشاء تصنيف المجلس بنجاح.");
  }

  async function saveTopicCategory() {
    await execute(async () => {
      await rpc("admin_create_topic_category", {
        p_code: categoryForm.code.trim().toLowerCase(),
        p_name_ar: categoryForm.name_ar,
        p_name_en: categoryForm.name_en || null,
        p_description: categoryForm.description || null,
      });
      setReferences({ units: [], classes: [], categories: [] });
      await loadReferences();
      closeModal();
    }, "تم إنشاء فئة الموضوعات بنجاح.");
  }

  function closeModal() {
    setModal(null);
    setEditingItem(null);
    setEditingStepId(null);
    setPolicyClientRequestId(null);
  }
  async function openItemEditor(item: PolicyItem) {
    await loadReferences();
    await loadWorkflows();
    const parsed = readVisualCriteria(item.match_criteria ?? {});
    setEditingItem(item);
    setItemForm({
      code: item.item_code,
      title: item.title_ar,
      body: item.body_text ?? "",
      type: item.item_type,
      mode: item.governance_mode,
      category: item.topic_category_id ?? "",
      workflow: item.workflow_template_version_id ?? "",
      sort: String(item.sort_order),
    });
    setMatchMode(parsed.mode);
    setMatchConditions(parsed.conditions);
    setModal("item");
  }
  async function openReadinessAction(action: string) {
    if (action === "review" && selectedVersion?.legal_status === "draft") {
      setModal("review");
      return;
    }
    if (
      action === "approve" &&
      selectedVersion?.legal_status === "under_review"
    ) {
      setModal("approve");
      return;
    }
    if (action === "activate" && selectedVersion?.legal_status === "approved") {
      if (!canActivatePolicy) {
        setNotice({
          kind: "error",
          text: `لا يمكن التفعيل الآن. المتبقي: ${activationBlockers
            .filter((check) => !check.done)
            .map((check) => check.label)
            .join("، ")}.`,
        });
        return;
      }
      setModal("activate");
      return;
    }
    if (action === "workflow") {
      const missingWorkflowItem = requiredPolicyItems.find(
        (item) => !item.workflow_template_version_id,
      );
      if (missingWorkflowItem) {
        await openItemEditor(missingWorkflowItem);
        return;
      }
      await changeTab("workflows");
      return;
    }
    if (action === "matcher") {
      await changeTab("matcher");
      return;
    }
    if (action === "policy" && detail) {
      setEditingPolicy(detail);
      setPolicyForm({
        code: detail.code,
        name_ar: detail.name_ar,
        name_en: detail.name_en ?? "",
        policy_type: detail.policy_type,
        description: detail.description ?? "",
        status: detail.status,
      });
      setModal("policy");
      return;
    }
    if (action === "version") {
      setVersionForm({ label: "", summary: "" });
      setModal("version");
      return;
    }
    await loadReferences();
    if (action === "item") {
      await loadWorkflows();
      setItemForm({
        code: "",
        title: "",
        body: "",
        type: "article",
        mode: "regulation_required",
        category: "",
        workflow: "",
        sort: "10",
      });
      setMatchMode("all");
      setMatchConditions([
        newMatchCondition("request_type"),
        newMatchCondition("academic_level"),
        newMatchCondition("source_type"),
      ]);
      setModal("item");
    }
    if (action === "scope") setModal("scope");
  }

  async function savePolicy() {
    const normalizedCode = policyForm.code.trim().toLowerCase();
    if (!editingPolicy && !/^[a-z][a-z0-9_.-]*$/.test(normalizedCode)) {
      setNotice({
        kind: "error",
        text: "رمز اللائحة يجب أن يبدأ بحرف إنجليزي صغير، ويقبل الأرقام والشرطات والنقاط فقط.",
        detail: "مثال صحيح: academic-regulation-2026",
      });
      return;
    }
    if (!policyForm.name_ar.trim()) {
      setNotice({
        kind: "error",
        text: "أدخل اسم اللائحة باللغة العربية قبل الحفظ.",
      });
      return;
    }
    const contract = editingPolicy
      ? "admin_update_policy"
      : "admin_create_policy_idempotent";
    const clientRequestId = policyClientRequestId ?? crypto.randomUUID();
    if (!editingPolicy) setPolicyClientRequestId(clientRequestId);
    const params = editingPolicy
      ? {
          p_policy_id: editingPolicy.id,
          p_name_ar: policyForm.name_ar,
          p_name_en: policyForm.name_en || null,
          p_description: policyForm.description || null,
          p_owner_user_id: editingPolicy.owner_user_id ?? null,
          p_status: policyForm.status,
        }
      : {
          p_code: normalizedCode,
          p_name_ar: policyForm.name_ar.trim(),
          p_name_en: policyForm.name_en || null,
          p_policy_type: policyForm.policy_type,
          p_description: policyForm.description || null,
          p_owner_user_id: null,
          p_client_request_id: clientRequestId,
        };
    const result = await execute(
      () => rpc<{ id: string }>(contract, params),
      "تم حفظ بيانات اللائحة.",
    );
    if (result) {
      setPolicyClientRequestId(null);
      closeModal();
      await refreshPolicies(result.id);
    }
  }
  async function createVersion() {
    if (!detail) return;
    const result = await execute(
      () =>
        rpc<{ id: string }>("admin_create_policy_version", {
          p_policy_id: detail.id,
          p_version_label: versionForm.label || null,
          p_change_summary: versionForm.summary || null,
        }),
      "تم إنشاء مسودة إصدار جديدة.",
    );
    if (result) {
      closeModal();
      await openPolicy(detail.id);
      setSelectedVersionId(result.id);
    }
  }
  async function saveItem() {
    if (!selectedVersion) return;
    if (!editingItem && !/^[A-Za-z0-9_.-]+$/.test(itemForm.code.trim())) {
      setNotice({
        kind: "error",
        text: "رمز البند يجب أن يحتوي أحرفًا وأرقامًا إنجليزية وشرطات أو نقاط فقط.",
      });
      return;
    }
    if (
      !itemForm.title.trim() ||
      !Number.isInteger(Number(itemForm.sort)) ||
      Number(itemForm.sort) < 1
    ) {
      setNotice({
        kind: "error",
        text: "أدخل عنوان البند وترتيبًا رقميًا أكبر من صفر.",
      });
      return;
    }
    if (itemForm.mode === "regulation_required" && !itemForm.workflow) {
      setNotice({
        kind: "error",
        text: "البند الإلزامي يحتاج قالب مسار فعالًا قبل حفظه.",
      });
      return;
    }
    const criteria: Record<string, unknown> = generatedCriteria;
    const contract = editingItem
      ? "admin_update_policy_item"
      : "admin_add_policy_item";
    const params = editingItem
      ? {
          p_policy_item_id: editingItem.id,
          p_title_ar: itemForm.title,
          p_title_en: null,
          p_body_text: itemForm.body || null,
          p_sort_order: Number(itemForm.sort),
          p_governance_mode: itemForm.mode,
          p_topic_category_id: itemForm.category || null,
          p_match_criteria: criteria,
          p_workflow_template_version_id: itemForm.workflow || null,
          p_is_active: true,
        }
      : {
          p_policy_version_id: selectedVersion.id,
          p_item_code: itemForm.code,
          p_title_ar: itemForm.title,
          p_sort_order: Number(itemForm.sort),
          p_parent_item_id: null,
          p_item_type: itemForm.type,
          p_title_en: null,
          p_body_text: itemForm.body || null,
          p_governance_mode: itemForm.mode,
          p_topic_category_id: itemForm.category || null,
          p_match_criteria: criteria,
          p_workflow_template_version_id: itemForm.workflow || null,
        };
    const result = await execute(
      () => rpc(contract, params),
      "تم حفظ بند اللائحة.",
    );
    if (result && detail) {
      closeModal();
      await openPolicy(detail.id);
    }
  }
  async function addScope() {
    if (!selectedVersion) return;
    if (
      scopeForm.type !== "organization" &&
      !scopeForm.target &&
      scopeForm.type !== "governance_level"
    ) {
      setNotice({
        kind: "error",
        text: "اختر الجهة أو التصنيف المناسب لنطاق السريان.",
      });
      return;
    }
    if (
      !Number.isInteger(Number(scopeForm.priority)) ||
      Number(scopeForm.priority) < 0 ||
      (scopeForm.to && (!scopeForm.from || scopeForm.to < scopeForm.from))
    ) {
      setNotice({
        kind: "error",
        text: "تحقق من الأولوية وتواريخ السريان؛ تاريخ النهاية يجب أن يكون بعد البداية.",
      });
      return;
    }
    const result = await execute(
      () =>
        rpc("admin_set_policy_scope", {
          p_policy_version_id: selectedVersion.id,
          p_scope_type: scopeForm.type,
          p_target_id: scopeForm.target || null,
          p_governance_level: scopeForm.level || null,
          p_include_descendants: scopeForm.descendants,
          p_priority: Number(scopeForm.priority),
          p_valid_from: scopeForm.from || null,
          p_valid_to: scopeForm.to || null,
        }),
      "تمت إضافة نطاق السريان.",
    );
    if (result && detail) {
      closeModal();
      await openPolicy(detail.id);
    }
  }
  async function removeRecord(
    contract: string,
    params: Record<string, unknown>,
    message: string,
  ) {
    if (!confirm("هل أنت متأكد من تنفيذ الحذف؟")) return;
    const result = await execute(() => rpc(contract, params), message);
    if (result && detail) await openPolicy(detail.id);
  }
  async function lifecycle(
    contract: string,
    params: Record<string, unknown>,
    message: string,
  ) {
    if (!selectedVersion) return;
    const result = await execute(
      () =>
        rpc(contract, { p_policy_version_id: selectedVersion.id, ...params }),
      message,
    );
    if (result && detail) {
      closeModal();
      await openPolicy(detail.id);
    }
  }
  async function submitForReview() {
    if (!canSubmitForReview) {
      setNotice({
        kind: "error",
        text: `لا يمكن إرسال الإصدار للمراجعة قبل اكتمال: ${blockingReviewChecks.map((check) => check.label).join("، ")}.`,
      });
      closeModal();
      return;
    }
    await lifecycle(
      "admin_submit_policy_for_review",
      {},
      "تم إرسال الإصدار للمراجعة المستقلة.",
    );
  }
  async function createWorkflow() {
    if (
      !/^[a-z][a-z0-9_.-]*$/.test(workflowForm.code.trim()) ||
      !workflowForm.name.trim()
    ) {
      setNotice({
        kind: "error",
        text: "أدخل رمز قالب إنجليزيًا صحيحًا واسمًا عربيًا للمسار.",
      });
      return;
    }
    const result = await execute(
      () =>
        rpc("admin_create_workflow_template", {
          p_code: workflowForm.code,
          p_name_ar: workflowForm.name,
          p_name_en: null,
          p_description: workflowForm.description || null,
        }),
      "تم إنشاء قالب المسار.",
    );
    if (result) {
      closeModal();
      await loadWorkflows();
    }
  }
  async function addStep() {
    const version = selectedWorkflow?.versions[0];
    if (!version) return;
    const outcomes = stepForm.outcomes
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      !/^[a-z][a-z0-9_.-]*$/.test(stepForm.code.trim()) ||
      !stepForm.name.trim() ||
      !Number.isInteger(Number(stepForm.sequence)) ||
      Number(stepForm.sequence) < 1
    ) {
      setNotice({
        kind: "error",
        text: "تحقق من رمز الخطوة واسمها وترتيبها الرقمي.",
      });
      return;
    }
    if (Boolean(stepForm.unit) === Boolean(stepForm.classId)) {
      setNotice({
        kind: "error",
        text: "اختر مجلسًا محددًا أو تصنيف مجلس واحدًا فقط للخطوة.",
      });
      return;
    }
    if (!outcomes.length) {
      setNotice({ kind: "error", text: "اختر نتيجة واحدة على الأقل للخطوة." });
      return;
    }
    const contract = editingStepId
      ? "admin_update_workflow_step"
      : "admin_add_workflow_step";
    const params = editingStepId
      ? {
          p_step_id: editingStepId,
          p_name_ar: stepForm.name,
          p_sequence_no: Number(stepForm.sequence),
          p_responsibility: stepForm.responsibility,
          p_governance_unit_id: stepForm.unit || null,
          p_governance_class_id: stepForm.classId || null,
          p_required_permission_code: stepForm.permission || null,
          p_is_initial: stepForm.initial,
          p_is_terminal: stepForm.terminal,
          p_entry_conditions: {},
          p_exit_conditions: {},
          p_allowed_outcomes: outcomes,
        }
      : {
          p_workflow_template_version_id: version.id,
          p_step_code: stepForm.code,
          p_name_ar: stepForm.name,
          p_sequence_no: Number(stepForm.sequence),
          p_step_type: stepForm.type,
          p_responsibility: stepForm.responsibility,
          p_governance_unit_id: stepForm.unit || null,
          p_governance_class_id: stepForm.classId || null,
          p_required_permission_code: stepForm.permission || null,
          p_is_initial: stepForm.initial,
          p_is_terminal: stepForm.terminal,
          p_entry_conditions: {},
          p_exit_conditions: {},
          p_allowed_outcomes: outcomes,
        };
    const result = await execute(
      () => rpc(contract, params),
      editingStepId ? "تم تحديث خطوة المسار." : "تمت إضافة خطوة المسار.",
    );
    if (result) {
      closeModal();
      await loadWorkflows();
      setSelectedWorkflow(null);
    }
  }
  async function addTransition() {
    const version = selectedWorkflow?.versions[0];
    if (!version) return;
    const result = await execute(
      () =>
        rpc("admin_add_workflow_transition", {
          p_workflow_template_version_id: version.id,
          p_from_step_id: transitionForm.from,
          p_outcome_code: transitionForm.outcome,
          p_to_step_id: transitionForm.to || null,
          p_transition_type: transitionForm.type,
          p_conditions: {},
        }),
      "تم ربط الانتقال.",
    );
    if (result) {
      closeModal();
      await loadWorkflows();
      setSelectedWorkflow(null);
    }
  }
  async function runMatcher() {
    const result = await execute(() =>
      rpc<Record<string, unknown>>("get_topic_regulation_options", {
        p_governance_unit_id: matcherForm.unit,
        p_topic_category_id: matcherForm.category,
        p_priority: matcherForm.priority,
        p_source_type: matcherForm.source,
        p_effective_on: matcherForm.date,
      }),
    );
    if (result) setMatcherResult(result);
  }
  async function requestException() {
    const contract =
      exceptionForm.type === "custom"
        ? "request_custom_workflow"
        : "request_workflow_exception";
    const result = await execute(
      () =>
        rpc(contract, {
          p_topic_id: exceptionForm.topic,
          p_workflow_template_version_id: exceptionForm.workflow,
          p_reason: exceptionForm.reason,
          p_valid_until: exceptionForm.until,
        }),
      "تم إرسال طلب الاستثناء للمراجعة المستقلة.",
    );
    if (result) {
      closeModal();
      await changeTab("exceptions");
    }
  }
  async function reviewException(item: GovernanceException, approve: boolean) {
    const contract =
      item.exception_type === "custom"
        ? "approve_custom_workflow"
        : "approve_workflow_exception";
    const result = await execute(
      () =>
        rpc(contract, {
          p_exception_id: item.id,
          p_approve: approve,
          p_review_comment: approve
            ? "تمت المراجعة والموافقة."
            : "تم الرفض بعد المراجعة.",
        }),
      approve ? "تم اعتماد الاستثناء." : "تم رفض الاستثناء.",
    );
    if (result) await changeTab("exceptions");
  }

  async function reviewCustomRouteDraft(
    item: TopicCustomRouteDraft,
    approve: boolean,
  ) {
    const result = await execute(
      () =>
        rpc("approve_topic_custom_route_draft", {
          p_custom_route_draft_id: item.id,
          p_approve: approve,
          p_review_comment: approve
            ? "تمت مراجعة مراحل المسار المخصص واعتمادها."
            : "تم رفض المسار المخصص بعد المراجعة.",
        }),
      approve
        ? "تم اعتماد المسار المخصص وبدء تنفيذه."
        : "تم رفض المسار المخصص.",
    );
    if (result) await changeTab("exceptions");
  }

  async function reviewPriorRouteRequest(
    item: TopicPriorRouteRequest,
    approve: boolean,
  ) {
    const comment = priorRouteReviewComments[item.id]?.trim() ?? "";
    if (comment.length < 5) {
      setNotice({
        kind: "error",
        text: "اكتب ملاحظة مراجعة واضحة قبل اعتماد الأدلة أو رفضها.",
      });
      return;
    }
    const result = await execute(
      () =>
        rpc("review_topic_prior_route_request", {
          p_request_id: item.id,
          p_action: approve ? "approve" : "reject",
          p_comment: comment,
        }),
      approve
        ? "تم اعتماد الأدلة وتفعيل أول مجلس متبقٍ."
        : "تم رفض إثبات المسار السابق.",
    );
    if (result) await changeTab("exceptions");
  }

  async function importPolicyBundle() {
    let bundle: Record<string, unknown>;
    try {
      bundle = JSON.parse(bundleJsonText) as Record<string, unknown>;
    } catch {
      setNotice({ kind: "error", text: "الملف المدخل ليس JSON صالحًا." });
      return;
    }
    const result = await execute(
      () =>
        rpc<{
          policy_id: string;
          items_count: number;
          scopes_count: number;
          workflows_count: number;
        }>("admin_import_policy_bundle", {
          p_bundle: bundle,
          p_client_request_id: crypto.randomUUID(),
        }),
      "تم استيراد الحزمة كاملة داخل معاملة واحدة.",
    );
    if (result) router.push(`/admin/regulations/${result.policy_id}`);
  }

  return (
    <div className="min-w-0 bg-q-bg py-5">
      <div className="space-y-4">
        {notice && (
          <div
            className={`flex items-start gap-3 rounded-q-control border p-4 text-q-caption  ${notice.kind === "success" ? "border-q-border bg-q-success-soft text-q-success" : "border-q-border bg-q-danger-soft text-q-danger"}`}
          >
            <span className="mt-0.5">
              {notice.kind === "success" ? (
                <Check size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
            </span>
            <div>
              <strong>{notice.text}</strong>
              {notice.detail && (
                <details className="mt-2 text-q-caption opacity-80">
                  <summary className="min-h-11 content-center">تفاصيل تقنية</summary>
                  <p dir="ltr" className="mt-1 break-all">
                    {notice.detail}
                  </p>
                </details>
              )}
            </div>
          </div>
        )}

        <div className="min-w-0">
          <PageHeader title="اللوائح والمسارات" description="مساحة تشغيل واحدة لإعداد اللائحة، ضبط نطاقها، ربط البنود بمسار الاعتماد، ثم اختبار المطابقة قبل التفعيل." actions={<div className="flex flex-wrap gap-2">
              {busy && (
                <span className="flex h-9 items-center gap-2 rounded-q-control border border-q-border bg-q-bg px-3 text-q-caption font-bold text-q-primary">
                  <LoaderCircle className="animate-spin" size={14} /> جار
                  التنفيذ
                </span>
              )}
              {tab === "policies" && (
                <>
                  <QButton type="submit" variant="ghost"
                    onClick={() => {
                      setEditingPolicy(null);
                      setPolicyForm({
                        code: "",
                        name_ar: "",
                        name_en: "",
                        policy_type: "regulation",
                        description: "",
                        status: "active",
                      });
                      setModal("policy");
                    }}
                    className="min-w-11 flex min-h-11 items-center justify-center gap-2 rounded-q-control bg-q-primary px-4 text-q-ui font-bold text-q-on-primary "
                  >
                    <CirclePlus size={15} />
                    إنشاء لائحة
                  </QButton>
                  <QButton type="submit" variant="ghost"
                    onClick={() => {
                      setBundleJsonText("");
                      setModal("import_bundle");
                    }}
                    className="min-w-11 flex min-h-11 items-center justify-center gap-2 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-bold text-q-text-2 hover:border-q-primary hover:text-q-primary"
                  >
                    <FileJson size={15} />
                    استيراد حزمة JSON
                  </QButton>
                </>
              )}
              {tab === "classes" && (
                <QButton type="submit" variant="ghost"
                  onClick={() => {
                    setClassForm({
                      code: "",
                      name_ar: "",
                      name_en: "",
                      level: "department",
                      description: "",
                    });
                    setModal("class");
                  }}
                  className="min-w-11 flex min-h-11 items-center justify-center gap-2 rounded-q-control bg-q-primary px-4 text-q-ui font-bold text-q-on-primary "
                >
                  <Plus size={15} />
                  تصنيف جديد
                </QButton>
              )}
              {tab === "categories" && (
                <QButton type="submit" variant="ghost"
                  onClick={() => {
                    setCategoryForm({
                      code: "",
                      name_ar: "",
                      name_en: "",
                      description: "",
                    });
                    setModal("category");
                  }}
                  className="min-w-11 flex min-h-11 items-center justify-center gap-2 rounded-q-control bg-q-primary px-4 text-q-ui font-bold text-q-on-primary "
                >
                  <Plus size={15} />
                  فئة جديدة
                </QButton>
              )}
            </div>} />
          <nav className="hidden">
            {(
              [
                [
                  "policies",
                  "اللوائح",
                  "إدارة البنود والنطاقات",
                  BookOpenCheck,
                ],
                [
                  "classes",
                  "تصنيفات المجالس",
                  "أنواع ومستويات المجالس",
                  Building2,
                ],
                ["categories", "فئات الموضوعات", "التصنيفات الأكاديمية", Tags],
                ["workflows", "مصمم المسارات", "تصميم رحلة الاعتماد", Workflow],
                [
                  "matcher",
                  "اختبار المطابقة",
                  "تجربة المحرك قبل التشغيل",
                  FlaskConical,
                ],
                [
                  "exceptions",
                  "الاستثناءات",
                  "طلبات مؤقتة ومراجعة",
                  ShieldCheck,
                ],
              ] as const
            ).map(([key, label, description, Icon]) => (
              <QButton type="submit" variant="ghost"
                key={key}
                onClick={() => changeTab(key)}
                className={`min-w-11 flex items-center gap-2 rounded-q-control border p-2.5 text-right transition ${tab === key ? "border-q-primary bg-q-primary text-q-on-primary " : "border-q-border bg-q-bg text-q-text-2 hover:border-q-primary hover:bg-q-surface"}`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-q-control ${tab === key ? "bg-q-surface/15" : "bg-q-surface text-q-primary"}`}
                >
                  <Icon size={16} />
                </span>
                <span>
                  <strong className="block text-q-caption">{label}</strong>
                  <span
                    className={`mt-0.5 block text-q-caption ${tab === key ? "text-q-on-primary/75" : "text-q-text-3"}`}
                  >
                    {description}
                  </span>
                </span>
              </QButton>
            ))}
          </nav>
        </div>

        <div className="grid items-start gap-4 2xl:grid-cols-[230px_minmax(0,1fr)]">
          <RegulationsNavigation active={tab} onChange={changeTab} />
          <div className="min-w-0">
            {tab === "policies" && (
              <div className="grid gap-4">
                <section className="overflow-hidden rounded-q-control border border-q-border bg-q-surface ">
                  <div className="border-b border-q-border p-3">
                    <div className="relative">
                      <Search
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-q-text-3"
                        size={15}
                      />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="ابحث بالاسم أو الرمز"
                        className={`${input} pr-10`}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-q-caption">
                      <div className="rounded-q-control bg-q-surface-2 p-1.5">
                        <strong className="block text-q-caption text-q-text">
                          {policies.length}
                        </strong>
                        <span className="text-q-text-3">لائحة</span>
                      </div>
                      <div className="rounded-q-control bg-q-surface-2 p-1.5">
                        <strong className="block text-q-caption text-q-text">
                          {policies.reduce(
                            (sum, policy) => sum + (policy.version_count ?? 0),
                            0,
                          )}
                        </strong>
                        <span className="text-q-text-3">إصدار</span>
                      </div>
                      <div className="rounded-q-control bg-q-surface-2 p-1.5">
                        <strong className="block text-q-caption text-q-link">
                          {visible.length}
                        </strong>
                        <span className="text-q-link">نتيجة</span>
                      </div>
                    </div>
                  </div>
                  <div className="min-h-[470px] overflow-x-auto">
                    <table className="w-full min-w-[820px] table-fixed text-right">
                      <thead className="border-b border-q-border bg-q-surface text-q-caption font-bold text-q-text-3">
                        <tr>
                          <th className="w-[34%] px-4 py-3">اللائحة</th>
                          <th className="w-[16%] px-4 py-3">النوع</th>
                          <th className="w-[12%] px-4 py-3">الحالة</th>
                          <th className="w-[12%] px-4 py-3 text-center">
                            الإصدارات
                          </th>
                          <th className="w-[16%] px-4 py-3">آخر تحديث</th>
                          <th className="w-[10%] px-4 py-3 text-center">
                            الإجراء
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-q-surface-2">
                        {visible.map((p) => (
                          <tr
                            key={p.id}
                            className="group transition hover:bg-q-bg"
                          >
                            <td className="px-4 py-3.5">
                              <Link
                                href={`/admin/regulations/${p.id}`}
                                className="inline-flex min-h-11 min-w-11 items-center flex min-w-0 items-center gap-3 rounded-q-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-q-primary"
                              >
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-q-control bg-q-surface-2 text-q-primary transition group-hover:bg-q-primary group-hover:text-q-on-primary">
                                  <BookOpenCheck size={16} />
                                </span>
                                <span className="min-w-0">
                                  <strong className="block truncate text-q-caption text-q-text group-hover:text-q-primary">
                                    {p.name_ar}
                                  </strong>
                                  <span
                                    className="mt-1 block truncate font-mono text-q-caption text-q-text-3"
                                    dir="ltr"
                                  >
                                    {p.code}
                                  </span>
                                </span>
                              </Link>
                            </td>
                            <td className="px-4 py-3.5 text-q-caption font-bold text-q-text-2">
                              {typeLabels[p.policy_type] ?? p.policy_type}
                            </td>
                            <td className="px-4 py-3.5">
                              <Badge value={p.status} />
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <strong className="inline-flex min-w-8 justify-center rounded-q-control bg-q-surface-2 px-2 py-1 text-q-caption text-q-text-2">
                                {p.version_count ?? 0}
                              </strong>
                            </td>
                            <td className="px-4 py-3.5 text-q-caption text-q-text-3">
                              {p.updated_at
                                ? new Date(p.updated_at).toLocaleDateString(
                                    "ar-SA-u-nu-latn",
                                  )
                                : "—"}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <Link
                                href={`/admin/regulations/${p.id}`}
                                aria-label={`فتح سجل اللائحة ${p.code}`}
                                className="inline-flex min-h-11 min-w-11 items-center inline-flex min-h-11 items-center gap-1.5 rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption font-bold text-q-primary transition hover:border-q-primary hover:bg-q-surface-2"
                              >
                                فتح <ChevronLeft size={12} />
                              </Link>
                            </td>
                          </tr>
                        ))}
                        {!visible.length && (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-16 text-center text-q-caption text-q-text-3"
                            >
                              لا توجد لوائح مطابقة لعبارة البحث.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {legacyInlineDetailEnabled && detail && (
                  <section>
                    {!detail ? (
                      <div className="grid min-h-[640px] place-items-center p-8 text-center">
                        <div>
                          <Layers3
                            className="mx-auto text-q-text-3"
                            size={34}
                          />
                          <h2 className="mt-3 text-q-ui font-bold text-q-text">
                            اختر لائحة لعرض مساحة العمل
                          </h2>
                          <p className="mt-2 text-q-caption text-q-text-3">
                            ستظهر دورة الإصدار والبنود والنطاقات وخطوة الاعتماد
                            هنا.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-4 border-b border-q-surface-2 bg-q-bg p-4 xl:grid-cols-[1fr_auto] xl:items-start">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-q-body font-bold text-q-text">
                                {detail.name_ar}
                              </h2>
                              <Badge value={detail.status} />
                            </div>
                            <p className="mt-0.5 text-q-caption text-q-text-3">
                              {detail.code} ·{" "}
                              {typeLabels[detail.policy_type] ??
                                detail.policy_type}
                            </p>
                            <p className="mt-2 max-w-5xl text-q-caption leading-5 text-q-text-2">
                              {detail.description || "لا يوجد وصف."}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/admin/regulations/${detail.id}`}
                              className="inline-flex min-h-11 min-w-11 items-center flex min-h-11 items-center gap-2 rounded-q-control bg-q-primary px-3 text-q-caption font-bold text-q-on-primary"
                            >
                              <BookOpenCheck size={13} />
                              فتح صفحة اللائحة
                            </Link>
                            <QButton type="submit" variant="ghost"
                              onClick={() => {
                                setEditingPolicy(detail);
                                setPolicyForm({
                                  code: detail.code,
                                  name_ar: detail.name_ar,
                                  name_en: detail.name_en ?? "",
                                  policy_type: detail.policy_type,
                                  description: detail.description ?? "",
                                  status: detail.status,
                                });
                                setModal("policy");
                              }}
                              className="min-w-11 flex min-h-11 items-center gap-2 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-bold text-q-text-2 hover:border-q-primary hover:text-q-primary"
                            >
                              <Pencil size={13} />
                              تعديل بيانات اللائحة
                            </QButton>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 border-b border-q-surface-2 p-3">
                          <span className="text-q-caption font-bold text-q-text-3">
                            الإصدارات:
                          </span>
                          {detail.versions?.map((v) => (
                            <QButton type="submit" variant="ghost"
                              key={v.id}
                              onClick={() => setSelectedVersionId(v.id)}
                              className={`min-w-11 rounded-q-control px-2.5 py-1.5 text-q-ui font-bold ${selectedVersion?.id === v.id ? "bg-q-text text-q-on-primary" : "bg-q-surface-2 text-q-text-2 hover:bg-q-surface-2"}`}
                            >
                              v{v.version_label || v.version_no} ·{" "}
                              {legalLabels[v.legal_status]}
                            </QButton>
                          ))}
                          <QButton type="submit" variant="ghost"
                            onClick={() => {
                              setVersionForm({ label: "", summary: "" });
                              setModal("version");
                            }}
                            className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control border border-dashed border-q-primary bg-q-surface text-q-primary"
                            aria-label="إصدار جديد"
                          >
                            <Plus size={13} />
                          </QButton>
                        </div>

                        {selectedVersion && (
                          <div className="p-3">
                            <QCard className="p-0 mb-3 flex flex-wrap items-center gap-3 rounded-q-control border border-q-border bg-q-bg px-3 py-2 text-q-caption text-q-text-2">
                              <span className="flex items-center gap-2">
                                <span>مرحلة الإصدار</span>
                                <Badge value={selectedVersion.legal_status} />
                              </span>
                              <span className="h-4 w-px bg-q-surface-2" />
                              <span className="flex min-w-[220px] items-center gap-2">
                                <span>الجاهزية</span>
                                <strong className="text-q-text">
                                  {automationLabels[
                                    selectedVersion.automation_status
                                  ] ?? selectedVersion.automation_status}{" "}
                                  ·{" "}
                                  {selectedVersion.readiness_percent ??
                                    selectedVersion.automation_readiness_pct ??
                                    0}
                                  %
                                </strong>
                                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-q-surface-2">
                                  <span
                                    className="block h-full rounded-full bg-q-primary"
                                    style={{
                                      width: `${selectedVersion.readiness_percent ?? selectedVersion.automation_readiness_pct ?? 0}%`,
                                    }}
                                  />
                                </span>
                              </span>
                              <span className="h-4 w-px bg-q-surface-2" />
                              <span>
                                السريان:{" "}
                                <strong className="text-q-text">
                                  {selectedVersion.effective_from ||
                                    "لم يبدأ بعد"}{" "}
                                  —{" "}
                                  {selectedVersion.effective_to ||
                                    "مفتوح دون نهاية"}
                                </strong>
                              </span>
                            </QCard>

                            <ApprovalChain
                              steps={lifecycleSteps.map((step, index) => ({
                                label: step.label,
                                description: step.done
                                  ? "مكتملة ويمكن مراجعتها"
                                  : index ===
                                      lifecycleSteps.findIndex(
                                        (item) => !item.done,
                                      )
                                    ? "تحتاج إجراء الآن"
                                    : "تُفتح بعد اكتمال المرحلة السابقة",
                                done: step.done,
                                locked:
                                  index >
                                  lifecycleSteps.findIndex(
                                    (item) => !item.done,
                                  ) +
                                    1,
                              }))}
                              onSelect={(index) => {
                                const step = lifecycleSteps[index];
                                if (step && !step.done)
                                  openReadinessAction(step.action);
                              }}
                            />

                            <section className="hidden">
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h3 className="text-q-caption font-bold text-q-text">
                                    دورة الاعتماد والتفعيل
                                  </h3>
                                  <p className="mt-0.5 text-q-caption leading-normal text-q-text-3">
                                    مسودة ← إرسال للمراجعة ← اعتماد من مستخدم
                                    آخر ← تفعيل بتاريخ نفاذ ← نافذة.
                                  </p>
                                </div>
                                <Badge value={selectedVersion.legal_status} />
                              </div>
                              <div className="grid gap-1.5 md:grid-cols-5">
                                {approvalFlowSteps.map((step, index) => (
                                  <div
                                    key={step.label}
                                    className={`relative rounded-q-control border px-2.5 py-2 ${step.done ? "border-q-border bg-q-success-soft text-q-success" : step.active ? "border-q-primary bg-q-surface-2 text-q-primary" : "border-q-border bg-q-bg text-q-text-3"}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`grid h-5 w-5 place-items-center rounded-full text-q-caption font-bold ${step.done ? "bg-q-success text-q-on-primary" : step.active ? "bg-q-primary text-q-on-primary" : "bg-q-surface-2 text-q-text-3"}`}
                                      >
                                        {step.done ? (
                                          <Check size={10} />
                                        ) : (
                                          index + 1
                                        )}
                                      </span>
                                      <strong className="text-q-caption leading-normal">
                                        {step.label}
                                      </strong>
                                    </div>
                                    <p className="mt-1 text-q-caption leading-normal opacity-80">
                                      {step.description}
                                    </p>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3 grid gap-2 text-q-caption leading-normal text-q-text-2 lg:grid-cols-4">
                                <span className="rounded-q-control bg-q-bg px-2.5 py-2">
                                  لا يمكن اعتماد الإصدار من نفس المستخدم الذي
                                  أرسله؛ الباكند يرفض العملية تلقائيًا.
                                </span>
                                <span className="rounded-q-control bg-q-bg px-2.5 py-2">
                                  لا يمكن التفعيل إلا بعد الاعتماد.
                                </span>
                                <span className="rounded-q-control bg-q-bg px-2.5 py-2">
                                  لا يمكن التفعيل إذا المسار غير جاهز أو
                                  الجاهزية أقل من 100%.
                                </span>
                                <span className="rounded-q-control bg-q-bg px-2.5 py-2">
                                  لا يمكن تعديل نسخة نافذة؛ أنشئ نسخة جديدة
                                  للتعديل.
                                </span>
                              </div>
                            </section>

                            <section className="hidden">
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h3 className="text-q-caption font-bold text-q-text">
                                    تسلسل إكمال اللائحة
                                  </h3>
                                  <p className="mt-0.5 text-q-caption leading-normal text-q-text-3">
                                    اتبع الخطوات من بيانات اللائحة حتى التفعيل.
                                    كل مرحلة تفتح الإجراء المناسب لها.
                                  </p>
                                </div>
                                <QBadge className="rounded-full bg-q-surface-2 px-2.5 py-1 text-q-caption font-bold text-q-primary">
                                  {
                                    lifecycleSteps.filter((step) => step.done)
                                      .length
                                  }{" "}
                                  من {lifecycleSteps.length}
                                </QBadge>
                              </div>
                              <RegulationWizard
                                steps={lifecycleSteps}
                                onSelect={(index) => {
                                  const step = lifecycleSteps[index];
                                  if (step && !step.done)
                                    openReadinessAction(step.action);
                                }}
                              />
                            </section>

                            {selectedVersion.legal_status === "draft" && (
                              <section className="mb-3 rounded-q-control border border-q-border bg-q-surface px-3 py-2 ">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <h3 className="text-q-caption font-bold text-q-text">
                                      رحلة تجهيز الإصدار
                                    </h3>
                                    <p className="mt-0.5 text-q-caption leading-normal text-q-text-3">
                                      أكمل المتطلبات بالترتيب قبل الإرسال.
                                    </p>
                                  </div>
                                  <QBadge className="rounded-full bg-q-surface-2 px-2.5 py-1 text-q-caption font-bold text-q-primary">
                                    {readinessCompleted} من{" "}
                                    {readinessChecks.length} مكتملة
                                  </QBadge>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {readinessChecks.map((check, index) => (
                                    <QButton variant="ghost"
                                      key={check.label}
                                      type="button"
                                      onClick={() =>
                                        !check.done &&
                                        openReadinessAction(check.action)
                                      }
                                      className={`min-w-11 group flex min-h-11 items-center gap-1.5 rounded-q-control border px-2 text-right transition ${check.done ? "border-q-border bg-q-success-soft text-q-success" : "border-q-border bg-q-bg text-q-text-2 hover:border-q-primary hover:bg-q-surface"}`}
                                    >
                                      <span
                                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-q-caption font-bold ${check.done ? "bg-q-success text-q-on-primary" : "bg-q-surface-2 text-q-primary group-hover:bg-q-primary group-hover:text-q-on-primary"}`}
                                      >
                                        {check.done ? (
                                          <Check size={10} />
                                        ) : (
                                          index + 1
                                        )}
                                      </span>
                                      <span className="text-q-caption font-bold">
                                        {check.label}
                                      </span>
                                    </QButton>
                                  ))}
                                </div>
                                {!canSubmitForReview && (
                                  <QCard className="p-0 mt-2 rounded-q-control border border-q-border bg-q-warning-soft px-3 py-2 text-q-caption leading-5 text-q-warning">
                                    <strong className="block">
                                      الإرسال للمراجعة مغلق مؤقتًا
                                    </strong>
                                    المتبقي:{" "}
                                    {blockingReviewChecks
                                      .map((check) => check.label)
                                      .join("، ") || "لا توجد متطلبات متبقية"}
                                    .
                                  </QCard>
                                )}
                              </section>
                            )}

                            <div className="mb-3 flex flex-wrap justify-end gap-2">
                              {selectedVersion.legal_status === "draft" && (
                                <>
                                  <QButton type="submit" variant="ghost"
                                    disabled={!canSubmitForReview}
                                    onClick={() => setModal("review")}
                                    title={
                                      canSubmitForReview
                                        ? "معاينة الإصدار قبل الإرسال"
                                        : "أكمل متطلبات الجاهزية أولًا"
                                    }
                                    className="min-w-11 flex min-h-11 items-center gap-1.5 rounded-q-control bg-q-primary px-3 text-q-ui font-bold text-q-on-primary disabled:cursor-not-allowed disabled:bg-q-surface-2"
                                  >
                                    <Send size={12} />
                                    معاينة وإرسال للمراجعة
                                  </QButton>
                                  <QButton type="submit" variant="ghost"
                                    onClick={() => openReadinessAction("item")}
                                    className="min-w-11 flex min-h-11 items-center gap-1.5 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-bold text-q-text-2 hover:border-q-primary hover:text-q-primary"
                                  >
                                    <Plus size={12} />
                                    إضافة بند
                                  </QButton>
                                  <QButton type="submit" variant="ghost"
                                    onClick={() => openReadinessAction("scope")}
                                    className="min-w-11 flex min-h-11 items-center gap-1.5 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-bold text-q-text-2 hover:border-q-primary hover:text-q-primary"
                                  >
                                    <Route size={12} />
                                    إضافة نطاق
                                  </QButton>
                                </>
                              )}
                              {selectedVersion.legal_status ===
                                "under_review" && (
                                <QButton type="submit" variant="ghost"
                                  onClick={() => setModal("approve")}
                                  className="min-w-11 flex min-h-11 items-center gap-1.5 rounded-q-control bg-q-success px-3 text-q-ui font-bold text-q-on-primary"
                                >
                                  <ShieldCheck size={12} />
                                  اعتماد من مراجع مستقل
                                </QButton>
                              )}
                              {selectedVersion.legal_status === "approved" && (
                                <QButton type="submit" variant="ghost"
                                  disabled={!canActivatePolicy}
                                  onClick={() =>
                                    canActivatePolicy
                                      ? setModal("activate")
                                      : setNotice({
                                          kind: "error",
                                          text: `لا يمكن التفعيل الآن. المتبقي: ${activationBlockers
                                            .filter((check) => !check.done)
                                            .map((check) => check.label)
                                            .join("، ")}.`,
                                        })
                                  }
                                  title={
                                    canActivatePolicy
                                      ? "تحديد تاريخ النفاذ والتفعيل"
                                      : "لا يمكن التفعيل قبل جاهزية المسار 100%"
                                  }
                                  className="min-w-11 flex min-h-11 items-center gap-1.5 rounded-q-control bg-q-primary px-3 text-q-ui font-bold text-q-on-primary disabled:cursor-not-allowed disabled:bg-q-surface-2"
                                >
                                  <Play size={12} />
                                  تحديد السريان والتفعيل
                                </QButton>
                              )}
                              {selectedVersion.legal_status === "effective" && (
                                <QButton type="submit" variant="ghost"
                                  onClick={() => setModal("suspend")}
                                  className="min-w-11 flex min-h-11 items-center gap-1.5 rounded-q-control bg-q-danger px-3 text-q-ui font-bold text-q-on-primary"
                                >
                                  <AlertCircle size={12} />
                                  تعليق الإصدار النافذ
                                </QButton>
                              )}
                            </div>

                            {!canEditSelectedVersion && (
                              <QCard className="p-0 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-q-control border border-q-border bg-q-bg px-3 py-2 text-q-caption leading-5 text-q-text-2">
                                <span>
                                  <strong className="text-q-text">
                                    هذا الإصدار مقفل للتحرير.
                                  </strong>{" "}
                                  {selectedVersion.legal_status === "effective"
                                    ? "النسخة النافذة لا تُعدّل مباشرة؛ أنشئ نسخة جديدة للتعديل الآمن."
                                    : "بعد الإرسال للمراجعة تصبح التعديلات على البنود والنطاقات مقفلة."}
                                </span>
                                <QButton type="submit" variant="ghost"
                                  onClick={() => {
                                    setVersionForm({ label: "", summary: "" });
                                    setModal("version");
                                  }}
                                  className="min-w-11 min-h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-bold text-q-primary hover:border-q-primary"
                                >
                                  إنشاء نسخة جديدة
                                </QButton>
                              </QCard>
                            )}

                            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
                              <QCard className="p-0 overflow-hidden rounded-q-control border border-q-border bg-q-surface">
                                <div className="flex items-center justify-between border-b border-q-surface-2 bg-q-bg px-3 py-2">
                                  <h3 className="text-q-caption font-bold text-q-text">
                                    بنود اللائحة
                                  </h3>
                                  <span className="text-q-caption font-bold text-q-text-3">
                                    {selectedVersion.items.length} بند
                                  </span>
                                </div>
                                <div className="divide-y divide-q-surface-2">
                                  {selectedVersion.items.map((i) => (
                                    <article
                                      key={i.id}
                                      className="grid gap-2 px-3 py-2.5 lg:grid-cols-[minmax(180px,.8fr)_minmax(240px,1fr)_auto] lg:items-center"
                                    >
                                      <div>
                                        <strong className="text-q-caption text-q-text">
                                          {i.title_ar}
                                        </strong>
                                        <span className="mt-0.5 block text-q-caption text-q-text-3">
                                          {i.item_code} ·{" "}
                                          {governanceModeLabels[
                                            i.governance_mode
                                          ] ?? i.governance_mode}
                                        </span>
                                        <span
                                          className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-q-caption font-bold ${i.workflow_template_version_id ? "bg-q-success-soft text-q-success" : "bg-q-warning-soft text-q-warning"}`}
                                        >
                                          {workflowVersionLabel(
                                            i.workflow_template_version_id,
                                          )}
                                        </span>
                                      </div>
                                      <p className="line-clamp-2 text-q-caption leading-normal text-q-text-2">
                                        {i.body_text || "لا يوجد نص مختصر."}
                                      </p>
                                      {selectedVersion.legal_status ===
                                        "draft" && (
                                        <div className="flex justify-end gap-1">
                                          <QButton type="submit" variant="ghost"
                                            aria-label={`تعديل ${i.title_ar}`}
                                            onClick={() => openItemEditor(i)}
                                            className="min-w-11 rounded-q-control p-1 text-q-primary hover:bg-q-surface-2"
                                          >
                                            <Pencil size={12} />
                                          </QButton>
                                          <QButton type="submit" variant="ghost"
                                            aria-label={`حذف ${i.title_ar}`}
                                            onClick={() =>
                                              removeRecord(
                                                "admin_remove_policy_item",
                                                { p_policy_item_id: i.id },
                                                "تم حذف البند.",
                                              )
                                            }
                                            className="min-w-11 rounded-q-control p-1 text-q-danger hover:bg-q-danger-soft"
                                          >
                                            <X size={12} />
                                          </QButton>
                                        </div>
                                      )}
                                    </article>
                                  ))}
                                  {!selectedVersion.items.length && (
                                    <p className="p-6 text-center text-q-caption text-q-text-3">
                                      لم تُضف بنود بعد.
                                    </p>
                                  )}
                                </div>
                              </QCard>
                              <QCard className="p-0 overflow-hidden rounded-q-control border border-q-border bg-q-surface">
                                <div className="flex items-center justify-between border-b border-q-surface-2 bg-q-bg px-3 py-2">
                                  <h3 className="text-q-caption font-bold text-q-text">
                                    نطاقات السريان
                                  </h3>
                                  <span className="text-q-caption font-bold text-q-text-3">
                                    {selectedVersion.scopes.length} نطاق
                                  </span>
                                </div>
                                <div className="divide-y divide-q-surface-2">
                                  {selectedVersion.scopes.map((s) => (
                                    <article
                                      key={s.id}
                                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                                    >
                                      <div>
                                        <strong className="text-q-caption text-q-text">
                                          {scopeLabels[s.scope_type] ??
                                            s.scope_type}
                                        </strong>
                                        <span className="mt-0.5 block text-q-caption text-q-text-3">
                                          الأولوية {s.priority} ·{" "}
                                          {s.valid_from || "يبدأ فور التفعيل"}
                                        </span>
                                      </div>
                                      {selectedVersion.legal_status ===
                                        "draft" && (
                                        <QButton type="submit" variant="ghost"
                                          aria-label="حذف نطاق السريان"
                                          onClick={() =>
                                            removeRecord(
                                              "admin_remove_policy_scope",
                                              { p_scope_assignment_id: s.id },
                                              "تم حذف النطاق.",
                                            )
                                          }
                                          className="min-w-11 rounded-q-control p-1 text-q-danger hover:bg-q-danger-soft"
                                        >
                                          <X size={12} />
                                        </QButton>
                                      )}
                                    </article>
                                  ))}
                                  {!selectedVersion.scopes.length && (
                                    <p className="p-6 text-center text-q-caption text-q-text-3">
                                      لم تُضف نطاقات بعد.
                                    </p>
                                  )}
                                </div>
                              </QCard>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </section>
                )}
              </div>
            )}

            {tab === "classes" && (
              <section className="rounded-q-control border border-q-border bg-q-surface p-4 ">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-q-surface-2 pb-3">
                  <div>
                    <h2 className="text-q-ui font-bold text-q-text">
                      تصنيفات المجالس واللجان
                    </h2>
                    <p className="mt-1 text-q-caption text-q-text-3">
                      تعريف مستويات الحوكمة وتصنيفات المجالس (قسم، كلية، جامعة،
                      لجنة) وتسكين الوحدات عليها.
                    </p>
                  </div>
                  <QButton type="submit" variant="ghost"
                    onClick={() => {
                      setClassForm({
                        code: "",
                        name_ar: "",
                        name_en: "",
                        level: "department",
                        description: "",
                      });
                      setModal("class");
                    }}
                    className="min-w-11 flex min-h-11 items-center gap-2 rounded-q-control bg-q-primary px-4 text-q-ui font-bold text-q-on-primary"
                  >
                    <Plus size={14} />
                    إضافة تصنيف مجلس
                  </QButton>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {references.classes.map((cls) => (
                    <QCard
                      key={cls.id}
                      className="p-0 rounded-q-control border border-q-border bg-q-bg p-4 "
                    >
                      <div className="flex items-center justify-between">
                        <span className="grid h-8 w-8 place-items-center rounded-q-control bg-q-surface-2 text-q-primary">
                          <Building2 size={16} />
                        </span>
                        <QBadge className="rounded-full bg-q-success-soft px-2.5 py-0.5 text-q-caption font-bold text-q-success">
                          نشط
                        </QBadge>
                      </div>
                      <h3 className="mt-3 text-q-caption font-bold text-q-text">
                        {cls.name_ar}
                      </h3>
                      <p className="mt-0.5 text-q-caption text-q-text-3">
                        {cls.code}
                      </p>
                    </QCard>
                  ))}
                  {!references.classes.length && (
                    <p className="col-span-full p-8 text-center text-q-caption text-q-text-3">
                      لا توجد تصنيفات مجالس مسجلة.
                    </p>
                  )}
                </div>
              </section>
            )}

            {tab === "categories" && (
              <section className="rounded-q-control border border-q-border bg-q-surface p-4 ">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-q-surface-2 pb-3">
                  <div>
                    <h2 className="text-q-ui font-bold text-q-text">
                      فئات الموضوعات الأكاديمية والإدارية
                    </h2>
                    <p className="mt-1 text-q-caption text-q-text-3">
                      تصنيفات الموضوعات المنظورة في النظام لربطها تلقائياً
                      باللوائح ومسارات الاعتماد.
                    </p>
                  </div>
                  <QButton type="submit" variant="ghost"
                    onClick={() => {
                      setCategoryForm({
                        code: "",
                        name_ar: "",
                        name_en: "",
                        description: "",
                      });
                      setModal("category");
                    }}
                    className="min-w-11 flex min-h-11 items-center gap-2 rounded-q-control bg-q-primary px-4 text-q-ui font-bold text-q-on-primary"
                  >
                    <Plus size={14} />
                    إضافة فئة موضوعات
                  </QButton>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {references.categories.map((cat) => (
                    <QCard
                      key={cat.id}
                      className="p-0 rounded-q-control border border-q-border bg-q-bg p-4 "
                    >
                      <div className="flex items-center justify-between">
                        <span className="grid h-8 w-8 place-items-center rounded-q-control bg-q-surface-2 text-q-primary">
                          <Tags size={16} />
                        </span>
                        <QBadge className="rounded-full bg-q-success-soft px-2.5 py-0.5 text-q-caption font-bold text-q-success">
                          متاحة
                        </QBadge>
                      </div>
                      <h3 className="mt-3 text-q-caption font-bold text-q-text">
                        {cat.name_ar}
                      </h3>
                      <p className="mt-0.5 text-q-caption text-q-text-3">
                        {cat.code}
                      </p>
                    </QCard>
                  ))}
                  {!references.categories.length && (
                    <p className="col-span-full p-8 text-center text-q-caption text-q-text-3">
                      لا توجد فئات موضوعات مسجلة.
                    </p>
                  )}
                </div>
              </section>
            )}

            {tab === "workflows" && (
              <section className="rounded-q-control border border-q-border bg-q-surface p-4 ">
                <div className="mb-4 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
                  <div>
                    <h2 className="text-q-ui font-bold text-q-text">
                      مصمم قوالب المسارات
                    </h2>
                    <p className="mt-1 text-q-caption leading-5 text-q-text-3">
                      صمّم المسار كرحلة مفهومة: بيانات، خطوات، جهات مسؤولة،
                      نتائج، انتقالات، ثم فحص وتفعيل.
                    </p>
                  </div>
                  <QButton type="submit" variant="ghost"
                    onClick={() => setModal("workflow")}
                    className="min-w-11 flex min-h-11 items-center gap-2 rounded-q-control bg-q-primary px-4 text-q-ui font-bold text-q-on-primary "
                  >
                    <Plus size={14} />
                    قالب جديد
                  </QButton>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {workflows.map((w) => {
                    const version = w.versions[0];
                    const orderedSteps = [...(version?.steps ?? [])].sort(
                      (a, b) => a.sequence_no - b.sequence_no,
                    );
                    const transitionFor = (stepId: string, outcome: string) =>
                      version?.transitions.find(
                        (transition) =>
                          transition.from_step_id === stepId &&
                          transition.outcome_code === outcome,
                      );
                    const missingTransitions = orderedSteps.flatMap((step) =>
                      step.is_terminal
                        ? []
                        : step.allowed_outcomes
                            .filter(
                              (outcome) => !transitionFor(step.id, outcome),
                            )
                            .map(
                              (outcome) =>
                                `${step.name_ar}: ${outcomeLabels[outcome] ?? outcome}`,
                            ),
                    );
                    const hasInitial =
                      orderedSteps.filter((step) => step.is_initial).length ===
                      1;
                    const hasTerminal = orderedSteps.some(
                      (step) => step.is_terminal,
                    );
                    const hasResponsibility =
                      orderedSteps.length > 0 &&
                      orderedSteps.every(
                        (step) =>
                          step.governance_unit_id || step.governance_class_id,
                      );
                    const workflowChecks = [
                      {
                        label: "بيانات المسار",
                        done: Boolean(w.name_ar && w.code),
                      },
                      { label: "خطوات المسار", done: orderedSteps.length > 0 },
                      { label: "الجهة المسؤولة", done: hasResponsibility },
                      {
                        label: "النتائج المتاحة",
                        done: orderedSteps.every(
                          (step) => step.allowed_outcomes.length > 0,
                        ),
                      },
                      {
                        label: "ماذا يحدث بعد كل نتيجة",
                        done: missingTransitions.length === 0,
                      },
                      {
                        label: "فحص المسار",
                        done: version?.validation_status === "valid",
                      },
                      {
                        label: "تفعيل المسار",
                        done: version?.status === "active",
                      },
                    ];
                    const canActivateWorkflow = Boolean(
                      version &&
                      hasInitial &&
                      hasTerminal &&
                      workflowChecks.slice(0, 5).every((check) => check.done),
                    );
                    return (
                      <article
                        key={w.id}
                        className={`rounded-q-control border p-3 transition ${selectedWorkflow?.id === w.id ? "border-q-primary bg-q-surface xl:col-span-2" : "border-q-border bg-q-surface hover:border-q-primary"}`}
                      >
                        <QButton type="submit" variant="ghost"
                          className="min-w-11 w-full text-right"
                          onClick={() =>
                            setSelectedWorkflow(
                              selectedWorkflow?.id === w.id ? null : w,
                            )
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="grid h-9 w-9 place-items-center rounded-q-control bg-q-surface-2 text-q-primary">
                              <Workflow size={17} />
                            </span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-q-caption font-bold ${version?.validation_status === "valid" ? "bg-q-success-soft text-q-success" : "bg-q-warning-soft text-q-warning"}`}
                              >
                                {version?.validation_status === "valid"
                                  ? "تم الفحص"
                                  : "يحتاج فحص"}
                              </span>
                              <Badge value={version?.status ?? w.status} />
                            </div>
                          </div>
                          <h3 className="mt-3 text-q-caption font-bold text-q-text">
                            {w.name_ar}
                          </h3>
                          <p className="mt-0.5 text-q-caption text-q-text-3">
                            {w.code} · {version?.steps.length ?? 0} خطوة ·{" "}
                            {version?.transitions.length ?? 0} انتقال
                          </p>
                        </QButton>
                        {selectedWorkflow?.id === w.id && version && (
                          <>
                            <QCard className="p-0 my-4 rounded-q-control border border-q-border bg-q-surface p-3">
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h3 className="text-q-caption font-bold text-q-text">
                                    رحلة إعداد المسار
                                  </h3>
                                  <p className="mt-0.5 text-q-caption text-q-text-3">
                                    هذه المراحل تضمن أن المسار مفهوم وقابل
                                    للتشغيل قبل التفعيل.
                                  </p>
                                </div>
                                <QBadge className="rounded-full bg-q-surface-2 px-2.5 py-1 text-q-caption font-bold text-q-primary">
                                  {
                                    workflowChecks.filter((check) => check.done)
                                      .length
                                  }{" "}
                                  من {workflowChecks.length}
                                </QBadge>
                              </div>
                              <div className="grid gap-1.5 sm:grid-cols-3 xl:grid-cols-7">
                                {workflowChecks.map((check, index) => (
                                  <div
                                    key={check.label}
                                    className={`rounded-q-control border p-2 text-right ${check.done ? "border-q-border bg-q-success-soft text-q-success" : "border-q-border bg-q-bg text-q-text-2"}`}
                                  >
                                    <span
                                      className={`mb-1 grid h-5 w-5 place-items-center rounded-full text-q-caption font-bold ${check.done ? "bg-q-success text-q-on-primary" : "bg-q-surface-2 text-q-primary"}`}
                                    >
                                      {check.done ? (
                                        <Check size={10} />
                                      ) : (
                                        index + 1
                                      )}
                                    </span>
                                    <strong className="block text-q-caption leading-normal">
                                      {check.label}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            </QCard>
                            <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
                              <section className="rounded-q-control border border-q-border bg-q-surface p-3">
                                <div className="mb-3 flex items-center justify-between">
                                  <h3 className="text-q-caption font-bold text-q-text">
                                    خطوات المسار والجهة المسؤولة
                                  </h3>
                                  <span className="text-q-caption font-bold text-q-text-3">
                                    {orderedSteps.length} خطوات
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  {orderedSteps.map((step, index) => (
                                    <article
                                      key={step.id}
                                      className="rounded-q-control border border-q-border bg-q-bg p-2.5"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <span className="grid h-7 w-7 place-items-center rounded-q-control bg-q-primary text-q-caption font-bold text-q-on-primary">
                                          {index + 1}
                                        </span>
                                        <div className="flex flex-wrap justify-end gap-1">
                                          {step.is_initial && (
                                            <QBadge className="rounded-full bg-q-surface-2 px-2 py-0.5 text-q-caption font-bold text-q-link">
                                              بداية
                                            </QBadge>
                                          )}
                                          {step.is_terminal && (
                                            <QBadge className="rounded-full bg-q-success-soft px-2 py-0.5 text-q-caption font-bold text-q-success">
                                              نهاية
                                            </QBadge>
                                          )}
                                        </div>
                                      </div>
                                      <strong className="mt-2 block text-q-caption leading-5 text-q-text">
                                        {step.name_ar}
                                      </strong>
                                      <div className="mt-1 grid gap-1 text-q-caption text-q-text-2 sm:grid-cols-2">
                                        <span>
                                          {stepTypeLabels[step.step_type] ??
                                            step.step_type}{" "}
                                          ·{" "}
                                          {responsibilityLabels[
                                            step.responsibility
                                          ] ?? step.responsibility}
                                        </span>
                                        <span>
                                          الجهة:{" "}
                                          <strong className="text-q-text">
                                            {responsibilityTargetLabel(
                                              step.governance_unit_id,
                                              step.governance_class_id,
                                            )}
                                          </strong>
                                        </span>
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {step.allowed_outcomes.map(
                                          (outcome) => (
                                            <span
                                              key={outcome}
                                              className="rounded-q-control bg-q-surface-2 px-2 py-0.5 text-q-caption font-bold text-q-text-2"
                                            >
                                              {outcomeLabels[outcome] ??
                                                outcome}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                      {version.status === "draft" && (
                                        <div className="mt-2 flex gap-2 border-t border-q-border pt-2">
                                          <QButton type="submit" variant="ghost"
                                            onClick={() => {
                                              setEditingStepId(step.id);
                                              setStepForm({
                                                code: step.step_code,
                                                name: step.name_ar,
                                                sequence: String(
                                                  step.sequence_no,
                                                ),
                                                type: step.step_type,
                                                responsibility:
                                                  step.responsibility,
                                                unit:
                                                  step.governance_unit_id ?? "",
                                                classId:
                                                  step.governance_class_id ??
                                                  "",
                                                permission:
                                                  step.required_permission_code ??
                                                  "",
                                                initial: step.is_initial,
                                                terminal: step.is_terminal,
                                                outcomes:
                                                  step.allowed_outcomes.join(
                                                    ",",
                                                  ),
                                              });
                                              setModal("step");
                                            }}
                                            className="min-w-11 rounded-q-control px-2 py-1 text-q-ui font-bold text-q-primary hover:bg-q-surface-2"
                                          >
                                            تعديل
                                          </QButton>
                                          <QButton type="submit" variant="ghost"
                                            onClick={async () => {
                                              if (
                                                !confirm(
                                                  "حذف الخطوة وانتقالاتها؟",
                                                )
                                              )
                                                return;
                                              const r = await execute(
                                                () =>
                                                  rpc(
                                                    "admin_remove_workflow_step",
                                                    { p_step_id: step.id },
                                                  ),
                                                "تم حذف الخطوة.",
                                              );
                                              if (r) {
                                                await loadWorkflows();
                                                setSelectedWorkflow(null);
                                              }
                                            }}
                                            className="min-w-11 rounded-q-control px-2 py-1 text-q-ui font-bold text-q-danger hover:bg-q-danger-soft"
                                          >
                                            حذف
                                          </QButton>
                                        </div>
                                      )}
                                    </article>
                                  ))}
                                  {!orderedSteps.length && (
                                    <p className="rounded-q-control border border-dashed border-q-border p-6 text-center text-q-caption text-q-text-3">
                                      أضف أول خطوة للمسار.
                                    </p>
                                  )}
                                </div>
                              </section>
                              <section className="rounded-q-control border border-q-border bg-q-bg p-3">
                                <h3 className="mb-3 text-q-caption font-bold text-q-text">
                                  ماذا يحدث بعد كل نتيجة؟
                                </h3>
                                <div className="space-y-2">
                                  {orderedSteps.flatMap((step) =>
                                    step.allowed_outcomes.map((outcome) => {
                                      const transition = transitionFor(
                                        step.id,
                                        outcome,
                                      );
                                      const destination = transition?.to_step_id
                                        ? orderedSteps.find(
                                            (item) =>
                                              item.id === transition.to_step_id,
                                          )?.name_ar
                                        : "تنتهي رحلة القرار";
                                      return (
                                        <div
                                          key={`${step.id}-${outcome}`}
                                          className={`rounded-q-control border bg-q-surface p-2.5 text-q-caption ${transition || step.is_terminal ? "border-q-border" : "border-q-border"}`}
                                        >
                                          <strong className="block text-q-text">
                                            {step.name_ar}
                                          </strong>
                                          <div className="mt-1 flex flex-wrap items-center gap-1 text-q-text-2">
                                            <span className="rounded-q-control bg-q-surface-2 px-2 py-0.5 font-bold text-q-primary">
                                              {outcomeLabels[outcome] ??
                                                outcome}
                                            </span>
                                            <ChevronLeft size={13} />
                                            <span>
                                              {transition || step.is_terminal
                                                ? destination
                                                : "لم تحدد الوجهة بعد"}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    }),
                                  )}
                                  {!orderedSteps.length && (
                                    <p className="p-6 text-center text-q-caption text-q-text-3">
                                      ستظهر نتائج كل خطوة بعد إضافتها.
                                    </p>
                                  )}
                                </div>
                                {missingTransitions.length > 0 && (
                                  <QCard className="p-0 mt-3 rounded-q-control border border-q-border bg-q-warning-soft p-2.5 text-q-caption leading-5 text-q-warning">
                                    <strong className="block">
                                      ينقص ربط النتائج التالية:
                                    </strong>
                                    {missingTransitions.join("، ")}
                                  </QCard>
                                )}
                              </section>
                            </div>
                            {version.status === "draft" && (
                              <div className="flex flex-wrap gap-2">
                                <QButton type="submit" variant="ghost"
                                  onClick={() => {
                                    setEditingStepId(null);
                                    setStepForm({
                                      code: "",
                                      name: "",
                                      sequence: String(
                                        (orderedSteps.at(-1)?.sequence_no ??
                                          0) + 10,
                                      ),
                                      type: "review",
                                      responsibility: "review",
                                      unit: "",
                                      classId: "",
                                      permission: "",
                                      initial: orderedSteps.length === 0,
                                      terminal: false,
                                      outcomes: "approved,returned,rejected",
                                    });
                                    setModal("step");
                                  }}
                                  className="min-w-11 rounded-q-control border border-q-border bg-q-surface px-3 py-2 text-q-ui font-bold text-q-text-2 hover:border-q-primary hover:text-q-primary"
                                >
                                  إضافة خطوة
                                </QButton>
                                <QButton type="submit" variant="ghost"
                                  disabled={!version.steps.length}
                                  onClick={() => setModal("transition")}
                                  className="min-w-11 rounded-q-control border border-q-border bg-q-surface px-3 py-2 text-q-ui font-bold text-q-text-2 disabled:opacity-40 hover:border-q-primary hover:text-q-primary"
                                >
                                  تحديد ماذا يحدث بعد نتيجة
                                </QButton>
                                <QButton type="submit" variant="ghost"
                                  disabled={!canActivateWorkflow}
                                  title={
                                    canActivateWorkflow
                                      ? "فحص المسار وتفعيله"
                                      : "أكمل الخطوات والجهات والانتقالات أولًا"
                                  }
                                  onClick={async () => {
                                    const r = await execute(
                                      () =>
                                        rpc(
                                          "admin_activate_workflow_template_version",
                                          {
                                            p_workflow_template_version_id:
                                              version.id,
                                          },
                                        ),
                                      "تم فحص المسار وتفعيله.",
                                    );
                                    if (r) {
                                      await loadWorkflows();
                                      setSelectedWorkflow(null);
                                    }
                                  }}
                                  className="min-w-11 rounded-q-control bg-q-success px-3 py-2 text-q-ui font-bold text-q-on-primary disabled:cursor-not-allowed disabled:bg-q-surface-2"
                                >
                                  فحص المسار وتفعيله
                                </QButton>
                              </div>
                            )}
                          </>
                        )}
                      </article>
                    );
                  })}
                  {!workflows.length && (
                    <QCard className="p-0 col-span-full grid min-h-56 place-items-center rounded-q-control border border-dashed border-q-border bg-q-bg text-q-caption text-q-text-3">
                      ابدأ بإنشاء أول قالب لمسار الاعتماد.
                    </QCard>
                  )}
                </div>
              </section>
            )}

            {tab === "matcher" && (
              <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
                <QCard className="p-0 rounded-q-card border border-q-border bg-q-surface p-5">
                  <h2 className="text-q-ui font-bold text-q-text">
                    محاكاة المطابقة
                  </h2>
                  <p className="mt-1 text-q-caption leading-5 text-q-text-3">
                    اختبر اللوائح المؤهلة بنفس العقد المستخدم عند إنشاء الموضوع.
                  </p>
                  <div className="mt-5 space-y-4">
                    <Field label="المجلس">
                      <select
                        className={input}
                        value={matcherForm.unit}
                        onChange={(e) =>
                          setMatcherForm({
                            ...matcherForm,
                            unit: e.target.value,
                          })
                        }
                      >
                        <option value="">اختر المجلس</option>
                        {references.units.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name_ar}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="فئة الموضوع">
                      <select
                        className={input}
                        value={matcherForm.category}
                        onChange={(e) =>
                          setMatcherForm({
                            ...matcherForm,
                            category: e.target.value,
                          })
                        }
                      >
                        <option value="">اختر الفئة</option>
                        {references.categories.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name_ar}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="الأولوية">
                        <select
                          className={input}
                          value={matcherForm.priority}
                          onChange={(e) =>
                            setMatcherForm({
                              ...matcherForm,
                              priority: e.target.value,
                            })
                          }
                        >
                          <option value="low">منخفضة</option>
                          <option value="medium">متوسطة</option>
                          <option value="high">عالية</option>
                          <option value="urgent">عاجلة</option>
                        </select>
                      </Field>
                      <Field label="تاريخ الاختبار">
                        <input
                          type="date"
                          className={input}
                          value={matcherForm.date}
                          onChange={(e) =>
                            setMatcherForm({
                              ...matcherForm,
                              date: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <QButton type="submit" variant="ghost"
                      disabled={
                        !matcherForm.unit || !matcherForm.category || busy
                      }
                      onClick={runMatcher}
                      className="min-w-11 flex h-11 w-full items-center justify-center gap-2 rounded-q-control bg-q-primary text-q-ui font-bold text-q-on-primary disabled:opacity-50"
                    >
                      <FlaskConical size={16} />
                      تشغيل الاختبار
                    </QButton>
                  </div>
                </QCard>
                <QCard className="p-0 rounded-q-card border border-q-border bg-q-surface p-5">
                  <h2 className="text-q-ui font-bold text-q-text">
                    نتيجة المحاكاة
                  </h2>
                  {matcherResult ? (
                    <div className="mt-4">
                      <div className="mb-4 rounded-q-control bg-q-surface-2 p-4 text-q-caption text-q-text-2">
                        وجد المحرك{" "}
                        <strong>
                          {String(matcherResult.total ?? matcherItems.length)}
                        </strong>{" "}
                        خيار مؤهل. لا يتم الاختيار تلقائياً عند تعدد النتائج.
                      </div>
                      {matcherItems.length ? (
                        <div className="space-y-3">
                          {matcherItems.map((item, index) => (
                            <article
                              key={`${nestedText(item, ["selection", "policy_id"], String(index))}-${index}`}
                              className="rounded-q-control border border-q-border bg-q-bg p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <QBadge className="mb-1 inline-flex rounded-full bg-q-surface-2 px-2.5 py-1 text-q-caption font-bold text-q-primary">
                                    خيار {index + 1}
                                  </QBadge>
                                  <h3 className="text-q-ui font-bold text-q-text">
                                    {nestedText(
                                      item,
                                      ["policy", "name_ar"],
                                      "لائحة مطابقة",
                                    )}
                                  </h3>
                                  <p className="mt-1 text-q-caption text-q-text-3">
                                    {nestedText(item, ["policy", "code"])} ·
                                    الإصدار{" "}
                                    {nestedText(
                                      item,
                                      ["version", "label"],
                                      nestedText(item, ["version", "number"]),
                                    )}
                                  </p>
                                </div>
                                <span
                                  className={`rounded-full px-3 py-1 text-q-caption font-bold ${nestedText(item, ["automation_status"]) === "ready" ? "bg-q-success-soft text-q-success" : "bg-q-warning-soft text-q-warning"}`}
                                >
                                  {nestedText(item, ["automation_status"]) ===
                                  "ready"
                                    ? "جاهزة للمسار"
                                    : "تحتاج إعداد"}
                                </span>
                              </div>
                              <div className="mt-3 grid gap-2 text-q-caption sm:grid-cols-2">
                                <div className="rounded-q-control bg-q-surface px-3 py-2">
                                  <span className="block text-q-text-3">
                                    البند المنطبق
                                  </span>
                                  <strong className="mt-1 block text-q-text">
                                    {nestedText(
                                      item,
                                      ["item", "title_ar"],
                                      "غير محدد",
                                    )}
                                  </strong>
                                </div>
                                <div className="rounded-q-control bg-q-surface px-3 py-2">
                                  <span className="block text-q-text-3">
                                    نطاق السريان
                                  </span>
                                  <strong className="mt-1 block text-q-text">
                                    {nestedText(
                                      item,
                                      ["scope", "type"],
                                      "النطاق المتاح",
                                    )}
                                  </strong>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <QCard className="p-0 rounded-q-control border border-q-border bg-q-warning-soft p-4 text-q-caption leading-6 text-q-warning">
                          لا توجد لائحة مطابقة لهذا السياق. يمكن طلب استثناء أو
                          إنشاء نطاق/بند مناسب.
                        </QCard>
                      )}
                    </div>
                  ) : (
                    <div className="grid min-h-80 place-items-center text-center text-q-caption text-q-text-3">
                      <div>
                        <FlaskConical className="mx-auto mb-3" size={30} />
                        أدخل سياق الموضوع لتظهر نتيجة المطابقة وسببها.
                      </div>
                    </div>
                  )}
                </QCard>
              </section>
            )}

            {tab === "exceptions" && (
              <section className="overflow-hidden rounded-q-card border border-q-border bg-q-surface">
                <div className="flex items-center justify-between border-b border-q-surface-2 p-5">
                  <div>
                    <h2 className="text-q-ui font-bold text-q-text">
                      مراجعة مسارات الموضوعات
                    </h2>
                    <p className="mt-1 text-q-caption text-q-text-3">
                      اعتمد المراحل المنفذة سابقًا، أو راجع المسارات المخصصة والاستثنائية كلٌ في قسمه.
                    </p>
                  </div>
                </div>
                <div className="border-b border-q-surface-2 bg-gradient-to-l from-q-surface-2 to-white p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-q-caption font-bold text-q-primary">
                        استكمال موضوعات قائمة
                      </p>
                      <h3 className="mt-1 text-q-ui font-bold text-q-text">
                        إثبات المجالس المنفذة خارج النظام
                      </h3>
                      <p className="mt-1 text-q-caption leading-5 text-q-text-3">
                        تحقق من تاريخ كل مجلس وقراره ومحضره قبل تفعيل أول مرحلة
                        متبقية.
                      </p>
                    </div>
                    <QBadge className="rounded-full bg-q-surface px-3 py-1.5 text-q-caption font-bold text-q-primary ">
                      {
                        priorRouteRequests.filter(
                          (item) => item.status === "submitted",
                        ).length
                      }{" "}
                      بانتظار التحقق
                    </QBadge>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {reviewablePriorRouteRequests.map((request) => (
                      <article
                        key={request.id}
                        className="overflow-hidden rounded-q-card border border-q-border bg-q-surface "
                      >
                        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-q-surface-2 p-4">
                          <div className="min-w-0">
                            <Link
                              href={`/admin/topics/${request.topic_id}`}
                              className="inline-flex min-h-11 min-w-11 items-center inline-flex items-center gap-1 text-q-caption font-bold text-q-primary hover:underline"
                            >
                              {request.topic_no || "موضوع قائم"}
                              <ChevronLeft size={12} />
                            </Link>
                            <Link
                              href={`/admin/topics/${request.topic_id}`}
                              className="inline-flex min-h-11 min-w-11 items-center mt-1 block text-q-ui font-bold text-q-text hover:text-q-primary hover:underline"
                            >
                              {request.topic_title_ar}
                            </Link>
                            <p className="mt-1 text-q-caption text-q-text-3">
                              قدمه: {request.requester_name_ar}
                              {request.submitted_at
                                ? ` · ${new Date(request.submitted_at).toLocaleDateString("ar-SA-u-nu-latn")}`
                                : ""}
                            </p>
                          </div>
                          <Badge value={request.status} />
                        </header>
                        <ol className="space-y-3 p-4">
                          {groupPriorRouteReviewSteps(request.steps).map(
                            (step) => (
                              <li
                                key={step.id}
                                className="rounded-q-control border border-q-border bg-q-bg p-3"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-q-control bg-q-success text-q-caption font-bold text-q-on-primary">
                                    {step.display_sequence_no}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <strong className="text-q-caption text-q-text">
                                      {step.responsible_unit_name_ar ||
                                        step.step_title}
                                    </strong>
                                    <p className="mt-0.5 text-q-caption text-q-text-3">
                                      اجتماع واحد يغطي{" "}
                                      {step.covered_step_titles.length}{" "}
                                      {step.covered_step_titles.length === 1
                                        ? "إجراء"
                                        : "إجراءات"}{" "}
                                      ·{" "}
                                      {new Date(
                                        step.meeting_date,
                                      ).toLocaleDateString("ar-SA-u-nu-latn")}
                                      {step.meeting_reference
                                        ? ` · ${step.meeting_reference}`
                                        : ""}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3 grid gap-2 rounded-q-control bg-q-surface p-2.5 text-q-caption leading-5 text-q-text-2 sm:grid-cols-2">
                                  <p>
                                    <b className="text-q-text">القرار: </b>
                                    {step.decision_text}
                                  </p>
                                  <p>
                                    <b className="text-q-text">
                                      سبب التسجيل:{" "}
                                    </b>
                                    {step.bypass_reason}
                                  </p>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {step.attachments.map((attachment) => (
                                    <a
                                      key={attachment.id}
                                      href={attachment.file_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex min-h-11 min-w-11 items-center rounded-q-control border border-q-primary bg-q-surface-2 px-2.5 py-1.5 text-q-caption font-bold text-q-primary"
                                    >
                                      عرض {attachment.file_name}
                                    </a>
                                  ))}
                                </div>
                              </li>
                            ),
                          )}
                        </ol>
                        {request.status === "submitted" && (
                          <footer className="space-y-3 border-t border-q-surface-2 bg-q-bg p-4">
                            {request.can_review === false && (
                              <QCard className="p-0 rounded-q-control border border-q-border bg-q-warning-soft p-3 text-q-caption font-bold leading-5 text-q-warning">
                                {request.review_block_reason ||
                                  "هذا الطلب يحتاج مراجعًا مستقلًا لاعتماده."}
                              </QCard>
                            )}
                            <label className="block">
                              <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                                ملاحظة المراجع *
                              </span>
                              <textarea
                                value={
                                  priorRouteReviewComments[request.id] ?? ""
                                }
                                onChange={(event) =>
                                  setPriorRouteReviewComments((current) => ({
                                    ...current,
                                    [request.id]: event.target.value,
                                  }))
                                }
                                placeholder="دوّن نتيجة فحص المحاضر والقرارات…"
                                className="min-h-20 w-full rounded-q-control border border-q-border bg-q-surface p-3 text-q-caption leading-5"
                              />
                              <span className="mt-1.5 block text-q-caption text-q-text-3">
                                اكتب 5 أحرف على الأقل لتفعيل زري الاعتماد والرفض.
                              </span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <QButton type="submit" variant="ghost"
                                disabled={
                                  request.can_review === false ||
                                  (priorRouteReviewComments[request.id]?.trim()
                                    .length ?? 0) < 5 || busy
                                }
                                onClick={() =>
                                  reviewPriorRouteRequest(request, true)
                                }
                                className="min-w-11 rounded-q-control bg-q-success px-4 py-2 text-q-ui font-bold text-q-on-primary disabled:bg-q-surface-2"
                              >
                                اعتماد وبدء المرحلة التالية
                              </QButton>
                              <QButton type="submit" variant="ghost"
                                disabled={
                                  request.can_review === false ||
                                  (priorRouteReviewComments[request.id]?.trim()
                                    .length ?? 0) < 5 || busy
                                }
                                onClick={() =>
                                  reviewPriorRouteRequest(request, false)
                                }
                                className="min-w-11 rounded-q-control bg-q-danger-soft px-4 py-2 text-q-ui font-bold text-q-danger disabled:text-q-text-3"
                              >
                                رفض الأدلة
                              </QButton>
                            </div>
                          </footer>
                        )}
                      </article>
                    ))}
                    {!reviewablePriorRouteRequests.length && (
                      <QCard className="p-0 rounded-q-control border border-dashed border-q-border bg-q-surface p-6 text-center text-q-caption text-q-text-3 xl:col-span-2">
                        لا توجد طلبات لاستكمال مسار سابق.
                      </QCard>
                    )}
                  </div>
                </div>
                <div className="border-b border-q-surface-2 bg-q-bg p-5">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-q-caption font-bold text-q-text">
                        مسارات الموضوعات المخصصة
                      </h3>
                      <p className="mt-1 text-q-caption text-q-text-3">
                        مسارات دائمة خاصة بموضوع واحد، منفصلة عن الاستثناءات
                        المؤقتة.
                      </p>
                    </div>
                    <QBadge className="rounded-full bg-q-surface px-3 py-1 text-q-caption font-bold text-q-text-2">
                      {
                        customRouteDrafts.filter(
                          (item) => item.status === "submitted",
                        ).length
                      }{" "}
                      بانتظار المراجعة
                    </QBadge>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {customRouteDrafts.map((draft) => (
                      <article
                        key={draft.id}
                        className="rounded-q-card border border-q-border bg-q-surface p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-q-caption font-bold text-q-primary">
                              {draft.topic_title_ar}
                            </p>
                            <h4 className="mt-1 text-q-ui font-bold text-q-text">
                              {draft.name_ar}
                            </h4>
                            <p className="mt-1 text-q-caption leading-5 text-q-text-3">
                              {draft.rationale}
                            </p>
                          </div>
                          <Badge value={draft.status} />
                        </div>
                        <ol className="mt-3 space-y-2">
                          {draft.steps.map((step) => (
                            <li
                              key={step.id}
                              className="flex items-center gap-3 rounded-q-control bg-q-bg px-3 py-2"
                            >
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-q-control bg-q-surface-2 text-q-caption font-bold text-q-primary">
                                {step.sequence_no}
                              </span>
                              <span className="min-w-0">
                                <strong className="block text-q-caption text-q-text">
                                  {step.name_ar}
                                </strong>
                                <span className="mt-0.5 block text-q-caption text-q-text-3">
                                  {step.governance_unit_name_ar}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ol>
                        {draft.status === "submitted" && (
                          <div className="mt-3 flex gap-2 border-t border-q-surface-2 pt-3">
                            <QButton type="submit" variant="ghost"
                              onClick={() =>
                                reviewCustomRouteDraft(draft, true)
                              }
                              className="min-w-11 rounded-q-control bg-q-success px-3 py-2 text-q-ui font-bold text-q-on-primary"
                            >
                              اعتماد وتشغيل
                            </QButton>
                            <QButton type="submit" variant="ghost"
                              onClick={() =>
                                reviewCustomRouteDraft(draft, false)
                              }
                              className="min-w-11 rounded-q-control bg-q-danger-soft px-3 py-2 text-q-ui font-bold text-q-danger"
                            >
                              رفض
                            </QButton>
                          </div>
                        )}
                      </article>
                    ))}
                    {!customRouteDrafts.length && (
                      <QCard className="p-0 rounded-q-control border border-dashed border-q-border bg-q-surface p-5 text-center text-q-caption text-q-text-3 xl:col-span-2">
                        لا توجد مسارات مخصصة بانتظار المراجعة.
                      </QCard>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-q-surface-2 p-5">
                    <div>
                      <h3 className="text-q-caption font-bold text-q-text">
                        الاستثناءات المؤقتة
                      </h3>
                      <p className="mt-1 text-q-caption text-q-text-3">
                        هذا القسم فقط لطلب الخروج المؤقت عن المسار الأصلي، ولا يخص إثبات المجالس السابقة.
                      </p>
                    </div>
                    <QButton type="submit" variant="ghost"
                      onClick={() => setModal("exception")}
                      className="min-w-11 flex min-h-11 items-center gap-2 rounded-q-control border border-q-primary bg-q-surface px-4 text-q-ui font-bold text-q-primary"
                    >
                      <Plus size={14} />
                      إنشاء استثناء مؤقت
                    </QButton>
                  </div>
                  <table className="w-full min-w-[900px] text-right">
                    <thead className="bg-q-bg text-q-caption text-q-text-3">
                      <tr>
                        <th className="p-4">الموضوع</th>
                        <th className="p-4">النوع</th>
                        <th className="p-4">المسار</th>
                        <th className="p-4">الصلاحية</th>
                        <th className="p-4">الحالة</th>
                        <th className="p-4">المراجعة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptions.map((e) => (
                        <tr
                          key={e.id}
                          className="border-t border-q-surface-2 text-q-caption"
                        >
                          <td className="p-4">
                            <strong className="text-q-text">
                              {e.topic_title_ar}
                            </strong>
                            <span className="mt-1 block text-q-caption text-q-text-3">
                              {e.reason}
                            </span>
                          </td>
                          <td className="p-4">{e.exception_type}</td>
                          <td className="p-4">{e.workflow_name_ar || "—"}</td>
                          <td className="p-4">
                            {new Date(e.valid_until).toLocaleDateString(
                              "ar-SA-u-nu-latn",
                            )}
                          </td>
                          <td className="p-4">
                            <Badge value={e.status} />
                          </td>
                          <td className="p-4">
                            {e.status === "pending" ? (
                              <div className="flex gap-2">
                                <QButton type="submit" variant="ghost"
                                  onClick={() => reviewException(e, true)}
                                  className="min-w-11 rounded-q-control bg-q-success px-3 py-2 text-q-ui font-bold text-q-on-primary"
                                >
                                  اعتماد
                                </QButton>
                                <QButton type="submit" variant="ghost"
                                  onClick={() => reviewException(e, false)}
                                  className="min-w-11 rounded-q-control bg-q-danger-soft px-3 py-2 text-q-ui font-bold text-q-danger"
                                >
                                  رفض
                                </QButton>
                              </div>
                            ) : (
                              "مكتملة"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!exceptions.length && (
                    <div className="grid min-h-64 place-items-center text-q-caption text-q-text-3">
                      لا توجد طلبات استثناء.
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        {modal === "policy" && (
          <Dialog
            title={editingPolicy ? "تعديل بيانات اللائحة" : "إنشاء لائحة جديدة"}
            onClose={closeModal}
            feedback={notice}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="رمز اللائحة"
                hint="بالإنجليزية فقط: academic-regulation-2026"
              >
                <input
                  disabled={Boolean(editingPolicy)}
                  className={input}
                  dir="ltr"
                  value={policyForm.code}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      code: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    })
                  }
                  placeholder="academic-regulation-2026"
                  pattern="[a-z][a-z0-9_.-]*"
                />
              </Field>
              <Field label="النوع">
                <select
                  disabled={Boolean(editingPolicy)}
                  className={input}
                  value={policyForm.policy_type}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      policy_type: e.target.value,
                    })
                  }
                >
                  {Object.entries(typeLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="الاسم بالعربية">
                <input
                  className={input}
                  value={policyForm.name_ar}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, name_ar: e.target.value })
                  }
                />
              </Field>
              <Field label="الاسم بالإنجليزية">
                <input
                  className={input}
                  dir="ltr"
                  value={policyForm.name_en}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, name_en: e.target.value })
                  }
                />
              </Field>
              {editingPolicy && (
                <Field label="حالة السجل">
                  <select
                    className={input}
                    value={policyForm.status}
                    onChange={(e) =>
                      setPolicyForm({ ...policyForm, status: e.target.value })
                    }
                  >
                    <option value="active">نشط</option>
                    <option value="inactive">غير نشط</option>
                    <option value="archived">مؤرشف</option>
                  </select>
                </Field>
              )}
            </div>
            <Field label="الوصف">
              <textarea
                className={`${textarea} mt-4`}
                value={policyForm.description}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, description: e.target.value })
                }
              />
            </Field>
            <Action busy={busy} onClick={savePolicy} label="حفظ اللائحة" />
          </Dialog>
        )}
        {modal === "version" && (
          <Dialog title="إنشاء إصدار جديد" onClose={closeModal} feedback={notice}>
            <div className="space-y-4">
              <Field label="وسم الإصدار">
                <input
                  className={input}
                  placeholder="2026.1"
                  value={versionForm.label}
                  onChange={(e) =>
                    setVersionForm({ ...versionForm, label: e.target.value })
                  }
                />
              </Field>
              <Field label="ملخص التغييرات">
                <textarea
                  className={textarea}
                  value={versionForm.summary}
                  onChange={(e) =>
                    setVersionForm({ ...versionForm, summary: e.target.value })
                  }
                />
              </Field>
            </div>
            <Action busy={busy} onClick={createVersion} label="إنشاء المسودة" />
          </Dialog>
        )}
        {modal === "item" && (
          <Dialog
            title={editingItem ? "تعديل بند اللائحة" : "إضافة بند لائحي"}
            onClose={closeModal}
            wide
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="رمز البند">
                <input
                  disabled={Boolean(editingItem)}
                  className={input}
                  dir="ltr"
                  value={itemForm.code}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, code: e.target.value })
                  }
                />
              </Field>
              <Field label="العنوان">
                <input
                  className={input}
                  value={itemForm.title}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, title: e.target.value })
                  }
                />
              </Field>
              <Field label="نوع البند">
                <select
                  className={input}
                  value={itemForm.type}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, type: e.target.value })
                  }
                >
                  <option value="chapter">فصل</option>
                  <option value="section">قسم</option>
                  <option value="article">مادة</option>
                  <option value="clause">فقرة</option>
                  <option value="procedure">إجراء</option>
                </select>
              </Field>
              <Field label="طريقة تطبيق البند">
                <select
                  className={input}
                  value={itemForm.mode}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, mode: e.target.value })
                  }
                >
                  <option value="regulation_required">
                    يجب تطبيق المسار المحدد
                  </option>
                  <option value="regulated_fallback_allowed">
                    يمكن استخدام مسار بديل
                  </option>
                  <option value="custom_route_allowed">
                    يمكن إنشاء مسار مخصص
                  </option>
                </select>
              </Field>
              <Field
                label="فئة الموضوع"
                hint="اتركها فارغة إذا كان البند ينطبق على كل الفئات"
              >
                <select
                  className={input}
                  value={itemForm.category}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, category: e.target.value })
                  }
                >
                  <option value="">كل الفئات</option>
                  {references.categories.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name_ar}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="مسار المعالجة">
                <select
                  className={input}
                  value={itemForm.workflow}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, workflow: e.target.value })
                  }
                >
                  <option value="">لم يحدد مسار</option>
                  {activeWorkflowVersions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="ترتيب ظهور البند">
                <input
                  type="number"
                  className={input}
                  value={itemForm.sort}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, sort: e.target.value })
                  }
                />
              </Field>
            </div>

            <section className="mt-5 rounded-q-card border border-q-border bg-q-bg p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-q-caption font-bold text-q-text">
                    متى ينطبق هذا البند؟
                  </h3>
                  <p className="mt-1 text-q-caption leading-5 text-q-text-3">
                    حدد صفات الموضوع، وسيتولى النظام بناء شروط المطابقة
                    تلقائيًا.
                  </p>
                </div>
              </div>

              <>
                <QCard className="p-0 mt-4 rounded-q-control border border-q-border bg-q-surface p-3">
                  <span className="block text-q-caption font-bold text-q-text">
                    ينطبق هذا البند عندما:
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2 text-q-caption">
                    {(["single", "all", "any"] as const).map((mode) => (
                      <QButton variant="ghost"
                        type="button"
                        key={mode}
                        onClick={() => setMatchMode(mode)}
                        className={`min-w-11 rounded-q-control border px-3 py-2 font-bold transition ${matchMode === mode ? "border-q-primary bg-q-primary text-q-on-primary" : "border-q-border bg-q-bg text-q-text-2"}`}
                      >
                        {mode === "single"
                          ? "شرط واحد"
                          : mode === "all"
                            ? "كل الشروط"
                            : "أي شرط"}
                      </QButton>
                    ))}
                  </div>
                </QCard>

                <div className="mt-3 space-y-2">
                  {matchConditions.map((condition, index) => {
                    const update = (patch: Partial<MatchCondition>) =>
                      setMatchConditions((items) =>
                        items.map((item) =>
                          item.id === condition.id
                            ? { ...item, ...patch }
                            : item,
                        ),
                      );
                    const options =
                      condition.field === "request_type"
                        ? requestTypeValues
                        : condition.field === "academic_level"
                          ? academicLevelValues
                          : condition.field === "priority"
                            ? priorityValues
                            : condition.field === "source_type"
                              ? sourceValues
                              : condition.field === "governance_level"
                                ? governanceLevelValues
                                : condition.field === "governance_unit_id"
                                  ? references.units.map((item) => ({
                                      value: item.id,
                                      label: item.name_ar,
                                    }))
                                  : condition.field === "governance_class_id"
                                    ? references.classes.map((item) => ({
                                        value: item.id,
                                        label: item.name_ar,
                                      }))
                                    : null;
                    const setValues = (values: string[]) =>
                      update({ values: values.filter(Boolean) });
                    return (
                      <QCard
                        key={condition.id}
                        className="p-0 rounded-q-control border border-q-border bg-q-surface p-3"
                      >
                        <div className="grid items-end gap-2 sm:grid-cols-[1fr_150px_36px]">
                          <Field label={`الشرط ${index + 1}`}>
                            <select
                              className={input}
                              value={condition.field}
                              onChange={(e) =>
                                update({
                                  field: e.target.value,
                                  values: defaultValuesForField(e.target.value),
                                })
                              }
                            >
                              {matchFields.map((field) => (
                                <option key={field.value} value={field.value}>
                                  {field.label}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="نوع الشرط">
                            <QButton variant="ghost"
                              type="button"
                              onClick={() =>
                                update({ inverted: !condition.inverted })
                              }
                              className={`min-w-11 min-h-11 w-full rounded-q-control border px-3 text-q-ui font-bold ${condition.inverted ? "border-q-border bg-q-warning-soft text-q-warning" : "border-q-border bg-q-bg text-q-text-2"}`}
                            >
                              {condition.inverted
                                ? "استثناء: لا يساوي"
                                : condition.values.length > 1
                                  ? "أحد القيم"
                                  : "يساوي"}
                            </QButton>
                          </Field>
                          <QButton variant="ghost"
                            type="button"
                            aria-label={`حذف الشرط ${index + 1}`}
                            onClick={() =>
                              setMatchConditions((items) =>
                                items.filter(
                                  (item) => item.id !== condition.id,
                                ),
                              )
                            }
                            className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control text-q-danger hover:bg-q-danger-soft"
                          >
                            <X size={15} />
                          </QButton>
                        </div>
                        <div className="mt-3">
                          {options ? (
                            <div className="flex flex-wrap gap-1.5">
                              {options.map((option) => {
                                const active = condition.values.includes(
                                  option.value,
                                );
                                return (
                                  <QButton variant="ghost"
                                    type="button"
                                    key={option.value}
                                    onClick={() =>
                                      setValues(
                                        active
                                          ? condition.values.filter(
                                              (value) => value !== option.value,
                                            )
                                          : [...condition.values, option.value],
                                      )
                                    }
                                    className={`min-w-11 rounded-q-control border px-2.5 py-1.5 text-q-ui font-bold transition ${active ? "border-q-primary bg-q-surface-2 text-q-primary" : "border-q-border bg-q-bg text-q-text-3"}`}
                                  >
                                    {option.label}
                                  </QButton>
                                );
                              })}
                            </div>
                          ) : (
                            <input
                              className={input}
                              value={condition.values.join(", ")}
                              placeholder="اكتب قيمة أو أكثر مفصولة بفاصلة"
                              onChange={(e) =>
                                setValues(
                                  e.target.value
                                    .split(",")
                                    .map((value) => value.trim()),
                                )
                              }
                            />
                          )}
                        </div>
                      </QCard>
                    );
                  })}
                </div>
                {!matchConditions.length && (
                  <QCard className="p-0 mt-3 rounded-q-control border border-dashed border-q-border bg-q-surface p-4 text-center text-q-caption text-q-text-3">
                    لا توجد شروط؛ سيطبق البند على جميع الموضوعات ضمن الفئة
                    والنطاق المحددين.
                  </QCard>
                )}
                <QButton variant="ghost"
                  type="button"
                  onClick={() =>
                    setMatchConditions((items) => [
                      ...items,
                      newMatchCondition(),
                    ])
                  }
                  className="min-w-11 mt-3 flex min-h-11 items-center gap-2 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-bold text-q-primary"
                >
                  <Plus size={14} />
                  إضافة شرط
                </QButton>
                {!!matchConditions.length && (
                  <p className="mt-3 rounded-q-control bg-q-surface-2 px-3 py-2 text-q-caption leading-5 text-q-link">
                    سيُطبّق البند عندما{" "}
                    {matchMode === "single"
                      ? "يتحقق الشرط الأول فقط"
                      : matchMode === "all"
                        ? "تتحقق كل الشروط"
                        : "يتحقق أي شرط من الشروط"}
                    ، مع احترام شروط الاستثناء.
                  </p>
                )}
                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <QCard className="p-0 rounded-q-control border border-q-border bg-q-surface p-3">
                    <h4 className="text-q-caption font-bold text-q-text">
                      ملخص الشروط التي سيطبقها النظام
                    </h4>
                    {criteriaSummary.length ? (
                      <div className="mt-3 space-y-2">
                        {criteriaSummary.map((summary, index) => (
                          <QCard
                            key={`${summary}-${index}`}
                            className="p-0 flex items-start gap-2 rounded-q-control border border-q-border bg-q-bg px-3 py-2 text-q-caption leading-5 text-q-text-2"
                          >
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-q-surface-2 text-q-caption font-bold text-q-primary">
                              {index + 1}
                            </span>
                            <span>{summary}</span>
                          </QCard>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-q-control bg-q-bg px-3 py-2 text-q-caption leading-5 text-q-text-3">
                        لا توجد شروط محددة؛ سيطبق البند على جميع الموضوعات ضمن
                        الفئة والنطاق.
                      </p>
                    )}
                  </QCard>
                  <QCard className="p-0 rounded-q-control border border-q-border bg-q-surface p-3">
                    <h4 className="text-q-caption font-bold text-q-text">
                      معاينة: هل هذا الموضوع يطابق؟
                    </h4>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Field label="نوع الطلب">
                        <select
                          className={input}
                          value={matchPreview.request_type}
                          onChange={(e) =>
                            setMatchPreview({
                              ...matchPreview,
                              request_type: e.target.value,
                            })
                          }
                        >
                          {requestTypeValues.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="المستوى الأكاديمي">
                        <select
                          className={input}
                          value={matchPreview.academic_level}
                          onChange={(e) =>
                            setMatchPreview({
                              ...matchPreview,
                              academic_level: e.target.value,
                            })
                          }
                        >
                          {academicLevelValues.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="مصدر الموضوع">
                        <select
                          className={input}
                          value={matchPreview.source_type}
                          onChange={(e) =>
                            setMatchPreview({
                              ...matchPreview,
                              source_type: e.target.value,
                            })
                          }
                        >
                          {sourceValues.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="الأولوية">
                        <select
                          className={input}
                          value={matchPreview.priority}
                          onChange={(e) =>
                            setMatchPreview({
                              ...matchPreview,
                              priority: e.target.value,
                            })
                          }
                        >
                          {priorityValues.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="المستوى التنظيمي">
                        <select
                          className={input}
                          value={matchPreview.governance_level}
                          onChange={(e) =>
                            setMatchPreview({
                              ...matchPreview,
                              governance_level: e.target.value,
                            })
                          }
                        >
                          {governanceLevelValues.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="مستوى التغيير">
                        <select
                          className={input}
                          value={matchPreview.change_level}
                          onChange={(e) =>
                            setMatchPreview({
                              ...matchPreview,
                              change_level: e.target.value,
                            })
                          }
                        >
                          {changeLevelValues.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div
                      className={`mt-3 rounded-q-control px-3 py-2 text-q-caption font-bold ${previewMatches === null ? "bg-q-neutral-soft text-q-text-2" : previewMatches ? "bg-q-success-soft text-q-success" : "bg-q-danger-soft text-q-danger"}`}
                    >
                      {previewMatches === null
                        ? "جارٍ التحقق عبر محرك المطابقة الفعلي…"
                        : previewMatches
                          ? "نعم، هذا الموضوع يطابق شروط البند."
                          : "لا، هذا الموضوع لا يطابق شروط البند."}
                    </div>
                  </QCard>
                </div>
              </>
            </section>

            <Field label="نص البند">
              <textarea
                className={`${textarea} mt-4 min-h-32`}
                value={itemForm.body}
                onChange={(e) =>
                  setItemForm({ ...itemForm, body: e.target.value })
                }
              />
            </Field>
            <Action busy={busy} onClick={saveItem} label="حفظ البند" />
          </Dialog>
        )}
        {modal === "scope" && (
          <Dialog title="إضافة نطاق سريان" onClose={closeModal}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="أين تطبق اللائحة؟">
                <select
                  className={input}
                  value={scopeForm.type}
                  onChange={(e) =>
                    setScopeForm({
                      ...scopeForm,
                      type: e.target.value,
                      target: "",
                    })
                  }
                >
                  <option value="organization">المنظمة كاملة</option>
                  <option value="governance_unit">مجلس أو وحدة محددة</option>
                  <option value="governance_class">
                    جميع المجالس من تصنيف محدد
                  </option>
                  <option value="governance_level">مستوى تنظيمي محدد</option>
                  <option value="unit_subtree">
                    وحدة وكل الوحدات التابعة لها
                  </option>
                </select>
              </Field>
              {["governance_unit", "unit_subtree"].includes(scopeForm.type) && (
                <Field label="المجلس">
                  <select
                    className={input}
                    value={scopeForm.target}
                    onChange={(e) =>
                      setScopeForm({ ...scopeForm, target: e.target.value })
                    }
                  >
                    <option value="">اختر المجلس</option>
                    {references.units.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name_ar}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {scopeForm.type === "governance_class" && (
                <Field label="تصنيف المجلس">
                  <select
                    className={input}
                    value={scopeForm.target}
                    onChange={(e) =>
                      setScopeForm({ ...scopeForm, target: e.target.value })
                    }
                  >
                    <option value="">اختر التصنيف</option>
                    {references.classes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name_ar}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {scopeForm.type === "governance_level" && (
                <Field label="المستوى التنظيمي">
                  <input
                    className={input}
                    value={scopeForm.level}
                    placeholder="مثال: الجامعة"
                    onChange={(e) =>
                      setScopeForm({ ...scopeForm, level: e.target.value })
                    }
                  />
                </Field>
              )}
              <Field
                label="أولوية النطاق"
                hint="تستخدم عند وجود أكثر من لائحة منطبقة"
              >
                <input
                  type="number"
                  className={input}
                  value={scopeForm.priority}
                  onChange={(e) =>
                    setScopeForm({ ...scopeForm, priority: e.target.value })
                  }
                />
              </Field>
              <Field label="بداية السريان (اختياري)">
                <input
                  type="date"
                  className={input}
                  value={scopeForm.from}
                  onChange={(e) =>
                    setScopeForm({ ...scopeForm, from: e.target.value })
                  }
                />
              </Field>
              <Field label="نهاية السريان (اختياري)">
                <input
                  type="date"
                  className={input}
                  value={scopeForm.to}
                  onChange={(e) =>
                    setScopeForm({ ...scopeForm, to: e.target.value })
                  }
                />
              </Field>
            </div>
            <Action busy={busy} onClick={addScope} label="إضافة النطاق" />
          </Dialog>
        )}
        {modal === "review" && selectedVersion && detail && (
          <Dialog title="مراجعة الإصدار قبل الإرسال" onClose={closeModal} wide>
            <div className="rounded-q-card bg-q-bg p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-q-caption font-bold text-q-link">
                    ملخص الإصدار
                  </p>
                  <h3 className="mt-1 text-q-ui font-bold text-q-text">
                    {detail.name_ar}
                  </h3>
                  <p className="mt-1 text-q-caption text-q-text-3">
                    الإصدار{" "}
                    {selectedVersion.version_label ||
                      selectedVersion.version_no}
                  </p>
                </div>
                <QBadge className="rounded-full bg-q-success-soft px-3 py-1.5 text-q-caption font-bold text-q-success">
                  جاهز للمراجعة
                </QBadge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-q-control bg-q-surface p-4">
                  <span className="text-q-caption text-q-text-3">البنود</span>
                  <strong className="mt-1 block text-q-body text-q-text">
                    {selectedVersion.items.length}
                  </strong>
                </div>
                <div className="rounded-q-control bg-q-surface p-4">
                  <span className="text-q-caption text-q-text-3">
                    نطاقات السريان
                  </span>
                  <strong className="mt-1 block text-q-body text-q-text">
                    {selectedVersion.scopes.length}
                  </strong>
                </div>
                <div className="rounded-q-control bg-q-surface p-4">
                  <span className="text-q-caption text-q-text-3">
                    جاهزية التشغيل
                  </span>
                  <strong className="mt-1 block text-q-body text-q-success">
                    {selectedVersion.readiness_percent ??
                      selectedVersion.automation_readiness_pct ??
                      0}
                    %
                  </strong>
                </div>
              </div>
            </div>
            <QCard className="p-0 mt-4 rounded-q-card border border-q-border bg-q-warning-soft p-4 text-q-caption leading-6 text-q-warning">
              <strong className="block">ما الذي سيحدث بعد الإرسال؟</strong>
              سيُقفل تحرير هذه المسودة وتنتقل إلى مراجع مستقل. لا يستطيع منشئ
              الإصدار اعتماده بنفسه، ويمكن التفعيل فقط بعد اكتمال الاعتماد.
            </QCard>
            <div className="mt-4 space-y-2">
              {readinessChecks.map((check) => (
                <div
                  key={check.label}
                  className="flex items-center gap-2 text-q-caption text-q-text-2"
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full ${check.done ? "bg-q-success text-q-on-primary" : "bg-q-warning-soft text-q-warning"}`}
                  >
                    {check.done ? <Check size={11} /> : "!"}
                  </span>
                  {check.label}
                </div>
              ))}
            </div>
            <Action
              busy={busy}
              onClick={submitForReview}
              label="تأكيد الإرسال للمراجعة"
            />
          </Dialog>
        )}
        {modal === "approve" && selectedVersion && detail && (
          <Dialog title="اعتماد الإصدار" onClose={closeModal}>
            <QCard className="p-0 rounded-q-control border border-q-border bg-q-bg p-4">
              <p className="text-q-caption font-bold text-q-link">
                اعتماد مستقل
              </p>
              <h3 className="mt-1 text-q-ui font-bold text-q-text">
                {detail.name_ar} · v
                {selectedVersion.version_label || selectedVersion.version_no}
              </h3>
              <p className="mt-2 text-q-caption leading-5 text-q-text-2">
                سيتم اعتماد الإصدار فقط إذا كان المستخدم الحالي ليس هو نفس من
                أرسله للمراجعة. هذه القاعدة مفروضة من قاعدة البيانات وليست مجرد
                تنبيه واجهة.
              </p>
            </QCard>
            <QCard className="p-0 mt-3 rounded-q-control border border-q-border bg-q-warning-soft p-3 text-q-caption leading-5 text-q-warning">
              بعد الاعتماد لا يتم تشغيل اللائحة تلقائيًا؛ يجب تحديد تاريخ النفاذ
              ثم التفعيل عندما تكون الجاهزية مكتملة.
            </QCard>
            <Action
              busy={busy}
              disabled={!canApproveVersion}
              onClick={() =>
                lifecycle(
                  "admin_approve_policy_version",
                  {},
                  "تم اعتماد الإصدار.",
                )
              }
              label="تأكيد الاعتماد"
            />
          </Dialog>
        )}
        {modal === "activate" && (
          <Dialog title="تفعيل الإصدار" onClose={closeModal}>
            <div className="mb-4 grid gap-2">
              {activationBlockers.map((check) => (
                <div
                  key={check.label}
                  className={`flex items-center gap-2 rounded-q-control border px-3 py-2 text-q-caption font-bold ${check.done ? "border-q-border bg-q-success-soft text-q-success" : "border-q-border bg-q-warning-soft text-q-warning"}`}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full ${check.done ? "bg-q-success text-q-on-primary" : "bg-q-warning-soft text-q-warning"}`}
                  >
                    {check.done ? <Check size={10} /> : "!"}
                  </span>
                  {check.label}
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="بداية السريان">
                <input
                  type="date"
                  className={input}
                  value={lifecycleForm.from}
                  onChange={(e) =>
                    setLifecycleForm({ ...lifecycleForm, from: e.target.value })
                  }
                />
              </Field>
              <Field label="نهاية السريان (اختياري)">
                <input
                  type="date"
                  className={input}
                  value={lifecycleForm.to}
                  onChange={(e) =>
                    setLifecycleForm({ ...lifecycleForm, to: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="mt-4 rounded-q-control bg-q-surface-2 p-3 text-q-caption leading-5 text-q-link">
              عند التفعيل تصبح النسخة نافذة ومقفلة ضد التعديل. أي تغيير لاحق يتم
              عبر إنشاء نسخة جديدة.
            </div>
            <Action
              busy={busy}
              disabled={!canActivatePolicy}
              onClick={() =>
                lifecycle(
                  "admin_activate_policy_version",
                  {
                    p_effective_from: lifecycleForm.from,
                    p_effective_to: lifecycleForm.to || null,
                  },
                  "تم تفعيل الإصدار.",
                )
              }
              label="تأكيد التفعيل"
            />
          </Dialog>
        )}
        {modal === "suspend" && (
          <Dialog title="تعليق الإصدار النافذ" onClose={closeModal}>
            <Field label="سبب التعليق" hint="يجب ألا يقل عن عشرة أحرف">
              <textarea
                className={textarea}
                value={lifecycleForm.reason}
                onChange={(e) =>
                  setLifecycleForm({ ...lifecycleForm, reason: e.target.value })
                }
              />
            </Field>
            <Action
              busy={busy}
              onClick={() =>
                lifecycle(
                  "admin_suspend_policy_version",
                  { p_reason: lifecycleForm.reason },
                  "تم تعليق الإصدار.",
                )
              }
              label="تعليق الإصدار"
              danger
            />
          </Dialog>
        )}
        {modal === "workflow" && (
          <Dialog title="إنشاء قالب مسار" onClose={closeModal}>
            <div className="space-y-4">
              <Field label="رمز القالب">
                <input
                  className={input}
                  dir="ltr"
                  value={workflowForm.code}
                  onChange={(e) =>
                    setWorkflowForm({ ...workflowForm, code: e.target.value })
                  }
                />
              </Field>
              <Field label="اسم القالب">
                <input
                  className={input}
                  value={workflowForm.name}
                  onChange={(e) =>
                    setWorkflowForm({ ...workflowForm, name: e.target.value })
                  }
                />
              </Field>
              <Field label="الوصف">
                <textarea
                  className={textarea}
                  value={workflowForm.description}
                  onChange={(e) =>
                    setWorkflowForm({
                      ...workflowForm,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Action busy={busy} onClick={createWorkflow} label="إنشاء القالب" />
          </Dialog>
        )}
        {modal === "step" && (
          <Dialog
            title={editingStepId ? "تعديل خطوة المسار" : "إضافة خطوة للمسار"}
            onClose={closeModal}
            wide
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <section className="rounded-q-control border border-q-border bg-q-bg p-4">
                <h3 className="mb-3 text-q-caption font-bold text-q-text">
                  بيانات الخطوة
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="رمز الخطوة"
                    hint="رمز داخلي مختصر لا يتغير بعد الإنشاء"
                  >
                    <input
                      disabled={Boolean(editingStepId)}
                      className={input}
                      dir="ltr"
                      value={stepForm.code}
                      onChange={(e) =>
                        setStepForm({ ...stepForm, code: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="اسم الخطوة">
                    <input
                      className={input}
                      value={stepForm.name}
                      onChange={(e) =>
                        setStepForm({ ...stepForm, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="ما الذي يحدث في هذه الخطوة؟">
                    <select
                      className={input}
                      value={stepForm.type}
                      onChange={(e) =>
                        setStepForm({ ...stepForm, type: e.target.value })
                      }
                    >
                      {Object.entries(stepTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ترتيب الخطوة">
                    <input
                      type="number"
                      className={input}
                      value={stepForm.sequence}
                      onChange={(e) =>
                        setStepForm({ ...stepForm, sequence: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </section>

              <section className="rounded-q-control border border-q-border bg-q-bg p-4">
                <h3 className="mb-3 text-q-caption font-bold text-q-text">
                  المسؤولية
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="نوع مسؤولية الجهة">
                    <select
                      className={input}
                      value={stepForm.responsibility}
                      onChange={(e) =>
                        setStepForm({
                          ...stepForm,
                          responsibility: e.target.value,
                        })
                      }
                    >
                      {Object.entries(responsibilityLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="الجهة المسؤولة">
                    <select
                      className={input}
                      value={stepForm.unit}
                      onChange={(e) =>
                        setStepForm({
                          ...stepForm,
                          unit: e.target.value,
                          classId: "",
                        })
                      }
                    >
                      <option value="">تحدد تلقائيًا حسب التصنيف</option>
                      {references.units.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name_ar}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="تصنيف الجهة المسؤولة"
                    hint="استخدمه عندما لا تريد تحديد مجلس بعينه"
                  >
                    <select
                      className={input}
                      value={stepForm.classId}
                      onChange={(e) =>
                        setStepForm({
                          ...stepForm,
                          classId: e.target.value,
                          unit: "",
                        })
                      }
                    >
                      <option value="">غير محدد</option>
                      {references.classes.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name_ar}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>
            </div>

            <section className="mt-4 rounded-q-control border border-q-border bg-q-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-q-caption font-bold text-q-text">
                    النتائج الممكنة
                  </h3>
                  <p className="mt-1 text-q-caption text-q-text-3">
                    اختر النتائج التي يمكن أن تخرج بها هذه الخطوة، وسيستخدمها
                    النظام عند ربط الانتقالات.
                  </p>
                </div>
                <QBadge className="rounded-full bg-q-surface-2 px-2.5 py-1 text-q-caption font-bold text-q-primary">
                  {selectedStepOutcomes.length} محددة
                </QBadge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {outcomeOptions.map((outcome) => {
                  const active = selectedStepOutcomes.includes(outcome);
                  return (
                    <QButton variant="ghost"
                      type="button"
                      key={outcome}
                      onClick={() => toggleStepOutcome(outcome)}
                      className={`min-w-11 flex min-h-11 items-center gap-2 rounded-q-control border px-3 text-q-ui font-bold transition ${active ? "border-q-primary bg-q-primary text-q-on-primary" : "border-q-border bg-q-bg text-q-text-2 hover:border-q-primary"}`}
                    >
                      <span
                        className={`grid h-4 w-4 place-items-center rounded-full ${active ? "bg-q-surface text-q-primary" : "bg-q-surface text-transparent"}`}
                      >
                        <Check size={10} />
                      </span>
                      {outcomeLabels[outcome]}
                    </QButton>
                  );
                })}
              </div>
            </section>

            <div className="mt-4 flex flex-wrap gap-3 rounded-q-control bg-q-bg p-3 text-q-caption text-q-text-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={stepForm.initial}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, initial: e.target.checked })
                  }
                />{" "}
                هذه أول خطوة في المسار
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={stepForm.terminal}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, terminal: e.target.checked })
                  }
                />{" "}
                تنتهي رحلة القرار عند هذه الخطوة
              </label>
            </div>
            <Action
              busy={busy}
              onClick={addStep}
              label={editingStepId ? "حفظ التعديلات" : "إضافة الخطوة"}
            />
          </Dialog>
        )}
        {modal === "transition" && (
          <Dialog title="ربط نتيجة الخطوة بالوجهة التالية" onClose={closeModal}>
            <div className="space-y-4">
              <Field label="الخطوة الحالية">
                <select
                  className={input}
                  value={transitionForm.from}
                  onChange={(e) => {
                    const step = selectedWorkflow?.versions[0]?.steps.find(
                      (item) => item.id === e.target.value,
                    );
                    setTransitionForm({
                      ...transitionForm,
                      from: e.target.value,
                      outcome: step?.allowed_outcomes[0] ?? "",
                      to: "",
                    });
                  }}
                >
                  <option value="">اختر الخطوة</option>
                  {selectedWorkflow?.versions[0]?.steps.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name_ar}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="عندما تكون النتيجة">
                <select
                  className={input}
                  value={transitionForm.outcome}
                  onChange={(e) =>
                    setTransitionForm({
                      ...transitionForm,
                      outcome: e.target.value,
                    })
                  }
                >
                  <option value="">اختر النتيجة</option>
                  {(
                    selectedWorkflow?.versions[0]?.steps.find(
                      (step) => step.id === transitionForm.from,
                    )?.allowed_outcomes ?? []
                  ).map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {outcomeLabels[outcome] ?? outcome}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="انتقل إلى">
                <select
                  className={input}
                  value={transitionForm.to}
                  onChange={(e) =>
                    setTransitionForm({ ...transitionForm, to: e.target.value })
                  }
                >
                  <option value="">إنهاء المسار</option>
                  {selectedWorkflow?.versions[0]?.steps
                    .filter((step) => step.id !== transitionForm.from)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name_ar}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="سلوك الانتقال">
                <select
                  className={input}
                  value={transitionForm.type}
                  onChange={(e) =>
                    setTransitionForm({
                      ...transitionForm,
                      type: e.target.value,
                    })
                  }
                >
                  {Object.entries(transitionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4 rounded-q-control bg-q-surface-2 p-3 text-q-caption leading-5 text-q-link">
              مثال: عند موافقة مجلس القسم، انتقل إلى اعتماد مجلس الكلية.
            </div>
            <Action busy={busy} onClick={addTransition} label="حفظ الربط" />
          </Dialog>
        )}
        {modal === "exception" && (
          <Dialog title="طلب مسار استثنائي" onClose={closeModal}>
            <div className="space-y-4">
              <Field label="نوع الطلب">
                <select
                  className={input}
                  value={exceptionForm.type}
                  onChange={(e) =>
                    setExceptionForm({ ...exceptionForm, type: e.target.value })
                  }
                >
                  <option value="exception">
                    استثناء لموضوع محظور أو متعارض
                  </option>
                  <option value="custom">مسار مخصص مصرح به</option>
                </select>
              </Field>
              <Field label="معرف الموضوع">
                <input
                  className={input}
                  dir="ltr"
                  value={exceptionForm.topic}
                  onChange={(e) =>
                    setExceptionForm({
                      ...exceptionForm,
                      topic: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="قالب المسار الفعال">
                <select
                  className={input}
                  value={exceptionForm.workflow}
                  onChange={(e) =>
                    setExceptionForm({
                      ...exceptionForm,
                      workflow: e.target.value,
                    })
                  }
                >
                  <option value="">اختر</option>
                  {activeWorkflowVersions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="صالح حتى">
                <input
                  type="datetime-local"
                  className={input}
                  value={exceptionForm.until}
                  onChange={(e) =>
                    setExceptionForm({
                      ...exceptionForm,
                      until: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="مبرر الاستثناء">
                <textarea
                  className={textarea}
                  value={exceptionForm.reason}
                  onChange={(e) =>
                    setExceptionForm({
                      ...exceptionForm,
                      reason: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Action
              busy={busy}
              onClick={requestException}
              label="إرسال للمراجعة"
            />
          </Dialog>
        )}
        {modal === "class" && (
          <Dialog title="إضافة تصنيف مجلس جديد" onClose={closeModal}>
            <div className="space-y-4">
              <Field
                label="الرمز الرمزي (Code)"
                hint="رمز بالإنجليزية مثل department_council"
              >
                <input
                  className={input}
                  dir="ltr"
                  value={classForm.code}
                  onChange={(e) =>
                    setClassForm({ ...classForm, code: e.target.value })
                  }
                />
              </Field>
              <Field label="اسم التصنيف بالعربية">
                <input
                  className={input}
                  value={classForm.name_ar}
                  onChange={(e) =>
                    setClassForm({ ...classForm, name_ar: e.target.value })
                  }
                />
              </Field>
              <Field label="اسم التصنيف بالإنجليزي (اختياري)">
                <input
                  className={input}
                  dir="ltr"
                  value={classForm.name_en}
                  onChange={(e) =>
                    setClassForm({ ...classForm, name_en: e.target.value })
                  }
                />
              </Field>
              <Field label="المستوى التنظيمي">
                <select
                  className={input}
                  value={classForm.level}
                  onChange={(e) =>
                    setClassForm({ ...classForm, level: e.target.value })
                  }
                >
                  {governanceLevelValues.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="الوصف">
                <textarea
                  className={textarea}
                  value={classForm.description}
                  onChange={(e) =>
                    setClassForm({ ...classForm, description: e.target.value })
                  }
                />
              </Field>
            </div>
            <Action
              busy={busy}
              onClick={saveGovernanceClass}
              label="حفظ تصنيف المجلس"
            />
          </Dialog>
        )}
        {modal === "category" && (
          <Dialog title="إضافة فئة موضوعات جديدة" onClose={closeModal}>
            <div className="space-y-4">
              <Field
                label="الرمز الرمزي (Code)"
                hint="رمز بالإنجليزية مثل department_curriculum_programs"
              >
                <input
                  className={input}
                  dir="ltr"
                  value={categoryForm.code}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, code: e.target.value })
                  }
                />
              </Field>
              <Field label="اسم الفئة بالعربية">
                <input
                  className={input}
                  value={categoryForm.name_ar}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      name_ar: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="اسم الفئة بالإنجليزي (اختياري)">
                <input
                  className={input}
                  dir="ltr"
                  value={categoryForm.name_en}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      name_en: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="الوصف">
                <textarea
                  className={textarea}
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Action
              busy={busy}
              onClick={saveTopicCategory}
              label="حفظ فئة الموضوعات"
            />
          </Dialog>
        )}
        {modal === "import_bundle" && (
          <Dialog
            title="استيراد حزمة لائحة ومسارات (JSON Bundle)"
            onClose={closeModal}
            wide
          >
            <div className="space-y-4">
              <QCard className="p-0 rounded-q-control border border-q-border bg-q-surface-2 p-3 text-q-caption leading-5 text-q-link">
                <strong>
                  استيراد حزمة تشغيلية متكاملة (qarar.policy_import.v3)
                </strong>
                : قم بلصق نص ملف الـ JSON الذي يحتوي اللائحة وموادها وقوالب
                المسارات والانتقالات، وسيقوم النظام بتعالجها وحل المراجع
                تلقائياً.
              </QCard>
              <Field label="محتوى ملف JSON">
                <textarea
                  rows={12}
                  className={`${textarea} font-mono text-q-ui`}
                  dir="ltr"
                  placeholder='{"schema_version": "qarar.policy_import.v3", ...}'
                  value={bundleJsonText}
                  onChange={(e) => setBundleJsonText(e.target.value)}
                />
              </Field>
            </div>
            <Action
              busy={busy}
              onClick={importPolicyBundle}
              label="استيراد الحزمة ذريًا"
            />
          </Dialog>
        )}
      </div>
    </div>
  );
}

function Action({
  busy,
  onClick,
  label,
  danger = false,
  disabled = false,
}: {
  busy: boolean;
  onClick: () => void;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end">
      <QButton type="submit" variant="ghost"
        disabled={busy || disabled}
        onClick={onClick}
        className={`min-w-11 flex min-h-11 items-center gap-2 rounded-q-control px-4 text-q-ui font-bold text-q-on-primary disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "bg-q-danger" : "bg-q-primary"}`}
      >
        {busy && <LoaderCircle className="animate-spin" size={14} />} {label}
      </QButton>
    </div>
  );
}
