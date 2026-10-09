import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const buttonStyles = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-q-control font-sans font-bold transition-colors disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "bg-q-primary text-q-on-primary hover:bg-q-primary-hover disabled:bg-q-neutral-soft disabled:text-q-text-3",
        secondary: "border border-q-primary bg-q-surface text-q-link hover:bg-q-surface-2 disabled:border-q-border disabled:bg-q-neutral-soft disabled:text-q-text-3",
        ghost: "bg-transparent text-q-link hover:bg-q-surface-2 disabled:text-q-text-3",
        danger: "bg-q-danger text-q-on-danger hover:opacity-90 disabled:bg-q-neutral-soft disabled:text-q-text-3",
      },
      size: {
        md: "min-h-11 px-5 text-q-ui",
        lg: "min-h-13 px-6 text-q-body",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles> & {
    /** Shown instead of the label while the action is in flight; also blocks a second submission. */
    pendingLabel?: string;
    pending?: boolean;
    children: ReactNode;
  };

export function Button({ variant, size, block, pending = false, pendingLabel, disabled, className, children, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cn(buttonStyles({ variant, size, block }), className)}
      {...rest}
    >
      {pending ? pendingLabel ?? children : children}
    </button>
  );
}
