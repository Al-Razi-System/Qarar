import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./governance-page-header.module.css";

const pages = [
  { key: "regulations", href: "/admin/regulations/library", label: "اللوائح والبنود" },
  { key: "routes", href: "/admin/workflows", label: "مسارات الموضوعات" },
  { key: "types", href: "/admin/governance-model", label: "تصنيفات الموضوعات" },
] as const;

export function GovernancePageHeader({ current, title, description, actions, id }: {
  current: typeof pages[number]["key"]; title: string; description: string; actions?: ReactNode; id?: string;
}) {
  return <header className={styles.header}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>إعداد الحوكمة</span><h1 id={id}>{title}</h1><p>{description}</p></div>{actions && <div className={styles.actions}>{actions}</div>}</div>
    <nav aria-label="إعدادات الحوكمة" className={styles.tabs}>{pages.map(page => <Link key={page.key} href={page.href} aria-current={page.key === current ? "page" : undefined}>{page.label}</Link>)}</nav>
  </header>;
}
