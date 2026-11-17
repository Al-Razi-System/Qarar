"use client";

import { Button as QButton } from "@/shared/ui/button";

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
            <QButton variant="ghost"
              type="button"
              aria-current={active ? "step" : undefined}
              aria-label={`${index + 1}. ${step.label}${step.done ? "، مكتملة" : "، غير مكتملة"}`}
              onClick={() => onSelect(index)}
              className={`min-w-11 group min-h-16 w-full rounded-q-control border p-2 text-right transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q-primary ${step.done ? "border-q-border bg-q-success-soft text-q-success" : active ? "border-q-primary bg-q-surface-2 text-q-primary" : "border-q-border bg-q-bg text-q-text-2 hover:border-q-primary hover:bg-q-surface"}`}
            >
              <span className={`mb-1 grid h-5 w-5 place-items-center rounded-full text-q-caption font-bold ${step.done ? "bg-q-success text-q-on-primary" : active ? "bg-q-primary text-q-on-primary" : "bg-q-surface-2 text-q-primary"}`}>
                {step.done ? <Check aria-hidden="true" size={10} /> : index + 1}
              </span>
              <strong className="block text-q-caption leading-normal">{step.label}</strong>
              {step.description && <span className="mt-0.5 block text-q-caption leading-normal opacity-80">{step.description}</span>}
            </QButton>
          </li>
        );
      })}
    </ol>
  );
}
