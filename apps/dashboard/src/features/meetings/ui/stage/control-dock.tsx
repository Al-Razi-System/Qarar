"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { OverflowMenu } from "@/shared/ui/overflow-menu";
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
  decisionTools?: ReactNode;
  /** How many agenda items the council has settled, out of all of them. */
  progress?: { done: number; total: number };
};

/**
 * The chair's control dock under the council table. Its main button is always
 * the next step of the item on screen; a step the server would reject is
 * disabled with the reason written beside it. What still stops the session
 * from ending is one click away instead of a list on the screen.
 */
export function ControlDock({ item, actions, note, busy, blockers, onAction, onComplete, pinned = false, decisionTools, progress }: Props) {
  const [showBlockers, setShowBlockers] = useState(false);
  const reason = actions.find((action) => action.disabledReason)?.disabledReason ?? null;
  const primary = actions[0];
  const status = busy ? <span role="status" className="font-bold text-q-text-2">جارٍ التنفيذ…</span>
    : reason ? <span className="font-bold text-q-warning">{reason}</span>
    : note ? <span className="text-q-text-2">{note}</span> : null;
  return (
    <section
      aria-label="شريط تحكم رئيس المجلس"
      className={cn(
        "bottom-3 z-30 flex min-w-0 flex-col gap-3 rounded-q-card border border-q-border bg-q-surface p-3 font-sans text-q-text shadow-xl @3xl/room:static @3xl/room:shadow-sm @2xl:flex-row @2xl:items-stretch",
        pinned ? "fixed inset-x-3" : "sticky",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        {item && <p className="m-0 text-q-caption font-bold text-q-text-2">الخطوة التالية في البند {item.agenda_order}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {primary && (
            <Button size="lg" className="max-w-full whitespace-normal text-start" disabled={busy || Boolean(primary.disabledReason)} onClick={() => onAction(primary)}>
              {primary.label}
            </Button>
          )}
          {actions.length > 1 && (
            <OverflowMenu
              label="خيارات أخرى للبند"
              disabled={busy}
              align="start"
              side="top"
              items={actions.slice(1).map((action) => ({ key: action.kind, label: action.label, hint: action.disabledReason, disabled: Boolean(action.disabledReason), onSelect: () => onAction(action) }))}
            />
          )}
          {decisionTools}
        </div>
        {status && <p className="m-0 text-q-caption">{status}</p>}
      </div>
      <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-4 gap-y-2 border-t border-q-border pt-3 @2xl:w-64 @2xl:shrink-0 @2xl:flex-col @2xl:flex-nowrap @2xl:items-stretch @2xl:justify-center @2xl:border-s @2xl:border-t-0 @2xl:ps-4 @2xl:pt-0">
        {progress && progress.total > 0 && (
          <div className="flex min-w-40 flex-1 flex-col gap-1 @2xl:flex-none">
            <p className="m-0 flex items-center justify-between gap-2 text-q-caption text-q-text-2">
              <span>البنود المحسومة</span>
              <span className="font-bold text-q-text"><span dir="ltr">{progress.done}</span> من <span dir="ltr">{progress.total}</span></span>
            </p>
            <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-q-neutral-soft">
              <span className="block h-full rounded-full bg-q-success transition-[width]" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            </span>
          </div>
        )}
        {blockers.length === 0
          ? <Button className="max-w-full whitespace-normal" variant="secondary" disabled={busy} onClick={onComplete}>إنهاء الجلسة والانتقال إلى إعداد المحضر</Button>
          : (
            <>
              {(actions.length === 0 || actions[0]?.kind === "edit_decision") && <p className="m-0 text-q-caption text-q-warning">الخطوة المتبقية: {blockers[0]}{blockers[0].includes("ملخص") && " يحفظه مقرر المجلس من بطاقة البند."}</p>}
              <Button variant="ghost" className="justify-start px-0" onClick={() => setShowBlockers(true)}>ما بقي قبل الإنهاء ({blockers.length})</Button>
            </>
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
