import { Building2, ChevronLeft } from "lucide-react";
import type { CouncilTreeNode } from "../model/types";
import { CouncilStatusBadge } from "./council-status-badge";

export function CouncilTree({ items, selectedId, onSelect }: { items: CouncilTreeNode[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (!items.length) return <div className="rounded-2xl border border-dashed border-[#cddbe8] bg-[#f8fbfe] p-8 text-center text-xs text-[#73859a]">لا توجد مجالس مطابقة.</div>;
  return <div className="space-y-2">
    {items.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} style={{ paddingRight: `${12 + Math.max(item.level_no - 1, 0) * 18}px` }} className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-right transition ${selectedId === item.id ? "border-[#0872df] bg-[#edf6ff] shadow-[0_7px_18px_rgba(0,102,204,.10)]" : "border-transparent bg-white hover:border-[#c9def0] hover:bg-[#f8fbfe]"}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${selectedId === item.id ? "bg-[#0872df] text-white" : "bg-[#eaf3fb] text-[#2177bd]"}`}><Building2 size={17} /></span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-black text-[#172a42]">{item.name_ar}</strong><span className="mt-1 block truncate text-[10px] text-[#8291a2]">{item.path_names.join(" / ")}</span></span>
      <CouncilStatusBadge value={item.status} /><ChevronLeft size={15} className="text-[#92a2b4] transition group-hover:-translate-x-0.5" />
    </button>)}
  </div>;
}
