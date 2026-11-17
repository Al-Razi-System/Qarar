"use client";

import { Card as QCard } from "@/shared/ui/card";

import { Button as QButton } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";

import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import { LoaderCircle, X } from "lucide-react";

export type AuthoringMutation = (
  action: () => Promise<unknown>,
  successMessage: string,
) => Promise<void>;

export const authoringInput =
  "h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui text-q-text outline-none transition placeholder:text-q-text-3 focus:border-q-primary focus:ring-4 focus:ring-q-primary/7 disabled:cursor-not-allowed disabled:bg-q-surface-2 disabled:text-q-text-3";
export const authoringTextarea =
  "min-h-28 w-full resize-y rounded-q-control border border-q-border bg-q-surface p-3 text-q-caption leading-6 text-q-text outline-none transition placeholder:text-q-text-3 focus:border-q-primary focus:ring-4 focus:ring-q-primary/7 disabled:cursor-not-allowed disabled:bg-q-surface-2";

export function AuthoringField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const generatedId = useId();
  const hintId = `${generatedId}-hint`;
  const element = isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
    ? children
    : null;
  const field = element
    ? cloneElement(element as ReactElement<{ id?: string; "aria-describedby"?: string }>, {
        id: element.props.id ?? generatedId,
        "aria-describedby": hint
          ? [element.props["aria-describedby"], hintId].filter(Boolean).join(" ")
          : element.props["aria-describedby"],
      })
    : children;
  const fieldId = element?.props.id ?? generatedId;

  return (
    <div className="block min-w-0">
      <label htmlFor={fieldId} className="mb-1.5 flex items-center gap-1 text-q-caption font-bold text-q-text-2">
        {label}
        {required && <span className="text-q-danger">*</span>}
      </label>
      {field}
      {hint && <span id={hintId} className="mt-1.5 block text-q-caption leading-normal text-q-text-3">{hint}</span>}
    </div>
  );
}

export function AuthoringDialog({
  title,
  description,
  onClose,
  children,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return <Dialog title={title} description={description} onClose={onClose} size={wide ? "xl" : "lg"}>
    {children}
  </Dialog>;
}

export function AuthoringNotice({
  notice,
  onDismiss,
}: {
  notice: { kind: "success" | "error"; message: string } | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;
  const success = notice.kind === "success";
  return (
    <InlineMessage tone={success ? "success" : "error"} className="flex items-center gap-2">
      <span className="min-w-0 flex-1">{notice.message}</span>
      <QButton variant="ghost" type="button" title="إخفاء الرسالة" aria-label="إخفاء الرسالة" onClick={onDismiss} className="min-w-11 grid min-h-11 min-w-11 place-items-center"><X size={13} /></QButton>
    </InlineMessage>
  );
}

export function PrimaryAction({
  children,
  busy,
  disabled,
  onClick,
  title,
  tone = "blue",
}: {
  children: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  tone?: "blue" | "red";
}) {
  return (
    <QButton variant={tone === "red" ? "danger" : "primary"} type="button" title={title} disabled={busy || disabled} onClick={onClick} className={`min-w-11 inline-flex min-h-11 items-center justify-center gap-2 rounded-q-control px-4 text-q-ui font-bold text-q-on-primary  transition disabled:cursor-not-allowed disabled:opacity-45 ${tone === "red" ? "bg-q-danger hover:bg-q-danger" : "bg-q-primary hover:bg-q-primary"}`}>
      {busy && <LoaderCircle size={14} className="animate-spin" />}
      {children}
    </QButton>
  );
}

export function EmptyAuthoringState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <QCard className="p-0 grid min-h-64 place-items-center rounded-q-card border border-dashed border-q-border bg-q-surface p-6 text-center">
      <div className="max-w-sm"><span className="mx-auto grid h-12 w-12 place-items-center rounded-q-card bg-q-surface-2 text-q-primary">{icon}</span><h3 className="mt-3 text-q-ui font-bold text-q-text">{title}</h3><p className="mt-1 text-q-caption leading-5 text-q-text-3">{description}</p>{action && <div className="mt-4">{action}</div>}</div>
    </QCard>
  );
}
