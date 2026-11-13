"use client";

import { Card as QCard } from "@/shared/ui/card";

import { Button as QButton } from "@/shared/ui/button";

import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  FileClock,
  FolderTree,
  LoaderCircle,
  RefreshCw,
  Route,
} from "lucide-react";
import {
  getPolicyAuthoringReferences,
  getPolicyDetail,
  type PolicyAuthoringReferences,
} from "../../api/regulations-client";
import type { Policy } from "../../model/types";
import {
  AuthoringNotice,
  type AuthoringMutation,
} from "./authoring-primitives";
import { PolicyContentEditor } from "./policy-content-editor";
import { PolicyIdentityPanel } from "./policy-identity-panel";
import { PolicyScopesPanel } from "./policy-scopes-panel";
import { PolicyVersionsPanel } from "./policy-versions-panel";

export type AuthoringSection = "structure" | "scopes" | "versions" | "identity";

const emptyReferences: PolicyAuthoringReferences = {
  units: [],
  classes: [],
  unitTypes: [],
  categories: [],
  users: [],
  governanceLevels: [],
};

const sections = [
  {
    id: "structure" as const,
    label: "الهيكل والمحتوى",
    hint: "الفصول والمواد والبنود",
    guide:
      "أدخل النص الرسمي كما ورد في المصدر ورتبه إلى باب وفصل ومادة وبند. لا تضف هنا مسار انتقال المعاملة.",
    output: "النتيجة: نص قانوني منظم يمكن ربط القواعد بكل مادة منه.",
    icon: FolderTree,
  },
  {
    id: "scopes" as const,
    label: "نطاق التطبيق",
    hint: "المجالس والوحدات المشمولة",
    guide:
      "حدد أين يسري الإصدار. اختر مستوى أو تصنيفاً لتضمين مجموعة مجالس تلقائياً، أو مجلساً محدداً لحالة خاصة.",
    output:
      "النتيجة: قائمة فعلية بالمجالس المشمولة الآن وقاعدة تضم المطابق مستقبلاً.",
    icon: Route,
  },
  {
    id: "versions" as const,
    label: "الإصدارات",
    hint: "المسودات والنسخ السابقة",
    guide:
      "المسودة قابلة للتحرير. بعد إرسالها للمراجعة تصبح نسخة ثابتة؛ وعند تعديل نسخة معتمدة تنشئ مسودة إصدار جديد.",
    output: "النتيجة: تاريخ قانوني محفوظ دون الكتابة فوق النسخ السابقة.",
    icon: FileClock,
  },
  {
    id: "identity" as const,
    label: "بيانات اللائحة",
    hint: "الهوية والملكية والمرجع",
    guide:
      "عرّف اسم اللائحة ورمزها ونوعها ووصفها والجهة المالكة ومصدرها العام. هذه البيانات تخص اللائحة كلها لا مادة منفردة.",
    output: "النتيجة: سجل لائحة معروف الهوية والملكية وقابل للبحث والتدقيق.",
    icon: BookOpenCheck,
  },
];

