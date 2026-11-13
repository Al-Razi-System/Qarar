import { cn } from "@/shared/lib/utils";

export type SessionOutcome = "on_time" | "late" | "missed" | "overdue" | "cancelled" | "upcoming";

export type RhythmSession = {
  key: string;
  outcome: SessionOutcome;
  /** Days late: after the due day for a held session, or so far for one not held yet. */
  lateDays: number;
  /** Shown above the mark in the full rhythm, e.g. the month. */
  heading?: string;
  /** Shown under the mark in the full rhythm, e.g. «تأخرت 6 أيام». */
  caption?: string;
};

const markStyle: Record<SessionOutcome, string> = {
  on_time: "bg-q-primary",
  late: "bg-q-primary",
  missed: "border-[3px] border-q-danger bg-q-surface",
  overdue: "border-[3px] border-q-danger bg-q-surface",
  cancelled: "border-2 border-q-border-strong bg-q-neutral-soft",
  upcoming: "border-2 border-dashed border-q-border-strong bg-q-surface",
};

const captionStyle: Record<SessionOutcome, string> = {
  on_time: "text-q-text-2",
  late: "font-semibold text-q-accent-text",
  missed: "font-semibold text-q-danger",
  overdue: "font-semibold text-q-danger",
  cancelled: "text-q-text-3",
  upcoming: "text-q-text-3",
};

/** The orange tail grows with the delay and stops at a readable maximum. */
const tailWidth = (days: number, unit: number, max: number) => Math.min(8 + days * unit, max);

function Mark({ outcome, lateDays, large }: { outcome: SessionOutcome; lateDays: number; large: boolean }) {
  return (
    <span className="flex items-center">
      <span className={cn("shrink-0 rounded-full", large ? "h-7 w-7" : "h-4 w-4", markStyle[outcome])} />
      {outcome === "late" && lateDays > 0 && (
        <span
          className={cn("-ms-0.5 shrink-0 rounded-full bg-q-accent", large ? "h-2.5" : "h-1.5")}
          style={{ width: tailWidth(lateDays, large ? 4 : 2, large ? 44 : 28) }}
        />
      )}
    </span>
  );
}

/** The key that explains the marks; shown once beside a full rhythm or above a table of compact ones. */
export function RhythmLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-q-caption text-q-text-2", className)}>
      <li className="flex items-center gap-1.5"><Mark outcome="on_time" lateDays={0} large={false} />انعقدت</li>
      <li className="flex items-center gap-1.5"><span className="h-1.5 w-6 rounded-full bg-q-accent" />مدة التأخير</li>
      <li className="flex items-center gap-1.5"><Mark outcome="missed" lateDays={0} large={false} />لم تنعقد</li>
      <li className="flex items-center gap-1.5"><Mark outcome="upcoming" lateDays={0} large={false} />قادمة</li>
    </ul>
  );
}

/**
 * A council's sessions as one mark each: held, held late (with a tail as long as the delay), not held,
 * or still to come. `summary` says the same thing in words; the compact form relies on it.
 */
export function SessionRhythm({ sessions, summary, variant = "compact", className }: {
  sessions: ReadonlyArray<RhythmSession>;
  summary: string;
  variant?: "compact" | "full";
  className?: string;
}) {
  if (variant === "compact") {
    return (
      <div role="img" aria-label={summary} className={cn("flex min-h-4 flex-wrap items-center gap-1.5", className)}>
        {sessions.map((session) => <Mark key={session.key} outcome={session.outcome} lateDays={session.lateDays} large={false} />)}
      </div>
    );
  }
  return (
    <div className={cn("overflow-x-auto", className)}>
      <ol aria-label={summary} className="m-0 flex min-w-max list-none p-0">
        {sessions.map((session) => (
          <li key={session.key} className="relative flex w-24 shrink-0 flex-col items-center gap-2 py-1">
            <span className="text-q-caption text-q-text-3">{session.heading}</span>
            <span className="relative flex h-9 w-full items-center justify-center">
              <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-q-surface-2" />
              <span className="relative"><Mark outcome={session.outcome} lateDays={session.lateDays} large /></span>
            </span>
            <span className={cn("px-1 text-center text-q-caption", captionStyle[session.outcome])}>{session.caption}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
