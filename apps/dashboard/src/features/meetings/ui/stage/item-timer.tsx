"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { formatDuration, readTimer } from "../../model/item-timer";
import type { ItemTimer as ItemTimerRecord } from "../../model/live-meeting";

/** The durations the chair can plan, in minutes. */
export const PLANNED_MINUTES_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90];

export type PlannedMinutesControl = {
  pending: boolean;
  error?: string | null;
  onChange: (minutes: number | null) => void;
};

type Props = {
  timer?: ItemTimerRecord;
  /** The server's time minus this device's. */
  clockOffsetMs: number;
  /** Given to the council's chair: plans the item's duration. */
  plan?: PlannedMinutesControl;
};

function useSecondTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * How long the council has discussed the item, against the chair's planned
 * duration. The start and end come from the database, so every screen agrees.
 */
export function ItemTimer({ timer, clockOffsetMs, plan }: Props) {
  const running = Boolean(timer?.discussion_started_at && !timer.discussion_ended_at);
  const now = useSecondTick(running);
  const reading = readTimer(timer, now, clockOffsetMs);
  if (!reading && !plan) return null;

  const over = reading?.overSeconds != null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-q-caption">
      {reading ? (
        <span
          role="timer"
          aria-label={over ? `تجاوزت المناقشة الوقت المحدد بـ ${formatDuration(reading.overSeconds!)}` : `مدة المناقشة ${formatDuration(reading.elapsedSeconds)}`}
          className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 font-bold", over ? "bg-q-warning-soft text-q-warning" : "bg-q-surface-2 text-q-text")}
        >
          {reading.running && <span aria-hidden="true" className={cn("q-live-dot inline-block h-2 w-2 rounded-full", over ? "bg-q-warning" : "bg-q-live")} />}
          <span>{reading.running ? "مدة المناقشة" : "استغرقت المناقشة"}</span>
          <span dir="ltr">{formatDuration(reading.elapsedSeconds)}</span>
          {reading.plannedSeconds !== null && <span className="font-normal">من {reading.plannedSeconds / 60} دقيقة</span>}
          {over && <span>· تجاوز <span dir="ltr">{formatDuration(reading.overSeconds!)}</span></span>}
        </span>
      ) : (
        <span className="text-q-text-2">يبدأ العدّاد مع بدء المناقشة.</span>
      )}
      {plan && <PlannedMinutesSelect plan={plan} plannedMinutes={timer?.planned_minutes ?? null} />}
    </div>
  );
}

/** The chair's choice of the item's planned duration, with its saving and failure states. */
export function PlannedMinutesSelect({ plan, plannedMinutes }: { plan: PlannedMinutesControl; plannedMinutes: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-q-caption">
      <label className="inline-flex items-center gap-2 font-bold text-q-text-2">
        المدة المقررة
        <select
          value={plannedMinutes ?? ""}
          disabled={plan.pending}
          onChange={(event) => plan.onChange(event.target.value ? Number(event.target.value) : null)}
          className="h-11 rounded-q-control border border-q-border bg-q-surface px-2 text-q-caption text-q-text"
        >
          <option value="">بلا تحديد</option>
          {PLANNED_MINUTES_CHOICES.map((minutes) => <option key={minutes} value={minutes}>{minutes} دقيقة</option>)}
          {plannedMinutes && !PLANNED_MINUTES_CHOICES.includes(plannedMinutes) && <option value={plannedMinutes}>{plannedMinutes} دقيقة</option>}
        </select>
      </label>
      {plan.pending && <span role="status" className="font-bold text-q-text-2">جارٍ حفظ المدة…</span>}
      {plan.error && <span role="alert" className="font-bold text-q-danger">{plan.error}</span>}
    </div>
  );
}
