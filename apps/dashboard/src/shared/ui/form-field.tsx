import type { InputHTMLAttributes, ReactNode } from "react";

export function FormField({
  label,
  icon,
  hint,
  error,
  className = "",
  type,
  dir,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-q-caption font-bold text-q-text">
        {label}
      </span>
      <span
        className={`flex h-12 items-center gap-3 rounded-q-control border bg-q-surface px-3.5 transition focus-within:border-q-primary focus-within:ring-4 focus-within:ring-q-primary/10 ${
          error ? "border-q-danger" : "border-q-border"
        }`}
      >
        {icon && <span className="text-q-text-3">{icon}</span>}
        <input
          suppressHydrationWarning
          className="min-w-0 flex-1 bg-transparent text-q-ui text-q-text outline-none placeholder:text-q-text-3"
          type={type}
          dir={dir ?? (type === "email" || type === "password" ? "ltr" : undefined)}
          {...props}
        />
      </span>
      {(hint || error) && (
        <span
          className={`mt-1.5 block text-q-caption ${
            error ? "text-q-danger" : "text-q-text-2"
          }`}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  );
}
