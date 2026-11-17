"use client";

import { Card as QCard } from "@/shared/ui/card";

import { Button as QButton } from "@/shared/ui/button";

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
    <section className="rounded-q-card border border-q-border bg-q-surface p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-q-border pb-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-surface-2 text-q-primary">
            <GitBranch size={18} />
          </span>
          <div>
            <h3 className="text-q-ui font-bold text-q-text">
              نسخ اللائحة وإصداراتها
            </h3>
            <p className="mt-1 text-q-caption leading-5 text-q-text-3">
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
      <p className="mt-3 rounded-q-control border border-q-border bg-q-surface px-4 py-3 text-q-caption leading-6 text-q-text-2">
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
                className={`rounded-q-card border p-4 transition ${selected ? "border-q-primary bg-q-surface " : "border-q-border bg-q-surface hover:border-q-primary"}`}
              >
                <QButton variant="ghost"
                  type="button"
                  title="اختيار هذا الإصدار للتحرير والعرض"
                  onClick={() => onSelectVersion(version.id)}
                  className="min-w-11 w-full text-right"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-q-caption font-bold ${editable ? "bg-q-warning-soft text-q-warning" : version.legal_status === "effective" ? "bg-q-success-soft text-q-success" : "bg-q-neutral-soft text-q-text-2"}`}
                      >
                        {statusLabels[version.legal_status] ??
                          version.legal_status}
                      </span>
                      <h4 className="mt-2 text-q-ui font-bold text-q-text">
                        {version.version_label ||
                          `الإصدار ${version.version_no}`}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-q-caption leading-5 text-q-text-3">
                        {version.change_summary || "لا يوجد ملخص تغييرات مسجل."}
                      </p>
                    </div>
                    <span className="grid h-9 w-9 place-items-center rounded-q-control bg-q-surface text-q-primary ">
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
                </QButton>
                <div className="mt-3 flex items-center justify-between border-t border-q-border pt-3">
                  <span className="text-q-caption font-bold text-q-text-3">
                    {selected
                      ? "نسخة العمل المعروضة الآن"
                      : version.legal_status === "effective"
                        ? "النسخة المطبقة حالياً"
                        : editable
                          ? "مسودة متاحة للتحرير"
                          : "سجل نظامي للقراءة فقط"}
                  </span>
                  {canDeleteVersion(version) && (
                    <QButton variant="ghost"
                      type="button"
                      title="حذف هذه المسودة الفارغة نهائياً"
                      aria-label={`حذف الإصدار ${version.version_label || version.version_no}`}
                      onClick={() => setDeleting(version)}
                      className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control text-q-danger hover:bg-q-danger-soft"
                    >
                      <Trash2 size={14} />
                    </QButton>
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
              <QButton variant="ghost"
                type="button"
                title="إنشاء الإصدار الأول"
                onClick={() => setCreating(true)}
                className="min-w-11 rounded-q-control bg-q-primary px-4 py-2.5 text-q-ui font-bold text-q-on-primary"
              >
                إنشاء الإصدار الأول
              </QButton>
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
          <QCard className="p-0 rounded-q-control border border-q-border bg-q-danger-soft p-4 text-q-caption leading-6 text-q-danger">
            سيتم حذف «
            {deleting.version_label || `الإصدار ${deleting.version_no}`}». لن
            تتأثر بقية الإصدارات.
          </QCard>
          <div className="mt-5 flex justify-end gap-2">
            <QButton variant="ghost"
              type="button"
              title="إلغاء الحذف"
              onClick={() => setDeleting(undefined)}
              className="min-w-11 min-h-11 rounded-q-control border border-q-border px-4 text-q-ui font-bold text-q-text-2"
            >
              إلغاء
            </QButton>
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
      ? "border-q-border bg-q-surface-2 text-q-link"
      : tone === "amber"
        ? "border-q-border bg-q-warning-soft text-q-warning"
        : "border-q-border bg-q-success-soft text-q-success";
  return (
    <div className={`flex items-start gap-2 rounded-q-control border p-3 ${colors}`}>
      <span className="mt-0.5">{icon}</span>
      <div>
        <strong className="text-q-caption font-bold">{title}</strong>
        <p className="mt-1 text-q-caption leading-5 opacity-80">{description}</p>
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
    <div className="rounded-q-control bg-q-surface px-2 py-2">
      <strong className="block text-q-caption text-q-text">{value}</strong>
      <span className="text-q-caption text-q-text-3">{label}</span>
    </div>
  );
}
