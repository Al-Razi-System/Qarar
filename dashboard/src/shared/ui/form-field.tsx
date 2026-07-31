import type { InputHTMLAttributes, ReactNode } from "react";

export function FormField({
  label,
  icon,
  hint,
  error,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-[13px] font-bold text-[#22324b]">
        {label}
      </span>
      <span
        className={`flex h-12 items-center gap-3 rounded-xl border bg-white px-3.5 transition focus-within:border-[#0066cc] focus-within:ring-4 focus-within:ring-[#0066cc]/8 ${
          error ? "border-red-400" : "border-[#dce5ef]"
        }`}
      >
        {icon && <span className="text-[#8190a4]">{icon}</span>}
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-[#0a1330] outline-none placeholder:text-[#9aa8b9]"
          {...props}
        />
      </span>
      {(hint || error) && (
        <span
          className={`mt-1.5 block text-[11px] ${
            error ? "text-red-600" : "text-[#718096]"
          }`}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  );
}
