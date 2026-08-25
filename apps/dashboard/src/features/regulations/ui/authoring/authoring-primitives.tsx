"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";

export type AuthoringMutation = (
  action: () => Promise<unknown>,
  successMessage: string,
) => Promise<void>;

export const authoringInput =
  "h-11 w-full rounded-xl border border-[#d8e4ef] bg-white px-3 text-[11px] text-[#21364e] outline-none transition placeholder:text-[#9aa9b8] focus:border-[#72b5ee] focus:ring-4 focus:ring-[#0872df]/7 disabled:cursor-not-allowed disabled:bg-[#f1f4f7] disabled:text-[#7b8998]";
export const authoringTextarea =
  "min-h-28 w-full resize-y rounded-xl border border-[#d8e4ef] bg-white p-3 text-[11px] leading-6 text-[#21364e] outline-none transition placeholder:text-[#9aa9b8] focus:border-[#72b5ee] focus:ring-4 focus:ring-[#0872df]/7 disabled:cursor-not-allowed disabled:bg-[#f1f4f7]";

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
      <label htmlFor={fieldId} className="mb-1.5 flex items-center gap-1 text-[9px] font-black text-[#415a73]">
        {label}
        {required && <span className="text-red-600">*</span>}
      </label>
      {field}
      {hint && <span id={hintId} className="mt-1.5 block text-[8px] leading-4 text-[#7d8ea1]">{hint}</span>}
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
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#071b39]/55 p-3 backdrop-blur-sm sm:p-6" role="presentation">
      <button type="button" aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="fixed inset-0 cursor-default" />
      <section role="dialog" aria-modal="true" aria-labelledby="authoring-dialog-title" className={`relative mx-auto my-3 overflow-hidden rounded-3xl border border-white/70 bg-[#f8fbfe] shadow-2xl ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <header className="flex items-start justify-between gap-4 border-b border-[#dfe9f2] bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 id="authoring-dialog-title" className="text-sm font-black text-[#142a43]">{title}</h2>
            {description && <p className="mt-1 text-[9px] leading-5 text-[#73859a]">{description}</p>}
          </div>
          <button type="button" aria-label="إغلاق" title="إغلاق دون حفظ" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#dfe7ef] text-[#6c7e91] hover:bg-[#f2f6fa] hover:text-[#0b2848]"><X size={16} /></button>
        </header>
        <div className="p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
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
    <div role={success ? "status" : "alert"} className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-[10px] font-bold ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
      {success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
      <span className="min-w-0 flex-1">{notice.message}</span>
      <button type="button" title="إخفاء الرسالة" aria-label="إخفاء الرسالة" onClick={onDismiss} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-black/5"><X size={13} /></button>
    </div>
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
    <button type="button" title={title} disabled={busy || disabled} onClick={onClick} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${tone === "red" ? "bg-red-700 hover:bg-red-800" : "bg-[#0872df] hover:bg-[#0066cc]"}`}>
      {busy && <LoaderCircle size={14} className="animate-spin" />}
      {children}
    </button>
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
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#cbdbea] bg-[#f9fbfd] p-6 text-center">
      <div className="max-w-sm"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#eaf4ff] text-[#0872df]">{icon}</span><h3 className="mt-3 text-sm font-black text-[#263b54]">{title}</h3><p className="mt-1 text-[9px] leading-5 text-[#7b8da1]">{description}</p>{action && <div className="mt-4">{action}</div>}</div>
    </div>
  );
}
