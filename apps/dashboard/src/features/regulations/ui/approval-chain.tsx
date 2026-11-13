"use client";

import { Card as QCard } from "@/shared/ui/card";
import { Badge as QBadge } from "@/shared/ui/badge";

import { Button as QButton } from "@/shared/ui/button";

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

  return <section id="approval-workflow" aria-labelledby="approval-chain-title" className="scroll-mt-28 overflow-hidden rounded-q-card border border-q-border bg-q-surface ">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-q-border bg-q-bg px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-surface-2 text-q-primary"><Sparkles size={18} /></span>
        <div>

          <h2 id="approval-chain-title" className="mt-0.5 text-q-ui font-bold text-q-text">رحلة إعداد اللائحة</h2>
        </div>
      </div>
      <QCard className="p-0 flex items-center gap-3 rounded-q-control border border-q-border bg-q-surface px-3 py-2">
        <div className="text-left"><strong className="block text-q-ui font-bold text-q-text">{percent}%</strong><span className="text-q-caption text-q-text-3">نسبة الإنجاز</span></div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-q-surface-2"><span className="block h-full rounded-full bg-q-success transition-all" style={{ width: `${percent}%` }} /></div>
        <QBadge className="rounded-full bg-q-surface-2 px-2 py-1 text-q-caption font-bold text-q-primary">{completed}/{steps.length}</QBadge>
      </QCard>
    </header>

    <div className="grid min-h-[470px] xl:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="border-b border-q-border bg-q-bg p-4 xl:border-b-0 xl:border-l">
        <div className="mb-4 px-1"><h3 className="text-q-caption font-bold text-q-text">مراحل العمل</h3><p className="mt-1 text-q-caption leading-normal text-q-text-3">اختر مرحلة لعرض تفاصيلها وإجراءاتها.</p></div>
        <ol className="space-y-1.5">
          {steps.map((step, index) => {
            const current = index === activeIndex;
            const selectedStep = index === selectedIndex;
            return <li key={step.label} className="relative">
              {index < steps.length - 1 && <span className={`absolute right-[21px] top-10 h-[calc(100%-20px)] w-px ${step.done ? "bg-q-success-soft" : "bg-q-surface-2"}`} />}
              <QButton variant="ghost" type="button" onClick={() => selectStep(index)} aria-current={current ? "step" : undefined} aria-pressed={selectedStep} className={`min-w-11 relative flex w-full items-center gap-3 rounded-q-control p-2.5 text-right transition ${selectedStep ? "bg-q-surface  ring-1 ring-q-primary" : "hover:bg-q-surface/80"}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-q-caption font-bold ${step.done ? "bg-q-success text-q-on-primary" : current ? "bg-q-primary text-q-on-primary" : step.locked ? "bg-q-surface-2 text-q-text-3" : "bg-q-surface-2 text-q-primary"}`}>{step.done ? <Check size={14} /> : step.locked ? <LockKeyhole size={13} /> : index + 1}</span>
                <span className="min-w-0 flex-1"><strong className={`block text-q-caption font-bold ${selectedStep || current ? "text-q-primary" : step.done ? "text-q-success" : "text-q-text-2"}`}>{step.label}</strong><span className={`mt-0.5 block text-q-caption ${step.done ? "text-q-success" : current ? "text-q-primary" : "text-q-text-3"}`}>{step.done ? "مكتملة" : current ? "المطلوبة الآن" : step.locked ? "بانتظار المرحلة السابقة" : "متاحة"}</span></span>
              </QButton>
            </li>;
          })}
        </ol>
      </aside>

      {selected && <div role="tabpanel" aria-live="polite" className="min-w-0 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-q-surface-2 pb-5">
          <div className="max-w-2xl">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-q-caption font-bold ${selected.done ? "bg-q-success-soft text-q-success" : selected.locked ? "bg-q-neutral-soft text-q-text-2" : "bg-q-surface-2 text-q-link"}`}>{selected.done ? "مرحلة مكتملة" : selected.locked ? "مرحلة مقفلة" : "المرحلة الحالية"}</span>
            <h3 className="mt-3 text-q-h3 font-bold text-q-text">{selected.label}</h3>
            <p className="mt-2 text-q-caption leading-6 text-q-text-3">{selected.description}</p>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-q-card bg-q-surface-2 text-q-primary"><CircleDot size={21} /></span>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <QCard className="p-0 rounded-q-card border border-q-border bg-q-bg p-4">
            <div className="flex items-center gap-2 text-q-caption font-bold text-q-text"><ListChecks size={15} className="text-q-primary" />ما المطلوب الآن؟</div>
            <ol className="mt-4 space-y-3">{(selected.requirements?.length ? selected.requirements : [selected.description]).map((requirement, index) => <li key={requirement} className="flex gap-3 text-q-caption leading-5 text-q-text-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-q-surface text-q-caption font-bold text-q-primary ">{index + 1}</span><span className="pt-0.5">{requirement}</span></li>)}</ol>
          </QCard>
          <div className="rounded-q-card bg-q-success-soft p-4">
            <Target size={17} className="text-q-success" />
            <h4 className="mt-3 text-q-caption font-bold text-q-success">هدف المرحلة</h4>
            <p className="mt-2 text-q-caption leading-5 text-q-success">{selected.objective || selected.description}</p>
          </div>
        </div>

        <QCard className="p-0 mt-4 flex gap-3 rounded-q-card border border-q-border bg-q-success-soft p-4"><BadgeCheck size={17} className="mt-0.5 shrink-0 text-q-success" /><div><strong className="text-q-caption text-q-success">معيار الاكتمال</strong><p className="mt-1 text-q-caption leading-5 text-q-success">{selected.completion || "عند حفظ المتطلبات والتحقق منها بنجاح."}</p></div></QCard>

        {selected.locked ? <QButton variant="ghost" type="button" disabled title="أكمل المرحلة السابقة قبل الانتقال" className="min-w-11 mt-6 flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-q-control bg-q-surface-2 text-q-ui font-bold text-q-text-3"><LockKeyhole size={14} />أكمل المرحلة السابقة أولًا</QButton> : selected.actionHref ? <Link href={selected.actionHref} title={selected.actionLabel || "فتح أدوات المرحلة"} onClick={() => onSelect(selectedIndex)} className="inline-flex min-h-11 min-w-11 items-center mt-6 flex h-11 w-full items-center justify-between rounded-q-control bg-q-primary px-4 text-q-caption font-bold text-q-on-primary transition hover:bg-q-primary"><span>{selected.actionLabel || (selected.done ? "مراجعة المرحلة" : "بدء التنفيذ")}</span><ArrowLeft size={15} /></Link> : <QButton variant="ghost" type="button" title={selected.actionLabel || "فتح أدوات المرحلة"} onClick={() => onSelect(selectedIndex)} className="min-w-11 mt-6 flex h-11 w-full items-center justify-between rounded-q-control bg-q-primary px-4 text-q-ui font-bold text-q-on-primary"><span>{selected.actionLabel || "فتح المرحلة"}</span><ArrowLeft size={15} /></QButton>}
      </div>}
    </div>
  </section>;
}
