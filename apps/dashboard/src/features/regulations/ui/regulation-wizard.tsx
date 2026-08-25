"use client";

import { Check } from "lucide-react";

export type RegulationWizardStep = {
  label: string;
  done: boolean;
  description?: string;
};

type Props = {
  steps: RegulationWizardStep[];
  onSelect: (index: number) => void;
};

export function RegulationWizard({ steps, onSelect }: Props) {
  const current = steps.findIndex((step) => !step.done);
  const activeIndex = current === -1 ? steps.length - 1 : current;

  return (
    <ol aria-label="مراحل إعداد اللائحة" className="grid gap-1.5 sm:grid-cols-3 xl:grid-cols-9">
      {steps.map((step, index) => {
        const active = index === activeIndex;
        return (
          <li key={step.label}>
            <button
              type="button"
              aria-current={active ? "step" : undefined}
              aria-label={`${index + 1}. ${step.label}${step.done ? "، مكتملة" : "، غير مكتملة"}`}
              onClick={() => onSelect(index)}
              className={`group min-h-16 w-full rounded-lg border p-2 text-right transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc] ${step.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : active ? "border-[#0066cc] bg-[#edf6ff] text-[#0066cc]" : "border-[#dce7f2] bg-[#fbfdff] text-[#52647a] hover:border-[#0066cc] hover:bg-white"}`}
            >
              <span className={`mb-1 grid h-5 w-5 place-items-center rounded-full text-[8px] font-black ${step.done ? "bg-emerald-600 text-white" : active ? "bg-[#0066cc] text-white" : "bg-[#eaf4ff] text-[#0066cc]"}`}>
                {step.done ? <Check aria-hidden="true" size={10} /> : index + 1}
              </span>
              <strong className="block text-[8px] leading-4">{step.label}</strong>
              {step.description && <span className="mt-0.5 block text-[7px] leading-3 opacity-80">{step.description}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
