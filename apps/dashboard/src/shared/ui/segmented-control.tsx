"use client";

import { cn } from "@/shared/lib/utils";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  /** Accessible name of the group, e.g. «التكليف موجّه إلى». */
  label: string;
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

/** A choice between a few mutually exclusive options that are all visible at once. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, disabled = false, className }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-1 rounded-q-card bg-q-surface-2 p-1", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => { if (!selected) onChange(option.value); }}
            className={cn(
              "min-h-11 flex-1 rounded-q-control px-3 font-sans text-q-ui font-bold transition-colors disabled:cursor-not-allowed",
              selected ? "bg-q-primary text-q-on-primary" : "bg-transparent text-q-text hover:bg-q-surface",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
