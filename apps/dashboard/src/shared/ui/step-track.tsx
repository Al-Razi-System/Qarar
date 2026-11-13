import { cn } from "@/shared/lib/utils";

/** Progress along a fixed route: one segment per step, the current one marked, in orange when it is held up. */
export function StepTrack({ total, done, held = false, label, className }: { total: number; done: number; held?: boolean; label: string; className?: string }) {
  if (total <= 0) return null;
  return (
    <span role="img" aria-label={label} className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={cn("h-1.5 w-5 rounded-full", index < done ? "bg-q-primary" : index === done ? (held ? "bg-q-accent" : "bg-q-link") : "bg-q-surface-2")} />
      ))}
    </span>
  );
}
