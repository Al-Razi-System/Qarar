import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Tone = "error" | "success" | "info";

const toneClass: Record<Tone, string> = {
  error: "bg-q-danger-soft text-q-danger",
  success: "bg-q-success-soft text-q-success",
  info: "bg-q-surface-2 text-q-text-2",
};

type Props = { tone?: Tone; children: ReactNode; className?: string };

/**
 * Feedback rendered at the action that produced it. Errors are announced
 * immediately; success and information are announced politely.
 */
export function InlineMessage({ tone = "info", className, children }: Props) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn("m-0 rounded-q-control px-3 py-2 font-sans text-q-caption font-bold", toneClass[tone], className)}
    >
      {children}
    </p>
  );
}
