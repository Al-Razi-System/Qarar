"use client";

import { Card as QCard } from "@/shared/ui/card";
import { Badge as QBadge } from "@/shared/ui/badge";

import { Button as QButton } from "@/shared/ui/button";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  ChevronDown,
  FileText,
  FolderTree,
  Gavel,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Paperclip,
  Plus,
  Route,
  Send,
  ShieldCheck,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { readUploadResponse } from "@/shared/api/upload-response";
import type {
  Policy,
  PolicyItem,
  LegislativeReadiness,
  ReferenceOption,
  WorkflowTemplate,
} from "../model/types";
import { workflowTemplatesFromResponse } from "../model/workflow-contract";
import { LegislativeModelWorkspace } from "./legislative-model-workspace";

type Stage =
  | "policy"
  | "version"
  | "legal"
  | "item"
  | "scope"
  | "workflow"
  | "review"
  | "approve"
  | "activate"
  | "suspend"
  | "attachment"
  | "rules";
type Notice = { kind: "success" | "error"; text: string } | null;
type ItemCriterion = {
  field: string;
  value: string;
  inverted: boolean;
};
type References = {
  units: ReferenceOption[];
  classes: ReferenceOption[];
  categories: ReferenceOption[];
  users: ReferenceOption[];
  governanceLevels: Array<{ value: string; label: string }>;
};

const input =
  "h-10 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary/10";
const textarea =
  "min-h-24 w-full rounded-q-control border border-q-border bg-q-surface p-3 text-q-caption leading-5 outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary/10";
const legalLabels: Record<string, string> = {
  draft: "مسودة",
  under_review: "قيد المراجعة",
  approved: "معتمدة",
  effective: "نافذة",
  suspended: "معلقة",
  expired: "منتهية",
};
const scopeLabels: Record<string, string> = {
  organization: "المنظمة كاملة",
  governance_unit: "مجلس محدد",
  governance_class: "تصنيف مجالس",
  governance_level: "مستوى تنظيمي",
  unit_subtree: "وحدة والجهات التابعة",
};

const itemCriterionFields = [
  { value: "", label: "ينطبق على جميع الموضوعات" },
  { value: "request_type", label: "نوع الطلب" },
  { value: "academic_level", label: "المستوى الأكاديمي" },
  { value: "priority", label: "أولوية الموضوع" },
  { value: "source_type", label: "مصدر الموضوع" },
  { value: "governance_level", label: "المستوى التنظيمي" },
];

