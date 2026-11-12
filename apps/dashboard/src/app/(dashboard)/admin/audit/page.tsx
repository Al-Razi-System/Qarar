import type { Metadata } from "next";
import { AuditWorkspace } from "@/features/audit/ui/audit-workspace";
import { Badge } from "@/shared/ui/badge";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "سجل التدقيق" };

export default function AuditPage() {
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        title="سجل التدقيق الحكومي"
        description="من فعل ماذا، بأي سجل، ومتى ومن أين، بما فيها المحاولات المرفوضة والفاشلة. السجل للإضافة فقط ولا يقبل التعديل أو الحذف."
        meta={<Badge tone="info">للإضافة فقط · بحث · تصدير</Badge>}
      />
      <AuditWorkspace />
    </div>
  );
}
