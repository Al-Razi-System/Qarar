"use client";

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
      <header className="overflow-hidden rounded-3xl border border-[#d9e6f1] bg-white shadow-[0_14px_42px_rgba(20,54,92,.07)]">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[linear-gradient(120deg,#0a2c55,#0872df)] px-5 py-5 text-white sm:px-6">
          <div>
            <p className="text-[9px] font-black text-[#ffbd86]">
              مساحة التأليف النظامي
            </p>
            <h2 className="mt-1 text-base font-black">
              حرر الإصدار ضمن خطوات واضحة وآمنة
            </h2>
            <p className="mt-1 max-w-2xl text-[9px] leading-5 text-white/70">
              اختر إصدار العمل، ثم ابنِ المحتوى وحدد نطاقه قبل الانتقال إلى
              القواعد والمراجعة.
            </p>
          </div>
          <label className="min-w-56">
            <span className="mb-1 block text-[8px] font-bold text-white/70">
              إصدار العمل الحالي
            </span>
            <select
              aria-label="إصدار العمل الحالي"
              title="اختيار الإصدار المستخدم في الهيكل والنطاق"
              value={selectedVersion?.id ?? ""}
              onChange={(event) => setSelectedVersionId(event.target.value)}
              className="h-10 w-full rounded-xl border border-white/20 bg-white px-3 text-[10px] font-black text-[#1b3551] outline-none"
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
              <button
                key={item.id}
                role="tab"
                aria-selected={active}
                type="button"
                title={item.hint}
                onClick={() => selectSection(item.id)}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-right transition ${active ? "border-[#85c0f2] bg-[#edf7ff] text-[#0872df]" : "border-[#e2eaf2] bg-white text-[#526980] hover:border-[#b8d7ef]"}`}
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-xl ${active ? "bg-[#0872df] text-white" : "bg-[#f1f5f9]"}`}
                >
                  <Icon size={16} />
                </span>
                <span>
                  <strong className="block text-[10px] font-black">
                    {item.label}
                  </strong>
                  <span className="mt-0.5 block text-[8px] opacity-70">
                    {item.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="grid gap-2 border-t border-[#dce8f2] bg-[#f4f9fe] px-4 py-3 sm:grid-cols-[1fr_auto]">
          <p className="text-[9px] leading-6 text-[#587087]">
            <strong className="text-[#174b75]">ماذا تفعل هنا؟ </strong>
            {selectedSection.guide}
          </p>
          <span className="rounded-xl border border-[#cfe2f2] bg-white px-3 py-2 text-[8px] font-black text-[#356487]">
            {selectedSection.output}
          </span>
        </div>
      </header>

      <div id="policy-authoring-notice">
        <AuthoringNotice notice={notice} onDismiss={() => setNotice(null)} />
      </div>
      {loadingReferences && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[#dce7f1] bg-white px-4 py-3 text-[9px] font-bold text-[#60758b]"
        >
          <LoaderCircle size={14} className="animate-spin text-[#0872df]" />
          جارٍ تحميل المجالس والتصنيفات والخيارات المرجعية...
        </div>
      )}
      {referenceError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[9px] font-bold text-red-800"
        >
          <span>{referenceError}</span>
          <button
            type="button"
            title="إعادة تحميل القوائم المرجعية"
            onClick={() => void reloadReferences()}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-white px-3 text-red-700 shadow-sm"
          >
            <RefreshCw size={12} /> إعادة المحاولة
          </button>
        </div>
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
