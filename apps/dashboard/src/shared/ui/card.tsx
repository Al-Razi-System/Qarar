import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Marks the card as the live item with the orange top edge. One per screen. */
  live?: boolean;
  children: ReactNode;
};

export function Card({ live = false, className, children, ...rest }: Props) {
  return (
    <div
      className={cn(
        "rounded-q-card border border-q-border bg-q-surface p-5 text-q-text",
        live && "border-t-4 border-t-q-live",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
