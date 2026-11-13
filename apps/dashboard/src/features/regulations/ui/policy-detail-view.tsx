"use client";

import { Badge as QBadge } from "@/shared/ui/badge";

import { PageHeader } from "@/shared/ui/page-header";
import { Button as QButton } from "@/shared/ui/button";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  FileText,
  Layers3,
  Route,
  Sparkles,
} from "lucide-react";
import type { Policy } from "../model/types";
import { ApprovalChain } from "./approval-chain";
import { PolicyManagementWorkspace } from "./policy-management-workspace";
import { LegislativeModelWorkspace } from "./legislative-model-workspace";
import { CouncilRulePresets } from "./council-rule-presets";
import { PolicyContentExplorer } from "./policy-content-explorer";
import { PolicyWorkspaceGuide } from "./policy-workspace-guide";
import {
  PolicyAuthoringWorkspace,
  type AuthoringSection,
} from "./authoring/policy-authoring-workspace";

const legalLabels: Record<string, string> = {
  draft: "مسودة",
  under_review: "قيد المراجعة",
  approved: "معتمدة",
  effective: "نافذة",
  suspended: "معلقة",
  expired: "منتهية",
};
type DetailTab =
  "content" | "management" | "legislative" | "presets" | "journey";

export function PolicyDetailView({
  policy: initialPolicy,
  initialView = "content",
  initialVersionId,
  initialItemId,
  initialAuthoringSection = "structure",
  initialLifecycleStage,
}: {
  policy: Policy;
  initialView?: DetailTab;
  initialVersionId?: string;
  initialItemId?: string;
  initialAuthoringSection?: AuthoringSection;
  initialLifecycleStage?: string;
}) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [activeTab, setActiveTab] = useState<DetailTab>(initialView);
  const [showLifecycleTools, setShowLifecycleTools] = useState(
    Boolean(initialLifecycleStage),
  );
  const version = policy.versions?.[0];
  const readinessPercent =
    version?.readiness_percent ?? version?.automation_readiness_pct ?? 0;
  const hasItems = Boolean(version?.items.length);
  const hasScopes = Boolean(version?.scopes.length);
  const workflowReady =
    version?.automation_status === "ready" && readinessPercent >= 100;
  const submitted = Boolean(
    version &&
    ["under_review", "approved", "effective", "suspended", "expired"].includes(
      version.legal_status,
    ),
  );
  const approved = Boolean(
    version &&
    ["approved", "effective", "suspended", "expired"].includes(
      version.legal_status,
    ),
  );
  const effective = version?.legal_status === "effective";
  const definitions = [
    {
      label: "بيانات اللائحة",
      description: "تعريف هوية اللائحة وملكيتها",
      done: Boolean(policy.name_ar && policy.code),
      objective:
        "إنشاء سجل واضح يمكن الرجوع إليه وربطه بجميع الإصدارات والمعاملات.",
      requirements: [
        "راجع الاسم والرمز والوصف ونوع اللائحة.",
        "حدّد حالة السجل واحفظ التغييرات.",
      ],
      completion: "وجود اسم عربي ورمز فريد ووصف واضح.",
      actionLabel: "تعديل بيانات اللائحة",
      actionHref: `?view=management&stage=policy#policy-management`,
    },
    {
      label: "إصدار العمل",
      description: "إنشاء نسخة قابلة للتحرير والمراجعة",
      done: Boolean(version),
      objective: "عزل التعديلات في إصدار مستقل قبل الاعتماد أو التفعيل.",
      requirements: [
        "أنشئ إصدارًا جديدًا وحدّد وسم النسخة.",
        "اكتب ملخص التغييرات ثم احفظ المسودة.",
      ],
      completion: "وجود إصدار مسودة مرتبط باللائحة.",
      actionLabel: "إنشاء أو إدارة إصدار",
      actionHref: `?view=management&stage=version#policy-management`,
    },
    {
      label: "محتوى اللائحة",
      description: "إضافة البنود والمواد وشروط المطابقة",
      done: hasItems,
      objective: "تحويل الوثيقة إلى بنود منظمة قابلة للتطبيق الآلي.",
      requirements: [
        "أضف رمز البند وعنوانه ونصه.",
        "حدّد الفئة وشروط المطابقة ومسار الاعتماد.",
      ],
      completion: "وجود بند واحد على الأقل مكتمل البيانات.",
      actionLabel: hasItems ? "إدارة البنود" : "إضافة أول بند",
      actionHref: `?view=management&stage=item#policy-management`,
    },
    {
      label: "نطاق التطبيق",
      description: "تحديد الجهات وفترة السريان",
      done: hasScopes,
      objective: "تحديد من تنطبق عليه اللائحة ومتى يبدأ أثرها.",
      requirements: [
        "اختر نوع النطاق والجهة أو المستوى.",
        "حدّد الأولوية والتواريخ وشمول الجهات التابعة.",
      ],
      completion: "وجود نطاق صالح واحد على الأقل.",
      actionLabel: "إدارة نطاق التطبيق",
      actionHref: `?view=management&stage=scope#policy-management`,
    },
    {
      label: "مسار الاعتماد",
      description: "ربط المراحل بالمسؤوليات والنتائج",
      done: workflowReady,
      objective:
        "ضمان انتقال المعاملة بين الجهات المخولة وفق تسلسل قابل للتدقيق.",
      requirements: [
        "أنشئ قالب المسار وخطواته وانتقالاته.",
        "فعّل المسار ثم اربطه بالبند الإلزامي.",
      ],
      completion: "مسار فعال وجاهزية الأتمتة 100%.",
      actionLabel: "فتح أدوات المسار",
      actionHref: `?view=legislative#policy-management`,
    },
    {
      label: "الإحالة للمراجعة",
      description: "إرسال الإصدار إلى مراجع مستقل",
      done: submitted,
      objective: "إجراء مراجعة مستقلة قبل منح الإصدار الصفة المعتمدة.",
      requirements: [
        "راجع فحص الجاهزية.",
        "أرسل الإصدار للمراجعة ليُقفل التحرير.",
      ],
      completion: "انتقال الحالة إلى قيد المراجعة.",
      actionLabel: "إرسال للمراجعة",
      actionHref: `?view=journey&stage=review#policy-management`,
    },
    {
      label: "الاعتماد",
      description: "توثيق الموافقة النهائية",
      done: approved,
      objective: "اعتماد الإصدار بواسطة مستخدم مستقل عن مقدم الإحالة.",
      requirements: [
        "سجّل الدخول كمراجع مخول.",
        "راجع الإصدار ثم أكد الاعتماد.",
      ],
      completion: "تسجيل هوية المعتمد وتاريخ الاعتماد.",
      actionLabel: "اعتماد الإصدار",
      actionHref: `?view=journey&stage=approve#policy-management`,
    },
    {
      label: "النفاذ",
      description: "إدخال الإصدار حيز التطبيق",
      done: effective,
      objective: "بدء تطبيق الإصدار المعتمد على الموضوعات الواقعة ضمن نطاقه.",
      requirements: [
        "حدّد بداية النفاذ ونهايته إن وجدت.",
        "فعّل الإصدار بعد اكتمال الجاهزية.",
      ],
      completion: "تحول الحالة إلى نافذة وتسجيل تاريخ التفعيل.",
      actionLabel: "تحديد النفاذ",
      actionHref: `?view=journey&stage=activate#policy-management`,
    },
  ];
  const firstIncomplete = definitions.findIndex((step) => !step.done);
  const steps = definitions.map((step, index) => ({
    ...step,
    locked: firstIncomplete >= 0 && index > firstIncomplete,
  }));
  const completedSteps = steps.filter((step) => step.done).length;
  const tabs: Array<{
    id: DetailTab;
    label: string;
    description: string;
    icon: typeof Sparkles;
    badge?: string;
  }> = [
    {
      id: "content",
      label: "المحتوى",
      description: "قراءة الفصول والمواد والبنود",
      icon: FileText,
      badge: `${version?.items.length ?? 0} عنصر`,
    },
    {
      id: "management",
      label: "التحرير والنطاق",
      description: "بناء الهيكل والجهات المشمولة",
      icon: Layers3,
      badge: version
        ? (legalLabels[version.legal_status] ?? version.legal_status)
        : "لا يوجد",
    },
    {
      id: "legislative",
      label: "القواعد والمسارات",
      description: "التنفيذ والإحالات والمسؤوليات",
      icon: BrainCircuit,
      badge: `${readinessPercent}%`,
    },
    {
      id: "presets",
      label: "قواعد الاجتماعات",
      description: "النصاب والتصويت بحسب المواد",
      icon: Sparkles,
      badge: hasItems ? "جاهزة" : "بعد إضافة المواد",
    },
    {
      id: "journey",
      label: "الاعتماد والنفاذ",
      description: "من المسودة إلى النسخة المطبقة",
      icon: Route,
      badge: `${completedSteps}/${steps.length}`,
    },
  ];

  function selectTab(tab: DetailTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("view", tab);
    if (tab !== "management") url.searchParams.delete("stage");
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-2">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin/regulations"
          title="العودة إلى قائمة جميع اللوائح"
          className="inline-flex min-h-11 min-w-11 items-center inline-flex min-h-11 items-center gap-1.5 rounded-q-control border border-q-border bg-q-surface px-2.5 text-q-caption font-bold text-q-text-2 hover:text-q-primary"
        >
          <ArrowRight size={14} />
          العودة إلى دليل اللوائح
        </Link>
        <QButton variant="ghost"
          type="button"
          title="عرض مراحل الجاهزية والمراجعة والاعتماد والنفاذ"
          onClick={() => selectTab("journey")}
          className="min-w-11 inline-flex min-h-11 items-center rounded-q-control bg-q-surface-2 px-2.5 text-q-ui font-bold text-q-primary"
        >
          عرض دليل التنفيذ
        </QButton>
      </div>
      <div className="min-w-0">
        <PageHeader title={policy.name_ar} description={policy.description || "لا يوجد وصف مسجل لهذه اللائحة."} meta={<QBadge tone="success">{policy.status === "active" ? "نشطة" : policy.status}</QBadge>} actions={<div className="flex gap-2 text-center">
            <div className="rounded-q-control bg-q-surface-2 px-3 py-1.5">
              <strong className="block text-q-ui text-q-text">
                {policy.versions?.length ?? 0}
              </strong>
              <span className="text-q-caption text-q-text-3">إصدار</span>
            </div>
            <div className="rounded-q-control bg-q-surface-2 px-3 py-1.5">
              <strong className="block text-q-ui text-q-primary">
                {readinessPercent}%
              </strong>
              <span className="text-q-caption text-q-text-3">جاهزية</span>
            </div>
          </div>} />
        <div className="grid gap-2 border-t border-q-border bg-q-bg px-4 py-3 text-q-caption text-q-text-2 sm:grid-cols-3 sm:px-6">
          <span>
            <strong className="text-q-text">الرمز:</strong> {policy.code}
          </span>
          <span>
            <strong className="text-q-text">الإصدار الحالي:</strong>{" "}
            {version?.version_label || version?.version_no || "—"}
          </span>
          <span>
            <strong className="text-q-text">الحالة النظامية:</strong>{" "}
            {version
              ? (legalLabels[version.legal_status] ?? version.legal_status)
              : "لا يوجد إصدار"}
          </span>
        </div>
      </div>
      <PolicyWorkspaceGuide />
      <section className="overflow-hidden rounded-q-card border border-q-border bg-q-surface ">
        <div className="border-b border-q-border bg-q-bg px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>

              <h2 className="mt-1 text-q-ui font-bold text-q-text">
                اقرأ المحتوى أولاً، ثم انتقل إلى العملية المطلوبة
              </h2>
            </div>
            <p className="text-q-caption text-q-text-2">
              كل قسم مستقل وواضح، مع بقاء العلاقة بين المادة والنطاق والقواعد
              والإصدار.
            </p>
          </div>
        </div>
        <nav
          aria-label="أقسام إدارة اللائحة"
          className="grid gap-2 overflow-x-auto p-3 sm:grid-cols-2 xl:grid-cols-5"
          role="tablist"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <QButton variant="ghost"
                key={tab.id}
                type="button"
                title={tab.description}
                onClick={() => selectTab(tab.id)}
                aria-selected={selected}
                role="tab"
                className={`min-w-11 relative flex min-w-52 items-center gap-3 rounded-q-control border px-3 py-3 text-right transition ${selected ? "border-q-primary bg-q-primary text-q-on-primary " : "border-q-border bg-q-surface text-q-text-2 hover:border-q-primary hover:bg-q-surface"}`}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-q-control ${selected ? "bg-q-surface/15" : "bg-q-surface-2 text-q-primary"}`}
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-q-caption font-bold">
                    {tab.label}
                  </strong>
                  <span
                    className={`mt-1 block text-q-caption ${selected ? "text-q-on-primary/75" : "text-q-text-3"}`}
                  >
                    {tab.description}
                  </span>
                </span>
                {tab.badge && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-q-caption font-bold ${selected ? "bg-q-surface/15 text-q-on-primary" : "bg-q-surface-2 text-q-primary"}`}
                  >
                    {tab.badge}
                  </span>
                )}
              </QButton>
            );
          })}
        </nav>
      </section>
      <div role="tabpanel" className="min-h-[420px] min-w-0">
        {activeTab === "content" && (
          <PolicyContentExplorer
            policy={policy}
            initialVersionId={initialVersionId}
            initialItemId={initialItemId}
            onEditContent={() => selectTab("management")}
            onManageRules={() => selectTab("legislative")}
          />
        )}
        {activeTab === "journey" && (
          <div className="space-y-4">
            <section className="rounded-q-card border border-q-border bg-q-surface p-4 ">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-q-caption font-bold text-q-link">
                    دورة حياة الإصدار
                  </p>
                  <h3 className="mt-1 text-q-ui font-bold text-q-text">
                    ثلاث مراحل مستقلة قبل تطبيق اللائحة
                  </h3>
                </div>
                <span className="rounded-q-control bg-q-surface-2 px-3 py-2 text-q-caption font-bold text-q-text-2">
                  فحص الجاهزية لا يعتمد الإصدار تلقائياً
                </span>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <LifecyclePhase
                  icon={<Layers3 size={17} />}
                  number="1"
                  title="الإعداد"
                  text="استكمال النص والمجالس المشمولة والقواعد والمصدر داخل مسودة قابلة للتحرير."
                  result="النتيجة: نسخة جاهزة للإرسال للمراجعة."
                />
                <LifecyclePhase
                  icon={<BookOpenCheck size={17} />}
                  number="2"
                  title="المراجعة والاعتماد"
                  text="يراجع المستخدم المخوّل النسخة المجمدة ثم يسجل قرار الاعتماد وهوية المعتمد."
                  result="النتيجة: نسخة معتمدة، لكنها ليست نافذة بعد."
                />
                <LifecyclePhase
                  icon={<Route size={17} />}
                  number="3"
                  title="النفاذ والتطبيق"
                  text="يُحدد بدء النفاذ، ثم يستخدم النظام هذه النسخة عند فحص الموضوعات والاجتماعات."
                  result="النتيجة: نسخة مطبقة فعلياً وقابلة للتدقيق."
                />
              </div>
              <p className="mt-3 rounded-q-control border border-q-border bg-q-warning-soft px-4 py-3 text-q-caption leading-6 text-q-warning">
                <strong>الفرق المهم:</strong> الاعتماد يثبت الموافقة النظامية
                على المحتوى، أما النفاذ فيحدد متى يبدأ النظام بتطبيقه. يمكن
                اعتماد إصدار اليوم وتحديد نفاذه في تاريخ لاحق.
              </p>
            </section>
            <ApprovalChain
              steps={steps}
              onSelect={(index) => {
                if (index <= 3) selectTab("management");
                else if (index === 4) selectTab("legislative");
                else setShowLifecycleTools(true);
              }}
            />
            {showLifecycleTools && (
              <PolicyManagementWorkspace
                policy={policy}
                onPolicyChange={setPolicy}
              />
            )}
          </div>
        )}
        {activeTab === "management" && (
          <PolicyAuthoringWorkspace
            policy={policy}
            onPolicyChange={setPolicy}
            initialSection={initialAuthoringSection}
          />
        )}
        {activeTab === "presets" && <CouncilRulePresets policy={policy} />}
        {activeTab === "legislative" && (
          <LegislativeModelWorkspace policy={policy} />
        )}
      </div>
    </div>
  );
}

function LifecyclePhase({
  icon,
  number,
  title,
  text,
  result,
}: {
  icon: React.ReactNode;
  number: string;
  title: string;
  text: string;
  result: string;
}) {
  return (
    <article className="rounded-q-card border border-q-border bg-q-bg p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-q-control bg-q-surface-2 text-q-primary">
          {icon}
        </span>
        <span className="text-q-caption font-bold text-q-text-3">
          المرحلة {number}
        </span>
      </div>
      <h4 className="mt-3 text-q-caption font-bold text-q-text">{title}</h4>
      <p className="mt-1 text-q-caption leading-5 text-q-text-3">{text}</p>
      <p className="mt-3 border-t border-q-border pt-2 text-q-caption font-bold text-q-text-2">
        {result}
      </p>
    </article>
  );
}
