import { cn } from "@/shared/lib/utils";

export type JourneyStepState = "done" | "current" | "upcoming" | "blocked";

export type JourneyStep = {
  label: string;
  state: JourneyStepState;
  /** Who or when, under the label in the full rail. */
  detail?: string | null;
};

type Props = {
  steps: JourneyStep[];
  /** Read by screen readers before the steps, e.g. «مسار المهمة». */
  label: string;
  /** A single thin line for lists; the full rail names every station. */
  compact?: boolean;
  className?: string;
};

const stateWords: Record<JourneyStepState, string> = {
  done: "تمت",
  current: "الآن",
  upcoming: "لم تبدأ",
  blocked: "متعثرة",
};

const dotClass: Record<JourneyStepState, string> = {
  done: "border-q-primary bg-q-primary text-q-on-primary",
  current: "border-q-live bg-q-live-soft text-q-live ring-4 ring-q-live-soft",
  upcoming: "border-q-border-strong bg-q-surface text-q-text-3",
  blocked: "border-q-danger bg-q-danger-soft text-q-danger ring-4 ring-q-danger-soft",
};

/**
 * The stations a piece of work passes through, in order. The station it is at
 * carries the live colour; the ones behind it are filled, the ones ahead are
 * outlined. Every state is also written, so colour is never the only signal.
 */
export function JourneyRail({ steps, label, compact = false, className }: Props) {
  if (compact) {
    return (
      <ol aria-label={label} className={cn("m-0 flex list-none items-center gap-1 p-0", className)}>
        {steps.map((step) => (
          <li key={step.label} className="flex min-w-0 flex-1">
            <span className="sr-only">{`${step.label}: ${stateWords[step.state]}`}</span>
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 flex-1 rounded-full",
                step.state === "done" && "bg-q-primary",
                step.state === "current" && "bg-q-live",
                step.state === "blocked" && "bg-q-danger",
                step.state === "upcoming" && "bg-q-neutral-soft",
              )}
            />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol aria-label={label} className={cn("m-0 grid list-none gap-0 p-0", className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, index) => {
        const reached = step.state === "done";
        return (
          <li key={step.label} aria-current={step.state === "current" || step.state === "blocked" ? "step" : undefined} className="relative flex min-w-0 flex-col items-center gap-2 text-center">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-4 h-0.5 -translate-y-1/2",
                  "end-1/2 start-[-50%]",
                  reached || step.state === "current" || step.state === "blocked" ? "bg-q-primary" : "bg-q-border",
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn("relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-q-caption font-bold", dotClass[step.state])}
            >
              {reached ? "✓" : index + 1}
            </span>
            <span className={cn("max-w-full px-1 text-q-caption", step.state === "upcoming" ? "text-q-text-3" : "font-bold text-q-text")}>
              {step.label}
              <span className="sr-only">{`: ${stateWords[step.state]}`}</span>
            </span>
            {step.detail && <span className="max-w-full truncate px-1 text-q-caption text-q-text-2">{step.detail}</span>}
          </li>
        );
      })}
    </ol>
  );
}
