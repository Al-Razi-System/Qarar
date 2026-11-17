import { useId, type ReactNode } from "react";

export function ActionTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const tooltipId = useId();
  return (
    <span className="group/tooltip relative inline-flex" aria-describedby={tooltipId}>
      {children}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 hidden w-max max-w-56 -translate-x-1/2 rounded-q-control bg-q-header px-2.5 py-1.5 text-center text-q-caption font-bold leading-normal text-q-on-primary shadow-xl group-hover/tooltip:block group-focus-within/tooltip:block"
      >
        {label}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-q-border" />
      </span>
    </span>
  );
}
