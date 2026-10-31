"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export type OverflowMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  /** A line under the label, such as why the item is disabled. */
  hint?: string | null;
  disabled?: boolean;
  /** A toggle such as night mode; announced as checked or not. */
  checked?: boolean;
  onSelect: () => void;
};

type Props = {
  /** The trigger's accessible name, e.g. «خيارات أخرى للبند». */
  label: string;
  items: OverflowMenuItem[];
  /** Read-only lines above the items, such as who is looking. */
  header?: ReactNode;
  /** Visible text beside the three dots; without it the trigger is an icon. */
  text?: string;
  disabled?: boolean;
  /** Which side of the trigger the menu lines up with. */
  align?: "start" | "end";
  /** Opens above the trigger, for menus that live at the bottom of the screen. */
  side?: "bottom" | "top";
  className?: string;
};

/**
 * Secondary actions behind one button, so a screen shows its main action and
 * keeps the rest a click away. It renders in place, not in a portal, so it
 * also works while the room fills the screen. Arrow keys move between items,
 * Escape and a click outside close it, and focus returns to the trigger.
 */
export function OverflowMenu({ label, items, header, text, disabled = false, align = "end", side = "bottom", className }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = root.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not([disabled])');
    first?.focus();
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const entries = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not([disabled])') ?? []);
    if (!entries.length) return;
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1
      : event.key === "ArrowDown" ? (index + 1) % entries.length : (index - 1 + entries.length) % entries.length;
    entries[next].focus();
  }

  return (
    <div ref={root} className={cn("relative inline-flex", className)} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={trigger}
        type="button"
        aria-label={text ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={label}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-q-control border border-q-border bg-q-surface font-sans text-q-caption font-bold text-q-text-2 transition-colors hover:bg-q-surface-2 hover:text-q-text disabled:cursor-not-allowed disabled:opacity-50",
          text ? "px-3" : "w-11",
          open && "bg-q-surface-2 text-q-text",
        )}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
        {text && <span>{text}</span>}
        {text && <span className="sr-only">{` — ${label}`}</span>}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            "q-enter absolute z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-q-card border border-q-border bg-q-surface p-1.5 font-sans text-q-text shadow-xl",
            align === "end" ? "end-0" : "start-0",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {header && <div className="border-b border-q-border px-3 pb-2 pt-1.5">{header}</div>}
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={item.checked}
              disabled={item.disabled}
              onClick={() => { close(false); item.onSelect(); }}
              className="flex min-h-11 w-full items-start gap-3 rounded-q-control px-3 py-2 text-start transition-colors hover:bg-q-surface-2 focus-visible:bg-q-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {item.icon && <span aria-hidden="true" className="mt-0.5 shrink-0 text-q-text-2">{item.icon}</span>}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-q-ui font-bold">{item.label}</span>
                {item.hint && <span className="text-q-caption text-q-text-2">{item.hint}</span>}
              </span>
              {item.checked !== undefined && (
                <span aria-hidden="true" className={cn("mt-1 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors", item.checked ? "bg-q-primary" : "bg-q-neutral-soft")}>
                  <span className={cn("block h-4 w-4 rounded-full bg-q-surface shadow transition-transform", item.checked ? "-translate-x-4" : "translate-x-0")} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
