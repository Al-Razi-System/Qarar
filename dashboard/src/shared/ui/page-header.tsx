import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions, meta }: Props) {
  return <header className="mb-7 overflow-hidden rounded-2xl border border-[#dbe6f1] bg-white shadow-[0_10px_30px_rgba(15,42,72,.05)]">
    <div className="flex flex-wrap items-end justify-between gap-5 p-5 sm:p-6">
      <div className="min-w-0"><p className="mb-2 text-[10px] font-black tracking-wide text-[#f17822]">{eyebrow}</p><h1 className="text-2xl font-black tracking-tight text-[#0a1330]">{title}</h1><p className="mt-2 max-w-3xl text-xs leading-6 text-[#687b91]">{description}</p>{meta && <div className="mt-4">{meta}</div>}</div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  </header>;
}
