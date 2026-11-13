import { Building2, ChevronLeft } from "lucide-react";
import type { CouncilTreeNode } from "../model/types";
import { CouncilStatusBadge } from "./council-status-badge";

export function CouncilTree({ items, selectedId, onSelect }: { items: CouncilTreeNode[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (!items.length) return <div className="rounded-q-card border border-dashed border-q-border bg-q-bg p-8 text-center text-q-caption text-q-text-2">لا توجد مجالس مطابقة.</div>;
  return <div className="space-y-2">
    {items.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} style={{ paddingRight: `${12 + Math.max(item.level_no - 1, 0) * 18}px` }} className={`group flex w-full items-center gap-3 rounded-q-control border p-3 text-right transition ${selectedId === item.id ? "border-q-primary bg-q-surface-2 shadow-sm" : "border-transparent bg-q-surface hover:border-q-border hover:bg-q-bg"}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-q-control ${selectedId === item.id ? "bg-q-primary text-q-on-primary" : "bg-q-surface-2 text-q-text-2"}`}><Building2 size={17} /></span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-q-caption font-black text-q-text-2">{item.name_ar}</strong><span className="mt-1 block truncate text-q-caption text-q-text-2">{item.path_names.join(" / ")}</span></span>
      <CouncilStatusBadge value={item.status} /><ChevronLeft size={15} className="text-q-text-2 transition group-hover:-translate-x-0.5" />
    </button>)}
  </div>;
}
