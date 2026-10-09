import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const badgeStyles = cva("inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-q-caption font-bold", {
  variants: {
    tone: {
      neutral: "bg-q-neutral-soft text-q-text-2",
      success: "bg-q-success-soft text-q-success",
      warning: "bg-q-warning-soft text-q-warning",
      danger: "bg-q-danger-soft text-q-danger",
      info: "bg-q-surface-2 text-q-link",
      // Reserved for the single live item on a screen (the agenda item under discussion).
      live: "bg-q-live-soft text-q-live",
    },
  },
  defaultVariants: { tone: "neutral" },
});

type Props = VariantProps<typeof badgeStyles> & { children: ReactNode; className?: string };

/** A status is always written out; colour only reinforces the text. */
export function Badge({ tone, className, children }: Props) {
  return <span className={cn(badgeStyles({ tone }), className)}>{children}</span>;
}
