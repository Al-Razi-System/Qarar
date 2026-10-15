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

/** The agenda as a vertical timeline: what is done, what is on now and what comes next. */
export function AgendaTimeline({ items, states, currentId, selectedId, onSelect }: Props) {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  return (
    <nav aria-label="جدول الأعمال" className="rounded-q-card border border-q-border bg-q-surface p-3 font-sans">
      <p className="m-0 px-2 pb-3 text-q-caption font-bold text-q-text-2">
        جدول الأعمال{currentIndex >= 0 ? ` · ${currentIndex + 1} من ${items.length}` : ` · ${items.length} بنود`}
      </p>
      <ol className="m-0 flex list-none flex-col p-0">
        {items.map((item, index) => {
          const selected = item.id === selectedId;
          const current = item.id === currentId;
          const state = states[item.id];
          const done = state?.tone === "success" || item.agenda_status === "postponed";
          const last = index === items.length - 1;
          const body = (
            <>
              <span aria-hidden="true" className="flex shrink-0 flex-col items-center self-stretch">
                <span
                  className={cn(
                    "mt-1 h-3.5 w-3.5 rounded-full border-2",
                    current ? "q-live-dot border-q-live bg-q-live" : done ? "border-q-success bg-q-success" : "border-q-border-strong bg-transparent",
                  )}
                />
                {!last && <span className="mt-1 w-0.5 flex-1 bg-q-border" />}
              </span>
              <span className={cn("flex min-w-0 flex-col items-start gap-0.5 pb-4", !current && !done && "opacity-70")}>
                <span className={cn("text-q-ui text-q-text", current ? "font-bold" : "font-normal")}>{item.agenda_order} · {item.topic?.title_ar ?? "بند جدول الأعمال"}</span>
                {state && <span className={cn("text-q-caption font-bold", toneText[state.tone])}>{state.label}</span>}
              </span>
            </>
          );
          return (
            <li key={item.id}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-start gap-3 rounded-q-control px-2 pt-1 text-start transition-colors",
                    selected ? "bg-q-surface-2" : "bg-transparent hover:bg-q-surface-2",
                  )}
                >
                  {body}
                </button>
              ) : (
                <div aria-current={current ? "step" : undefined} className="flex w-full items-start gap-3 px-2 pt-1">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
