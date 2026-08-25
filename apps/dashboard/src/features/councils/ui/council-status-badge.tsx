import type { CouncilStatus } from "../model/types";

const status = {
  active: { label: "نشط", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  inactive: { label: "غير نشط", className: "border-amber-200 bg-amber-50 text-amber-700" },
  archived: { label: "مؤرشف", className: "border-slate-200 bg-slate-100 text-slate-600" },
} satisfies Record<CouncilStatus, { label: string; className: string }>;

export function CouncilStatusBadge({ value }: { value: CouncilStatus }) {
  const item = status[value] ?? status.inactive;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${item.className}`}>{item.label}</span>;
}
