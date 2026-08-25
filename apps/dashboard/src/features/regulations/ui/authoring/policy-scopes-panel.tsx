"use client";

import { useState } from "react";
import {
  Building2,
  CalendarDays,
  Layers3,
  Plus,
  Route,
  Trash2,
  Users,
} from "lucide-react";
import {
  regulationsRpc,
  type PolicyAuthoringReferences,
} from "../../api/regulations-client";
import {
  firstValidationMessage,
  policyScopeDraftSchema,
} from "../../model/policy-authoring";
import { resolvePolicyScopeUnits } from "../../model/policy-scope-impact";
import type {
  PolicyScope,
  PolicyVersion,
  ReferenceOption,
} from "../../model/types";
import {
  AuthoringDialog,
  AuthoringField,
  EmptyAuthoringState,
  PrimaryAction,
  authoringInput,
  type AuthoringMutation,
} from "./authoring-primitives";

const scopeLabels: Record<string, string> = {
  organization: "المنظمة كاملة",
  governance_unit: "مجلس أو وحدة محددة",
  governance_class: "تصنيف مجالس",
  governance_unit_type: "نوع وحدة تنظيمية",
  governance_level: "مستوى تنظيمي",
  unit_subtree: "وحدة والجهات التابعة",
};

type ScopeForm = {
  type:
    | "organization"
    | "governance_unit"
    | "governance_class"
    | "governance_unit_type"
    | "governance_level"
    | "unit_subtree";
  targetId: string;
  governanceLevel: string;
  includeDescendants: boolean;
  priority: string;
  validFrom: string;
  validTo: string;
};

const blankScope: ScopeForm = {
  type: "organization",
  targetId: "",
  governanceLevel: "",
  includeDescendants: false,
  priority: "100",
  validFrom: "",
  validTo: "",
};

function scopeTargetId(scope: PolicyScope) {
  if (scope.scope_type === "governance_class")
    return scope.governance_class_id ?? scope.target_id;
  if (scope.scope_type === "governance_unit_type")
    return scope.governance_unit_type_id ?? scope.target_id;
  return scope.governance_unit_id ?? scope.target_id;
}

function referenceName(options: ReferenceOption[], id?: string | null) {
  const option = options.find((item) => item.id === id);
  return option ? String(option.name_ar ?? option.code) : null;
}

function scopeDescription(
  scope: PolicyScope,
  references: PolicyAuthoringReferences,
) {
  if (scope.scope_type === "organization")
    return "جميع المجالس والوحدات داخل المنظمة";
  if (scope.scope_type === "governance_class")
    return (
      referenceName(references.classes, scopeTargetId(scope)) ??
      "تصنيف غير متاح"
    );
  if (scope.scope_type === "governance_unit_type")
    return (
      referenceName(references.unitTypes, scopeTargetId(scope)) ??
      "نوع غير متاح"
    );
  if (scope.scope_type === "governance_level")
    return (
      references.governanceLevels.find(
        (level) => level.value === scope.governance_level,
      )?.label ??
      scope.governance_level ??
      "مستوى غير متاح"
    );
  const name =
    referenceName(references.units, scopeTargetId(scope)) ?? "جهة غير متاحة";
  return scope.scope_type === "unit_subtree"
    ? `${name} وجميع الجهات التابعة لها`
    : name;
}

function impactLabel(count: number) {
  if (count === 0) return "لا يطابق أي مجلس حالياً";
  if (count === 1) return "يشمل مجلساً واحداً حالياً";
  if (count === 2) return "يشمل مجلسين حالياً";
  if (count <= 10) return `يشمل ${count} مجالس حالياً`;
  return `يشمل ${count} مجلساً حالياً`;
}

