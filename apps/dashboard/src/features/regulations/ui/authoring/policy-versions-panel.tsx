"use client";

import { useState } from "react";
import {
  CheckCircle2,
  FileClock,
  GitBranch,
  PencilLine,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { regulationsRpc } from "../../api/regulations-client";
import {
  firstValidationMessage,
  versionDraftSchema,
} from "../../model/policy-authoring";
import type { Policy, PolicyVersion } from "../../model/types";
import {
  AuthoringDialog,
  AuthoringField,
  EmptyAuthoringState,
  PrimaryAction,
  authoringInput,
  authoringTextarea,
  type AuthoringMutation,
} from "./authoring-primitives";

const statusLabels: Record<string, string> = {
  draft: "مسودة قابلة للتحرير",
  under_review: "قيد المراجعة",
  approved: "معتمدة",
  effective: "نافذة",
  suspended: "معلقة",
  expired: "منتهية",
};

function canDeleteVersion(version: PolicyVersion) {
  return (
    version.legal_status === "draft" &&
    version.items.length === 0 &&
    version.scopes.length === 0 &&
    (version.attachments?.length ?? 0) === 0 &&
    !version.issuing_authority &&
    !version.approval_authority &&
    !version.approval_decision_number &&
    !version.source_document_hash
  );
}

export function PolicyVersionsPanel({
  policy,
  selectedVersionId,
  onSelectVersion,
  busy,
  mutate,
  reportError,
}: {
  policy: Policy;
  selectedVersionId: string;
  onSelectVersion: (versionId: string) => void;
  busy: boolean;
  mutate: AuthoringMutation;
  reportError: (message: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PolicyVersion>();
  const [form, setForm] = useState({ label: "", summary: "" });

  async function createVersion() {
    const parsed = versionDraftSchema.safeParse(form);
    const error = firstValidationMessage(parsed);
    if (error || !parsed.success) {
      reportError(error ?? "راجع بيانات الإصدار.");
      return;
    }
    await mutate(
      () =>
        regulationsRpc("admin_create_policy_version", {
          p_policy_id: policy.id,
          p_version_label: parsed.data.label,
          p_change_summary: parsed.data.summary,
        }),
      "تم إنشاء إصدار مسودة جديد.",
    );
    setCreating(false);
    setForm({ label: "", summary: "" });
  }

  async function removeVersion() {
    if (!deleting) return;
    await mutate(
      () =>
        regulationsRpc("admin_remove_empty_policy_version", {
          p_policy_version_id: deleting.id,
        }),
      "تم حذف الإصدار الفارغ.",
    );
    setDeleting(undefined);
  }

  return (
    <section className="rounded-2xl border border-[#dce7f1] bg-white p-5 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ebf0f5] pb-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf4ff] text-[#0872df]">
            <GitBranch size={18} />
          </span>
          <div>
            <h3 className="text-sm font-black text-[#1b3049]">
              نسخ اللائحة وإصداراتها
            </h3>
            <p className="mt-1 text-[9px] leading-5 text-[#718398]">
              الإصدار هو نسخة قانونية محفوظة من اللائحة، وليس مجرد رقم تقني.
            </p>
          </div>
        </div>
        <PrimaryAction
          busy={busy}
          onClick={() => setCreating(true)}
          title="إنشاء إصدار مسودة فارغ"
        >
          <Plus size={14} /> إصدار جديد
        </PrimaryAction>
      </header>

      <div className="mt-4 grid gap-2 lg:grid-cols-3">
        <VersionPurpose
          icon={<PencilLine size={15} />}
          title="1. مسودة العمل"
          description="تضيف وتعدّل النص والنطاق والقواعد بحرية."
          tone="blue"
        />
        <VersionPurpose
          icon={<ShieldCheck size={15} />}
          title="2. المراجعة والاعتماد"
          description="تُجمّد النسخة حتى يراجعها ويعتمدها المخوّل."
          tone="amber"
        />
        <VersionPurpose
          icon={<CheckCircle2 size={15} />}
          title="3. النسخة النافذة"
          description="هي النسخة التي يطبقها النظام على الموضوعات والاجتماعات."
          tone="green"
        />
      </div>
      <p className="mt-3 rounded-xl border border-[#d6e7f6] bg-[#f4f9fe] px-4 py-3 text-[9px] leading-6 text-[#416079]">
        لا تنشئ إصداراً لكل تعديل صغير. أنشئ إصداراً جديداً فقط عندما تحتاج إلى
        تعديل نسخة سبق اعتمادها أو دخلت حيز النفاذ؛ وبذلك يبقى التاريخ النظامي
        قابلاً للتدقيق.
      </p>

      {policy.versions?.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {policy.versions.map((version) => {
            const selected = version.id === selectedVersionId;
            const editable = version.legal_status === "draft";
            return (
              <article
                key={version.id}
                className={`rounded-2xl border p-4 transition ${selected ? "border-[#83bff2] bg-[#f1f8ff] shadow-sm" : "border-[#e0e8f0] bg-white hover:border-[#b8d6ee]"}`}
              >
                <button
                  type="button"
                  title="اختيار هذا الإصدار للتحرير والعرض"
                  onClick={() => onSelectVersion(version.id)}
                  className="w-full text-right"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[8px] font-black ${editable ? "bg-amber-100 text-amber-800" : version.legal_status === "effective" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
                      >
                        {statusLabels[version.legal_status] ??
                          version.legal_status}
                      </span>
                      <h4 className="mt-2 text-sm font-black text-[#20364f]">
                        {version.version_label ||
                          `الإصدار ${version.version_no}`}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-[9px] leading-5 text-[#718398]">
                        {version.change_summary || "لا يوجد ملخص تغييرات مسجل."}
                      </p>
                    </div>
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#0872df] shadow-sm">
                      <FileClock size={16} />
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <VersionMetric
                      label="العناصر"
                      value={version.items.length}
                    />
                    <VersionMetric
                      label="النطاقات"
                      value={version.scopes.length}
                    />
                    <VersionMetric
                      label="الجاهزية"
                      value={`${version.readiness_percent ?? version.automation_readiness_pct ?? 0}%`}
                    />
                  </div>
                </button>
                <div className="mt-3 flex items-center justify-between border-t border-[#dce8f2] pt-3">
                  <span className="text-[8px] font-bold text-[#718398]">
                    {selected
                      ? "نسخة العمل المعروضة الآن"
                      : version.legal_status === "effective"
                        ? "النسخة المطبقة حالياً"
                        : editable
                          ? "مسودة متاحة للتحرير"
                          : "سجل نظامي للقراءة فقط"}
                  </span>
                  {canDeleteVersion(version) && (
                    <button
                      type="button"
                      title="حذف هذه المسودة الفارغة نهائياً"
                      aria-label={`حذف الإصدار ${version.version_label || version.version_no}`}
                      onClick={() => setDeleting(version)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyAuthoringState
            icon={<FileClock size={21} />}
            title="لا يوجد إصدار بعد"
            description="أنشئ مسودة الإصدار الأول قبل إضافة المواد والنطاقات."
            action={
              <button
                type="button"
                title="إنشاء الإصدار الأول"
                onClick={() => setCreating(true)}
                className="rounded-xl bg-[#0872df] px-4 py-2.5 text-[10px] font-black text-white"
              >
                إنشاء الإصدار الأول
              </button>
            }
          />
        </div>
      )}

      {creating && (
        <AuthoringDialog
          title="إنشاء إصدار مسودة"
          description="لن يؤثر الإصدار الجديد على الإصدار النافذ حتى يمر بالمراجعة والاعتماد."
          onClose={() => setCreating(false)}
        >
          <div className="space-y-4">
            <AuthoringField
              label="وسم الإصدار"
              hint="مثال: 2.0 أو 2026.2"
              required
            >
              <input
                dir="ltr"
                className={authoringInput}
                value={form.label}
                onChange={(event) =>
                  setForm({ ...form, label: event.target.value })
                }
              />
            </AuthoringField>
            <AuthoringField
              label="ملخص التغييرات"
              hint="اشرح سبب الإصدار وما الذي سيختلف عن الإصدار السابق."
              required
            >
              <textarea
                className={authoringTextarea}
                value={form.summary}
                onChange={(event) =>
                  setForm({ ...form, summary: event.target.value })
                }
              />
            </AuthoringField>
            <div className="flex justify-end">
              <PrimaryAction
                busy={busy}
                onClick={() => void createVersion()}
                title="التحقق وإنشاء إصدار المسودة"
              >
                <Plus size={14} /> إنشاء المسودة
              </PrimaryAction>
            </div>
          </div>
        </AuthoringDialog>
      )}

      {deleting && (
        <AuthoringDialog
          title="حذف الإصدار الفارغ"
          description="هذا الإجراء نهائي ومتاح فقط للمسودة غير المرتبطة بأي محتوى أو نطاق أو مرفق."
          onClose={() => setDeleting(undefined)}
        >
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[10px] leading-6 text-red-900">
            سيتم حذف «
            {deleting.version_label || `الإصدار ${deleting.version_no}`}». لن
            تتأثر بقية الإصدارات.
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
              onClick={() => void removeVersion()}
              title="تأكيد حذف الإصدار نهائياً"
            >
              <Trash2 size={14} /> حذف الإصدار
            </PrimaryAction>
          </div>
        </AuthoringDialog>
      )}
    </section>
  );
}

function VersionPurpose({
  icon,
  title,
  description,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone: "blue" | "amber" | "green";
}) {
  const colors =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 ${colors}`}>
      <span className="mt-0.5">{icon}</span>
      <div>
        <strong className="text-[9px] font-black">{title}</strong>
        <p className="mt-1 text-[8px] leading-5 opacity-80">{description}</p>
      </div>
    </div>
  );
}

function VersionMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-white px-2 py-2">
      <strong className="block text-[11px] text-[#213750]">{value}</strong>
      <span className="text-[8px] text-[#8191a3]">{label}</span>
    </div>
  );
}
