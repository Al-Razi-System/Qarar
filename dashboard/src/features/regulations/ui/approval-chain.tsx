"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Check, CircleDot, ListChecks, LockKeyhole, Sparkles, Target } from "lucide-react";

export type ApprovalChainStep = {
  label: string;
  description: string;
  done: boolean;
  locked?: boolean;
  objective?: string;
  requirements?: string[];
  completion?: string;
  actionLabel?: string;
  actionHref?: string;
};

export function ApprovalChain({ steps, onSelect }: { steps: ApprovalChainStep[]; onSelect: (index: number) => void }) {
  const firstPending = steps.findIndex((step) => !step.done);
  const activeIndex = firstPending === -1 ? Math.max(steps.length - 1, 0) : firstPending;
  const [selectedIndex, setSelectedIndex] = useState(activeIndex);
  const selected = steps[selectedIndex] ?? steps[activeIndex];
  const completed = steps.filter((step) => step.done).length;
  const percent = steps.length ? Math.round((completed / steps.length) * 100) : 0;

  function selectStep(index: number) {
    setSelectedIndex(index);
    onSelect(index);
  }

  return <section id="approval-workflow" aria-labelledby="approval-chain-title" className="scroll-mt-28 overflow-hidden rounded-2xl border border-[#dbe6f1] bg-white shadow-[0_12px_34px_rgba(15,42,72,.06)]">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e7eef5] bg-[#fbfdff] px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf4ff] text-[#0872df]"><Sparkles size={18} /></span>
        <div>
          <p className="text-[9px] font-black text-[#f17822]">دليل التنفيذ والاعتماد</p>
          <h2 id="approval-chain-title" className="mt-0.5 text-sm font-black text-[#14233a]">رحلة إعداد اللائحة</h2>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-[#dfe9f2] bg-white px-3 py-2">
        <div className="text-left"><strong className="block text-sm font-black text-[#0a1330]">{percent}%</strong><span className="text-[8px] text-[#8190a3]">نسبة الإنجاز</span></div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#e5edf5]"><span className="block h-full rounded-full bg-[#11a377] transition-all" style={{ width: `${percent}%` }} /></div>
        <span className="rounded-full bg-[#edf6ff] px-2 py-1 text-[8px] font-black text-[#0066cc]">{completed}/{steps.length}</span>
      </div>
    </header>

    <div className="grid min-h-[470px] xl:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="border-b border-[#e7eef5] bg-[#f8fbfe] p-4 xl:border-b-0 xl:border-l">
        <div className="mb-4 px-1"><h3 className="text-[10px] font-black text-[#20344d]">مراحل العمل</h3><p className="mt-1 text-[8px] leading-4 text-[#8190a3]">اختر مرحلة لعرض تفاصيلها وإجراءاتها.</p></div>
        <ol className="space-y-1.5">
          {steps.map((step, index) => {
            const current = index === activeIndex;
            const selectedStep = index === selectedIndex;
            return <li key={step.label} className="relative">
              {index < steps.length - 1 && <span className={`absolute right-[21px] top-10 h-[calc(100%-20px)] w-px ${step.done ? "bg-emerald-300" : "bg-[#dce6ef]"}`} />}
              <button type="button" onClick={() => selectStep(index)} aria-current={current ? "step" : undefined} aria-pressed={selectedStep} className={`relative flex w-full items-center gap-3 rounded-xl p-2.5 text-right transition ${selectedStep ? "bg-white shadow-[0_5px_14px_rgba(15,42,72,.08)] ring-1 ring-[#b8d9f4]" : "hover:bg-white/80"}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[9px] font-black ${step.done ? "bg-emerald-600 text-white" : current ? "bg-[#0872df] text-white" : step.locked ? "bg-[#e9eef3] text-[#8c9aad]" : "bg-[#eaf4ff] text-[#0066cc]"}`}>{step.done ? <Check size={14} /> : step.locked ? <LockKeyhole size={13} /> : index + 1}</span>
                <span className="min-w-0 flex-1"><strong className={`block text-[9px] font-black ${selectedStep || current ? "text-[#0066cc]" : step.done ? "text-emerald-800" : "text-[#40546b]"}`}>{step.label}</strong><span className={`mt-0.5 block text-[7px] ${step.done ? "text-emerald-600" : current ? "text-[#0872df]" : "text-[#8998aa]"}`}>{step.done ? "مكتملة" : current ? "المطلوبة الآن" : step.locked ? "بانتظار المرحلة السابقة" : "متاحة"}</span></span>
              </button>
            </li>;
          })}
        </ol>
      </aside>

      {selected && <div role="tabpanel" aria-live="polite" className="min-w-0 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf1f5] pb-5">
          <div className="max-w-2xl">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[8px] font-black ${selected.done ? "bg-emerald-100 text-emerald-700" : selected.locked ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-700"}`}>{selected.done ? "مرحلة مكتملة" : selected.locked ? "مرحلة مقفلة" : "المرحلة الحالية"}</span>
            <h3 className="mt-3 text-xl font-black text-[#14233a]">{selected.label}</h3>
            <p className="mt-2 text-[10px] leading-6 text-[#718196]">{selected.description}</p>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#edf6ff] text-[#0872df]"><CircleDot size={21} /></span>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="rounded-2xl border border-[#dce7f0] bg-[#fbfdff] p-4">
            <div className="flex items-center gap-2 text-[10px] font-black text-[#29425f]"><ListChecks size={15} className="text-[#0872df]" />ما المطلوب الآن؟</div>
            <ol className="mt-4 space-y-3">{(selected.requirements?.length ? selected.requirements : [selected.description]).map((requirement, index) => <li key={requirement} className="flex gap-3 text-[10px] leading-5 text-[#61758c]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[9px] font-black text-[#0066cc] shadow-sm">{index + 1}</span><span className="pt-0.5">{requirement}</span></li>)}</ol>
          </div>
          <div className="rounded-2xl bg-[#eef8f4] p-4">
            <Target size={17} className="text-emerald-700" />
            <h4 className="mt-3 text-[10px] font-black text-emerald-900">هدف المرحلة</h4>
            <p className="mt-2 text-[9px] leading-5 text-emerald-800">{selected.objective || selected.description}</p>
          </div>
        </div>

        <div className="mt-4 flex gap-3 rounded-2xl border border-[#d8eee4] bg-[#f5fcf8] p-4"><BadgeCheck size={17} className="mt-0.5 shrink-0 text-emerald-700" /><div><strong className="text-[10px] text-emerald-900">معيار الاكتمال</strong><p className="mt-1 text-[9px] leading-5 text-emerald-800">{selected.completion || "عند حفظ المتطلبات والتحقق منها بنجاح."}</p></div></div>

        {selected.locked ? <button type="button" disabled className="mt-6 flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#e2e8ef] text-[10px] font-black text-[#77889b]"><LockKeyhole size={14} />أكمل المرحلة السابقة أولًا</button> : selected.actionHref ? <Link href={selected.actionHref} className="mt-6 flex h-11 w-full items-center justify-between rounded-xl bg-[#0872df] px-4 text-[10px] font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)] transition hover:bg-[#0066cc]"><span>{selected.actionLabel || (selected.done ? "مراجعة المرحلة" : "بدء التنفيذ")}</span><ArrowLeft size={15} /></Link> : <button type="button" onClick={() => onSelect(selectedIndex)} className="mt-6 flex h-11 w-full items-center justify-between rounded-xl bg-[#0872df] px-4 text-[10px] font-black text-white"><span>{selected.actionLabel || "فتح المرحلة"}</span><ArrowLeft size={15} /></button>}
      </div>}
    </div>
  </section>;
}