function ScopeImpact({
  scope,
  references,
  compact = false,
}: {
  scope: PolicyScope;
  references: PolicyAuthoringReferences;
  compact?: boolean;
}) {
  const units = resolvePolicyScopeUnits(scope, references);
  return (
    <div
      className={`mt-3 rounded-xl border p-3 ${units.length ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50"}`}
    >
      <div className="flex items-center gap-2">
        <Users
          size={14}
          className={units.length ? "text-emerald-700" : "text-amber-700"}
        />
        <strong
          className={`text-[9px] ${units.length ? "text-emerald-800" : "text-amber-800"}`}
        >
          {impactLabel(units.length)}
        </strong>
      </div>
      {units.length > 0 && (
        <div className="mt-2">
          <p className="mb-2 text-[8px] font-black text-[#49657e]">
            المجالس المشمولة الآن:
          </p>
          <div
            className={`grid gap-1.5 overflow-y-auto sm:grid-cols-2 ${compact ? "max-h-36" : "max-h-56"}`}
          >
            {units.map((unit) => (
              <span
                key={unit.id}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-[8px] font-bold text-[#35536b]"
              >
                <Building2 size={11} className="shrink-0 text-emerald-600" />
                {String(unit.name_ar ?? unit.code)}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[8px] leading-5 text-[#6d7f90]">
        النتيجة تُحتسب من شجرة المجالس الحالية، وأي مجلس جديد يطابق القاعدة
        سيُضم تلقائياً.
      </p>
    </div>
  );
}

export function PolicyScopesPanel({
  version,
  references,
  busy,
  mutate,
  reportError,
}: {
  version?: PolicyVersion;
  references: PolicyAuthoringReferences;
  busy: boolean;
  mutate: AuthoringMutation;
  reportError: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<PolicyScope>();
  const [form, setForm] = useState<ScopeForm>(blankScope);
  const editable = version?.legal_status === "draft";

  async function addScope() {
    if (!version) return;
    const parsed = policyScopeDraftSchema.safeParse(form);
    const error = firstValidationMessage(parsed);
    if (error || !parsed.success) {
      reportError(error ?? "راجع بيانات النطاق.");
      return;
    }
    await mutate(
      () =>
        regulationsRpc("admin_set_policy_scope", {
          p_policy_version_id: version.id,
          p_scope_type: parsed.data.type,
          p_target_id: parsed.data.targetId || null,
          p_governance_level:
            parsed.data.type === "governance_level"
              ? parsed.data.governanceLevel
              : null,
          p_include_descendants:
            parsed.data.type === "unit_subtree" &&
            parsed.data.includeDescendants,
          p_priority: Number(parsed.data.priority),
          p_valid_from: parsed.data.validFrom || null,
          p_valid_to: parsed.data.validTo || null,
        }),
      "تمت إضافة نطاق التطبيق.",
    );
    setAdding(false);
    setForm(blankScope);
  }

  async function removeScope() {
    if (!deleting) return;
    await mutate(
      () =>
        regulationsRpc("admin_remove_policy_scope", {
          p_scope_assignment_id: deleting.id,
        }),
      "تم حذف نطاق التطبيق.",
    );
    setDeleting(undefined);
  }

  if (!version)
    return (
      <EmptyAuthoringState
        icon={<Route size={22} />}
        title="اختر أو أنشئ إصداراً"
        description="يرتبط نطاق التطبيق بإصدار محدد حتى تبقى الإصدارات السابقة قابلة للتدقيق."
      />
    );

  return (
    <section className="overflow-hidden rounded-2xl border border-[#dce7f1] bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5edf4] bg-[#fbfdff] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff2e8] text-[#d96712]">
            <Route size={18} />
          </span>
          <div>
            <h3 className="text-sm font-black text-[#1b3049]">
              المجالس المشمولة بنطاق الإصدار
            </h3>
            <p className="mt-1 text-[9px] leading-5 text-[#718398]">
              كل بطاقة تعرض قاعدة الاختيار ونتيجتها الفعلية من شجرة المجالس
              الحالية.
            </p>
          </div>
        </div>
        {editable ? (
          <PrimaryAction
            busy={busy}
            onClick={() => setAdding(true)}
            title="إضافة قاعدة جديدة لتحديد المجالس المشمولة"
          >
            <Plus size={14} /> إضافة نطاق
          </PrimaryAction>
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black text-slate-700">
            الإصدار للقراءة فقط
          </span>
        )}
      </header>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px] sm:p-5">
        <div className="space-y-3">
          {version.scopes.map((scope) => (
            <article
              key={scope.id}
              className="flex items-start gap-3 rounded-2xl border border-[#dfe8f1] bg-white p-4 shadow-sm"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf4ff] text-[#0872df]">
                {scope.scope_type === "organization" ? (
                  <Building2 size={17} />
                ) : scope.scope_type === "governance_class" ||
                  scope.scope_type === "governance_unit_type" ? (
                  <Layers3 size={17} />
                ) : (
                  <Route size={17} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-[11px] text-[#243a52]">
                    {scopeLabels[scope.scope_type] ?? scope.scope_type}
                  </strong>
                  <span className="rounded-full bg-[#f0f5f9] px-2 py-0.5 text-[8px] font-black text-[#667b91]">
                    أولوية {scope.priority}
                  </span>
                  {scope.include_descendants && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black text-emerald-700">
                      يشمل التابع
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[9px] leading-5 text-[#6f8297]">
                  {scopeDescription(scope, references)}
                </p>
                <p className="mt-2 flex items-center gap-1 text-[8px] text-[#8998a9]">
                  <CalendarDays size={11} />
                  {scope.valid_from
                    ? `من ${scope.valid_from}`
                    : "يبدأ عند نفاذ الإصدار"}
                  {scope.valid_to
                    ? ` حتى ${scope.valid_to}`
                    : " دون تاريخ نهاية"}
                </p>
                <ScopeImpact scope={scope} references={references} />
              </div>
              {editable && (
                <button
                  type="button"
                  title="حذف نطاق التطبيق من هذه المسودة"
                  aria-label={`حذف نطاق ${scopeLabels[scope.scope_type] ?? scope.scope_type}`}
                  onClick={() => setDeleting(scope)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </article>
          ))}
          {!version.scopes.length && (
            <EmptyAuthoringState
              icon={<Route size={22} />}
              title="لا يوجد نطاق تطبيق"
              description={
                editable
                  ? "أضف نطاقاً واحداً على الأقل لتحديد المجالس والوحدات التي يسري عليها الإصدار."
                  : "لم يُسجل نطاق تطبيق لهذا الإصدار."
              }
              action={
                editable ? (
                  <button
                    type="button"
                    title="إضافة أول نطاق تطبيق"
                    onClick={() => setAdding(true)}
                    className="rounded-xl bg-[#0872df] px-4 py-2.5 text-[10px] font-black text-white"
                  >
                    إضافة أول نطاق
                  </button>
                ) : undefined
              }
            />
          )}
        </div>
        <aside className="space-y-3">
          <div className="rounded-2xl border border-[#d9e8f5] bg-[#f3f9ff] p-4">
            <h4 className="text-[10px] font-black text-[#285071]">
              كيف تختار النطاق؟
            </h4>
            <ul className="mt-3 space-y-2 text-[9px] leading-5 text-[#60778e]">
              <li>• استخدم «تصنيف مجالس» لكل مجالس الأقسام أو الكليات.</li>
              <li>• استخدم «نوع وحدة» لكل الوحدات من نوع تنظيمي واحد.</li>
              <li>• استخدم «وحدة والجهات التابعة» لفرع تنظيمي كامل.</li>
              <li>• الأولوية الأعلى تحسم عند وجود أكثر من نطاق مطابق.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[#f0ddc9] bg-[#fff9f3] p-4 text-[9px] leading-6 text-[#76533a]">
            ربط المادة بدور مجلس أو خطوة اعتماد يتم في «القواعد والمسارات». هنا
            نحدد فقط أين يسري الإصدار.
          </div>
        </aside>
      </div>

      {adding && (
        <ScopeDialog
          form={form}
          setForm={setForm}
          references={references}
          busy={busy}
          onClose={() => setAdding(false)}
          onSave={() => void addScope()}
        />
      )}
      {deleting && (
        <AuthoringDialog
          title="حذف نطاق التطبيق"
          description="لن يُحذف أي مجلس؛ سيُزال ارتباط هذا الإصدار بالنطاق فقط."
          onClose={() => setDeleting(undefined)}
        >
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[10px] leading-6 text-red-900">
            سيتم حذف نطاق «
            {scopeLabels[deleting.scope_type] ?? deleting.scope_type}» من
            المسودة.
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              title="إلغاء الحذف"
              onClick={() => setDeleting(undefined)}
              className="h-10 rounded-xl border border-[#dce5ee] px-4 text-[10px] font-black text-[#52677e]"
            >
              إلغاء
            </button>
            <PrimaryAction
              busy={busy}
              tone="red"
              onClick={() => void removeScope()}
              title="تأكيد حذف النطاق"
            >
              <Trash2 size={14} /> حذف النطاق
            </PrimaryAction>
          </div>
        </AuthoringDialog>
      )}
    </section>
  );
}

function ScopeDialog({
  form,
  setForm,
  references,
  busy,
  onClose,
  onSave,
}: {
  form: ScopeForm;
  setForm: (form: ScopeForm) => void;
  references: PolicyAuthoringReferences;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const targetOptions =
    form.type === "governance_class"
      ? references.classes
      : form.type === "governance_unit_type"
        ? references.unitTypes
        : references.units;
  const needsTarget = [
    "governance_unit",
    "governance_class",
    "governance_unit_type",
    "unit_subtree",
  ].includes(form.type);
  const previewScope: PolicyScope = {
    id: "preview",
    policy_version_id: "preview",
    scope_type: form.type,
    target_id: form.targetId || null,
    governance_unit_id: ["governance_unit", "unit_subtree"].includes(form.type)
      ? form.targetId || null
      : null,
    governance_class_id:
      form.type === "governance_class" ? form.targetId || null : null,
    governance_unit_type_id:
      form.type === "governance_unit_type" ? form.targetId || null : null,
    governance_level:
      form.type === "governance_level" ? form.governanceLevel || null : null,
    include_descendants: form.includeDescendants,
    priority: Number(form.priority || 0),
    is_active: true,
  };
  const canPreview =
    form.type === "organization" ||
    (needsTarget ? Boolean(form.targetId) : Boolean(form.governanceLevel));
  return (
    <AuthoringDialog
      title="إضافة نطاق تطبيق"
      description="اختر قاعدة واحدة، ثم راجع أسماء المجالس التي ستشملها قبل الحفظ."
      onClose={onClose}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthoringField label="نوع النطاق" required>
          <select
            className={authoringInput}
            value={form.type}
            onChange={(event) =>
              setForm({
                ...form,
                type: event.target.value as ScopeForm["type"],
                targetId: "",
                governanceLevel: "",
                includeDescendants: event.target.value === "unit_subtree",
              })
            }
          >
            {Object.entries(scopeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </AuthoringField>
        {needsTarget && (
          <AuthoringField
            label={
              form.type === "governance_class"
                ? "تصنيف المجالس"
                : form.type === "governance_unit_type"
                  ? "نوع الوحدة"
                  : "المجلس أو الوحدة"
            }
            required
          >
            <select
              className={authoringInput}
              value={form.targetId}
              onChange={(event) =>
                setForm({ ...form, targetId: event.target.value })
              }
            >
              <option value="">اختر...</option>
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {String(option.name_ar ?? option.code)}
                </option>
              ))}
            </select>
          </AuthoringField>
        )}
        {form.type === "governance_level" && (
          <AuthoringField label="المستوى التنظيمي" required>
            <select
              className={authoringInput}
              value={form.governanceLevel}
              onChange={(event) =>
                setForm({ ...form, governanceLevel: event.target.value })
              }
            >
              <option value="">اختر...</option>
              {references.governanceLevels.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </AuthoringField>
        )}
        <AuthoringField
          label="الأولوية"
          hint="تُطبق القيمة الأعلى عند تداخل النطاقات."
        >
          <input
            dir="ltr"
            type="number"
            min="0"
            max="10000"
            className={authoringInput}
            value={form.priority}
            onChange={(event) =>
              setForm({ ...form, priority: event.target.value })
            }
          />
        </AuthoringField>
        <AuthoringField label="بداية السريان">
          <input
            dir="ltr"
            type="date"
            className={authoringInput}
            value={form.validFrom}
            onChange={(event) =>
              setForm({ ...form, validFrom: event.target.value })
            }
          />
        </AuthoringField>
        <AuthoringField label="نهاية السريان">
          <input
            dir="ltr"
            type="date"
            className={authoringInput}
            value={form.validTo}
            onChange={(event) =>
              setForm({ ...form, validTo: event.target.value })
            }
          />
        </AuthoringField>
        {form.type === "unit_subtree" && (
          <label className="flex items-center gap-2 rounded-xl border border-[#dfe8f1] bg-white p-3 text-[9px] font-bold text-[#40566e]">
            <input
              type="checkbox"
              checked={form.includeDescendants}
              onChange={(event) =>
                setForm({ ...form, includeDescendants: event.target.checked })
              }
            />
            تضمين جميع الجهات التابعة
          </label>
        )}
      </div>
      {canPreview && (
        <div className="mt-4">
          <p className="text-[9px] font-black text-[#2f4962]">
            معاينة قبل الحفظ
          </p>
          <ScopeImpact scope={previewScope} references={references} compact />
        </div>
      )}
      <div className="mt-6 flex justify-end border-t border-[#e4ebf2] pt-4">
        <PrimaryAction
          busy={busy}
          onClick={onSave}
          title="التحقق وإضافة نطاق التطبيق"
        >
          <Plus size={14} /> إضافة النطاق
        </PrimaryAction>
      </div>
    </AuthoringDialog>
  );
}
