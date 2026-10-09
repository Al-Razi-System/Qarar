"use client";

import { useEffect, useId, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Props = {
  title: string;
  description?: string;
  /** Called by the close button, the Escape key and a click on the backdrop. */
  onClose: () => void;
  /** Blocks closing while an action is in flight so its result is not lost. */
  closeDisabled?: boolean;
  /** Actions, rendered in a row at the bottom. Put the error message here, beside them. */
  footer?: ReactNode;
  size?: "md" | "lg";
  children: ReactNode;
};

/**
 * The in-page dialog. It replaces native browser dialogs: it keeps what the
 * user typed when an action fails and shows the error beside the action.
 * Render it inside the themed container so it follows the light or night mode.
 */
export function Dialog({ title, description, onClose, closeDisabled = false, footer, size = "md", children }: Props) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeDisabled) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDisabled, onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-q-scrim p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn("w-full rounded-q-card border border-q-border bg-q-surface font-sans text-q-text shadow-2xl", size === "lg" ? "max-w-2xl" : "max-w-lg")}
      >
        <header className="flex items-start justify-between gap-4 border-b border-q-border p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="m-0 text-q-h3 font-bold">{title}</h2>
            {description && <p id={descriptionId} className="m-0 mt-1 text-q-caption text-q-text-2">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="إغلاق"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-q-control bg-transparent text-q-h3 text-q-text-2 hover:bg-q-surface-2 disabled:cursor-not-allowed disabled:text-q-text-3"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="flex flex-col gap-4 p-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-q-border p-5">{footer}</footer>}
      </div>
    </div>
  );
}
