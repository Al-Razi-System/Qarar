import { cn } from "@/shared/lib/utils";

export type Metric = {
  label: string;
  /** The figure as the reader says it: «1 من 3»، «83%»، «4 أيام». */
  value: string;
  /** What the figure is measured against, in words. */
  note: string;
  /** Filled share of the bar, 0–1. Omit when there is nothing to measure yet. */
  ratio?: number | null;
  /** Where the target sits on the bar, 0–1. */
  target?: number | null;
  tone?: "primary" | "accent" | "danger";
};

const fill = { primary: "bg-q-primary", accent: "bg-q-accent", danger: "bg-q-danger" } as const;
const percent = (value: number) => `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;

/** A row of indicators in one panel, each with a bar against its target. Never a grid of look-alike cards. */
export function MetricStrip({ metrics, label, className }: { metrics: ReadonlyArray<Metric>; label: string; className?: string }) {
  return (
    <section aria-label={label} className={cn("grid gap-px overflow-hidden rounded-q-card border border-q-border bg-q-border sm:grid-cols-2 xl:grid-cols-4", className)}>
      {metrics.map((metric) => (
        <div key={metric.label} className="flex flex-col gap-1.5 bg-q-surface px-6 py-4">
          <span className="text-q-ui text-q-text-2">{metric.label}</span>
          <span className="text-q-h2 font-semibold text-q-text">{metric.value}</span>
          <span aria-hidden="true" className="relative my-1 block h-2 rounded-full bg-q-surface-2">
            {metric.ratio != null && <span className={cn("absolute inset-y-0 start-0 rounded-full", fill[metric.tone ?? "primary"])} style={{ width: percent(metric.ratio) }} />}
            {metric.target != null && <span className="absolute -top-1.5 h-5 w-1 -translate-x-1/2 rounded-full bg-q-text ring-2 ring-q-surface rtl:translate-x-1/2" style={{ insetInlineStart: percent(metric.target) }} />}
          </span>
          <span className="text-q-caption text-q-text-3">{metric.note}</span>
        </div>
      ))}
    </section>
  );
}
