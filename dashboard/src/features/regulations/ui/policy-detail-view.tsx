"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Layers3,
  Route,
  Sparkles,
} from "lucide-react";
import type { Policy } from "../model/types";
import { ApprovalChain } from "./approval-chain";
import { PolicyManagementWorkspace } from "./policy-management-workspace";
import { LegislativeModelWorkspace } from "./legislative-model-workspace";
import { CouncilRulePresets } from "./council-rule-presets";

const legalLabels: Record<string, string> = {
  draft: "مسودة",
  under_review: "قيد المراجعة",
  approved: "معتمدة",
  effective: "نافذة",
  suspended: "معلقة",
  expired: "منتهية",
};
type DetailTab = "journey" | "management" | "presets" | "legislative";

export function PolicyDetailView({
  policy: initialPolicy,
}: {
  policy: Policy;
}) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [activeTab, setActiveTab] = useState<DetailTab>("journey");
  const version = policy.versions?.[0];
  const readinessPercent =
    version?.readiness_percent ?? version?.automation_readiness_pct ?? 0;
  const hasItems = Boolean(version?.items.length);
  const hasScopes = Boolean(version?.scopes.length);
  const workflowReady =
    version?.automation_status === "ready" &&
    readinessPercent >= 100;
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
      actionHref: `?stage=policy#policy-management`,
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
      actionHref: `?stage=version#policy-management`,
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
      actionHref: `?stage=item#policy-management`,
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
      actionHref: `?stage=scope#policy-management`,
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
      actionHref: `?stage=workflow#policy-management`,
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
      actionHref: `?stage=review#policy-management`,
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
      actionHref: `?stage=approve#policy-management`,
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
      actionHref: `?stage=activate#policy-management`,
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
      id: "journey",
      label: "رحلة إعداد اللائحة",
      description: "المراحل ونسبة الاكتمال",
      icon: Route,
      badge: `${completedSteps}/${steps.length}`,
    },
    {
      id: "management",
      label: "إدارة الإصدار",
      description: "البنود والنطاق والمرفقات",
      icon: Layers3,
      badge: version
        ? (legalLabels[version.legal_status] ?? version.legal_status)
        : "لا يوجد",
    },
    {
      id: "presets",
      label: "قوالب المجلس",
      description: "النصاب والتصويت والاجتماعات",
      icon: Sparkles,
      badge: hasItems ? "جاهزة" : "بعد إضافة المواد",
    },
    {
      id: "legislative",
      label: "العقل التشريعي والحوكمة",
      description: "النص والقواعد والإحالات",
      icon: BrainCircuit,
      badge: `${readinessPercent}%`,
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-2">
      <div className="flex h-9 items-center justify-between">
        <Link
          href="/admin/regulations"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dce6ef] bg-white px-2.5 text-[9px] font-bold text-[#52647a] hover:text-[#0066cc]"
        >
          <ArrowRight size={14} />
          العودة إلى دليل اللوائح
        </Link>
        <button
          type="button"
          onClick={() => setActiveTab("journey")}
          className="inline-flex h-8 items-center rounded-lg bg-[#edf6ff] px-2.5 text-[9px] font-black text-[#0066cc]"
        >
          عرض دليل التنفيذ
        </button>
      </div>
      <header className="overflow-hidden rounded-xl border border-[#d7e3ef] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf4ff] text-[#0066cc]">
                <BookOpenCheck size={16} />
              </span>
              <div>
                <p className="text-[9px] font-black text-[#f17822]">
                  سجل لائحة نظامية
                </p>
                <h1 className="mt-0.5 text-lg font-black text-[#0a1330]">
                  {policy.name_ar}
                </h1>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-700">
                {policy.status === "active" ? "نشطة" : policy.status}
              </span>
            </div>
            <p className="hidden max-w-4xl text-xs leading-6 text-[#63758a]">
              {policy.description || "لا يوجد وصف مسجل لهذه اللائحة."}
            </p>
          </div>
          <div className="flex gap-2 text-center">
            <div className="rounded-lg bg-[#f3f7fb] px-3 py-1.5">
              <strong className="block text-sm text-[#0a1330]">
                {policy.versions?.length ?? 0}
              </strong>
              <span className="text-[9px] text-[#7b8da1]">إصدار</span>
            </div>
            <div className="rounded-lg bg-[#edf6ff] px-3 py-1.5">
              <strong className="block text-sm text-[#0066cc]">
                {readinessPercent}%
              </strong>
              <span className="text-[9px] text-[#6f8296]">جاهزية</span>
            </div>
          </div>
        </div>
        <div className="hidden grid gap-2 border-t border-[#e9eef4] bg-[#fbfdff] px-6 py-4 text-[10px] text-[#617389] sm:grid-cols-3">
          <span>
            <strong className="text-[#263950]">الرمز:</strong> {policy.code}
          </span>
          <span>
            <strong className="text-[#263950]">الإصدار الحالي:</strong>{" "}
            {version?.version_label || version?.version_no || "—"}
          </span>
          <span>
            <strong className="text-[#263950]">الحالة النظامية:</strong>{" "}
            {version
              ? (legalLabels[version.legal_status] ?? version.legal_status)
              : "لا يوجد إصدار"}
          </span>
        </div>
      </header>
      <section className="overflow-hidden rounded-2xl border border-[#dbe6f1] bg-white shadow-[0_8px_24px_rgba(15,42,72,.05)]">
        <div className="border-b border-[#e8eef4] bg-[#fbfdff] px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black text-[#f17822]">مساحات عمل اللائحة</p><h2 className="mt-1 text-sm font-black text-[#172a42]">اختر المهمة التي تريد إكمالها الآن</h2></div><p className="text-[11px] text-[#617389]">ابدأ من رحلة الإعداد، ثم انتقل إلى الإصدار أو القواعد عند الحاجة.</p></div>
        </div>
        <nav aria-label="أقسام إدارة اللائحة" className="grid gap-2 overflow-x-auto p-3 sm:grid-cols-2 xl:grid-cols-4" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-selected={selected} role="tab" className={`relative flex min-w-52 items-center gap-3 rounded-xl border px-3 py-3 text-right transition ${selected ? "border-[#0872df] bg-[#0872df] text-white shadow-[0_7px_16px_rgba(0,102,204,.18)]" : "border-[#e1eaf2] bg-white text-[#465a72] hover:border-[#9bc9f2] hover:bg-[#f7fbff]"}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${selected ? "bg-white/15" : "bg-[#eaf4ff] text-[#0066cc]"}`}><Icon size={17} /></span>
              <span className="min-w-0 flex-1"><strong className="block text-[11px] font-black">{tab.label}</strong><span className={`mt-1 block text-[10px] ${selected ? "text-white/75" : "text-[#7d8da1]"}`}>{tab.description}</span></span>
              {tab.badge && <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${selected ? "bg-white/15 text-white" : "bg-[#edf6ff] text-[#0066cc]"}`}>{tab.badge}</span>}
            </button>;
          })}
        </nav>
      </section>
      <div role="tabpanel" className="min-h-[420px] min-w-0">
          {activeTab === "journey" && (
            <ApprovalChain steps={steps} onSelect={() => undefined} />
          )}
          {activeTab === "management" && (
            <PolicyManagementWorkspace
              policy={policy}
              onPolicyChange={setPolicy}
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
