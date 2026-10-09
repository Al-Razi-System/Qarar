import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import type { AgendaItemState } from "../../model/agenda-flow";
import type { AgendaDiscussionItem } from "../../model/live-meeting";

type Props = {
  items: AgendaDiscussionItem[];
  states: Record<string, AgendaItemState>;
  /** The item the council is on right now. */
  currentId: string | null;
  /** The item whose details are shown beside the timeline. */
  selectedId: string | null;
  onSelect: (itemId: string) => void;
};

/** The agenda as a vertical timeline: what is done, what is on now and what comes next. */
export function AgendaTimeline({ items, states, currentId, selectedId, onSelect }: Props) {
  return (
    <nav aria-label="جدول الأعمال" className="rounded-q-card border border-q-border bg-q-surface p-3 font-sans">
      <p className="m-0 px-2 pb-2 text-q-caption font-bold text-q-text-2">جدول الأعمال · {items.length} بنود</p>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((item) => {
          const selected = item.id === selectedId;
          const current = item.id === currentId;
          const state = states[item.id];
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-start gap-3 rounded-q-control border p-2 text-start transition-colors",
                  selected ? "border-q-primary bg-q-surface-2" : "border-transparent bg-transparent hover:bg-q-surface-2",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full text-q-caption font-bold",
                    current ? "bg-q-live-soft text-q-live" : "bg-q-neutral-soft text-q-text-2",
                  )}
                >
                  {item.agenda_order}
                </span>
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <span className="text-q-ui font-bold text-q-text">{item.topic?.title_ar ?? "بند جدول الأعمال"}</span>
                  {state && <Badge tone={state.tone}>{state.label}</Badge>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
