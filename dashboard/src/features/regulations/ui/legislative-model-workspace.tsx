"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  FileDiff,
  FileText,
  Gavel,
  GitBranch,
  Link2,
  ListChecks,
  Plus,
  RefreshCw,
  Save,
  Scale,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type {
  LegislativeReadiness,
  Policy,
  PolicyItem,
  PolicyRule,
  PolicyVersion,
  PolicyVersionComparison,
  ReferenceOption,
  WorkflowTemplate,
} from "../model/types";

type Tab = "structure" | "rules" | "references" | "readiness" | "compare";
type Notice = { kind: "success" | "error"; text: string } | null;
type LegislativeModel = PolicyVersion & { items: PolicyItem[] };

const input =
  "h-10 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-[11px] text-[#263950] outline-none transition focus:border-[#0872df] focus:ring-2 focus:ring-[#0872df]/10";
const textarea =
  "min-h-24 w-full rounded-xl border border-[#dbe5ef] bg-white p-3 text-[11px] leading-6 text-[#263950] outline-none transition focus:border-[#0872df] focus:ring-2 focus:ring-[#0872df]/10";
const tabLabels: Record<Tab, string> = {
  structure: "النص والهيكل",
  rules: "القواعد التنفيذية",
  references: "الإحالات",
  readiness: "فحص الجاهزية",
  compare: "مقارنة الإصدارات",
};
const typeLabels: Record<string, string> = {
  chapter: "باب",
  section: "فصل",
  article: "مادة",
  clause: "فقرة",
  procedure: "إجراء",
};
const ruleTypeLabels: Record<string, string> = {
  eligibility: "أهلية",
  prohibition: "حظر",
  requirement: "متطلب",
  authority: "صلاحية",
  deadline: "مدة زمنية",
  calculation: "احتساب",
  routing: "إحالة ومسار",
  exception: "استثناء",
  informational: "تفسير",
};
const referenceLabels: Record<string, string> = {
  implements: "ينفذ",
  amends: "يعدل",
  repeals: "يلغي",
  supersedes: "يستبدل",
  interprets: "يفسر",
  exception_to: "استثناء من",
  related_to: "مرتبط بـ",
  based_on: "مستند إلى",
};

const executableItemTypes = new Set(["article", "clause", "procedure"]);
const ruleTemplates = [
  {
    id: "requirement",
    title: "متطلب إلزامي",
    description: "لا يمكن إتمام الإجراء قبل استيفاء المتطلب.",
    ruleType: "requirement",
    context: { when: "before_action" },
    effect: { outcome: "block", message: "يلزم استيفاء المتطلب قبل المتابعة." },
  },
  {
    id: "deadline",
    title: "مهلة زمنية",
    description: "تحدد الحد الزمني لتنفيذ الإجراء أو اتخاذ القرار.",
    ruleType: "deadline",
    context: { event: "submission" },
    effect: { outcome: "notify", deadline_days: 0 },
  },
  {
    id: "authority",
    title: "صلاحية واعتماد",
    description: "تحدد الجهة المخولة بالتحقق أو الاعتماد أو الرفض.",
    ruleType: "authority",
    context: { action: "approval" },
    effect: { outcome: "route_to_authority" },
  },
  {
    id: "routing",
    title: "إحالة ومسار",
    description: "توجه الطلب تلقائيًا إلى المسار الإداري الملائم.",
    ruleType: "routing",
    context: { event: "submitted" },
    effect: { outcome: "start_workflow" },
  },
] as const;

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/regulations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.assign(
      `/login?next=${encodeURIComponent(window.location.pathname)}`,
    );
    throw new Error("انتهت الجلسة. سيتم تحويلك لتسجيل الدخول.");
  }
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
  const isSystemIdentifier = label.includes("رمز القاعدة");
  return (
    <label className={isSystemIdentifier ? "hidden" : "block"}>
      <span className="mb-1.5 block text-[10px] font-black text-[#344861]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[8px] leading-4 text-[#8190a3]">
          {hint}
        </span>
      )}
    </label>
  );
}

function emptyRule(item: PolicyItem) {
  return {
    id: "",
    code: `${item.item_code.toLowerCase().replace(/[^a-z0-9_.-]/g, "-")}-rule`,
    name_ar: `قاعدة ${item.title_ar}`,
    description: "",
    rule_type: "requirement",
    status: "draft",
    priority: "100",
    applies_when: "{}",
    effect_payload: "{}",
    requires_workflow: false,
    valid_from: "",
    valid_to: "",
    conditions: [] as Array<Record<string, unknown>>,
    requirements: [] as Array<Record<string, unknown>>,
    authorities: [] as Array<Record<string, unknown>>,
    actions: [] as Array<Record<string, unknown>>,
    workflow_bindings: [] as Array<Record<string, unknown>>,
  };
}

