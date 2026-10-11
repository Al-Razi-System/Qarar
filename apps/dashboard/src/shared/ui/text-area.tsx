import { useId, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string;
  /** Shown beside the label, e.g. a character count or «اختيارية». */
  aside?: ReactNode;
  hint?: string;
  error?: string | null;
};

/** A labelled multi-line field. The error is tied to the field and announced. */
export function TextArea({ label, aside, hint, error, className, ...rest }: Props) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className="flex flex-col gap-1.5 font-sans">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-q-ui font-bold text-q-text">{label}</label>
        {aside && <span className="text-q-caption text-q-text-2">{aside}</span>}
      </div>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          "min-h-28 w-full resize-y rounded-q-control border bg-q-surface p-3 text-q-ui text-q-text outline-none placeholder:text-q-text-3 focus:border-q-primary focus:ring-2 focus:ring-q-focus disabled:cursor-not-allowed disabled:bg-q-neutral-soft",
          error ? "border-q-danger" : "border-q-border-strong",
          className,
        )}
        {...rest}
      />
      {(error || hint) && <p id={messageId} role={error ? "alert" : undefined} className={cn("m-0 text-q-caption", error ? "font-bold text-q-danger" : "text-q-text-2")}>{error ?? hint}</p>}
    </div>
  );
}
