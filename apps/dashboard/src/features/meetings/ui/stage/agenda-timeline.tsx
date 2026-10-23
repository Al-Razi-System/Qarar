import { Check } from "lucide-react";
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
  /** Absent for a member, who follows the meeting and cannot open another item. */
  onSelect?: (itemId: string) => void;
};

const toneText: Record<AgendaItemState["tone"], string> = {
  neutral: "text-q-text-2",
  live: "text-q-live",
  info: "text-q-link",
  success: "text-q-success",
  warning: "text-q-warning",
  danger: "text-q-danger",
};

// Inside the chair's room (a container named "room"), a medium width keeps
// only the numbered stations; the titles stay for screen readers and tooltips.
const railOnly = "@3xl/room:@max-6xl/room:sr-only";

/**
 * The agenda as numbered stations: settled ones are ticked, the one the council
 * is on carries the live colour, the ones ahead are outlined.
 */
export function AgendaTimeline({ items, states, currentId, selectedId, onSelect }: Props) {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  return (
    <nav aria-label="جدول الأعمال" className="rounded-q-card border border-q-border bg-q-surface p-3 font-sans @3xl/room:@max-6xl/room:px-1.5">
      <p className={cn("m-0 px-2 pb-3 text-q-caption font-bold text-q-text-2", railOnly)}>
        جدول الأعمال{currentIndex >= 0 ? ` · ${currentIndex + 1} من ${items.length}` : ` · ${items.length} بنود`}
      </p>
      <p aria-hidden="true" className="m-0 hidden pb-3 text-center text-q-caption font-bold text-q-text-2 @3xl/room:@max-6xl/room:block">
        <span dir="ltr">{currentIndex >= 0 ? `${currentIndex + 1}/${items.length}` : items.length}</span>
      </p>
      <ol className="m-0 flex list-none flex-col p-0">
        {items.map((item, index) => {
          const selected = item.id === selectedId;
          const current = item.id === currentId;
          const state = states[item.id];
          const done = state?.tone === "success" || item.agenda_status === "postponed";
          const last = index === items.length - 1;
          const title = item.topic?.title_ar ?? "بند جدول الأعمال";
          const body = (
            <>
              <span aria-hidden="true" className="flex shrink-0 flex-col items-center self-stretch">
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border-2 text-q-caption font-bold",
                    current ? "border-q-live bg-q-live-soft text-q-live ring-4 ring-q-live-soft"
                      : done ? "border-q-success bg-q-success text-q-on-success"
                      : "border-q-border-strong bg-q-surface text-q-text-2",
                  )}
                >
                  {done && !current ? <Check size={14} strokeWidth={3} /> : item.agenda_order}
                </span>
                {!last && <span className={cn("my-1 w-0.5 flex-1", done ? "bg-q-success" : "bg-q-border")} />}
              </span>
              <span className={cn("flex min-w-0 flex-col items-start gap-0.5 pb-4 pt-0.5", railOnly)}>
                <span className={cn("text-q-ui leading-snug text-q-text", current ? "font-bold" : "font-normal", !current && !done && "text-q-text-2")}><span className="sr-only">البند {item.agenda_order}: </span>{title}</span>
                {state && <span className={cn("text-q-caption font-bold", toneText[state.tone])}>{state.label}</span>}
              </span>
            </>
          );
          const rowClass = "flex min-h-11 w-full items-start gap-3 rounded-q-control px-2 pt-1 text-start @3xl/room:@max-6xl/room:justify-center @3xl/room:@max-6xl/room:px-0";
          return (
            <li key={item.id}>
              {onSelect ? (
                <button
                  type="button"
                  title={`${item.agenda_order} · ${title}`}
                  onClick={() => onSelect(item.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(rowClass, "transition-colors", selected ? "bg-q-surface-2" : "bg-transparent hover:bg-q-surface-2")}
                >
                  {body}
                </button>
              ) : (
                <div aria-current={current ? "step" : undefined} title={`${item.agenda_order} · ${title}`} className={rowClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
