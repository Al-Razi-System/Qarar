"use client";

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
  return <aside className="sticky top-[98px] overflow-hidden rounded-2xl border border-[#dbe6f1] bg-white shadow-[0_8px_24px_rgba(15,42,72,.05)]">
    <div className="border-b border-[#e8eef4] bg-[#fbfdff] p-4"><p className="text-[9px] font-black text-[#f17822]">التنقل الداخلي</p><h2 className="mt-1 text-xs font-black text-[#172a42]">اللوائح ومسارات القرار</h2><p className="mt-1 text-[8px] leading-4 text-[#8292a5]">اختر قسمًا لإدارة محتواه.</p></div>
    <nav aria-label="التبويبات الداخلية لمساحة اللوائح" className="p-2" role="tablist" aria-orientation="vertical">
      {groups.map((group, groupIndex) => <div key={group.label} className={groupIndex ? "mt-4 border-t border-[#edf1f5] pt-3" : ""}><p className="mb-1.5 px-2 text-[8px] font-bold text-[#8998aa]">{group.label}</p><div className="space-y-1">{group.items.map((tab) => { const Icon = tab.icon; const selected = active === tab.key; return <button key={tab.key} type="button" role="tab" aria-selected={selected} onClick={() => onChange(tab.key)} className={`relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-right transition ${selected ? "bg-[#0872df] text-white shadow-[0_7px_16px_rgba(0,102,204,.18)]" : "text-[#465a72] hover:bg-[#f2f7fc]"}`}>{selected && <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-full bg-[#ff8a1f]" />}<span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-white/15" : "bg-[#eaf4ff] text-[#0066cc]"}`}><Icon size={15} /></span><span className="min-w-0"><strong className="block text-[9px] font-black">{tab.label}</strong><span className={`mt-0.5 block truncate text-[7px] ${selected ? "text-white/70" : "text-[#8b9aab]"}`}>{tab.hint}</span></span></button>; })}</div></div>)}
    </nav>
  </aside>;
}