export function PolicyAuthoringWorkspace({
  policy,
  onPolicyChange,
  initialSection = "structure",
}: {
  policy: Policy;
  onPolicyChange: (policy: Policy) => void;
  initialSection?: AuthoringSection;
}) {
  const [section, setSection] = useState<AuthoringSection>(initialSection);
  const [selectedVersionId, setSelectedVersionId] = useState(
    policy.versions?.[0]?.id ?? "",
  );
  const [references, setReferences] = useState(emptyReferences);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [referenceError, setReferenceError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const selectedVersion =
    policy.versions?.find((version) => version.id === selectedVersionId) ??
    policy.versions?.[0];
  const selectedSection =
    sections.find((item) => item.id === section) ?? sections[0];

  useEffect(() => {
    let active = true;
    void getPolicyAuthoringReferences()
      .then((result) => {
        if (!active) return;
        setReferences(result);
        setReferenceError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setReferenceError(
          error instanceof Error
            ? error.message
            : "تعذر تحميل القوائم المرجعية.",
        );
      })
      .finally(() => {
        if (active) setLoadingReferences(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function reloadReferences() {
    setLoadingReferences(true);
    setReferenceError(undefined);
    try {
      setReferences(await getPolicyAuthoringReferences());
    } catch (error) {
      setReferenceError(
        error instanceof Error ? error.message : "تعذر تحميل القوائم المرجعية.",
      );
    } finally {
      setLoadingReferences(false);
    }
  }

  const mutate: AuthoringMutation = async (action, successMessage) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      const refreshed = await getPolicyDetail(policy.id);
      onPolicyChange(refreshed);
      if (
        !refreshed.versions?.some((version) => version.id === selectedVersionId)
      ) {
        setSelectedVersionId(refreshed.versions?.[0]?.id ?? "");
      }
      setNotice({ kind: "success", message: successMessage });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "تعذر تنفيذ العملية.",
      });
    } finally {
      setBusy(false);
    }
  };

  function reportError(message: string) {
    setNotice({ kind: "error", message });
    document
      .getElementById("policy-authoring-notice")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function selectSection(next: AuthoringSection) {
    setSection(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "management");
    url.searchParams.set("authoring", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <section id="policy-authoring" className="space-y-4 scroll-mt-28">
      <header className="overflow-hidden rounded-q-card border border-q-border bg-q-surface ">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-q-header px-5 py-5 text-q-on-primary sm:px-6">
          <div>

            <h2 className="mt-1 text-q-ui font-bold">
              حرر الإصدار ضمن خطوات واضحة وآمنة
            </h2>
            <p className="mt-1 max-w-2xl text-q-caption leading-5 text-q-on-primary/70">
              اختر إصدار العمل، ثم ابنِ المحتوى وحدد نطاقه قبل الانتقال إلى
              القواعد والمراجعة.
            </p>
          </div>
          <label className="min-w-56">
            <span className="mb-1 block text-q-caption font-bold text-q-on-primary/70">
              إصدار العمل الحالي
            </span>
            <select
              aria-label="إصدار العمل الحالي"
              title="اختيار الإصدار المستخدم في الهيكل والنطاق"
              value={selectedVersion?.id ?? ""}
              onChange={(event) => setSelectedVersionId(event.target.value)}
              className="min-h-11 w-full rounded-q-control border border-q-surface/20 bg-q-surface px-3 text-q-caption font-bold text-q-text outline-none"
            >
              {policy.versions?.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.version_label || `الإصدار ${version.version_no}`} ·{" "}
                  {version.legal_status === "draft"
                    ? "مسودة"
                    : version.legal_status}
                </option>
              ))}
            </select>
          </label>
        </div>
        <nav
          role="tablist"
          aria-label="أقسام تأليف اللائحة"
          className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {sections.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <QButton variant="ghost"
                key={item.id}
                role="tab"
                aria-selected={active}
                type="button"
                title={item.hint}
                onClick={() => selectSection(item.id)}
                className={`min-w-11 flex items-center gap-3 rounded-q-control border px-3 py-3 text-right transition ${active ? "border-q-primary bg-q-surface-2 text-q-primary" : "border-q-border bg-q-surface text-q-text-2 hover:border-q-primary"}`}
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-q-control ${active ? "bg-q-primary text-q-on-primary" : "bg-q-surface-2"}`}
                >
                  <Icon size={16} />
                </span>
                <span>
                  <strong className="block text-q-caption font-bold">
                    {item.label}
                  </strong>
                  <span className="mt-0.5 block text-q-caption opacity-70">
                    {item.hint}
                  </span>
                </span>
              </QButton>
            );
          })}
        </nav>
        <div className="grid gap-2 border-t border-q-border bg-q-surface px-4 py-3 sm:grid-cols-[1fr_auto]">
          <p className="text-q-caption leading-6 text-q-text-2">
            <strong className="text-q-text-2">ماذا تفعل هنا؟ </strong>
            {selectedSection.guide}
          </p>
          <span className="rounded-q-control border border-q-border bg-q-surface px-3 py-2 text-q-caption font-bold text-q-text-2">
            {selectedSection.output}
          </span>
        </div>
      </header>

      <div id="policy-authoring-notice">
        <AuthoringNotice notice={notice} onDismiss={() => setNotice(null)} />
      </div>
      {loadingReferences && (
        <QCard
          role="status"
          className="p-0 flex items-center gap-2 rounded-q-control border border-q-border bg-q-surface px-4 py-3 text-q-caption font-bold text-q-text-2"
        >
          <LoaderCircle size={14} className="animate-spin text-q-primary" />
          جارٍ تحميل المجالس والتصنيفات والخيارات المرجعية...
        </QCard>
      )}
      {referenceError && (
        <QCard
          role="alert"
          className="p-0 flex flex-wrap items-center justify-between gap-3 rounded-q-control border border-q-border bg-q-danger-soft px-4 py-3 text-q-caption font-bold text-q-danger"
        >
          <span>{referenceError}</span>
          <QButton variant="ghost"
            type="button"
            title="إعادة تحميل القوائم المرجعية"
            onClick={() => void reloadReferences()}
            className="min-w-11 inline-flex min-h-11 items-center gap-1 rounded-q-control bg-q-surface px-3 text-q-danger "
          >
            <RefreshCw size={12} /> إعادة المحاولة
          </QButton>
        </QCard>
      )}

      <div role="tabpanel">
        {section === "structure" && (
          <PolicyContentEditor
            version={selectedVersion}
            references={references}
            busy={busy}
            mutate={mutate}
            reportError={reportError}
          />
        )}
        {section === "scopes" && (
          <PolicyScopesPanel
            version={selectedVersion}
            references={references}
            busy={busy}
            mutate={mutate}
            reportError={reportError}
          />
        )}
        {section === "versions" && (
          <PolicyVersionsPanel
            policy={policy}
            selectedVersionId={selectedVersion?.id ?? ""}
            onSelectVersion={setSelectedVersionId}
            busy={busy}
            mutate={mutate}
            reportError={reportError}
          />
        )}
        {section === "identity" && (
          <PolicyIdentityPanel
            policy={policy}
            references={references}
            busy={busy}
            mutate={mutate}
            reportError={reportError}
          />
        )}
      </div>
    </section>
  );
}