export function LegislativeModelWorkspace({
  policy,
  initialTab = "structure",
  initialItemId,
  rulesOnly = false,
}: {
  policy: Policy;
  initialTab?: Tab;
  initialItemId?: string;
  rulesOnly?: boolean;
}) {
  const [versionId, setVersionId] = useState(policy.versions?.[0]?.id ?? "");
  const [model, setModel] = useState<LegislativeModel | null>(null);
  const [selectedItemId, setSelectedItemId] = useState(initialItemId ?? "");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [readiness, setReadiness] = useState<LegislativeReadiness | null>(null);
  const [comparison, setComparison] = useState<PolicyVersionComparison | null>(
    null,
  );
  const [compareVersionId, setCompareVersionId] = useState("");
  const [units, setUnits] = useState<ReferenceOption[]>([]);
  const [classes, setClasses] = useState<ReferenceOption[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [itemForm, setItemForm] = useState({
    official_text: "",
    interpretation_text: "",
    source_page_from: "",
    source_page_to: "",
    source_locator: "",
    legal_status: "active",
    amendment_note: "",
    requires_executable_rule: false,
    supersedes_item_id: "",
  });
  const [versionForm, setVersionForm] = useState({
    issuing_authority: "",
    approval_authority: "",
    approval_decision_number: "",
    approval_date: "",
    issue_reason: "",
    supersedes_version_id: "",
    source_document_hash: "",
  });
  const [ruleForm, setRuleForm] = useState<ReturnType<typeof emptyRule> | null>(
    null,
  );
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [referenceForm, setReferenceForm] = useState({
    id: "",
    reference_type: "based_on",
    target_policy_id: "",
    target_policy_version_id: "",
    target_policy_item_id: "",
    external_reference: "",
    citation_text: "",
    notes: "",
  });

  const selectedItem =
    model?.items.find((item) => item.id === selectedItemId) ?? model?.items[0];
  const editable = model?.legal_status === "draft";
  const selectedItemCanHaveRules = Boolean(
    selectedItem && executableItemTypes.has(selectedItem.item_type),
  );
  const selectItemFromTree = (item: PolicyItem) => {
    setSelectedItemId(item.id);
    setRuleForm(null);
    setRuleDrawerOpen(executableItemTypes.has(item.item_type));
  };
  const itemDepthById = useMemo(() => {
    const byId = new Map(model?.items.map((item) => [item.id, item]) ?? []);
    const depthOf = (item: PolicyItem, visited = new Set<string>()): number => {
      if (!item.parent_item_id || visited.has(item.id)) return 0;
      const parent = byId.get(item.parent_item_id);
      return parent ? 1 + depthOf(parent, new Set([...visited, item.id])) : 0;
    };
    return new Map(model?.items.map((item) => [item.id, depthOf(item)]) ?? []);
  }, [model]);

  const loadModel = useCallback(
    async (targetVersionId = versionId) => {
      if (!targetVersionId) return;
      setBusy(true);
      try {
        const data = await rpc<LegislativeModel>(
          "admin_get_policy_legislative_model",
          { p_policy_version_id: targetVersionId },
        );
        setModel(data);
        setSelectedItemId((current) =>
          data.items.some((item) => item.id === current)
            ? current
            : (data.items[0]?.id ?? ""),
        );
        setVersionForm({
          issuing_authority: data.issuing_authority ?? "",
          approval_authority: data.approval_authority ?? "",
          approval_decision_number: data.approval_decision_number ?? "",
          approval_date: data.approval_date ?? "",
          issue_reason: data.issue_reason ?? "",
          supersedes_version_id: data.supersedes_version_id ?? "",
          source_document_hash: data.source_document_hash ?? "",
        });
      } catch (error) {
        setNotice({
          kind: "error",
          text:
            error instanceof Error
              ? error.message
              : "تعذر تحميل النموذج التشريعي.",
        });
      } finally {
        setBusy(false);
      }
    },
    [versionId],
  );

  useEffect(() => {
    // تحميل الإصدار استجابة لتغيير الاختيار الخارجي.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadModel();
  }, [loadModel]);

  useEffect(() => {
    if (!selectedItem) return;
    // يعاد تهيئة نموذج التحرير عند انتقال المستخدم إلى مادة أخرى.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemForm({
      official_text: selectedItem.official_text ?? selectedItem.body_text ?? "",
      interpretation_text: selectedItem.interpretation_text ?? "",
      source_page_from: selectedItem.source_page_from
        ? String(selectedItem.source_page_from)
        : "",
      source_page_to: selectedItem.source_page_to
        ? String(selectedItem.source_page_to)
        : "",
      source_locator: selectedItem.source_locator ?? "",
      legal_status: selectedItem.legal_status ?? "active",
      amendment_note: selectedItem.amendment_note ?? "",
      requires_executable_rule: Boolean(selectedItem.requires_executable_rule),
      supersedes_item_id: selectedItem.supersedes_item_id ?? "",
    });
    setRuleForm(null);
  }, [selectedItem]);

  useEffect(() => {
    void Promise.all([
      rpc<{ items: ReferenceOption[] }>("admin_list_governance_units", {
        p_query: null,
        p_status: "active",
        p_unit_type_id: null,
        p_governance_class_id: null,
        p_parent_unit_id: null,
        p_limit: 100,
        p_offset: 0,
      }),
      rpc<{ items: ReferenceOption[] }>("admin_list_governance_unit_classes", {
        p_query: null,
        p_is_active: true,
        p_limit: 100,
        p_offset: 0,
      }),
      rpc<WorkflowTemplate[]>("admin_list_workflow_templates"),
    ])
      .then(([unitData, classData, workflowData]) => {
        setUnits(unitData.items);
        setClasses(classData.items);
        setWorkflows(workflowData);
      })
      .catch(() => undefined);
  }, []);

  const workflowVersions = useMemo(
    () =>
      workflows.flatMap((template) =>
        template.versions
          .filter((version) => version.status === "active")
          .map((version) => ({
            id: version.id,
            label: `${template.name_ar} · إصدار ${version.version_no}`,
          })),
      ),
    [workflows],
  );

  async function execute(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await loadModel();
      setNotice({ kind: "success", text: success });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر تنفيذ العملية.",
      });
    } finally {
      setBusy(false);
    }
  }

  function parseJson(value: string, label: string) {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
        throw new Error();
      return parsed;
    } catch {
      throw new Error(`${label} يجب أن يكون كائن JSON صحيحًا.`);
    }
  }

  function editRule(rule: PolicyRule) {
    setRuleForm({
      id: rule.id,
      code: rule.rule_code,
      name_ar: rule.name_ar,
      description: rule.description ?? "",
      rule_type: rule.rule_type,
      status: rule.status,
      priority: String(rule.priority),
      applies_when: JSON.stringify(rule.applies_when ?? {}, null, 2),
      effect_payload: JSON.stringify(rule.effect_payload ?? {}, null, 2),
      requires_workflow: rule.requires_workflow,
      valid_from: rule.valid_from ?? "",
      valid_to: rule.valid_to ?? "",
      conditions: rule.conditions.map((row) => ({
        code: row.condition_code,
        field_path: row.field_path,
        operator: row.operator,
        expected_value: row.expected_value,
        failure_action: row.failure_action,
        failure_message_ar: row.failure_message_ar ?? "",
      })),
      requirements: rule.requirements.map((row) => ({
        code: row.requirement_code,
        name_ar: row.name_ar,
        requirement_type: row.requirement_type,
        is_mandatory: row.is_mandatory,
        timing: row.timing,
        validation_spec: row.validation_spec,
      })),
      authorities: rule.authorities.map((row) => ({
        governance_unit_id: row.governance_unit_id ?? "",
        governance_class_id: row.governance_class_id ?? "",
        responsibility: row.responsibility,
        authority_action: row.authority_action,
        required_permission_code: row.required_permission_code ?? "",
        is_final: row.is_final,
      })),
      actions: rule.actions.map((row) => ({
        code: row.action_code,
        label_ar: row.label_ar,
        action_type: row.action_type,
        is_terminal: row.is_terminal,
        requires_reason: row.requires_reason,
        result_payload: row.result_payload,
      })),
      workflow_bindings: rule.workflow_bindings.map((row) => ({
        workflow_template_version_id: row.workflow_template_version_id,
        binding_type: row.binding_type,
        selection_conditions: row.selection_conditions,
        priority: row.priority,
      })),
    });
  }

  async function saveRule() {
    if (!selectedItem || !ruleForm) return;
    if (!executableItemTypes.has(selectedItem.item_type)) {
      setNotice({
        kind: "error",
        text: "لا يمكن ربط القاعدة بفصل أو باب. اختر مادة أو فقرة أو إجراءً تنفيذيًا.",
      });
      return;
    }
    if (!ruleForm.name_ar.trim() || !ruleForm.description.trim()) {
      setNotice({
        kind: "error",
        text: "أدخل اسم القاعدة ووصفًا واضحًا قبل الحفظ.",
      });
      return;
    }
    if (!/^[a-z][a-z0-9_.-]*$/.test(ruleForm.code)) {
      setNotice({
        kind: "error",
        text: "رمز القاعدة يجب أن يبدأ بحرف إنجليزي صغير.",
      });
      return;
    }
    await execute(
      () =>
        rpc("admin_save_policy_rule", {
          p_policy_item_id: selectedItem.id,
          p_rule: {
            id: ruleForm.id || null,
            code: ruleForm.code,
            name_ar: ruleForm.name_ar,
            description: ruleForm.description || null,
            rule_type: ruleForm.rule_type,
            status: ruleForm.status,
            priority: Number(ruleForm.priority),
            applies_when: parseJson(ruleForm.applies_when, "شروط التطبيق"),
            effect_payload: parseJson(ruleForm.effect_payload, "أثر القاعدة"),
            requires_workflow: ruleForm.requires_workflow,
            valid_from: ruleForm.valid_from || null,
            valid_to: ruleForm.valid_to || null,
            conditions: ruleForm.conditions,
            requirements: ruleForm.requirements,
            authorities: ruleForm.authorities,
            actions: ruleForm.actions,
            workflow_bindings: ruleForm.workflow_bindings,
          },
        }),
      "تم حفظ القاعدة التنفيذية وجميع تفاصيلها.",
    );
    setRuleForm(null);
  }

  async function runReadiness() {
    if (!model) return;
    setBusy(true);
    try {
      const result = await rpc<LegislativeReadiness>(
        "admin_validate_policy_version_readiness",
        { p_policy_version_id: model.id },
      );
      setReadiness(result);
      setTab("readiness");
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر فحص الجاهزية.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function runComparison() {
    if (!model || !compareVersionId) return;
    setBusy(true);
    try {
      setComparison(
        await rpc<PolicyVersionComparison>("admin_compare_policy_versions", {
          p_left_version_id: compareVersionId,
          p_right_version_id: model.id,
        }),
      );
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "تعذر مقارنة الإصدارين.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!policy.versions?.length) return null;

  return (
    <>
    <section
      id="legislative-model"
      className="overflow-hidden rounded-2xl border border-[#d7e3ef] bg-white shadow-[0_12px_34px_rgba(15,42,72,.06)]"
    >
      <header className="border-b border-[#e6edf4] bg-[linear-gradient(135deg,#071b39_0%,#0066cc_72%,#1e88e5_100%)] px-5 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-black text-[#ffb46c]">
              العقل التشريعي والحوكمي
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-black">
              <Scale size={20} />
              النموذج التشريعي التنفيذي
            </h2>
            <p className="mt-2 max-w-3xl text-[10px] leading-5 text-blue-100">
              افصل النص الرسمي عن تفسيره الرقمي، وحدد الشروط والمتطلبات والجهات
              والنتائج والمسارات مع إمكانية التتبع والمقارنة.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="الإصدار التشريعي"
              className="h-9 rounded-xl border border-white/20 bg-white/10 px-3 text-[10px] font-bold text-white outline-none"
              value={versionId}
              onChange={(event) => {
                setVersionId(event.target.value);
                setReadiness(null);
                setComparison(null);
              }}
            >
              <option className="text-[#0a1330]" value="">
                اختر إصدارًا
              </option>
              {policy.versions.map((version) => (
                <option
                  className="text-[#0a1330]"
                  key={version.id}
                  value={version.id}
                >
                  الإصدار {version.version_label || version.version_no} ·{" "}
                  {version.legal_status}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadModel()}
              aria-label="تحديث النموذج"
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-white/10"
            >
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>
      {!rulesOnly && (
        <nav className="flex gap-1 overflow-x-auto border-b border-[#e6edf4] bg-[#f8fafc] p-2">
          {(Object.keys(tabLabels) as Tab[]).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-[9px] font-black transition ${tab === value ? "bg-[#0066cc] text-white shadow" : "text-[#607287] hover:bg-white"}`}
            >
              {tabLabels[value]}
            </button>
          ))}
        </nav>
      )}
      {notice && (
        <div
          className={`m-4 rounded-xl border px-4 py-3 text-[10px] ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          {notice.text}
        </div>
      )}
      {!model ? (
        <div className="grid min-h-72 place-items-center text-[10px] text-[#8190a3]">
          <RefreshCw className="mb-2 animate-spin" />
          جاري تحميل النموذج التشريعي...
        </div>
      ) : (
        <div className="p-4">
          {tab === "structure" && (
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="rounded-xl border border-[#e0e8f0] bg-[#fbfdff]">
                <div className="border-b border-[#e8eef4] p-3">
                  <h3 className="text-[11px] font-black text-[#21354d]">
                    هيكل الوثيقة
                  </h3>
                  <p className="mt-1 text-[8px] text-[#8190a3]">
                    باب ← فصل ← مادة ← فقرة ← إجراء
                  </p>
                </div>
                <div className="max-h-[680px] overflow-y-auto p-2">
                  {model.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectItemFromTree(item)}
                      style={{
                        paddingRight: `${12 + (item.parent_item_id ? 18 : 0)}px`,
                      }}
                      className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-right transition ${selectedItem?.id === item.id ? "bg-[#eaf4ff] text-[#0066cc]" : "text-[#40546b] hover:bg-white"}`}
                    >
                      <span>
                        <strong className="block text-[9px]">
                          {item.item_code} · {item.title_ar}
                        </strong>
                        <small className="mt-1 block text-[7px] opacity-70">
                          {typeLabels[item.item_type] ?? item.item_type}
                          {item.source_page_from
                            ? ` · ص ${item.source_page_from}`
                            : ""}
                        </small>
                      </span>
                      <ChevronLeft size={12} />
                    </button>
                  ))}
                </div>
              </aside>
              <div className="space-y-4">
                {selectedItem ? (
                  <section className="rounded-xl border border-[#e0e8f0] p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-[12px] font-black text-[#20344d]">
                          {selectedItem.title_ar}
                        </h3>
                        <p className="mt-1 text-[8px] text-[#8190a3]">
                          النص الرسمي محفوظ دون استبداله بالتفسير التنفيذي.
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[8px] font-black ${itemForm.requires_executable_rule ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {itemForm.requires_executable_rule
                          ? "تحتاج قاعدة تنفيذية"
                          : "مادة تنظيمية"}
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="النص الرسمي">
                        <textarea
                          disabled={!editable}
                          className={`${textarea} min-h-44`}
                          value={itemForm.official_text}
                          onChange={(e) =>
                            setItemForm({
                              ...itemForm,
                              official_text: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        label="التفسير التنفيذي"
                        hint="شرح إداري لا يستبدل النص القانوني"
                      >
                        <textarea
                          disabled={!editable}
                          className={`${textarea} min-h-44`}
                          value={itemForm.interpretation_text}
                          onChange={(e) =>
                            setItemForm({
                              ...itemForm,
                              interpretation_text: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <Field label="من صفحة">
                        <input
                          disabled={!editable}
                          type="number"
                          min="1"
                          className={input}
                          value={itemForm.source_page_from}
                          onChange={(e) =>
                            setItemForm({
                              ...itemForm,
                              source_page_from: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="إلى صفحة">
                        <input
                          disabled={!editable}
                          type="number"
                          min="1"
                          className={input}
                          value={itemForm.source_page_to}
                          onChange={(e) =>
                            setItemForm({
                              ...itemForm,
                              source_page_to: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="موضع النص">
                        <input
                          disabled={!editable}
                          className={input}
                          value={itemForm.source_locator}
                          onChange={(e) =>
                            setItemForm({
                              ...itemForm,
                              source_locator: e.target.value,
                            })
                          }
                          placeholder="الفصل التاسع / المادة 33"
                        />
                      </Field>
                      <Field label="حالة المادة">
                        <select
                          disabled={!editable}
                          className={input}
                          value={itemForm.legal_status}
                          onChange={(e) =>
                            setItemForm({
                              ...itemForm,
                              legal_status: e.target.value,
                            })
                          }
                        >
                          <option value="active">سارية</option>
                          <option value="amended">معدلة</option>
                          <option value="repealed">ملغاة</option>
                          <option value="suspended">موقوفة</option>
                        </select>
                      </Field>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                      <Field label="ملاحظة التعديل">
                        <input
                          disabled={!editable}
                          className={input}
                          value={itemForm.amendment_note}
                          onChange={(e) =>
                            setItemForm({
                              ...itemForm,
                              amendment_note: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <label className="flex h-10 items-center gap-2 self-end rounded-xl border border-[#dbe5ef] px-3 text-[9px] font-bold text-[#40546b]">
                        <input
                          disabled={!editable}
                          type="checkbox"
                          checked={itemForm.requires_executable_rule}
                          onChange={(e) =>
                            setItemForm({
                              ...itemForm,
                              requires_executable_rule: e.target.checked,
                            })
                          }
                        />
                        هذه المادة تنتج قاعدة تنفيذية
                      </label>
                    </div>
                    {editable && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void execute(
                            () =>
                              rpc("admin_update_policy_item_legal_text", {
                                p_policy_item_id: selectedItem.id,
                                p_official_text: itemForm.official_text || null,
                                p_interpretation_text:
                                  itemForm.interpretation_text || null,
                                p_source_page_from: itemForm.source_page_from
                                  ? Number(itemForm.source_page_from)
                                  : null,
                                p_source_page_to: itemForm.source_page_to
                                  ? Number(itemForm.source_page_to)
                                  : null,
                                p_source_locator:
                                  itemForm.source_locator || null,
                                p_legal_status: itemForm.legal_status,
                                p_amendment_note:
                                  itemForm.amendment_note || null,
                                p_requires_executable_rule:
                                  itemForm.requires_executable_rule,
                                p_supersedes_item_id:
                                  itemForm.supersedes_item_id || null,
                              }),
                            "تم حفظ النص والبيانات القانونية للمادة.",
                          )
                        }
                        className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0066cc] px-4 text-[9px] font-black text-white disabled:opacity-50"
                      >
                        <Save size={13} />
                        حفظ بيانات المادة
                      </button>
                    )}
                  </section>
                ) : (
                  <section className="grid min-h-56 place-items-center rounded-xl border border-dashed border-[#cbd9e7] bg-[#fbfdff] p-8 text-center">
                    <div>
                      <FileText
                        className="mx-auto mb-3 text-[#7da8cf]"
                        size={30}
                      />
                      <h3 className="text-[12px] font-black text-[#20344d]">
                        لم يُضف محتوى تشريعي بعد
                      </h3>
                      <p className="mx-auto mt-2 max-w-md text-[9px] leading-5 text-[#718399]">
                        ابدأ بإضافة الفصل الأول من قسم إدارة الإصدار، ثم أضف
                        المواد واختر الفصل من حقل البند الأب.
                      </p>
                      <a
                        href="#policy-management"
                        className="mt-4 inline-flex h-10 items-center rounded-xl bg-[#0066cc] px-4 text-[9px] font-black text-white"
                      >
                        الانتقال إلى إضافة أول بند
                      </a>
                    </div>
                  </section>
                )}
                {model ? (false && (
                <section className="rounded-xl border border-[#e0e8f0] p-4">
                  <h3 className="mb-4 text-[11px] font-black text-[#20344d]">
                    بيانات الإصدار القانونية
                  </h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="الجهة المصدرة">
                      <input
                        disabled={!editable}
                        className={input}
                        value={versionForm.issuing_authority}
                        onChange={(e) =>
                          setVersionForm({
                            ...versionForm,
                            issuing_authority: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="جهة الاعتماد">
                      <input
                        disabled={!editable}
                        className={input}
                        value={versionForm.approval_authority}
                        onChange={(e) =>
                          setVersionForm({
                            ...versionForm,
                            approval_authority: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="رقم قرار الاعتماد">
                      <input
                        disabled={!editable}
                        className={input}
                        value={versionForm.approval_decision_number}
                        onChange={(e) =>
                          setVersionForm({
                            ...versionForm,
                            approval_decision_number: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="تاريخ الاعتماد">
                      <input
                        disabled={!editable}
                        type="date"
                        className={input}
                        value={versionForm.approval_date}
                        onChange={(e) =>
                          setVersionForm({
                            ...versionForm,
                            approval_date: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="سبب الإصدار">
                      <select
                        disabled={!editable}
                        className={input}
                        value={versionForm.issue_reason}
                        onChange={(e) =>
                          setVersionForm({
                            ...versionForm,
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
                        disabled={!editable}
                        className={input}
                        value={versionForm.supersedes_version_id}
                        onChange={(e) =>
                          setVersionForm({
                            ...versionForm,
                            supersedes_version_id: e.target.value,
                          })
                        }
                      >
                        <option value="">لا يستبدل إصدارًا</option>
                        {policy.versions
                          ?.filter((version) => version.id !== model!.id)
                          .map((version) => (
                            <option key={version.id} value={version.id}>
                              الإصدار{" "}
                              {version.version_label || version.version_no}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <Field
                    label="البصمة الرقمية لملف المصدر"
                    hint="SHA-256 للتحقق من عدم تغيير الملف"
                  >
                    <input
                      disabled={!editable}
                      dir="ltr"
                      className={`${input} mt-3`}
                      value={versionForm.source_document_hash}
                      onChange={(e) =>
                        setVersionForm({
                          ...versionForm,
                          source_document_hash: e.target.value,
                        })
                      }
                    />
                  </Field>
                  {editable && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void execute(
                          () =>
                            rpc("admin_update_policy_version_legal_metadata", {
                              p_policy_version_id: model!.id,
                              p_issuing_authority:
                                versionForm.issuing_authority || null,
                              p_approval_authority:
                                versionForm.approval_authority || null,
                              p_approval_decision_number:
                                versionForm.approval_decision_number || null,
                              p_approval_date:
                                versionForm.approval_date || null,
                              p_issue_reason: versionForm.issue_reason || null,
                              p_supersedes_version_id:
                                versionForm.supersedes_version_id || null,
                              p_source_document_hash:
                                versionForm.source_document_hash || null,
                            }),
                          "تم حفظ بيانات الإصدار القانونية.",
                        )
                      }
                      className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0a1330] px-4 text-[9px] font-black text-white"
                    >
                      <Save size={13} />
                      حفظ بيانات الإصدار
                    </button>
                  )}
                </section>
                )) : null}
              </div>
            </div>
          )}

          {tab === "rules" && selectedItem && (
            <div className="space-y-4">
              {!rulesOnly && (
                <aside className="min-w-0 rounded-2xl border border-[#dbe6f0] bg-white p-4 shadow-[0_10px_28px_rgba(25,67,110,.05)]">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-[11px] font-black text-[#20344d]">
                        قواعد المادة
                      </h3>
                      <p className="mt-1 text-[8px] text-[#8190a3]">
                        {selectedItem.title_ar}
                      </p>
                    </div>
                    {editable && selectedItemCanHaveRules && (
                      <button
                        onClick={() => setRuleForm(emptyRule(selectedItem))}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0066cc] px-3 text-[9px] font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)]"
                        aria-label="إضافة قاعدة"
                      >
                        <Plus size={14} />
                        إضافة قاعدة
                      </button>
                    )}
                  </div>
                  {selectedItemCanHaveRules && (
                    <div className="mb-3 rounded-xl bg-[#edf6ff] px-3 py-2 text-[8px] font-bold text-[#295f8e]">
                      هذه المادة تدعم أكثر من قاعدة تنفيذية. القواعد الحالية:{" "}
                      {selectedItem.rules?.length ?? 0}.
                    </div>
                  )}
                  {!selectedItemCanHaveRules && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[9px] leading-5 text-amber-800">
                      اختر مادة أو فقرة أو إجراءً من القائمة أدناه. الأبواب
                      والفصول تُستخدم للتنظيم فقط ولا تحمل قواعد تشغيلية مباشرة.
                    </div>
                  )}
                  <div className="mb-3 border-t border-[#edf1f5] pt-3">
                    <p className="mb-2 text-[8px] font-black text-[#607287]">
                      البنود القابلة للتنفيذ
                    </p>
                    <div className="max-h-40 space-y-1 overflow-x-hidden overflow-y-auto rounded-xl border border-[#e8eef4] bg-[#fbfdff] p-2">
                      {model.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          style={{
                            paddingRight: `${10 + (itemDepthById.get(item.id) ?? 0) * 18}px`,
                          }}
                          className={`w-full min-w-0 border-r-2 rounded-lg py-2.5 pl-2 text-right text-[9px] transition ${item.id === selectedItem.id ? "border-[#0066cc] bg-[#eaf4ff] font-black text-[#0066cc]" : executableItemTypes.has(item.item_type) ? "border-[#c9deef] text-[#52647a] hover:bg-[#f7fafc]" : "border-transparent text-[#718399] hover:bg-[#f7fafc]"}`}
                        >
                          {item.item_code} · {item.title_ar}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(selectedItem.rules ?? []).map((rule) => (
                      <button
                        key={rule.id}
                        onClick={() => editRule(rule)}
                        className={`w-full rounded-xl border p-3 text-right ${ruleForm?.id === rule.id ? "border-[#7ab8f5] bg-[#edf6ff]" : "border-[#e2e9f1]"}`}
                      >
                        <strong className="text-[9px] text-[#263950]">
                          {rule.name_ar}
                        </strong>
                        <span className="mt-1 block text-[7px] text-[#8190a3]">
                          {rule.rule_code} ·{" "}
                          {ruleTypeLabels[rule.rule_type] ?? rule.rule_type}
                        </span>
                      </button>
                    ))}
                    {!selectedItem.rules?.length && (
                      <div className="rounded-xl border border-dashed border-[#cfdae5] p-6 text-center text-[8px] text-[#8190a3]">
                        <Gavel className="mx-auto mb-2" size={20} />
                        لا توجد قواعد تنفيذية لهذه المادة.
                      </div>
                    )}
                  </div>
                </aside>
              )}
              <div className="min-w-0">
                {rulesOnly &&
                  selectedItemCanHaveRules &&
                  !ruleForm &&
                  editable && (
                    <div className="mb-4 flex justify-center rounded-2xl border border-[#dbe7f2] bg-[#f8fbff] p-6">
                      <button
                        type="button"
                        onClick={() => setRuleForm(emptyRule(selectedItem))}
                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0066cc] px-5 text-[10px] font-black text-white shadow-[0_10px_22px_rgba(0,102,204,.2)]"
                      >
                        <Plus size={15} />
                        إنشاء قاعدة جديدة للمادة
                      </button>
                    </div>
                  )}
                {!selectedItemCanHaveRules ? (
                  <div className="grid min-h-96 place-items-center rounded-xl border border-dashed border-[#cfdae5] bg-[#fbfdff] p-8 text-center text-[9px] text-[#8190a3]">
                    <div>
                      <Gavel
                        className="mx-auto mb-3 text-[#7da8cf]"
                        size={30}
                      />
                      <strong className="block text-[12px] text-[#40546b]">
                        حدد بندًا تنفيذيًا لإنشاء قاعدة
                      </strong>
                      <span className="mt-2 block">
                        القواعد ترتبط بالمادة أو الفقرة أو الإجراء حتى يبقى
                        مصدرها القانوني واضحًا وقابلًا للتدقيق.
                      </span>
                    </div>
                  </div>
                ) : !ruleForm && !rulesOnly ? (
                  <div className="grid min-h-96 place-items-center rounded-xl border border-dashed border-[#cfdae5] text-center text-[9px] text-[#8190a3]">
                    <div>
                      <ListChecks className="mx-auto mb-3" size={30} />
                      <strong className="block text-[11px] text-[#40546b]">
                        اختر قاعدة أو أنشئ قاعدة جديدة
                      </strong>
                      <span className="mt-1 block">
                        يمكن للمادة الواحدة إنتاج أكثر من قاعدة ومسار.
                      </span>
                    </div>
                  </div>
                ) : ruleForm ? (
                  <RuleEditor
                    form={ruleForm}
                    setForm={setRuleForm}
                    editable={editable}
                    units={units}
                    classes={classes}
                    workflows={workflowVersions}
                    busy={busy}
                    onSave={() => void saveRule()}
                    onRemove={
                      ruleForm.id
                        ? () =>
                            void execute(
                              () =>
                                rpc("admin_remove_policy_rule", {
                                  p_policy_rule_id: ruleForm.id,
                                }),
                              "تم حذف القاعدة التنفيذية.",
                            ).then(() => setRuleForm(null))
                        : undefined
                    }
                  />
                ) : null}
              </div>
            </div>
          )}
          {tab === "rules" && !selectedItem && (
            <WorkspaceEmptyState
              icon={Gavel}
              title="لا يمكن إنشاء قاعدة قبل إضافة مادة"
              description="القواعد التنفيذية ترتبط بمادة محددة حتى يبقى مصدر القرار القانوني قابلًا للتتبع. أضف فصلًا ومادة من إدارة الإصدار ثم ارجع إلى هذا التبويب."
              actionLabel="الانتقال إلى إدارة الإصدار"
              actionHref="#policy-management"
              steps={[
                "أضف فصلًا أو مادة إلى الإصدار المسودة.",
                "اختر المادة وفعّل: هذه المادة تنتج قاعدة تنفيذية.",
                "أنشئ القاعدة وشروطها ونتائجها من هذا التبويب.",
              ]}
            />
          )}

          {tab === "references" && selectedItem && (
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <section className="rounded-xl border border-[#e0e8f0] p-4">
                <h3 className="text-[11px] font-black text-[#20344d]">
                  الإحالات القانونية للمادة
                </h3>
                <div className="mt-3 space-y-2">
                  {(selectedItem.references ?? []).map((reference) => (
                    <article
                      key={reference.id}
                      className="flex items-start justify-between rounded-xl border border-[#e4ebf2] p-3"
                    >
                      <div>
                        <span className="rounded-full bg-[#edf6ff] px-2 py-1 text-[7px] font-black text-[#0066cc]">
                          {referenceLabels[reference.reference_type] ??
                            reference.reference_type}
                        </span>
                        <strong className="mt-2 block text-[9px] text-[#263950]">
                          {reference.citation_text ||
                            reference.external_reference ||
                            "إحالة داخلية"}
                        </strong>
                        <p className="mt-1 text-[8px] text-[#8190a3]">
                          {reference.notes}
                        </p>
                      </div>
                      {editable && (
                        <button
                          onClick={() =>
                            void execute(
                              () =>
                                rpc("admin_remove_policy_reference", {
                                  p_policy_reference_id: reference.id,
                                }),
                              "تم حذف الإحالة.",
                            )
                          }
                          aria-label="حذف الإحالة"
                          className="text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </article>
                  ))}
                  {!selectedItem.references?.length && (
                    <p className="rounded-xl border border-dashed p-6 text-center text-[8px] text-[#8190a3]">
                      لا توجد إحالات مسجلة.
                    </p>
                  )}
                </div>
              </section>
              <section className="rounded-xl border border-[#e0e8f0] p-4">
                <h3 className="text-[11px] font-black text-[#20344d]">
                  إضافة إحالة
                </h3>
                <div className="mt-4 space-y-3">
                  <Field label="نوع العلاقة">
                    <select
                      disabled={!editable}
                      className={input}
                      value={referenceForm.reference_type}
                      onChange={(e) =>
                        setReferenceForm({
                          ...referenceForm,
                          reference_type: e.target.value,
                        })
                      }
                    >
                      {Object.entries(referenceLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="مرجع خارجي">
                    <input
                      disabled={!editable}
                      className={input}
                      value={referenceForm.external_reference}
                      onChange={(e) =>
                        setReferenceForm({
                          ...referenceForm,
                          external_reference: e.target.value,
                        })
                      }
                      placeholder="قرار مجلس الجامعة رقم..."
                    />
                  </Field>
                  <Field label="نص الاستشهاد">
                    <input
                      disabled={!editable}
                      className={input}
                      value={referenceForm.citation_text}
                      onChange={(e) =>
                        setReferenceForm({
                          ...referenceForm,
                          citation_text: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="ملاحظات">
                    <textarea
                      disabled={!editable}
                      className={textarea}
                      value={referenceForm.notes}
                      onChange={(e) =>
                        setReferenceForm({
                          ...referenceForm,
                          notes: e.target.value,
                        })
                      }
                    />
                  </Field>
                  {editable && (
                    <button
                      disabled={
                        busy ||
                        (!referenceForm.external_reference &&
                          !referenceForm.target_policy_id)
                      }
                      onClick={() =>
                        void execute(
                          () =>
                            rpc("admin_save_policy_reference", {
                              p_policy_reference_id: referenceForm.id || null,
                              p_source_policy_item_id: selectedItem.id,
                              p_target_policy_id:
                                referenceForm.target_policy_id || null,
                              p_target_policy_version_id:
                                referenceForm.target_policy_version_id || null,
                              p_target_policy_item_id:
                                referenceForm.target_policy_item_id || null,
                              p_external_reference:
                                referenceForm.external_reference || null,
                              p_reference_type: referenceForm.reference_type,
                              p_citation_text:
                                referenceForm.citation_text || null,
                              p_notes: referenceForm.notes || null,
                            }),
                          "تم حفظ الإحالة القانونية.",
                        ).then(() =>
                          setReferenceForm({
                            id: "",
                            reference_type: "based_on",
                            target_policy_id: "",
                            target_policy_version_id: "",
                            target_policy_item_id: "",
                            external_reference: "",
                            citation_text: "",
                            notes: "",
                          }),
                        )
                      }
                      className="h-10 w-full rounded-xl bg-[#0066cc] text-[9px] font-black text-white disabled:opacity-50"
                    >
                      <Link2 className="ml-1 inline" size={13} />
                      حفظ الإحالة
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}
          {tab === "references" && !selectedItem && (
            <WorkspaceEmptyState
              icon={Link2}
              title="لا توجد مادة لربط الإحالات بها"
              description="كل إحالة يجب أن تنطلق من مادة معلومة، سواء كانت مبنية على قانون خارجي أو تستبدل مادة أخرى أو تفسرها."
              actionLabel="إضافة أول مادة"
              actionHref="#policy-management"
              steps={[
                "أضف المادة بالنص الرسمي ورقم الصفحة.",
                "حدد المادة من هيكل الوثيقة.",
                "أضف نوع الإحالة ونص الاستشهاد والمرجع الخارجي.",
              ]}
            />
          )}

          {tab === "readiness" && (
            <section className="rounded-xl border border-[#e0e8f0] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-[12px] font-black text-[#20344d]">
                    <ShieldCheck size={17} className="text-emerald-600" />
                    فحص اكتمال الإصدار
                  </h3>
                  <p className="mt-1 text-[8px] text-[#8190a3]">
                    يتحقق من النصوص والنطاقات والقواعد والصلاحيات والمسارات
                    والمصدر.
                  </p>
                </div>
                <button
                  disabled={busy}
                  onClick={() => void runReadiness()}
                  className="h-10 rounded-xl bg-[#0066cc] px-4 text-[9px] font-black text-white"
                >
                  {busy ? "جارٍ الفحص..." : "تشغيل الفحص"}
                </button>
              </div>
              {readiness ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
                  <div
                    className={`grid place-items-center rounded-2xl p-6 text-center ${readiness.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                  >
                    <strong className="text-4xl">{readiness.score}%</strong>
                    <span className="mt-2 text-[9px] font-black">
                      {readiness.ready ? "جاهز للمراجعة" : "يحتاج استكمال"}
                    </span>
                    <small className="mt-2 text-[8px]">
                      {readiness.items_ready} من {readiness.items_total} بند
                      مكتمل
                    </small>
                  </div>
                  <div className="space-y-2">
                    {readiness.errors.map((item) => (
                      <div
                        key={item.code}
                        className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[9px] text-red-800"
                      >
                        <AlertTriangle size={14} />
                        <div>
                          <strong>{item.code}</strong>
                          <p className="mt-1">{item.message}</p>
                        </div>
                      </div>
                    ))}
                    {readiness.warnings.map((item) => (
                      <div
                        key={item.code}
                        className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[9px] text-amber-800"
                      >
                        <AlertTriangle size={14} />
                        <div>
                          <strong>{item.code}</strong>
                          <p className="mt-1">{item.message}</p>
                        </div>
                      </div>
                    ))}
                    {readiness.ready && !readiness.warnings.length && (
                      <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[9px] text-emerald-800">
                        <CheckCircle2 size={16} />
                        اكتملت جميع متطلبات النموذج التشريعي.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <ReadinessPreview
                    label="محتوى الإصدار"
                    value={
                      model.items.length
                        ? `${model.items.length} بند`
                        : "غير مضاف"
                    }
                    ready={model.items.length > 0}
                  />
                  <ReadinessPreview
                    label="نطاق التطبيق"
                    value={
                      model.scopes?.length
                        ? `${model.scopes.length} نطاق`
                        : "غير محدد"
                    }
                    ready={Boolean(model.scopes?.length)}
                  />
                  <ReadinessPreview
                    label="بيانات المصدر"
                    value={
                      model.source_document_hash
                        ? "موثقة بالبصمة"
                        : "البصمة غير مسجلة"
                    }
                    ready={Boolean(model.source_document_hash)}
                  />
                  <div className="md:col-span-3 rounded-xl border border-dashed border-[#b9cee0] bg-[#f8fbfe] p-6 text-center">
                    <ShieldCheck className="mx-auto text-[#6d9bc3]" size={28} />
                    <strong className="mt-3 block text-[11px] text-[#29425f]">
                      الفحص متاح ولا توجد نتيجة محفوظة بعد
                    </strong>
                    <p className="mt-2 text-[9px] text-[#718399]">
                      اضغط «تشغيل الفحص» للحصول على قائمة دقيقة بالأخطاء
                      والتحذيرات والمتطلبات الناقصة.
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === "compare" && (policy.versions?.length ?? 0) > 1 && (
            <section className="rounded-xl border border-[#e0e8f0] p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] flex-1">
                  <Field label="قارن الإصدار الحالي مع">
                    <select
                      className={input}
                      value={compareVersionId}
                      onChange={(e) => setCompareVersionId(e.target.value)}
                    >
                      <option value="">اختر الإصدار السابق</option>
                      {policy.versions
                        ?.filter((version) => version.id !== model.id)
                        .map((version) => (
                          <option key={version.id} value={version.id}>
                            الإصدار{" "}
                            {version.version_label || version.version_no}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
                <button
                  disabled={!compareVersionId || busy}
                  onClick={() => void runComparison()}
                  className="h-10 rounded-xl bg-[#0066cc] px-4 text-[9px] font-black text-white disabled:opacity-50"
                >
                  <FileDiff className="ml-1 inline" size={14} />
                  تشغيل المقارنة
                </button>
              </div>
              {comparison ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <DiffList
                    title="مواد مضافة"
                    color="emerald"
                    items={comparison.added.map(
                      (item) => `${item.item_code} · ${item.title_ar}`,
                    )}
                  />
                  <DiffList
                    title="مواد معدلة"
                    color="amber"
                    items={comparison.modified.map(
                      (item) => `${item.item_code} · ${item.right.title_ar}`,
                    )}
                  />
                  <DiffList
                    title="مواد ملغاة أو محذوفة"
                    color="red"
                    items={comparison.removed.map(
                      (item) => `${item.item_code} · ${item.title_ar}`,
                    )}
                  />
                </div>
              ) : (
                <p className="mt-5 rounded-xl border border-dashed p-8 text-center text-[9px] text-[#718399]">
                  اختر إصدارًا سابقًا ثم شغّل المقارنة لعرض المواد المضافة
                  والمعدلة والملغاة.
                </p>
              )}
            </section>
          )}
          {tab === "compare" && (policy.versions?.length ?? 0) <= 1 && (
            <WorkspaceEmptyState
              icon={FileDiff}
              title="لا يوجد إصدار سابق للمقارنة"
              description="المقارنة تحتاج إصدارين على الأقل من اللائحة نفسها. الإصدار 2018.1 هو الإصدار الوحيد حاليًا، لذلك لا توجد فروقات يمكن حسابها."
              actionLabel="الانتقال إلى إدارة الإصدار"
              actionHref="#policy-management"
              steps={[
                "أكمل الإصدار الحالي واعتمده.",
                "أنشئ إصدار عمل جديدًا عند وجود تعديل لاحق.",
                "ارجع هنا لمقارنة المواد المضافة والمعدلة والملغاة.",
              ]}
            />
          )}
        </div>
      )}
    </section>
    {ruleDrawerOpen && selectedItem && selectedItemCanHaveRules && (
      <div className="fixed inset-0 z-50 bg-[#081630]/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="إدارة قواعد المادة">
        <aside className="ml-auto flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl" dir="rtl">
          <header className="flex items-start justify-between gap-4 border-b border-[#e5edf4] bg-[linear-gradient(135deg,#0a1330,#0066cc)] px-5 py-5 text-white">
            <div><p className="text-[10px] font-black text-[#ffb46c]">إدارة تشريعية</p><h3 className="mt-1 text-base font-black">قواعد المادة: {selectedItem.title_ar}</h3><p className="mt-1 text-[10px] text-white/75">يمكن للمادة الواحدة أن تحتوي عدة قواعد مستقلة، لكل منها شروط ومتطلبات وصلاحيات ونتائج.</p></div>
            <button onClick={() => setRuleDrawerOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-white/10 text-lg" aria-label="إغلاق لوحة قواعد المادة">×</button>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#dce9f5] bg-[#f8fbff] p-4">
              <div><p className="text-[10px] font-black text-[#0066cc]">{selectedItem.item_code}</p><p className="mt-1 text-xs font-bold text-[#203952]">{selectedItem.rules?.length ?? 0} قاعدة مرتبطة بهذه المادة</p></div>
              {editable && <button onClick={() => { setRuleForm(emptyRule(selectedItem)); setTab("rules"); setRuleDrawerOpen(false); }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0066cc] px-4 text-[10px] font-black text-white"><Plus size={15}/> إنشاء قاعدة</button>}
            </div>
            <div className="space-y-3">
              {(selectedItem.rules ?? []).map((rule) => <article key={rule.id} className="rounded-2xl border border-[#e2eaf2] p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="text-xs font-black text-[#1e3854]">{rule.name_ar}</h4><p className="mt-1 text-[10px] text-[#718399]">{ruleTypeLabels[rule.rule_type] ?? rule.rule_type} · أولوية {rule.priority}</p>{rule.description && <p className="mt-2 text-[11px] leading-6 text-[#526f8b]">{rule.description}</p>}</div>{editable && <button onClick={() => { editRule(rule); setTab("rules"); setRuleDrawerOpen(false); }} className="shrink-0 rounded-lg border border-[#c9def1] px-3 py-2 text-[10px] font-black text-[#0066cc]">تحرير</button>}</div></article>)}
              {!selectedItem.rules?.length && <div className="rounded-2xl border border-dashed border-[#bdd5e8] bg-[#fbfdff] p-8 text-center"><Gavel className="mx-auto text-[#83a5c5]" size={28}/><h4 className="mt-3 text-xs font-black text-[#29435e]">لا توجد قواعد لهذه المادة بعد</h4><p className="mt-2 text-[11px] leading-6 text-[#718399]">أنشئ القاعدة الأولى لتحديد الشروط والمتطلبات والجهات المخولة والقرارات والمسار.</p></div>}
            </div>
          </div>
          <footer className="border-t border-[#e5edf4] bg-[#fbfdff] p-4"><button onClick={() => { setTab("rules"); setRuleDrawerOpen(false); }} className="w-full rounded-xl border border-[#cbddeb] px-4 py-3 text-[11px] font-black text-[#365572]">فتح مساحة القواعد الكاملة</button></footer>
        </aside>
      </div>
    )}
    </>
  );
}

function DiffList({
  title,
  color,
  items,
}: {
  title: string;
  color: "emerald" | "amber" | "red";
  items: string[];
}) {
  const colors = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <strong className="text-[10px]">
        {title} ({items.length})
      </strong>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-lg bg-white/70 p-2 text-[8px]">
            {item}
          </div>
        ))}
        {!items.length && (
          <p className="text-[8px] opacity-70">لا توجد تغييرات.</p>
        )}
      </div>
    </div>
  );
}

function ReadinessPreview({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${ready ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}
    >
      <span
        className={`text-[8px] font-black ${ready ? "text-emerald-700" : "text-amber-700"}`}
      >
        {ready ? "مكتمل" : "يحتاج استكمال"}
      </span>
      <strong className="mt-2 block text-[10px] text-[#29425f]">{label}</strong>
      <p className="mt-1 text-[8px] text-[#718399]">{value}</p>
    </div>
  );
}

function WorkspaceEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  steps,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  steps: string[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#dbe6f0] bg-white">
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px] lg:items-center">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#eaf4ff] text-[#0066cc]">
            <Icon size={22} />
          </span>
          <div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[8px] font-black text-amber-700">
              متطلب سابق غير مكتمل
            </span>
            <h3 className="mt-3 text-base font-black text-[#14233a]">
              {title}
            </h3>
            <p className="mt-2 max-w-2xl text-[10px] leading-6 text-[#66798f]">
              {description}
            </p>
            <a
              href={actionHref}
              className="mt-4 inline-flex h-10 items-center rounded-xl bg-[#0066cc] px-4 text-[9px] font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.16)]"
            >
              {actionLabel}
            </a>
          </div>
        </div>
        <div className="rounded-xl border border-[#e0e9f2] bg-[#f8fbfe] p-4">
          <strong className="text-[9px] text-[#29425f]">
            ما الذي يجب فعله؟
          </strong>
          <ol className="mt-3 space-y-2">
            {steps.map((step, index) => (
              <li
                key={step}
                className="flex gap-2 text-[8px] leading-5 text-[#66798f]"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white font-black text-[#0066cc] shadow-sm">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function RuleEditor({
  form,
  setForm,
  editable,
  units,
  classes,
  workflows,
  busy,
  onSave,
  onRemove,
}: {
  form: ReturnType<typeof emptyRule>;
  setForm: React.Dispatch<
    React.SetStateAction<ReturnType<typeof emptyRule> | null>
  >;
  editable: boolean;
  units: ReferenceOption[];
  classes: ReferenceOption[];
  workflows: Array<{ id: string; label: string }>;
  busy: boolean;
  onSave: () => void;
  onRemove?: () => void;
}) {
  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm({ ...form, [key]: value });
  }
  function updateRow(
    key:
      | "conditions"
      | "requirements"
      | "authorities"
      | "actions"
      | "workflow_bindings",
    index: number,
    patch: Record<string, unknown>,
  ) {
    update(
      key,
      form[key].map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }
  function removeRow(
    key:
      | "conditions"
      | "requirements"
      | "authorities"
      | "actions"
      | "workflow_bindings",
    index: number,
  ) {
    update(
      key,
      form[key].filter((_, rowIndex) => rowIndex !== index),
    );
  }
  function applyTemplate(template: (typeof ruleTemplates)[number]) {
    const baseCode = form.code.replace(/-rule$/, "") || "rule";
    setForm({
      ...form,
      code: form.id ? form.code : `${baseCode}-${template.id}`,
      name_ar: form.id ? form.name_ar : template.title,
      description: form.description || template.description,
      rule_type: template.ruleType,
      applies_when: JSON.stringify(template.context, null, 2),
      effect_payload: JSON.stringify(template.effect, null, 2),
      requires_workflow:
        template.id === "authority" || template.id === "routing",
    });
  }
  function getSetting(value: string, key: string, fallback = "") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return typeof parsed[key] === "string" ? parsed[key] : fallback;
    } catch {
      return fallback;
    }
  }
  function updateContext(event: string) {
    update("applies_when", JSON.stringify(event === "always" ? {} : { event }));
  }
  function updateEffect(outcome: string) {
    update(
      "effect_payload",
      JSON.stringify(outcome === "none" ? {} : { outcome }),
    );
  }
  function addCondition(preset: Partial<Record<string, unknown>> = {}) {
    update("conditions", [
      ...form.conditions,
      {
        code: `condition_${form.conditions.length + 1}`,
        field_path: "",
        operator: "eq",
        expected_value: "",
        failure_action: "return_for_completion",
        failure_message_ar: "",
        ...preset,
      },
    ]);
  }
  function conditionSummary(row: Record<string, unknown>) {
    const fields: Record<string, string> = {
      "request.status": "حالة الطلب",
      "request.type": "نوع الطلب",
      "meeting.quorum": "النصاب",
      "attendance.rate": "نسبة الحضور",
      "document.meeting_minutes": "محضر الاجتماع",
      "member.role": "صفة العضو",
    };
    const operators: Record<string, string> = {
      eq: "تساوي",
      neq: "لا تساوي",
      gt: "أكبر من",
      gte: "لا تقل عن",
      lt: "أصغر من",
      lte: "لا تزيد عن",
      exists: "موجود",
      not_exists: "غير موجود",
    };
    const failures: Record<string, string> = {
      block: "أوقف العملية",
      reject: "ارفض الطلب",
      return_for_completion: "أعده للاستكمال",
      warn: "اعرض تحذيرًا",
      request_exception: "اطلب استثناءً",
    };
    const subject = fields[String(row.field_path ?? "")] ?? "البيان المختار";
    const operator = operators[String(row.operator ?? "eq")] ?? "يطابق";
    const value =
      row.expected_value === "" || row.expected_value == null
        ? "القيمة المحددة"
        : String(row.expected_value);
    const failure =
      failures[String(row.failure_action ?? "return_for_completion")] ??
      "اتخذ الإجراء المحدد";
    return `تطبّق القاعدة عندما يكون ${subject} ${operator} ${value}؛ وإذا لم يتحقق الشرط: ${failure}.`;
  }
  return (
    <section className="space-y-4 rounded-xl border border-[#e0e8f0] p-4">
      {!form.id && form.code.endsWith("-rule") && (
        <div className="rounded-2xl border border-[#d8e8f8] bg-[#f8fbff] p-4">
          <div className="mb-3">
            <strong className="text-[11px] text-[#20344d]">
              ابدأ بقالب قاعدة
            </strong>
            <p className="mt-1 text-[8px] text-[#718399]">
              اختر النمط الأقرب ثم عدّل الحقول؛ لا تحتاج إلى كتابة إعدادات تقنية
              من البداية.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {ruleTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={!editable}
                onClick={() => applyTemplate(template)}
                className={`rounded-xl border p-3 text-right transition ${form.rule_type === template.ruleType ? "border-[#79b8f5] bg-[#eaf4ff]" : "border-[#e0e8f0] bg-white hover:border-[#9bc9f6]"}`}
              >
                <strong className="block text-[9px] text-[#24405e]">
                  {template.title}
                </strong>
                <span className="mt-1 block text-[8px] leading-4 text-[#718399]">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="رمز القاعدة">
          <input
            disabled={!editable || Boolean(form.id)}
            dir="ltr"
            className={input}
            value={form.code}
            onChange={(e) =>
              update("code", e.target.value.toLowerCase().replace(/\s+/g, "-"))
            }
          />
        </Field>
        <Field label="اسم القاعدة">
          <input
            disabled={!editable}
            className={input}
            value={form.name_ar}
            onChange={(e) => update("name_ar", e.target.value)}
          />
        </Field>
        <Field label="نوع القاعدة">
          <select
            disabled={!editable}
            className={input}
            value={form.rule_type}
            onChange={(e) => update("rule_type", e.target.value)}
          >
            {Object.entries(ruleTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="الوصف">
        <textarea
          disabled={!editable}
          className={textarea}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="الحالة">
          <select
            disabled={!editable}
            className={input}
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="draft">مسودة</option>
            <option value="active">نشطة</option>
            <option value="suspended">موقوفة</option>
            <option value="retired">متقاعدة</option>
          </select>
        </Field>
        <Field label="الأولوية">
          <input
            disabled={!editable}
            type="number"
            className={input}
            value={form.priority}
            onChange={(e) => update("priority", e.target.value)}
          />
        </Field>
        <Field label="صالحة من">
          <input
            disabled={!editable}
            type="date"
            className={input}
            value={form.valid_from}
            onChange={(e) => update("valid_from", e.target.value)}
          />
        </Field>
        <Field label="صالحة إلى">
          <input
            disabled={!editable}
            type="date"
            className={input}
            value={form.valid_to}
            onChange={(e) => update("valid_to", e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 rounded-xl bg-[#edf6ff] p-3 text-[9px] font-bold text-[#295f8e]">
        <input
          disabled={!editable}
          type="checkbox"
          checked={form.requires_workflow}
          onChange={(e) => update("requires_workflow", e.target.checked)}
        />
        تحتاج هذه القاعدة إلى مسار اعتماد
      </label>
      <section className="grid gap-3 rounded-2xl border border-[#d8e8f8] bg-[#f8fbff] p-4 md:grid-cols-2">
        <Field
          label="متى تعمل القاعدة؟"
          hint="هذا إعداد عام؛ أما الحالات التفصيلية فتُضاف في قسم الشروط."
        >
          <select
            disabled={!editable}
            className={input}
            value={getSetting(form.applies_when, "event", "always")}
            onChange={(e) => updateContext(e.target.value)}
          >
            <option value="always">دائمًا عند تنفيذ المادة</option>
            <option value="submission">عند تقديم الطلب</option>
            <option value="before_action">قبل تنفيذ الإجراء</option>
            <option value="review">أثناء المراجعة</option>
            <option value="approval">قبل الاعتماد</option>
            <option value="after_decision">بعد صدور القرار</option>
          </select>
        </Field>
        <Field
          label="ما الإجراء الافتراضي للنظام؟"
          hint="يمكن تحديد قرارات أكثر تفصيلاً في قسم القرارات والنتائج."
        >
          <select
            disabled={!editable}
            className={input}
            value={getSetting(form.effect_payload, "outcome", "none")}
            onChange={(e) => updateEffect(e.target.value)}
          >
            <option value="none">لا إجراء تلقائي</option>
            <option value="block">منع المتابعة</option>
            <option value="return_for_completion">إعادة للاستكمال</option>
            <option value="notify">إشعار الجهة المختصة</option>
            <option value="route_to_authority">إحالة إلى الجهة المختصة</option>
            <option value="start_workflow">بدء مسار اعتماد</option>
          </select>
        </Field>
      </section>
      <section className="rounded-2xl border border-[#d8e8f8] bg-[#f8fbff] p-4">
        <h4 className="text-[11px] font-black text-[#20344d]">
          كيف تُبنى القاعدة؟
        </h4>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-white p-3 text-[8px] leading-5 text-[#607287]">
            <strong className="block text-[#0066cc]">1. الشرط</strong>متى تُطبق
            القاعدة؟ مثال: عندما يكون الطلب جديدًا.
          </div>
          <div className="rounded-xl bg-white p-3 text-[8px] leading-5 text-[#607287]">
            <strong className="block text-[#0066cc]">2. المتطلب</strong>ما الذي
            يجب تقديمه؟ مثال: محضر اجتماع أو مستند إثبات.
          </div>
          <div className="rounded-xl bg-white p-3 text-[8px] leading-5 text-[#607287]">
            <strong className="block text-[#0066cc]">3. الجهة</strong>من يراجع
            أو يعتمد أو ينفذ؟ اختر المجلس أو الوحدة المختصة.
          </div>
          <div className="rounded-xl bg-white p-3 text-[8px] leading-5 text-[#607287]">
            <strong className="block text-[#0066cc]">4. القرار</strong>ما
            النتيجة المتاحة؟ موافقة، رفض، إعادة للاستكمال أو إحالة.
          </div>
        </div>
        <p className="mt-3 text-[8px] text-[#718399]">
          أضف فقط ما تحتاجه القاعدة؛ ليست كل القواعد بحاجة إلى جميع الأقسام.
        </p>
      </section>
      <RuleRows
        title="الشروط"
        icon={<ListChecks size={14} />}
        onAdd={
          editable
            ? () =>
                update("conditions", [
                  ...form.conditions,
                  {
                    code: `condition_${form.conditions.length + 1}`,
                    field_path: "",
                    operator: "eq",
                    expected_value: "",
                    failure_action: "return_for_completion",
                    failure_message_ar: "",
                  },
                ])
            : undefined
        }
      >
        <div className="rounded-xl border border-[#d8e8f8] bg-[#f8fbff] p-3">
          <p className="text-[9px] font-black text-[#29425f]">
            متى نطبّق هذه القاعدة؟
          </p>
          <p className="mt-1 text-[8px] leading-5 text-[#718399]">
            اختر حالة جاهزة أو أضف شرطًا مخصصًا. الشرط اختياري؛ أضفه فقط عندما
            تعتمد القاعدة على حالة محددة.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!editable}
              onClick={() =>
                addCondition({
                  field_path: "document.meeting_minutes",
                  operator: "exists",
                  expected_value: "",
                  failure_action: "return_for_completion",
                })
              }
              className="rounded-lg border border-[#cfe2f5] bg-white px-3 py-2 text-[8px] font-bold text-[#0066cc]"
            >
              يتطلب محضر اجتماع
            </button>
            <button
              type="button"
              disabled={!editable}
              onClick={() =>
                addCondition({
                  field_path: "meeting.quorum",
                  operator: "eq",
                  expected_value: "مكتمل",
                  failure_action: "block",
                })
              }
              className="rounded-lg border border-[#cfe2f5] bg-white px-3 py-2 text-[8px] font-bold text-[#0066cc]"
            >
              يتحقق النصاب
            </button>
            <button
              type="button"
              disabled={!editable}
              onClick={() =>
                addCondition({
                  field_path: "attendance.rate",
                  operator: "gte",
                  expected_value: "67",
                  failure_action: "return_for_completion",
                })
              }
              className="rounded-lg border border-[#cfe2f5] bg-white px-3 py-2 text-[8px] font-bold text-[#0066cc]"
            >
              حضور لا يقل عن 67%
            </button>
          </div>
        </div>
        <RowLegend
          labels={[
            "رمز الشرط",
            "البيان المراد فحصه",
            "المقارنة",
            "القيمة المطلوبة",
            "عند عدم التحقق",
          ]}
        />
        {form.conditions.map((row, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl bg-[#f8fafc] p-3 md:grid-cols-6"
          >
            <p className="col-span-full rounded-lg bg-white px-3 py-2 text-[9px] leading-5 text-[#40546b]">
              {conditionSummary(row)}
            </p>
            <input
              disabled={!editable}
              className="hidden"
              value={String(row.code ?? "")}
              onChange={(e) =>
                updateRow("conditions", index, { code: e.target.value })
              }
              placeholder="الرمز"
            />
            <select
              disabled={!editable}
              className={input}
              value={String(row.field_path ?? "")}
              onChange={(e) =>
                updateRow("conditions", index, { field_path: e.target.value })
              }
            >
              <option value="">اختر البيان المراد فحصه</option>
              <option value="request.status">حالة الطلب</option>
              <option value="request.type">نوع الطلب</option>
              <option value="meeting.quorum">اكتمال النصاب</option>
              <option value="attendance.rate">نسبة الحضور</option>
              <option value="document.meeting_minutes">
                وجود محضر الاجتماع
              </option>
              <option value="member.role">صفة العضو</option>
            </select>
            <select
              disabled={!editable}
              className={input}
              value={String(row.operator ?? "eq")}
              onChange={(e) =>
                updateRow("conditions", index, { operator: e.target.value })
              }
            >
              {[
                ["eq", "يساوي"],
                ["neq", "لا يساوي"],
                ["gt", "أكبر من"],
                ["gte", "أكبر أو يساوي"],
                ["lt", "أصغر من"],
                ["lte", "أصغر أو يساوي"],
                ["in", "ضمن قائمة"],
                ["contains", "يحتوي"],
                ["exists", "موجود"],
                ["not_exists", "غير موجود"],
                ["before", "قبل تاريخ"],
                ["after", "بعد تاريخ"],
                ["matches", "يطابق نمطًا"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              disabled={!editable}
              className={input}
              value={
                typeof row.expected_value === "string"
                  ? row.expected_value
                  : JSON.stringify(row.expected_value)
              }
              onChange={(e) => {
                let value: unknown = e.target.value;
                try {
                  value = JSON.parse(e.target.value);
                } catch {}
                updateRow("conditions", index, { expected_value: value });
              }}
              placeholder="القيمة"
            />
            <select
              disabled={!editable}
              className={input}
              value={String(row.failure_action ?? "block")}
              onChange={(e) =>
                updateRow("conditions", index, {
                  failure_action: e.target.value,
                })
              }
            >
              <option value="block">منع</option>
              <option value="reject">رفض</option>
              <option value="return_for_completion">إعادة للاستكمال</option>
              <option value="warn">تحذير</option>
              <option value="request_exception">طلب استثناء</option>
            </select>
            {editable && (
              <button
                onClick={() => removeRow("conditions", index)}
                className="text-red-600"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </RuleRows>
      <RuleRows
        title="المتطلبات والمستندات"
        icon={<FileText size={14} />}
        onAdd={
          editable
            ? () =>
                update("requirements", [
                  ...form.requirements,
                  {
                    code: `document_${form.requirements.length + 1}`,
                    name_ar: "مستند مطلوب",
                    requirement_type: "document",
                    is_mandatory: true,
                    timing: "before_submission",
                    validation_spec: {},
                  },
                ])
            : undefined
        }
      >
        <RowLegend
          labels={[
            "رمز المتطلب",
            "اسم المستند أو البيان",
            "نوعه",
            "متى يُطلب",
            "إلزامي؟",
          ]}
        />
        {form.requirements.map((row, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl bg-[#f8fafc] p-3 md:grid-cols-6"
          >
            <input
              disabled={!editable}
              className="hidden"
              value={String(row.code ?? "")}
              onChange={(e) =>
                updateRow("requirements", index, { code: e.target.value })
              }
            />
            <input
              disabled={!editable}
              className={input}
              value={String(row.name_ar ?? "")}
              onChange={(e) =>
                updateRow("requirements", index, { name_ar: e.target.value })
              }
            />
            <select
              disabled={!editable}
              className={input}
              value={String(row.requirement_type ?? "document")}
              onChange={(e) =>
                updateRow("requirements", index, {
                  requirement_type: e.target.value,
                })
              }
            >
              {[
                "document",
                "data",
                "approval",
                "fee",
                "declaration",
                "evidence",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              disabled={!editable}
              className={input}
              value={String(row.timing ?? "before_submission")}
              onChange={(e) =>
                updateRow("requirements", index, { timing: e.target.value })
              }
            >
              {[
                "before_submission",
                "before_review",
                "before_decision",
                "after_decision",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-[8px]">
              <input
                disabled={!editable}
                type="checkbox"
                checked={Boolean(row.is_mandatory)}
                onChange={(e) =>
                  updateRow("requirements", index, {
                    is_mandatory: e.target.checked,
                  })
                }
              />
              إلزامي
            </label>
            {editable && (
              <button
                onClick={() => removeRow("requirements", index)}
                className="text-red-600"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </RuleRows>
      <RuleRows
        title="الجهات والصلاحيات"
        icon={<Scale size={14} />}
        onAdd={
          editable
            ? () =>
                update("authorities", [
                  ...form.authorities,
                  {
                    governance_unit_id: "",
                    governance_class_id: classes[0]?.id ?? "",
                    responsibility: "review",
                    authority_action: "recommend",
                    required_permission_code: "",
                    is_final: false,
                  },
                ])
            : undefined
        }
      >
        <RowLegend
          labels={[
            "الجهة المختصة",
            "مسؤوليتها",
            "القرار المسموح",
            "كود صلاحية اختياري",
            "قرار نهائي؟",
          ]}
        />
        {form.authorities.map((row, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl bg-[#f8fafc] p-3 md:grid-cols-6"
          >
            <select
              disabled={!editable}
              className={input}
              value={String(
                row.governance_class_id
                  ? `class:${row.governance_class_id}`
                  : `unit:${row.governance_unit_id ?? ""}`,
              )}
              onChange={(e) => {
                const [kind, id] = e.target.value.split(":");
                updateRow("authorities", index, {
                  governance_class_id: kind === "class" ? id : "",
                  governance_unit_id: kind === "unit" ? id : "",
                });
              }}
            >
              <option value="unit:">اختر الجهة</option>
              <optgroup label="تصنيفات المجالس">
                {classes.map((item) => (
                  <option key={item.id} value={`class:${item.id}`}>
                    {item.name_ar}
                  </option>
                ))}
              </optgroup>
              <optgroup label="مجالس محددة">
                {units.map((item) => (
                  <option key={item.id} value={`unit:${item.id}`}>
                    {item.name_ar}
                  </option>
                ))}
              </optgroup>
            </select>
            <select
              disabled={!editable}
              className={input}
              value={String(row.responsibility ?? "review")}
              onChange={(e) =>
                updateRow("authorities", index, {
                  responsibility: e.target.value,
                })
              }
            >
              {[
                "present",
                "review",
                "discuss",
                "recommend",
                "initial_approve",
                "final_approve",
                "execute",
                "follow_up",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              disabled={!editable}
              className={input}
              value={String(row.authority_action ?? "recommend")}
              onChange={(e) =>
                updateRow("authorities", index, {
                  authority_action: e.target.value,
                })
              }
            >
              {[
                "recommend",
                "approve",
                "final_approve",
                "reject",
                "return",
                "refer",
                "execute",
                "verify",
                "follow_up",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <input
              disabled={!editable}
              className={input}
              value={String(row.required_permission_code ?? "")}
              onChange={(e) =>
                updateRow("authorities", index, {
                  required_permission_code: e.target.value,
                })
              }
              placeholder="permission.code"
            />
            <label className="flex items-center gap-2 text-[8px]">
              <input
                disabled={!editable}
                type="checkbox"
                checked={Boolean(row.is_final)}
                onChange={(e) =>
                  updateRow("authorities", index, {
                    is_final: e.target.checked,
                  })
                }
              />
              نهائية
            </label>
            {editable && (
              <button
                onClick={() => removeRow("authorities", index)}
                className="text-red-600"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </RuleRows>
      <RuleRows
        title="القرارات والنتائج المسموحة"
        icon={<Gavel size={14} />}
        onAdd={
          editable
            ? () =>
                update("actions", [
                  ...form.actions,
                  {
                    code: "approved",
                    label_ar: "موافقة",
                    action_type: "approve",
                    is_terminal: false,
                    requires_reason: false,
                    result_payload: {},
                  },
                ])
            : undefined
        }
      >
        <RowLegend
          labels={[
            "رمز القرار",
            "النص الظاهر للمستخدم",
            "نوع القرار",
            "ينهي الطلب؟",
            "يتطلب سببًا؟",
          ]}
        />
        {form.actions.map((row, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl bg-[#f8fafc] p-3 md:grid-cols-6"
          >
            <input
              disabled={!editable}
              className="hidden"
              value={String(row.code ?? "")}
              onChange={(e) =>
                updateRow("actions", index, { code: e.target.value })
              }
            />
            <input
              disabled={!editable}
              className={input}
              value={String(row.label_ar ?? "")}
              onChange={(e) =>
                updateRow("actions", index, { label_ar: e.target.value })
              }
            />
            <select
              disabled={!editable}
              className={input}
              value={String(row.action_type ?? "approve")}
              onChange={(e) =>
                updateRow("actions", index, { action_type: e.target.value })
              }
            >
              {[
                "recommend",
                "approve",
                "reject",
                "return",
                "defer",
                "refer",
                "execute",
                "cancel",
                "request_exception",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-[8px]">
              <input
                disabled={!editable}
                type="checkbox"
                checked={Boolean(row.is_terminal)}
                onChange={(e) =>
                  updateRow("actions", index, { is_terminal: e.target.checked })
                }
              />
              نهائية
            </label>
            <label className="flex items-center gap-2 text-[8px]">
              <input
                disabled={!editable}
                type="checkbox"
                checked={Boolean(row.requires_reason)}
                onChange={(e) =>
                  updateRow("actions", index, {
                    requires_reason: e.target.checked,
                  })
                }
              />
              تحتاج سببًا
            </label>
            {editable && (
              <button
                onClick={() => removeRow("actions", index)}
                className="text-red-600"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </RuleRows>
      {form.requires_workflow && (
        <RuleRows
          title="ارتباطات مسارات الاعتماد"
          icon={<GitBranch size={14} />}
          onAdd={
            editable
              ? () =>
                  update("workflow_bindings", [
                    ...form.workflow_bindings,
                    {
                      workflow_template_version_id: workflows[0]?.id ?? "",
                      binding_type: "primary",
                      selection_conditions: {},
                      priority: 100,
                    },
                  ])
              : undefined
          }
        >
          {form.workflow_bindings.map((row, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl bg-[#f8fafc] p-3 md:grid-cols-4"
            >
              <select
                disabled={!editable}
                className={input}
                value={String(row.workflow_template_version_id ?? "")}
                onChange={(e) =>
                  updateRow("workflow_bindings", index, {
                    workflow_template_version_id: e.target.value,
                  })
                }
              >
                <option value="">اختر المسار</option>
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.label}
                  </option>
                ))}
              </select>
              <select
                disabled={!editable}
                className={input}
                value={String(row.binding_type ?? "primary")}
                onChange={(e) =>
                  updateRow("workflow_bindings", index, {
                    binding_type: e.target.value,
                  })
                }
              >
                <option value="primary">أساسي</option>
                <option value="objection">اعتراض</option>
                <option value="exception">استثناء</option>
                <option value="fallback">بديل</option>
              </select>
              <input
                disabled={!editable}
                type="number"
                className={input}
                value={String(row.priority ?? 100)}
                onChange={(e) =>
                  updateRow("workflow_bindings", index, {
                    priority: Number(e.target.value),
                  })
                }
              />
              {editable && (
                <button
                  onClick={() => removeRow("workflow_bindings", index)}
                  className="text-red-600"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </RuleRows>
      )}
      {editable && (
        <div className="flex flex-wrap gap-2 border-t border-[#e8eef4] pt-4">
          <button
            disabled={busy || !form.name_ar || !form.code}
            onClick={onSave}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0066cc] px-5 text-[9px] font-black text-white disabled:opacity-50"
          >
            <Save size={13} />
            حفظ القاعدة كاملة
          </button>
          {onRemove && (
            <button
              disabled={busy}
              onClick={onRemove}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 px-4 text-[9px] font-black text-red-700"
            >
              <Trash2 size={13} />
              حذف القاعدة
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function RowLegend({ labels }: { labels: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-2 text-[8px] font-black text-[#718399] md:grid-cols-5">
      {labels
        .filter((label) => !label.includes("رمز"))
        .map((label) => (
          <span key={label}>{label}</span>
        ))}
    </div>
  );
}

function RuleRows({
  title,
  icon,
  onAdd,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e2e9f1]">
      <header className="flex items-center justify-between border-b border-[#e8eef4] bg-[#fbfdff] px-3 py-2.5">
        <h4 className="flex items-center gap-2 text-[9px] font-black text-[#30445c]">
          {icon}
          {title}
        </h4>
        {onAdd && (
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded-lg bg-[#edf6ff] px-2 py-1.5 text-[8px] font-black text-[#0066cc]"
          >
            <Plus size={11} />
            إضافة
          </button>
        )}
      </header>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}
