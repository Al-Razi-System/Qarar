import {
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/shared/lib/utils";
const control =
  "min-h-11 w-full min-w-0 rounded-q-control border border-q-border-strong bg-q-surface px-3 py-2 text-q-ui text-q-text outline-none focus-visible:ring-2 focus-visible:ring-q-primary disabled:bg-q-surface-2 disabled:text-q-text-3";
type FieldProps = { label: string; hint?: string };
function Field({
  label,
  hint,
  id,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-q-ui font-bold text-q-text">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-q-caption text-q-text-2">
          {hint}
        </p>
      )}
    </div>
  );
}
export function AdministrativeInput({
  label,
  hint,
  className,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const id = props.id ?? generated;
  return (
    <Field label={label} hint={hint} id={id}>
      <input
        {...props}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(control, className)}
      />
    </Field>
  );
}
export function AdministrativeSelect({
  label,
  hint,
  className,
  children,
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const id = props.id ?? generated;
  return (
    <Field label={label} hint={hint} id={id}>
      <select
        {...props}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(control, className)}
      >
        {children}
      </select>
    </Field>
  );
}
export function AdministrativeTextArea({
  label,
  hint,
  className,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const id = props.id ?? generated;
  return (
    <Field label={label} hint={hint} id={id}>
      <textarea
        rows={3}
        {...props}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(control, className)}
      />
    </Field>
  );
}
