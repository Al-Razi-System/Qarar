import type { ItemTimer } from "./live-meeting";

export type TimerReading = {
  /** Seconds of discussion so far, or in total once it ended. */
  elapsedSeconds: number;
  running: boolean;
  plannedSeconds: number | null;
  /** Seconds beyond the planned duration; null without a plan or while within it. */
  overSeconds: number | null;
};

/**
 * What an item's timer reads now. `clockOffsetMs` is the server's time minus
 * this device's, so every screen counts from the same instant whatever its clock.
 */
export function readTimer(timer: ItemTimer | undefined, nowMs: number, clockOffsetMs = 0): TimerReading | null {
  if (!timer?.discussion_started_at) return null;
  const start = Date.parse(timer.discussion_started_at);
  if (Number.isNaN(start)) return null;
  const end = timer.discussion_ended_at ? Date.parse(timer.discussion_ended_at) : null;
  const running = end === null || Number.isNaN(end);
  const until = running ? nowMs + clockOffsetMs : (end as number);
  const elapsedSeconds = Math.max(0, Math.floor((until - start) / 1000));
  const plannedSeconds = timer.planned_minutes ? timer.planned_minutes * 60 : null;
  const overSeconds = plannedSeconds !== null && elapsedSeconds > plannedSeconds ? elapsedSeconds - plannedSeconds : null;
  return { elapsedSeconds, running, plannedSeconds, overSeconds };
}

/** 7:05 → "07:05"; an hour or more → "1:02:03". */
export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const clock = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}
