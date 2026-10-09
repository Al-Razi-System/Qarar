"use client";

import { Button } from "@/shared/ui/button";
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
};

/**
 * The chair's control dock. It stays at the bottom of the screen and its main
 * button is always the next step of the item on screen. A step the server would
 * reject is disabled with the reason written beside it.
 */
export function ControlDock({ item, actions, note, busy, blockers, onAction, onComplete }: Props) {
  const reason = actions.find((action) => action.disabledReason)?.disabledReason ?? null;
  return (
    <section aria-label="شريط تحكم رئيس المجلس" className="sticky bottom-3 z-30 flex flex-col gap-3 rounded-q-card border border-q-border-strong bg-q-surface p-3 font-sans text-q-text shadow-xl lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="m-0 truncate text-q-caption font-bold text-q-text-2">{item ? `البند ${item.agenda_order} · ${item.topic?.title_ar ?? "بند جدول الأعمال"}` : "لا يوجد بند محدد"}</p>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action, index) => (
            <Button
              key={action.kind}
              variant={index === 0 ? "primary" : "secondary"}
              disabled={busy || Boolean(action.disabledReason)}
              onClick={() => onAction(action)}
            >
              {action.label}
            </Button>
          ))}
          {busy && <span role="status" className="text-q-caption font-bold text-q-text-2">جارٍ التنفيذ…</span>}
          {!busy && reason && <span className="text-q-caption font-bold text-q-warning">{reason}</span>}
          {!busy && actions.length === 0 && note && <span className="text-q-ui text-q-text-2">{note}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-q-border pt-3 lg:items-end lg:border-s lg:border-t-0 lg:ps-4 lg:pt-0">
        <Button variant="secondary" disabled={busy || blockers.length > 0} onClick={onComplete}>إنهاء الجلسة والانتقال إلى إعداد المحضر</Button>
        {blockers.length > 0 && <span className="text-q-caption text-q-text-2">متبقٍ {blockers.length} قبل الإنهاء، وهي في قائمة «قبل إنهاء الجلسة».</span>}
      </div>
    </section>
  );
}