function readItemCriterion(criteria: Record<string, unknown>): ItemCriterion {
  const inverted =
    criteria.not && typeof criteria.not === "object" && !Array.isArray(criteria.not)
      ? (criteria.not as Record<string, unknown>)
      : null;
  const source = inverted ?? criteria;
  const entry = Object.entries(source).find(
    ([key, value]) =>
      itemCriterionFields.some((field) => field.value === key) &&
      ["string", "number", "boolean"].includes(typeof value),
  );
  return {
    field: entry?.[0] ?? "",
    value: entry ? String(entry[1]) : "",
    inverted: Boolean(inverted),
  };
}

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/regulations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  if (label.includes("JSON")) return null;
  return (
    <label className="block">
      <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-q-caption leading-normal text-q-text-3">
          {hint}
        </span>
      )}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-q-header/55 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-q-card bg-q-surface shadow-2xl ${wide ? "max-w-4xl" : "max-w-xl"}`}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-q-border bg-q-surface/95 px-5 py-4 backdrop-blur">
          <h2 className="text-q-ui font-bold text-q-text">{title}</h2>
          <QButton variant="ghost"
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control bg-q-surface-2 text-q-text-3"
          >
            <X size={15} />
          </QButton>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

export function PolicyManagementWorkspace({
  policy,
  onPolicyChange,
}: {
  policy: Policy;
  onPolicyChange: (policy: Policy) => void;
}) {
  const [selectedVersionId, setSelectedVersionId] = useState(
    policy.versions?.[0]?.id ?? "",
  );
  const selectedVersion =
    policy.versions?.find((version) => version.id === selectedVersionId) ??
    policy.versions?.[0];
  const canDeleteSelectedVersion = Boolean(
    selectedVersion &&
    selectedVersion.legal_status === "draft" &&
    selectedVersion.items.length === 0 &&
    selectedVersion.scopes.length === 0 &&
    (selectedVersion.attachments?.length ?? 0) === 0 &&
    !selectedVersion.issuing_authority &&
    !selectedVersion.approval_authority &&
    !selectedVersion.approval_decision_number &&
    !selectedVersion.approval_date &&
    !selectedVersion.source_document_hash,
  );
  const itemsByParent = useMemo(() => {
    const groups = new Map<string | null, PolicyItem[]>();
    for (const item of selectedVersion?.items ?? []) {
      const key = item.parent_item_id ?? null;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    groups.forEach((items) =>
      items.sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.title_ar.localeCompare(right.title_ar, "ar"),
      ),
    );
    return groups;
  }, [selectedVersion?.items]);
  const [stage, setStage] = useState<Stage | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [references, setReferences] = useState<References>({
    units: [],
    classes: [],
    categories: [],
    users: [],
    governanceLevels: [],
  });
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [legislativeReadiness, setLegislativeReadiness] =
    useState<LegislativeReadiness | null>(null);
  const [editingItem, setEditingItem] = useState<PolicyItem | null>(null);
  const [rulesItem, setRulesItem] = useState<PolicyItem | null>(null);
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [policyForm, setPolicyForm] = useState({
    name_ar: policy.name_ar,
    name_en: policy.name_en ?? "",
    description: policy.description ?? "",
    status: policy.status,
    owner_user_id: policy.owner_user_id ?? "",
    owner_governance_unit_id: policy.owner_governance_unit_id ?? "",
    legal_reference: policy.legal_reference ?? "",
    decision_number: policy.decision_number ?? "",
  });
  const [versionForm, setVersionForm] = useState({ label: "", summary: "" });
  const [legalVersionForm, setLegalVersionForm] = useState({
    issuing_authority: "",
    approval_authority: "",
    approval_decision_number: "",
    approval_date: "",
    issue_reason: "",
    supersedes_version_id: "",
    source_document_hash: "",
  });
  const [itemForm, setItemForm] = useState({
    code: "",
    title: "",
    body: "",
    type: "article",
    mode: "regulation_required",
    category: "",
    workflow: "",
    parent: "",
    sort: "10",
    criteria: "{}",
  });
  const [itemCriterion, setItemCriterion] = useState<ItemCriterion>({
    field: "",
    value: "",
    inverted: false,
  });
  const [scopeForm, setScopeForm] = useState({
    type: "organization",
    target: "",
    level: "university",
    priority: "100",
    from: "",
    to: "",
    descendants: false,
  });
  const [lifecycleForm, setLifecycleForm] = useState({
    from: "",
    to: "",
    reason: "",
  });
  const [attachmentForm, setAttachmentForm] = useState({
    target: "policy",
    itemId: "",
    name: "",
    url: "",
    mime: "",
    description: "",
  });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const activeWorkflows = useMemo(
    () =>
      workflows.flatMap((template) =>
        template.versions
          .filter((version) => version.status === "active")
          .map((version) => ({
            id: version.id,
            label: `${template.name_ar} · الإصدار ${version.version_no}`,
          })),
      ),
    [workflows],
  );
  const requiredItems =
    selectedVersion?.items.filter(
      (item) => item.governance_mode === "regulation_required",
    ) ?? [];
  const requiredItemsLinked =
    Boolean(selectedVersion?.items.length) &&
    requiredItems.every((item) => item.workflow_template_version_id);
  const visibleAttachments = [
    ...(policy.attachments ?? []).map((attachment) => ({
      ...attachment,
      targetLabel: "اللائحة",
    })),
    ...(selectedVersion?.attachments ?? []).map((attachment) => ({
      ...attachment,
      targetLabel: `الإصدار ${selectedVersion?.version_label || selectedVersion?.version_no}`,
    })),
    ...(selectedVersion?.items.flatMap((item) =>
      (item.attachments ?? []).map((attachment) => ({
        ...attachment,
        targetLabel: item.title_ar,
      })),
    ) ?? []),
  ];
  const readiness = [
    {
      label: "بيانات اللائحة محفوظة",
      done: Boolean(policy.name_ar && policy.code),
    },
    { label: "إصدار العمل موجود", done: Boolean(selectedVersion) },
    {
      label: "بند لائحي واحد على الأقل",
      done: Boolean(selectedVersion?.items.length),
    },
    {
      label: "نطاق سريان واحد على الأقل",
      done: Boolean(selectedVersion?.scopes.length),
    },
    { label: "ربط البنود الإلزامية بمسار فعال", done: requiredItemsLinked },
  ];
  const canSubmit =
    selectedVersion?.legal_status === "draft" &&
    readiness.every((check) => check.done);
  const canActivate =
    selectedVersion?.legal_status === "approved" &&
    selectedVersion.automation_status === "ready" &&
    (selectedVersion.readiness_percent ??
      selectedVersion.automation_readiness_pct ??
      0) >= 100;

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "stage",
    ) as Stage | null;
    if (
      requested &&
      [
        "policy",
        "version",
        "legal",
        "item",
        "scope",
        "workflow",
        "review",
        "approve",
        "activate",
        "suspend",
        "attachment",
      ].includes(requested)
    )
      void openStage(requested);
    // Deep links are intentionally handled once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh(success?: string) {
    const updated = await rpc<Policy>("admin_get_policy_detail", {
      p_policy_id: policy.id,
    });
    onPolicyChange(updated);
    if (success) setNotice({ kind: "success", text: success });
  }

  async function saveLegalVersionMetadata() {
    if (!selectedVersion) return;
    await run(
      () =>
        rpc("admin_update_policy_version_legal_metadata", {
          p_policy_version_id: selectedVersion.id,
          p_issuing_authority: legalVersionForm.issuing_authority || null,
          p_approval_authority: legalVersionForm.approval_authority || null,
          p_approval_decision_number:
            legalVersionForm.approval_decision_number || null,
          p_approval_date: legalVersionForm.approval_date || null,
          p_issue_reason: legalVersionForm.issue_reason || null,
          p_supersedes_version_id:
            legalVersionForm.supersedes_version_id || null,
          p_source_document_hash: legalVersionForm.source_document_hash || null,
        }),
      "تم حفظ بيانات الإصدار القانونية.",
    );
  }

  async function removeEmptyVersion() {
    if (!selectedVersion) return;
    if (
      !window.confirm(
        "سيُحذف الإصدار المسودة الفارغ نهائيًا. هل تريد المتابعة؟",
      )
    )
      return;
    await run(
      () =>
        rpc("admin_remove_empty_policy_version", {
          p_policy_version_id: selectedVersion.id,
        }),
      "تم حذف الإصدار المسودة الفارغ.",
    );
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await refresh(success);
      closeModal();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر تنفيذ العملية.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function loadReferences() {
    if (
      references.units.length ||
      references.classes.length ||
      references.categories.length
    )
      return;
    const [units, classes, categories, workflowList, formOptions] =
      await Promise.all([
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
          {
            p_query: null,
            p_is_active: true,
            p_limit: 100,
            p_offset: 0,
          },
        ),
        rpc<{ items: ReferenceOption[] }>("admin_list_topic_categories", {
          p_query: null,
          p_is_active: true,
          p_limit: 100,
          p_offset: 0,
        }),
        rpc<unknown>("admin_list_workflow_templates"),
        rpc<{
          users: ReferenceOption[];
          governance_levels: Array<{ value: string; label: string }>;
        }>("get_policy_form_options"),
      ]);
    setReferences({
      units: units.items,
      classes: classes.items,
      categories: categories.items,
      users: formOptions.users,
      governanceLevels: formOptions.governance_levels,
    });
    setWorkflows(workflowTemplatesFromResponse(workflowList));
  }

  async function openStage(next: Stage) {
    if (["policy", "item", "scope", "workflow"].includes(next))
      await loadReferences();
    if (next === "item" && !editingItem) {
      setItemCriterion({ field: "", value: "", inverted: false });
      setItemForm({
        code: "",
        title: "",
        body: "",
        type: "article",
        mode: "regulation_required",
        category: "",
        workflow: "",
        parent: "",
        sort: String((selectedVersion?.items.at(-1)?.sort_order ?? 0) + 10),
        criteria: "{}",
      });
    }
    if (next === "legal")
      setLegalVersionForm({
        issuing_authority: selectedVersion?.issuing_authority ?? "",
        approval_authority: selectedVersion?.approval_authority ?? "",
        approval_decision_number:
          selectedVersion?.approval_decision_number ?? "",
        approval_date: selectedVersion?.approval_date ?? "",
        issue_reason: selectedVersion?.issue_reason ?? "",
        supersedes_version_id: selectedVersion?.supersedes_version_id ?? "",
        source_document_hash: selectedVersion?.source_document_hash ?? "",
      });
    if (next === "review" && selectedVersion) {
      setLegislativeReadiness(
        await rpc<LegislativeReadiness>(
          "admin_validate_policy_version_readiness",
          { p_policy_version_id: selectedVersion.id },
        ),
      );
    }
    setStage(next);
    document
      .getElementById("policy-management")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeModal() {
    setStage(null);
    setEditingItem(null);
    setRulesItem(null);
    if (window.location.search.includes("stage="))
      window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.hash,
      );
  }

  function editItem(item: PolicyItem) {
    setEditingItem(item);
    setItemCriterion(readItemCriterion(item.match_criteria ?? {}));
    setItemForm({
      code: item.item_code,
      title: item.title_ar,
      body: item.body_text ?? "",
      type: item.item_type,
      mode: item.governance_mode,
      category: item.topic_category_id ?? "",
      workflow: item.workflow_template_version_id ?? "",
      parent: item.parent_item_id ?? "",
      sort: String(item.sort_order),
      criteria: JSON.stringify(item.match_criteria ?? {}, null, 2),
    });
    void openStage("item");
  }

  function openRules(item: PolicyItem) {
    setRulesItem(item);
    setStage("rules");
  }

  async function addChildItem(parent: PolicyItem) {
    await loadReferences();
    setEditingItem(null);
    setItemCriterion({ field: "", value: "", inverted: false });
    setItemForm({
      code: "",
      title: "",
      body: "",
      type: parent.item_type === "article" ? "clause" : "article",
      mode: "custom_route_allowed",
      category: "",
      workflow: "",
      parent: parent.id,
      sort: String(
        (itemsByParent.get(parent.id)?.at(-1)?.sort_order ?? 0) + 10,
      ),
      criteria: "{}",
    });
    setStage("item");
  }

  function toggleItemChildren(itemId: string) {
    setCollapsedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function parsedCriteria() {
    if (!itemCriterion.field) return {};
    if (!itemCriterion.value.trim()) {
      setNotice({
        kind: "error",
        text: "أدخل القيمة المطلوبة لشرط انطباق البند.",
      });
      return null;
    }
    const visualCriterion = {
      [itemCriterion.field]: itemCriterion.value.trim(),
    };
    if (itemCriterion.inverted) return { not: visualCriterion };
    return visualCriterion;

    try {
      const value = JSON.parse(itemForm.criteria || "{}");
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw new Error();
      return value as Record<string, unknown>;
    } catch {
      setNotice({
        kind: "error",
        text: "شروط المطابقة يجب أن تكون كائن JSON صالحًا.",
      });
      return null;
    }
  }

  async function saveItem() {
    if (!selectedVersion) return;
    const criteria = parsedCriteria();
    if (!criteria) return;
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
          p_title_en: null,
          p_body_text: itemForm.body || null,
          p_sort_order: Number(itemForm.sort),
          p_parent_item_id: itemForm.parent || null,
          p_item_type: itemForm.type,
          p_governance_mode: itemForm.mode,
          p_topic_category_id: itemForm.category || null,
          p_match_criteria: criteria,
          p_workflow_template_version_id: itemForm.workflow || null,
        };
    await run(async () => {
      const result = await rpc(contract, params);
      if (editingItem)
        await rpc("admin_move_policy_item", {
          p_policy_item_id: editingItem.id,
          p_parent_item_id: itemForm.parent || null,
          p_sort_order: Number(itemForm.sort),
        });
      return result;
    }, "تم حفظ بند اللائحة بنجاح.");
  }

  async function saveScope() {
    if (!selectedVersion) return;
    const needsTarget = [
      "governance_unit",
      "governance_class",
      "unit_subtree",
    ].includes(scopeForm.type);
    if (needsTarget && !scopeForm.target) {
      setNotice({
        kind: "error",
        text: "اختر المجلس أو التصنيف قبل إضافة نطاق التطبيق.",
      });
      return;
    }
    if (scopeForm.type === "governance_level" && !scopeForm.level) {
      setNotice({
        kind: "error",
        text: "اختر المستوى التنظيمي قبل إضافة نطاق التطبيق.",
      });
      return;
    }
    if (scopeForm.to && !scopeForm.from) {
      setNotice({
        kind: "error",
        text: "حدّد بداية السريان قبل تاريخ النهاية.",
      });
      return;
    }
    if (scopeForm.from && scopeForm.to && scopeForm.to < scopeForm.from) {
      setNotice({
        kind: "error",
        text: "تاريخ نهاية السريان يجب أن يكون بعد تاريخ البداية أو مساويًا له.",
      });
      return;
    }
    await run(
      () =>
        rpc("admin_set_policy_scope", {
          p_policy_version_id: selectedVersion.id,
          p_scope_type: scopeForm.type,
          p_target_id: scopeForm.target || null,
          p_governance_level:
            scopeForm.type === "governance_level" ? scopeForm.level : null,
          p_include_descendants:
            scopeForm.type === "unit_subtree" && scopeForm.descendants,
          p_priority: Number(scopeForm.priority),
          p_valid_from: scopeForm.from || null,
          p_valid_to: scopeForm.to || null,
        }),
      "تمت إضافة نطاق التطبيق.",
    );
  }

  async function uploadAttachment() {
    if (!attachmentFile) throw new Error("اختر ملفًا من جهازك.");
    const form = new FormData();
    form.set("file", attachmentFile);
    form.set("policyId", policy.id);
    form.set("target", attachmentForm.target);
    form.set("versionId", selectedVersion?.id ?? "");
    form.set("itemId", attachmentForm.itemId);
    form.set("description", attachmentForm.description);
    const response = await fetch("/api/admin/regulations/upload", {
      method: "POST",
      body: form,
    });
    const payload = await readUploadResponse(response);
    setAttachmentFile(null);
    return payload;
  }

  async function remove(
    contract: string,
    params: Record<string, unknown>,
    success: string,
  ) {
    if (!window.confirm("هل أنت متأكد من الحذف؟")) return;
    await run(() => rpc(contract, params), success);
  }

  const renderTreeNode = (
    item: PolicyItem,
    depth = 0,
    ancestry: string[] = [],
  ): React.ReactNode => {
    const children = (itemsByParent.get(item.id) ?? []).filter(
      (child) => !ancestry.includes(child.id),
    );
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedItemIds.has(item.id);
    const typeLabel: Record<string, string> = {
      chapter: "فصل",
      section: "قسم",
      article: "مادة",
      clause: "فقرة",
      procedure: "إجراء",
    };

    return (
      <div
        key={item.id}
        className="relative"
        style={{ marginRight: `min(${depth * 22}px, 12%)` }}
      >
        {depth > 0 && (
          <span className="absolute -right-[13px] top-0 h-7 w-3 border-b border-r border-q-border" />
        )}
        <article
          className={`group rounded-q-control border transition ${depth === 0 ? "border-q-border bg-q-surface " : "border-q-border bg-q-bg"}`}
        >
          <div className="flex flex-wrap items-start gap-2 p-3">
            <QButton variant="ghost"
              type="button"
              aria-label={
                hasChildren
                  ? isCollapsed
                    ? "توسيع العناصر الفرعية"
                    : "طي العناصر الفرعية"
                  : "لا توجد عناصر فرعية"
              }
              disabled={!hasChildren}
              onClick={() => toggleItemChildren(item.id)}
              className={`min-w-11 mt-0.5 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-q-control ${hasChildren ? "bg-q-surface-2 text-q-primary hover:bg-q-surface-2" : "bg-q-surface-2 text-q-text-3"}`}
            >
              {hasChildren ? (
                <ChevronDown
                  className={
                    isCollapsed
                      ? "-rotate-90 transition-transform"
                      : "transition-transform"
                  }
                  size={14}
                />
              ) : (
                <FolderTree size={13} />
              )}
            </QButton>
            <div className="min-w-0 flex-1 basis-40">
              <div className="flex flex-wrap items-center gap-2">
                <QBadge className="rounded-full bg-q-surface-2 px-2 py-0.5 text-q-caption font-bold text-q-primary">
                  {typeLabel[item.item_type] ?? item.item_type}
                </QBadge>
                <strong className="text-q-caption text-q-text">
                  {item.title_ar}
                </strong>
              </div>
              <p className="mt-1 line-clamp-2 text-q-caption leading-normal text-q-text-3">
                {item.body_text || "لا يوجد نص محفوظ لهذا البند."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-q-caption text-q-text-3">
                <code
                  dir="ltr"
                  className="rounded-q-control bg-q-surface-2 px-1.5 py-0.5 text-q-text-2"
                >
                  {item.item_code}
                </code>
                <span>ترتيب {item.sort_order}</span>
                {hasChildren && <span>{children.length} عناصر فرعية</span>}
              </div>
            </div>
            {selectedVersion?.legal_status === "draft" && (
              <div className="flex flex-wrap shrink-0 items-center gap-0.5 opacity-100 transition group-hover:opacity-100 sm:opacity-60">
                {["article", "clause", "procedure"].includes(
                  item.item_type,
                ) && (
                  <QButton variant="ghost"
                    type="button"
                    aria-label={`إدارة قواعد ${item.title_ar}`}
                    title="القواعد والتنفيذات"
                    onClick={() => openRules(item)}
                    className="min-w-11 rounded-q-control p-2 text-q-primary hover:bg-q-surface-2"
                  >
                    <Gavel size={13} />
                  </QButton>
                )}
                <QButton variant="ghost"
                  type="button"
                  aria-label={`إضافة عنصر فرعي إلى ${item.title_ar}`}
                  title="إضافة عنصر فرعي"
                  onClick={() => void addChildItem(item)}
                  className="min-w-11 rounded-q-control p-2 text-q-primary hover:bg-q-surface-2"
                >
                  <Plus size={13} />
                </QButton>
                <QButton type="submit" variant="ghost"
                  aria-label={`تعديل ${item.title_ar}`}
                  onClick={() => editItem(item)}
                  className="min-w-11 rounded-q-control p-2 text-q-primary hover:bg-q-surface-2"
                >
                  <Pencil size={13} />
                </QButton>
                <QButton type="submit" variant="ghost"
                  aria-label={`حذف ${item.title_ar}`}
                  onClick={() =>
                    remove(
                      "admin_remove_policy_item",
                      { p_policy_item_id: item.id },
                      "تم حذف البند.",
                    )
                  }
                  className="min-w-11 rounded-q-control p-2 text-q-danger hover:bg-q-danger-soft"
                >
                  <Trash2 size={13} />
                </QButton>
              </div>
            )}
          </div>
        </article>
        {hasChildren && !isCollapsed && (
          <div className="mr-3 mt-2 space-y-2 border-r border-q-border pr-3">
            {children.map((child) =>
              renderTreeNode(child, depth + 1, [...ancestry, item.id]),
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section id="policy-management" className="scroll-mt-28 space-y-4">
      {notice && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-q-control border p-3 text-q-caption font-bold ${notice.kind === "success" ? "border-q-border bg-q-success-soft text-q-success" : "border-q-border bg-q-danger-soft text-q-danger"}`}
        >
          {notice.kind === "success" ? (
            <Check size={15} />
          ) : (
            <AlertCircle size={15} />
          )}{" "}
          {notice.text}
        </div>
      )}

      <QCard className="p-0 overflow-hidden rounded-q-card border border-q-border bg-q-surface ">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-q-border bg-q-bg p-4">
          <div>
            <p className="text-q-caption font-bold text-q-link">
              مساحة التنفيذ
            </p>
            <h2 className="mt-1 text-q-ui font-bold text-q-text">
              إدارة الإصدار الحالي
            </h2>
            <p className="mt-1 text-q-caption text-q-text-3">
              نفّذ البنود والنطاقات والإجراءات من هذه الصفحة دون العودة إلى دليل
              اللوائح.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QButton type="submit" variant="ghost"
              onClick={() => openStage("attachment")}
              className="min-w-11 min-h-11 rounded-q-control border border-q-border px-3 text-q-ui font-bold text-q-text-2"
            >
              <Paperclip className="ml-1 inline" size={12} />
              المرفقات
            </QButton>
            <QButton type="submit" variant="ghost"
              onClick={() => openStage("policy")}
              className="min-w-11 min-h-11 rounded-q-control border border-q-border px-3 text-q-ui font-bold text-q-text-2"
            >
              <Pencil className="ml-1 inline" size={12} />
              تعديل البيانات
            </QButton>
            <QButton type="submit" variant="ghost"
              onClick={() => openStage("legal")}
              className="min-w-11 min-h-11 rounded-q-control border border-q-border px-3 text-q-ui font-bold text-q-text-2"
            >
              <FileText className="ml-1 inline" size={12} />
              بيانات الإصدار
            </QButton>
            <QButton type="submit" variant="ghost"
              onClick={() => openStage("scope")}
              className="min-w-11 min-h-11 rounded-q-control border border-q-border px-3 text-q-ui font-bold text-q-text-2"
            >
              <Route className="ml-1 inline" size={12} />
              نطاقات التطبيق
            </QButton>
            <QButton type="submit" variant="ghost"
              onClick={() => openStage("review")}
              className="min-w-11 min-h-11 rounded-q-control border border-q-border px-3 text-q-ui font-bold text-q-text-2"
            >
              <ShieldCheck className="ml-1 inline" size={12} />
              الجاهزية والاعتماد
            </QButton>
            {canDeleteSelectedVersion && (
              <QButton variant="ghost"
                type="button"
                disabled={busy}
                onClick={() => void removeEmptyVersion()}
                className="min-w-11 min-h-11 rounded-q-control border border-q-border px-3 text-q-ui font-bold text-q-danger hover:bg-q-danger-soft disabled:opacity-50"
              >
                <Trash2 className="ml-1 inline" size={12} />
                حذف الإصدار الفارغ
              </QButton>
            )}
            <QButton type="submit" variant="ghost"
              onClick={() => openStage("version")}
              className="min-w-11 min-h-11 rounded-q-control bg-q-primary px-3 text-q-ui font-bold text-q-on-primary"
            >
              <Plus className="ml-1 inline" size={12} />
              إصدار جديد
            </QButton>
          </div>
        </header>
        <div className="flex gap-2 overflow-x-auto border-b border-q-surface-2 p-3">
          {policy.versions?.map((version) => (
            <QButton type="submit" variant="ghost"
              key={version.id}
              onClick={() => {
                setSelectedVersionId(version.id);
                void openStage("legal");
              }}
              className={`min-w-11 shrink-0 rounded-q-control px-3 py-2 text-q-ui font-bold ${selectedVersion?.id === version.id ? "bg-q-header text-q-on-primary" : "bg-q-surface-2 text-q-text-2"}`}
            >
              v{version.version_label || version.version_no} ·{" "}
              {legalLabels[version.legal_status] ?? version.legal_status}
            </QButton>
          ))}
        </div>
        {stage === "rules" && rulesItem && (
          <Modal
            title={`القواعد والتنفيذات: ${rulesItem.title_ar}`}
            onClose={closeModal}
            wide
          >
            <div
              className={`mb-3 rounded-q-control border px-4 py-3 text-q-caption leading-5 ${
                rulesItem.requires_executable_rule
                  ? "border-q-border bg-q-surface-2 text-q-link"
                  : "border-q-border bg-q-neutral-soft text-q-text-2"
              }`}
            >
              {rulesItem.requires_executable_rule
                ? "هذه مادة تنفيذية؛ يمكنك مراجعة قواعدها الحالية أو إضافة أكثر من قاعدة مرتبطة بها."
                : "هذه مادة تعريفية أو تنظيمية ولا تتطلب قاعدة تنفيذية حاليًا. استخدم زر إنشاء قاعدة فقط إذا أردت تحويل حكم محدد فيها إلى تحقق أو إجراء آلي."}
            </div>
            <LegislativeModelWorkspace
              policy={policy}
              initialTab="rules"
              initialItemId={rulesItem.id}
              rulesOnly
            />
          </Modal>
        )}
        {stage === "legal" && selectedVersion && (
          <Modal title="بيانات الإصدار القانونية" onClose={closeModal} wide>
            <section className="bg-q-bg px-1 py-1">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-q-caption font-bold text-q-link">
                    بيانات قانونية للإصدار
                  </p>
                  <h3 className="mt-1 text-q-caption font-bold text-q-text">
                    الإصدار{" "}
                    {selectedVersion.version_label ||
                      selectedVersion.version_no}
                  </h3>
                </div>
                <QBadge className="rounded-full bg-q-surface-2 px-2.5 py-1 text-q-caption font-bold text-q-primary">
                  تخص الوثيقة كاملة وليست بندًا
                </QBadge>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="الجهة المصدرة">
                  <input
                    disabled={selectedVersion.legal_status !== "draft"}
                    className={input}
                    value={legalVersionForm.issuing_authority}
                    onChange={(e) =>
                      setLegalVersionForm({
                        ...legalVersionForm,
                        issuing_authority: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="جهة الاعتماد">
                  <input
                    disabled={selectedVersion.legal_status !== "draft"}
                    className={input}
                    value={legalVersionForm.approval_authority}
                    onChange={(e) =>
                      setLegalVersionForm({
                        ...legalVersionForm,
                        approval_authority: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="رقم قرار الاعتماد">
                  <input
                    disabled={selectedVersion.legal_status !== "draft"}
                    dir="ltr"
                    className={input}
                    value={legalVersionForm.approval_decision_number}
                    onChange={(e) =>
                      setLegalVersionForm({
                        ...legalVersionForm,
                        approval_decision_number: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="تاريخ الاعتماد">
                  <input
                    disabled={selectedVersion.legal_status !== "draft"}
                    type="date"
                    className={input}
                    value={legalVersionForm.approval_date}
                    onChange={(e) =>
                      setLegalVersionForm({
                        ...legalVersionForm,
                        approval_date: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="سبب الإصدار">
                  <select
                    disabled={selectedVersion.legal_status !== "draft"}
                    className={input}
                    value={legalVersionForm.issue_reason}
                    onChange={(e) =>
                      setLegalVersionForm({
                        ...legalVersionForm,
                        issue_reason: e.target.value,
                      })
                    }
                  >
                    <option value="">اختر</option>
                    <option value="initial">إصدار أول</option>
                    <option value="amendment">تعديل</option>
                    <option value="replacement">استبدال</option>
                    <option value="consolidation">دمج لوائح</option>
                  </select>
                </Field>
                <Field label="الإصدار السابق">
                  <select
                    disabled={selectedVersion.legal_status !== "draft"}
                    className={input}
                    value={legalVersionForm.supersedes_version_id}
                    onChange={(e) =>
                      setLegalVersionForm({
                        ...legalVersionForm,
                        supersedes_version_id: e.target.value,
                      })
                    }
                  >
                    <option value="">لا يستبدل إصدارًا</option>
                    {policy.versions
                      ?.filter((version) => version.id !== selectedVersion.id)
                      .map((version) => (
                        <option key={version.id} value={version.id}>
                          الإصدار {version.version_label || version.version_no}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field
                  label="البصمة الرقمية لملف المصدر"
                  hint="SHA-256 للتحقق من عدم تغيير ملف PDF"
                >
                  <input
                    disabled={selectedVersion.legal_status !== "draft"}
                    dir="ltr"
                    className={input}
                    value={legalVersionForm.source_document_hash}
                    onChange={(e) =>
                      setLegalVersionForm({
                        ...legalVersionForm,
                        source_document_hash: e.target.value,
                      })
                    }
                  />
                </Field>
                {selectedVersion.legal_status === "draft" && (
                  <QButton type="submit" variant="ghost"
                    disabled={busy}
                    onClick={() => void saveLegalVersionMetadata()}
                    className="min-w-11 min-h-11 rounded-q-control bg-q-header px-4 text-q-ui font-bold text-q-on-primary disabled:opacity-50"
                  >
                    حفظ بيانات الإصدار
                  </QButton>
                )}
              </div>
            </section>
          </Modal>
        )}
        {!selectedVersion ? (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div>
              <FileText className="mx-auto text-q-text-3" />
              <p className="mt-3 text-q-caption font-bold text-q-text">
                لا يوجد إصدار عمل
              </p>
              <QButton type="submit" variant="ghost"
                onClick={() => openStage("version")}
                className="min-w-11 mt-3 rounded-q-control bg-q-primary px-4 py-2 text-q-ui font-bold text-q-on-primary"
              >
                إنشاء الإصدار الأول
              </QButton>
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-4">
            <div className="space-y-4">
              <section className="min-h-[560px] overflow-hidden rounded-q-card border border-q-border bg-q-surface ">
                <div className="flex items-center justify-between bg-q-bg px-3 py-2.5">
                  <div>
                    <h3 className="text-q-caption font-bold text-q-text">
                      بنود اللائحة
                    </h3>
                    <p className="mt-0.5 text-q-caption text-q-text-3">
                      المواد وشروط المطابقة والمسارات المرتبطة.
                    </p>
                  </div>
                  {selectedVersion.legal_status === "draft" && (
                    <QButton type="submit" variant="ghost"
                      onClick={() => openStage("item")}
                      className="min-w-11 rounded-q-control bg-q-primary px-3 py-2 text-q-ui font-bold text-q-on-primary"
                    >
                      <Plus className="ml-1 inline" size={11} />
                      إضافة بند
                    </QButton>
                  )}
                </div>
                <div className="min-h-[480px] space-y-2 bg-q-bg p-4">
                  {selectedVersion.items
                    .filter(
                      (item) =>
                        !item.parent_item_id ||
                        !selectedVersion.items.some(
                          (candidate) => candidate.id === item.parent_item_id,
                        ),
                    )
                    .sort(
                      (left, right) =>
                        left.sort_order - right.sort_order ||
                        left.title_ar.localeCompare(right.title_ar, "ar"),
                    )
                    .map((item) => renderTreeNode(item))}
                  {!selectedVersion.items.length && (
                    <p className="rounded-q-control border border-dashed border-q-border bg-q-surface p-8 text-center text-q-caption text-q-text-3">
                      لم تُضف بنود بعد. أضف فصلاً أولاً ثم اربط المواد به.
                    </p>
                  )}
                </div>
                <div className="hidden">
                  {selectedVersion.items.map((item) => (
                    <article
                      key={item.id}
                      className="grid gap-2 px-3 py-3 md:grid-cols-[1fr_auto] md:items-center"
                    >
                      <div>
                        <strong className="text-q-caption text-q-text">
                          {item.title_ar}
                        </strong>
                        <p className="mt-1 line-clamp-2 text-q-caption leading-normal text-q-text-3">
                          {item.body_text || "لا يوجد نص."}
                        </p>
                        <span className="mt-1 inline-flex text-q-caption text-q-text-3">
                          {item.item_code} · ترتيب {item.sort_order}
                        </span>
                      </div>
                      {selectedVersion.legal_status === "draft" && (
                        <div className="flex gap-1">
                          <QButton type="submit" variant="ghost"
                            aria-label={`تعديل ${item.title_ar}`}
                            onClick={() => editItem(item)}
                            className="min-w-11 rounded-q-control p-2 text-q-primary hover:bg-q-surface-2"
                          >
                            <Pencil size={13} />
                          </QButton>
                          <QButton type="submit" variant="ghost"
                            aria-label={`حذف ${item.title_ar}`}
                            onClick={() =>
                              remove(
                                "admin_remove_policy_item",
                                { p_policy_item_id: item.id },
                                "تم حذف البند.",
                              )
                            }
                            className="min-w-11 rounded-q-control p-2 text-q-danger hover:bg-q-danger-soft"
                          >
                            <Trash2 size={13} />
                          </QButton>
                        </div>
                      )}
                    </article>
                  ))}
                  {!selectedVersion.items.length && (
                    <p className="p-8 text-center text-q-caption text-q-text-3">
                      لم تُضف بنود بعد.
                    </p>
                  )}
                </div>
              </section>
            </div>
            <aside className="hidden">
              <section className="rounded-q-control border border-q-border p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-q-caption font-bold text-q-text">
                    <Route className="ml-1 inline text-q-primary" size={14} />
                    نطاقات التطبيق
                  </h3>
                  {selectedVersion.legal_status === "draft" && (
                    <QButton type="submit" variant="ghost"
                      onClick={() => openStage("scope")}
                      className="min-w-11 rounded-q-control border border-q-border px-2 py-1.5 text-q-ui font-bold text-q-primary"
                    >
                      إضافة
                    </QButton>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {selectedVersion.scopes.map((scope) => (
                    <div
                      key={scope.id}
                      className="flex items-center justify-between rounded-q-control bg-q-bg p-2.5"
                    >
                      <div>
                        <strong className="text-q-caption text-q-text-2">
                          {scopeLabels[scope.scope_type] ?? scope.scope_type}
                        </strong>
                        <span className="mt-1 block text-q-caption text-q-text-3">
                          الأولوية {scope.priority} ·{" "}
                          {scope.valid_from || "عند التفعيل"}
                        </span>
                      </div>
                      {selectedVersion.legal_status === "draft" && (
                        <QButton type="submit" variant="ghost"
                          aria-label="حذف النطاق"
                          onClick={() =>
                            remove(
                              "admin_remove_policy_scope",
                              { p_scope_assignment_id: scope.id },
                              "تم حذف النطاق.",
                            )
                          }
                          className="min-w-11 p-1.5 text-q-danger"
                        >
                          <Trash2 size={12} />
                        </QButton>
                      )}
                    </div>
                  ))}
                  {!selectedVersion.scopes.length && (
                    <p className="text-q-caption text-q-text-3">لا توجد نطاقات.</p>
                  )}
                </div>
              </section>
              <section className="rounded-q-control border border-q-border p-3">
                <h3 className="text-q-caption font-bold text-q-text">
                  <ShieldCheck
                    className="ml-1 inline text-q-success"
                    size={14}
                  />
                  الجاهزية ودورة الاعتماد
                </h3>
                <div className="mt-3 space-y-2">
                  {readiness.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-center gap-2 text-q-caption text-q-text-2"
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
                <div className="mt-4 grid gap-2">
                  {selectedVersion.legal_status === "draft" && (
                    <QButton type="submit" variant="ghost"
                      disabled={!canSubmit}
                      onClick={() => openStage("review")}
                      className="min-w-11 min-h-11 rounded-q-control bg-q-primary text-q-ui font-bold text-q-on-primary disabled:cursor-not-allowed disabled:bg-q-surface-2"
                    >
                      <Send className="ml-1 inline" size={12} />
                      إرسال للمراجعة
                    </QButton>
                  )}
                  {selectedVersion.legal_status === "under_review" && (
                    <QButton type="submit" variant="ghost"
                      onClick={() => openStage("approve")}
                      className="min-w-11 min-h-11 rounded-q-control bg-q-success text-q-ui font-bold text-q-on-primary"
                    >
                      اعتماد الإصدار
                    </QButton>
                  )}
                  {selectedVersion.legal_status === "approved" && (
                    <QButton type="submit" variant="ghost"
                      disabled={!canActivate}
                      onClick={() => openStage("activate")}
                      className="min-w-11 min-h-11 rounded-q-control bg-q-primary text-q-ui font-bold text-q-on-primary disabled:bg-q-surface-2"
                    >
                      تحديد النفاذ والتفعيل
                    </QButton>
                  )}
                  {selectedVersion.legal_status === "effective" && (
                    <QButton type="submit" variant="ghost"
                      onClick={() => openStage("suspend")}
                      className="min-w-11 min-h-11 rounded-q-control bg-q-danger text-q-ui font-bold text-q-on-primary"
                    >
                      تعليق الإصدار
                    </QButton>
                  )}
                  <QButton type="submit" variant="ghost"
                    onClick={() => openStage("workflow")}
                    className="min-w-11 min-h-11 rounded-q-control border border-q-border text-q-ui font-bold text-q-primary"
                  >
                    <Workflow className="ml-1 inline" size={12} />
                    إدارة مسارات الاعتماد
                  </QButton>
                </div>
              </section>
            </aside>
          </div>
        )}
      </QCard>

      {stage === "attachment" && (
        <Modal title="مرفقات اللائحة" onClose={closeModal} wide>
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <Field label="إرفاق على">
                <select
                  className={input}
                  value={attachmentForm.target}
                  onChange={(e) =>
                    setAttachmentForm({
                      ...attachmentForm,
                      target: e.target.value,
                      itemId: "",
                    })
                  }
                >
                  <option value="policy">اللائحة</option>
                  {selectedVersion && (
                    <option value="version">الإصدار الحالي</option>
                  )}
                  <option value="item">بند محدد</option>
                </select>
              </Field>
              {attachmentForm.target === "item" && (
                <Field label="البند">
                  <select
                    className={input}
                    value={attachmentForm.itemId}
                    onChange={(e) =>
                      setAttachmentForm({
                        ...attachmentForm,
                        itemId: e.target.value,
                      })
                    }
                  >
                    <option value="">اختر البند</option>
                    {selectedVersion?.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title_ar}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="اسم الملف">
                <input
                  className={input}
                  value={attachmentForm.name}
                  onChange={(e) =>
                    setAttachmentForm({
                      ...attachmentForm,
                      name: e.target.value,
                    })
                  }
                />
              </Field>
              <Field
                label="رابط الملف"
                hint="اختياري عند استخدام ملف موجود في مخزن مؤسسي خارجي"
              >
                <input
                  dir="ltr"
                  type="url"
                  className={input}
                  value={attachmentForm.url}
                  onChange={(e) =>
                    setAttachmentForm({
                      ...attachmentForm,
                      url: e.target.value,
                    })
                  }
                />
              </Field>
              <Field
                label="رفع ملف من الجهاز"
                hint="PDF أو PNG أو JPEG أو DOCX، بحد أقصى 25 ميجابايت"
              >
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx"
                  className={`${input} py-2`}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setAttachmentFile(file);
                    if (file)
                      setAttachmentForm({
                        ...attachmentForm,
                        name: file.name,
                        mime: file.type,
                      });
                  }}
                />
              </Field>
              <Field label="نوع الملف">
                <input
                  dir="ltr"
                  className={input}
                  placeholder="application/pdf"
                  value={attachmentForm.mime}
                  onChange={(e) =>
                    setAttachmentForm({
                      ...attachmentForm,
                      mime: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="وصف المرفق">
                <textarea
                  className={textarea}
                  value={attachmentForm.description}
                  onChange={(e) =>
                    setAttachmentForm({
                      ...attachmentForm,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
              <Action
                busy={busy}
                disabled={
                  !attachmentForm.name.trim() ||
                  (!attachmentFile &&
                    !/^https:\/\//.test(attachmentForm.url)) ||
                  (attachmentForm.target === "item" && !attachmentForm.itemId)
                }
                label="إضافة المرفق"
                onClick={() =>
                  run(
                    () =>
                      attachmentFile
                        ? uploadAttachment()
                        : rpc("admin_add_policy_attachment", {
                            p_policy_id:
                              attachmentForm.target === "policy"
                                ? policy.id
                                : null,
                            p_policy_version_id:
                              attachmentForm.target === "version"
                                ? (selectedVersion?.id ?? null)
                                : null,
                            p_policy_item_id:
                              attachmentForm.target === "item"
                                ? attachmentForm.itemId
                                : null,
                            p_file_name: attachmentForm.name,
                            p_file_url: attachmentForm.url,
                            p_mime_type: attachmentForm.mime || null,
                            p_file_size_bytes: null,
                            p_description: attachmentForm.description || null,
                          }),
                    "تمت إضافة المرفق.",
                  )
                }
              />
            </div>
            <div>
              <h3 className="mb-3 text-q-caption font-bold text-q-text">
                المرفقات الحالية
              </h3>
              <div className="space-y-2">
                {visibleAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between gap-3 rounded-q-control border border-q-border p-3"
                  >
                    <div className="min-w-0">
                      <a
                        href={attachment.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 min-w-11 items-center flex items-center gap-1 truncate text-q-caption font-bold text-q-primary"
                      >
                        {attachment.file_name}
                        <ExternalLink size={11} />
                      </a>
                      <span className="mt-1 block text-q-caption text-q-text-3">
                        {attachment.targetLabel}
                      </span>
                    </div>
                    <QButton type="submit" variant="ghost"
                      aria-label={`حذف ${attachment.file_name}`}
                      onClick={() =>
                        remove(
                          "admin_remove_policy_attachment",
                          { p_attachment_id: attachment.id },
                          "تم حذف المرفق.",
                        )
                      }
                      className="min-w-11 rounded-q-control p-2 text-q-danger hover:bg-q-danger-soft"
                    >
                      <Trash2 size={13} />
                    </QButton>
                  </div>
                ))}
                {!visibleAttachments.length && (
                  <p className="rounded-q-control border border-dashed p-8 text-center text-q-caption text-q-text-3">
                    لا توجد مرفقات بعد.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {stage === "policy" && (
        <Modal title="تعديل بيانات اللائحة" onClose={closeModal}>
          <div className="space-y-4">
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
                dir="ltr"
                className={input}
                value={policyForm.name_en}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, name_en: e.target.value })
                }
              />
            </Field>
            <Field label="الوصف">
              <textarea
                className={textarea}
                value={policyForm.description}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, description: e.target.value })
                }
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="مالك اللائحة">
                <select
                  className={input}
                  value={policyForm.owner_user_id}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      owner_user_id: e.target.value,
                    })
                  }
                >
                  <option value="">غير محدد</option>
                  {references.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name_ar}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="الجهة المالكة">
                <select
                  className={input}
                  value={policyForm.owner_governance_unit_id}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      owner_governance_unit_id: e.target.value,
                    })
                  }
                >
                  <option value="">غير محددة</option>
                  {references.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name_ar}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="المرجع النظامي">
                <input
                  className={input}
                  value={policyForm.legal_reference}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      legal_reference: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="رقم القرار">
                <input
                  dir="ltr"
                  className={input}
                  value={policyForm.decision_number}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      decision_number: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Field label="الحالة">
              <select
                className={input}
                value={policyForm.status}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, status: e.target.value })
                }
              >
                <option value="active">نشطة</option>
                <option value="inactive">غير نشطة</option>
                <option value="archived">مؤرشفة</option>
              </select>
            </Field>
          </div>
          <Action
            busy={busy}
            label="حفظ البيانات"
            onClick={() =>
              run(
                () =>
                  rpc("admin_update_policy", {
                    p_policy_id: policy.id,
                    p_name_ar: policyForm.name_ar,
                    p_name_en: policyForm.name_en || null,
                    p_description: policyForm.description || null,
                    p_owner_user_id: policyForm.owner_user_id || null,
                    p_status: policyForm.status,
                    p_owner_governance_unit_id:
                      policyForm.owner_governance_unit_id || null,
                    p_legal_reference: policyForm.legal_reference || null,
                    p_decision_number: policyForm.decision_number || null,
                  }),
                "تم تحديث بيانات اللائحة.",
              )
            }
          />
        </Modal>
      )}
      {stage === "version" && (
        <Modal title="إنشاء إصدار عمل جديد" onClose={closeModal}>
          <div className="space-y-4">
            <Field label="وسم الإصدار" hint="مثال: 1.0 أو 2026.1">
              <input
                dir="ltr"
                className={input}
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
          <Action
            busy={busy}
            label="إنشاء المسودة"
            onClick={() =>
              run(
                () =>
                  rpc("admin_create_policy_version", {
                    p_policy_id: policy.id,
                    p_version_label: versionForm.label || null,
                    p_change_summary: versionForm.summary || null,
                  }),
                "تم إنشاء إصدار العمل.",
              )
            }
          />
        </Modal>
      )}
      {stage === "item" && (
        <Modal
          title={editingItem ? "تعديل بند اللائحة" : "إضافة بند لائحي"}
          onClose={closeModal}
          wide
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="رمز البند">
              <input
                disabled={Boolean(editingItem)}
                dir="ltr"
                className={input}
                value={itemForm.code}
                onChange={(e) =>
                  setItemForm({ ...itemForm, code: e.target.value })
                }
              />
            </Field>
            <Field label="عنوان البند">
              <input
                className={input}
                value={itemForm.title}
                onChange={(e) =>
                  setItemForm({ ...itemForm, title: e.target.value })
                }
              />
            </Field>
            <Field label="النوع">
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
            <section className="sm:col-span-2 rounded-q-card border border-q-border bg-q-surface p-4">
              <div className="mb-3">
                <h3 className="text-q-caption font-bold text-q-text">
                  متى ينطبق هذا البند؟
                </h3>
                <p className="mt-1 text-q-caption leading-5 text-q-text-3">
                  اختر الصفة التي يراجعها النظام ثم اكتب القيمة المتوقعة. اتركها دون شرط ليطبق البند على الجميع.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Field label="البيان المراد فحصه">
                  <select
                    className={input}
                    value={itemCriterion.field}
                    onChange={(event) =>
                      setItemCriterion({
                        field: event.target.value,
                        value: "",
                        inverted: false,
                      })
                    }
                  >
                    {itemCriterionFields.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="القيمة المطلوبة"
                  hint={itemCriterion.field ? "مثال: طلب إنشاء برنامج جديد" : undefined}
                >
                  <input
                    className={input}
                    value={itemCriterion.value}
                    disabled={!itemCriterion.field}
                    placeholder={itemCriterion.field ? "اكتب القيمة" : "لا يحتاج قيمة"}
                    onChange={(event) =>
                      setItemCriterion({
                        ...itemCriterion,
                        value: event.target.value,
                      })
                    }
                  />
                </Field>
                <QButton variant="ghost"
                  type="button"
                  disabled={!itemCriterion.field}
                  onClick={() =>
                    setItemCriterion({
                      ...itemCriterion,
                      inverted: !itemCriterion.inverted,
                    })
                  }
                  className={`min-w-11 min-h-11 rounded-q-control border px-4 text-q-ui font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
                    itemCriterion.inverted
                      ? "border-q-border bg-q-warning-soft text-q-warning"
                      : "border-q-border bg-q-surface text-q-text-2"
                  }`}
                >
                  {itemCriterion.inverted ? "استثناء: لا يساوي" : "يساوي"}
                </QButton>
              </div>
              <p className="mt-3 rounded-q-control bg-q-surface px-3 py-2 text-q-caption leading-5 text-q-text-2">
                {!itemCriterion.field
                  ? "سيطبق هذا البند على جميع الموضوعات ضمن الفئة والنطاق المحددين."
                  : `سيطبق البند عندما يكون ${
                      itemCriterionFields.find((field) => field.value === itemCriterion.field)?.label
                    } ${itemCriterion.inverted ? "لا يساوي" : "يساوي"} «${
                      itemCriterion.value || "القيمة التي ستدخلها"
                    }».`}
              </p>
            </section>
            <Field
              label="البند الأب"
              hint="ابنِ الهيكل: باب ← فصل ← مادة ← فقرة"
            >
              <select
                className={input}
                value={itemForm.parent}
                onChange={(e) =>
                  setItemForm({ ...itemForm, parent: e.target.value })
                }
              >
                <option value="">بدون بند أب (مستوى رئيسي)</option>
                {selectedVersion?.items
                  .filter((item) => item.id !== editingItem?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.item_code} · {item.title_ar}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="طريقة التطبيق">
              <select
                className={input}
                value={itemForm.mode}
                onChange={(e) =>
                  setItemForm({ ...itemForm, mode: e.target.value })
                }
              >
                <option value="regulation_required">مسار اللائحة إلزامي</option>
                <option value="regulated_fallback_allowed">
                  يسمح بمسار بديل
                </option>
                <option value="custom_route_allowed">يسمح بمسار مخصص</option>
              </select>
            </Field>
            <Field label="فئة الموضوع">
              <select
                className={input}
                value={itemForm.category}
                onChange={(e) =>
                  setItemForm({ ...itemForm, category: e.target.value })
                }
              >
                <option value="">كل الفئات</option>
                {references.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name_ar}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="مسار الاعتماد">
              <select
                className={input}
                value={itemForm.workflow}
                onChange={(e) =>
                  setItemForm({ ...itemForm, workflow: e.target.value })
                }
              >
                <option value="">دون مسار</option>
                {activeWorkflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الترتيب">
              <input
                type="number"
                className={input}
                value={itemForm.sort}
                onChange={(e) =>
                  setItemForm({ ...itemForm, sort: e.target.value })
                }
              />
            </Field>
            <Field
              label="شروط المطابقة JSON"
              hint='مثال: {"request_type":"new_academic_program"}'
            >
              <textarea
                dir="ltr"
                className={`${textarea} font-mono`}
                value={itemForm.criteria}
                onChange={(e) =>
                  setItemForm({ ...itemForm, criteria: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="نص البند">
            <textarea
              className={`${textarea} mt-4 min-h-36`}
              value={itemForm.body}
              onChange={(e) =>
                setItemForm({ ...itemForm, body: e.target.value })
              }
            />
          </Field>
          <Action busy={busy} label="حفظ البند" onClick={saveItem} />
        </Modal>
      )}
      {stage === "scope" && (
        <Modal title="إضافة نطاق تطبيق" onClose={closeModal}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نوع النطاق">
              <select
                className={input}
                value={scopeForm.type}
                onChange={(e) =>
                  setScopeForm({
                    ...scopeForm,
                    type: e.target.value,
                    target: "",
                    descendants:
                      e.target.value === "unit_subtree"
                        ? scopeForm.descendants
                        : false,
                  })
                }
              >
                <option value="organization">المنظمة كاملة</option>
                <option value="governance_unit">مجلس محدد</option>
                <option value="governance_class">تصنيف مجالس</option>
                <option value="governance_level">مستوى تنظيمي</option>
                <option value="unit_subtree">وحدة والجهات التابعة</option>
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
                  <option value="">اختر</option>
                  {references.units.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name_ar}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {scopeForm.type === "governance_class" && (
              <Field label="التصنيف">
                <select
                  className={input}
                  value={scopeForm.target}
                  onChange={(e) =>
                    setScopeForm({ ...scopeForm, target: e.target.value })
                  }
                >
                  <option value="">اختر</option>
                  {references.classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name_ar}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {scopeForm.type === "governance_level" && (
              <Field label="المستوى">
                <select
                  className={input}
                  value={scopeForm.level}
                  onChange={(e) =>
                    setScopeForm({ ...scopeForm, level: e.target.value })
                  }
                >
                  {references.governanceLevels.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="الأولوية">
              <input
                type="number"
                className={input}
                value={scopeForm.priority}
                onChange={(e) =>
                  setScopeForm({ ...scopeForm, priority: e.target.value })
                }
              />
            </Field>
            <Field label="بداية السريان">
              <input
                type="date"
                className={input}
                value={scopeForm.from}
                onChange={(e) =>
                  setScopeForm({ ...scopeForm, from: e.target.value })
                }
              />
            </Field>
            <Field label="نهاية السريان">
              <input
                type="date"
                className={input}
                value={scopeForm.to}
                onChange={(e) =>
                  setScopeForm({ ...scopeForm, to: e.target.value })
                }
              />
            </Field>
            {scopeForm.type === "unit_subtree" && (
              <label className="flex items-center gap-2 text-q-caption font-bold text-q-text-2">
                <input
                  type="checkbox"
                  checked={scopeForm.descendants}
                  onChange={(e) =>
                    setScopeForm({
                      ...scopeForm,
                      descendants: e.target.checked,
                    })
                  }
                />
                تضمين الجهات التابعة
              </label>
            )}
          </div>
          <Action
            busy={busy}
            label="إضافة النطاق"
            onClick={() => void saveScope()}
          />
        </Modal>
      )}
      {stage === "workflow" && (
        <Modal title="إدارة مسار الاعتماد" onClose={closeModal}>
          <QCard className="p-0 rounded-q-control border border-q-border bg-q-surface-2 p-4 text-q-caption leading-6 text-q-link">
            أنشئ المسار وفعّله أولًا، ثم عد إلى بند اللائحة واختر الإصدار الفعال
            للمسار. البنود الإلزامية لا تُرسل للمراجعة دون مسار فعال.
          </QCard>
          <Link
            href="/admin/regulations?section=workflows"
            className="inline-flex min-h-11 min-w-11 items-center mt-4 flex min-h-11 items-center justify-between rounded-q-control bg-q-primary px-4 text-q-caption font-bold text-q-on-primary"
          >
            فتح مصمم المسارات <Workflow size={15} />
          </Link>
        </Modal>
      )}
      {stage === "review" && selectedVersion && (
        <Modal title="إرسال الإصدار للمراجعة" onClose={closeModal}>
          <div className="space-y-2">
            {readiness.map((check) => (
              <div
                key={check.label}
                className={`flex items-center gap-2 rounded-q-control border p-3 text-q-caption ${check.done ? "border-q-border bg-q-success-soft text-q-success" : "border-q-border bg-q-warning-soft text-q-warning"}`}
              >
                {check.done ? <Check size={13} /> : <AlertCircle size={13} />}{" "}
                {check.label}
              </div>
            ))}
          </div>
          {legislativeReadiness && (
            <div className="mt-3 space-y-2">
              {legislativeReadiness.errors.map((item) => (
                <QCard
                  key={item.code}
                  className="p-0 flex items-start gap-2 rounded-q-control border border-q-border bg-q-danger-soft p-3 text-q-caption text-q-danger"
                >
                  <AlertCircle className="mt-0.5 shrink-0" size={13} />
                  <span>{item.message}</span>
                </QCard>
              ))}
              {legislativeReadiness.warnings.map((item) => (
                <QCard
                  key={item.code}
                  className="p-0 flex items-start gap-2 rounded-q-control border border-q-border bg-q-warning-soft p-3 text-q-caption text-q-warning"
                >
                  <AlertCircle className="mt-0.5 shrink-0" size={13} />
                  <span>{item.message}</span>
                </QCard>
              ))}
            </div>
          )}
          <Action
            busy={busy}
            disabled={!canSubmit || !legislativeReadiness?.ready}
            label="تأكيد الإرسال للمراجعة"
            onClick={() =>
              run(
                () =>
                  rpc("admin_submit_policy_for_review", {
                    p_policy_version_id: selectedVersion.id,
                  }),
                "تم إرسال الإصدار للمراجعة.",
              )
            }
          />
        </Modal>
      )}
      {stage === "approve" && selectedVersion && (
        <Modal title="اعتماد الإصدار" onClose={closeModal}>
          <QCard className="p-0 rounded-q-control border border-q-border bg-q-warning-soft p-4 text-q-caption leading-6 text-q-warning">
            يشترط أن ينفذ الاعتماد مستخدم آخر غير مقدم الإصدار. سيتم تسجيل هوية
            المعتمد ووقت الاعتماد في سجل التدقيق.
          </QCard>
          <Action
            busy={busy}
            label="تأكيد الاعتماد"
            onClick={() =>
              run(
                () =>
                  rpc("admin_approve_policy_version", {
                    p_policy_version_id: selectedVersion.id,
                  }),
                "تم اعتماد الإصدار.",
              )
            }
          />
        </Modal>
      )}
      {stage === "activate" && selectedVersion && (
        <Modal title="تحديد النفاذ وتفعيل الإصدار" onClose={closeModal}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="بداية النفاذ">
              <input
                type="date"
                className={input}
                value={lifecycleForm.from}
                onChange={(e) =>
                  setLifecycleForm({ ...lifecycleForm, from: e.target.value })
                }
              />
            </Field>
            <Field label="نهاية النفاذ (اختياري)">
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
          <Action
            busy={busy}
            disabled={!canActivate || !lifecycleForm.from}
            label="تفعيل الإصدار"
            onClick={() =>
              run(
                () =>
                  rpc("admin_activate_policy_version", {
                    p_policy_version_id: selectedVersion.id,
                    p_effective_from: lifecycleForm.from,
                    p_effective_to: lifecycleForm.to || null,
                  }),
                "تم تفعيل الإصدار.",
              )
            }
          />
        </Modal>
      )}
      {stage === "suspend" && selectedVersion && (
        <Modal title="تعليق الإصدار النافذ" onClose={closeModal}>
          <Field label="سبب التعليق" hint="عشرة أحرف على الأقل">
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
            disabled={lifecycleForm.reason.trim().length < 10}
            label="تعليق الإصدار"
            danger
            onClick={() =>
              run(
                () =>
                  rpc("admin_suspend_policy_version", {
                    p_policy_version_id: selectedVersion.id,
                    p_reason: lifecycleForm.reason,
                  }),
                "تم تعليق الإصدار.",
              )
            }
          />
        </Modal>
      )}
    </section>
  );
}

function Action({
  label,
  onClick,
  busy,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end">
      <QButton variant="ghost"
        type="button"
        disabled={busy || disabled}
        onClick={onClick}
        className={`min-w-11 flex min-h-11 items-center gap-2 rounded-q-control px-4 text-q-ui font-bold text-q-on-primary disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "bg-q-danger" : "bg-q-primary"}`}
      >
        {busy && <LoaderCircle className="animate-spin" size={14} />} {label}
      </QButton>
    </div>
  );
}
