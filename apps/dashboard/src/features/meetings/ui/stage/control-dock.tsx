"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";
import type { ChairAction } from "../../model/agenda-flow";
import type { AgendaDiscussionItem } from "../../model/live-meeting";

type Props = {
  item: AgendaDiscussionItem | null;
  actions: ChairAction[];
  /** What happened last on this item when there is nothing left to do on it. */
  note: string | null;
  busy: boolean;
  /** Everything that still stops the session from ending; empty when it can end. */
  blockers: string[];
  onAction: (action: ChairAction) => void;
  onComplete: () => void;
  pinned?: boolean;
};

/**
 * The chair's control dock under the council table. Its main button is always
 * the next step of the item on screen; a step the server would reject is
 * disabled with the reason written beside it. What still stops the session
 * from ending is one click away instead of a list on the screen.
 */
export function ControlDock({ item, actions, note, busy, blockers, onAction, onComplete, pinned = false }: Props) {
  const [showBlockers, setShowBlockers] = useState(false);
  const reason = actions.find((action) => action.disabledReason)?.disabledReason ?? null;
  return (
    <section aria-label="شريط تحكم رئيس المجلس" className={cn("bottom-3 z-30 flex min-w-0 flex-col gap-3 rounded-q-card border border-q-border-strong bg-q-surface p-3 font-sans text-q-text shadow-xl lg:static", pinned ? "fixed inset-x-3" : "sticky")}>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="m-0 truncate text-q-caption font-bold text-q-text-2">{item ? `البند ${item.agenda_order} · ${item.topic?.title_ar ?? "بند جدول الأعمال"}` : "لا يوجد بند محدد"}</p>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action, index) => (
            <Button
              key={action.kind}
              size={index === 0 ? "lg" : undefined}
              variant={index === 0 ? "primary" : "secondary"}
              className="max-w-full whitespace-normal text-start"
              disabled={busy || Boolean(action.disabledReason)}
              onClick={() => onAction(action)}
            >
              {action.label}
            </Button>
          ))}
          {busy && <span role="status" className="text-q-caption font-bold text-q-text-2">جارٍ التنفيذ…</span>}
          {!busy && reason && <span className="text-q-caption font-bold text-q-warning">{reason}</span>}
          {!busy && !reason && note && <span className="text-q-ui text-q-text-2">{note}</span>}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-q-border pt-3">
        <Button className="max-w-full whitespace-normal text-start" variant="secondary" disabled={busy || blockers.length > 0} onClick={onComplete}>إنهاء الجلسة والانتقال إلى إعداد المحضر</Button>
        {blockers.length > 0 && (
          <Button variant="ghost" onClick={() => setShowBlockers(true)}>ما بقي قبل الإنهاء ({blockers.length})</Button>
        )}
      </div>
      {showBlockers && (
        <Dialog
          title="قبل إنهاء الجلسة"
          description="تنتهي الجلسة حين يكتمل كل ما يلي."
          onClose={() => setShowBlockers(false)}
          footer={<Button variant="secondary" onClick={() => setShowBlockers(false)}>عودة</Button>}
        >
          <section role="region" aria-label="قبل إنهاء الجلسة">
            <ul className="m-0 flex list-disc flex-col gap-1 ps-5 text-q-ui text-q-text-2">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          </section>
        </Dialog>
      )}
    </section>
  );
}
