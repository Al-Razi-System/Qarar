"use client";

import { Button as QButton } from "@/shared/ui/button";

import { BookOpenCheck, Building2, FlaskConical, ShieldCheck, Tags, Workflow } from "lucide-react";

export type RegulationsTab = "policies" | "workflows" | "matcher" | "exceptions" | "classes" | "categories";

const groups = [
  { label: "إدارة اللوائح", items: [
    { key: "policies" as const, label: "مكتبة اللوائح", hint: "الإصدارات والنفاذ", icon: BookOpenCheck },
    { key: "categories" as const, label: "مجالات الموضوعات", hint: "تصنيف المعاملات", icon: Tags },
    { key: "classes" as const, label: "هيكلة المجالس", hint: "المستويات والجهات", icon: Building2 },
  ]},
  { label: "الحوكمة والتشغيل", items: [
    { key: "workflows" as const, label: "مسارات الاعتماد", hint: "المراحل والانتقالات", icon: Workflow },
    { key: "matcher" as const, label: "محاكي الانطباق", hint: "التحقق قبل التشغيل", icon: FlaskConical },
    { key: "exceptions" as const, label: "الاستثناءات", hint: "الطلبات المؤقتة", icon: ShieldCheck },
  ]},
];

export function RegulationsNavigation({ active, onChange }: { active: RegulationsTab; onChange: (tab: RegulationsTab) => void }) {
  return <aside className="overflow-hidden rounded-q-card border border-q-border bg-q-surface 2xl:sticky 2xl:top-[98px]">
    <div className="border-b border-q-border bg-q-bg p-4"><h2 className="mt-1 text-q-caption font-bold text-q-text">اللوائح ومسارات القرار</h2><p className="mt-1 text-q-caption leading-normal text-q-text-3">اختر قسمًا لإدارة محتواه.</p></div>
    <nav aria-label="التبويبات الداخلية لمساحة اللوائح" className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-3 2xl:block" role="tablist" aria-orientation="vertical">
      {groups.map((group, groupIndex) => <div key={group.label} className={`contents 2xl:block ${groupIndex ? "2xl:mt-4 2xl:border-t 2xl:border-q-surface-2 2xl:pt-3" : ""}`}><p className="hidden 2xl:mb-1.5 2xl:block 2xl:px-2 2xl:text-q-caption 2xl:font-bold 2xl:text-q-text-3">{group.label}</p><div className="contents 2xl:block 2xl:space-y-1">{group.items.map((tab) => { const Icon = tab.icon; const selected = active === tab.key; return <QButton variant="ghost" key={tab.key} type="button" role="tab" aria-selected={selected} onClick={() => onChange(tab.key)} className={`min-w-11 relative flex min-h-14 w-full items-center gap-2.5 rounded-q-control px-2.5 py-2.5 text-right transition ${selected ? "bg-q-primary text-q-on-primary " : "text-q-text-2 hover:bg-q-surface-2"}`}>{selected && <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-full bg-q-surface-2" />}<span className={`grid h-8 w-8 shrink-0 place-items-center rounded-q-control ${selected ? "bg-q-surface/15" : "bg-q-surface-2 text-q-primary"}`}><Icon size={15} /></span><span className="min-w-0"><strong className="block text-q-caption font-bold">{tab.label}</strong><span className={`mt-0.5 block truncate text-q-caption ${selected ? "text-q-on-primary/70" : "text-q-text-3"}`}>{tab.hint}</span></span></QButton>; })}</div></div>)}
    </nav>
  </aside>;
}
