import type { Metadata } from "next";
import { AuditWorkspace } from "@/features/audit/ui/audit-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "سجل التدقيق" };

export default function AuditPage() {
  return <div className="mx-auto max-w-[1480px]"><PageHeader eyebrow="التدقيق والامتثال" title="سجل التدقيق الحكومي" description="تتبع الأحداث والعمليات في المنصة مع مراجعة التفاصيل والطلبات والتغييرات الحساسة." meta={<span className="inline-flex rounded-full bg-[#f1f7fd] px-3 py-1.5 text-[10px] font-bold text-[#2770b9]">سجل غير قابل للتلاعب · طلبات البحث · التصدير</span>} /><AuditWorkspace /></div>;
}
