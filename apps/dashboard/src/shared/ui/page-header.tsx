import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
};

/** The compact page title. No label sits above it: the navigation already says where the page lives. */
export function PageHeader({ title, description, actions, meta }: Props) {
  return <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-q-border pb-5">
    <div className="min-w-0">
      <h1 className="text-q-h2 font-bold text-q-text">{title}</h1>
      <p className="mt-1 max-w-3xl text-q-ui text-q-text-2">{description}</p>
      {meta && <div className="mt-3">{meta}</div>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
  </header>;
}
