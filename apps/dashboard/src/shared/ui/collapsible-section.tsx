"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** A titled block whose long content can be folded away, closed by default unless asked otherwise. */
export function CollapsibleSection({ title, hint, badge, defaultOpen = false, children }: { title: string; hint?: string; badge?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return <section className="overflow-hidden rounded-q-card border border-q-border bg-q-surface">
    <div className="flex min-h-14 items-center gap-3 pe-4">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)} className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-start hover:bg-q-surface-2">
        <span className="min-w-0"><span className="block text-q-ui font-bold text-q-text">{title}</span>{hint && <span className="mt-0.5 block text-q-caption text-q-text-2">{hint}</span>}</span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-q-text-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
    {open && <div id={panelId} className="border-t border-q-border p-4">{children}</div>}
  </section>;
}
