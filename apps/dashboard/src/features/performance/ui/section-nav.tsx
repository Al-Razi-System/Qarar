import Link from "next/link";
import { cn } from "@/shared/lib/utils";

const sections = [
  { key: "councils", href: "/admin/performance", label: "المجالس" },
  { key: "topics", href: "/admin/performance/topics", label: "الموضوعات" },
] as const;

/** The follow-up centre's dashboards share one switch, so they read as one place. */
export function SectionNav({ current }: { current: typeof sections[number]["key"] }) {
  return (
    <nav aria-label="لوحات المتابعة" className="mb-4 inline-flex gap-1 rounded-q-card bg-q-rail p-1">
      {sections.map((section) => (
        <Link key={section.key} href={section.href} aria-current={section.key === current ? "page" : undefined}
          className={cn("inline-flex min-h-11 items-center rounded-q-control px-5 text-q-ui font-semibold", section.key === current ? "bg-q-surface text-q-link" : "text-q-text-2 hover:text-q-text")}>
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
