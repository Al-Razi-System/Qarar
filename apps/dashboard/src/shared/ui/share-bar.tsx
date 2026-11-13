import { cn } from "@/shared/lib/utils";

export type Share = { key: string; label: string; count: number; tone: "primary" | "link" | "accent" | "danger" | "warning" | "muted" };

const fill: Record<Share["tone"], string> = {
  primary: "bg-q-primary", link: "bg-q-link", accent: "bg-q-accent", danger: "bg-q-danger", warning: "bg-q-warning", muted: "bg-q-border-strong",
};

/** How a total splits into parts: one bar, and every part named with its count so colour is never the only cue. */
export function ShareBar({ shares, label, className }: { shares: ReadonlyArray<Share>; label: string; className?: string }) {
  const parts = shares.filter((share) => share.count > 0);
  const total = parts.reduce((sum, share) => sum + share.count, 0);
  if (total === 0) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {parts.map((share) => <span key={share.key} className={cn("h-full", fill[share.tone])} style={{ width: `${(share.count / total) * 100}%` }} />)}
      </div>
      <ul aria-label={label} className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-q-ui text-q-text-2">
        {parts.map((share) => (
          <li key={share.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", fill[share.tone])} />
            <span>{share.label}</span><span className="font-semibold text-q-text">{share.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
